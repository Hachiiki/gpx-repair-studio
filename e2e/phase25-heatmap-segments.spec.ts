/**
 * Phase 25 E2E — the heatmap & personal segments (§25 verification):
 *
 *   1. the heatmap: seeding the shelf through the bundle-import door
 *      (two ride.tcx sessions), loading the fixture into the repair
 *      map, toggling the wash on — the bridge sees the layer visible
 *      with one MultiPoint feature per session (24 decimated points),
 *      the legend gains its entry, and off hides it again;
 *   2. the segment create → match → PR flow: the stretch door (two
 *      map clicks on the loaded track), the naming dialog, the
 *      matcher over BOTH seeded sessions (identical geometry — two
 *      efforts, the PR marked), the rules disclosure, and the draw
 *      door's honest empty table (anchors off the track match
 *      nothing);
 *   3. axe: zero critical violations on the segments tab.
 *
 * Seeding rides the same import door a user's backup would. No
 * network beyond the dev basemap.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");

function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "critical");
}

/** The Phase 24 seeding door: a portable library bundle of N rides. */
async function seedLibrary(page: Page, names: readonly string[]): Promise<void> {
  const rideXml = readFileSync(join(FORMAT_FIXTURES, "ride.tcx"), "utf8");
  const record = {
    schemaVersion: 2,
    kind: "file",
    section: "repair",
    savedAt: 1_700_000_000_000,
    fileName: "ride.tcx",
    gapThresholds: {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    },
    reconstructions: {},
    skippedGapIds: [],
    manualSpans: [],
    fileTiming: { startMs: null, totalDurationMs: null },
    roadLegs: {},
    workingEdits: [],
  };
  const bundle = {
    format: "gpxrepair-library",
    version: 1,
    exportedAt: 1_700_000_000_000,
    sessions: names.map((name) => ({
      name,
      record,
      source: {
        name: "ride.tcx",
        type: "application/vnd.garmin.tcx+xml",
        encoding: "text",
        data: rideXml,
      },
    })),
  };
  const dir = await mkdtemp(join(tmpdir(), "gpxr-phase25-"));
  const path = join(dir, "library.gpxrepair.json");
  await writeFile(path, JSON.stringify(bundle, null, 2));

  await page.goto("/");
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("sessions-import-button").click(),
  ]);
  await chooser.setFiles([path]);
  await expect(page.getByTestId("sessions-notice")).toContainText(
    String(names.length),
  );
  await page.keyboard.press("Escape");
}

/** Load ride.tcx through the landing's repair door (the map's own upload path). */
async function loadRideTcx(page: Page): Promise<void> {
  await enterRepairTool(page);
  // The wait starts BEFORE the click (the chooser fires on click).
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const chooser = await chooserPromise;
  await chooser.setFiles([join(FORMAT_FIXTURES, "ride.tcx")]);
  await expect(page.getByTestId("map-toolbar")).toBeVisible({
    timeout: 20_000,
  });
}

async function canvasBox(page: Page) {
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}


/**
 * The dialog's exit animation keeps a full-page scrim mounted for
 * ~100 ms after close — wait until the canvas is the top element at
 * its center again, or the pick clicks land on the fading scrim.
 */
async function waitForMapClear(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
) {
  await page.waitForFunction(
    ([cx, cy]) => {
      const top = document.elementFromPoint(cx, cy);
      return top !== null && top.closest(".maplibregl-canvas") !== null;
    },
    [box.x + box.width / 2, box.y + box.height / 2],
    { timeout: 5000, polling: 50 },
  );
}

async function clickAt(
  page: Page,
  lat: number,
  lon: number,
  box: { x: number; y: number },
) {
  const { x, y } = await page.evaluate(
    ([lat_, lon_]) =>
      window.__gpxMapController!.projectLatLon(
        lat_ as number,
        lon_ as number,
      ),
    [lat, lon] as const,
  );
  await page.mouse.click(box.x + x, box.y + y);
}

test.describe("Phase 25 — heatmap & personal segments", () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [
            { name: "gpx-repair-studio.tour.v1", value: "seen" },
          ],
        },
      ],
    },
  });

  test.beforeEach(async ({ page }) => {
    // The shelf (sessions + derived stores + segments) belongs to this
    // spec alone — one DB wipe covers every Phase 25 store (v4).
    await page.goto("/");
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name === "gpx-repair-studio.sessions") {
          indexedDB.deleteDatabase(db.name);
        }
      }
    });
  });

  test("the heatmap: toggle on → one feature per session, legend entry, off hides", async ({
    page,
  }) => {
    await seedLibrary(page, ["Morning Ride", "Second Ride"]);

    // Load the fixture through the landing's repair door (the toggle
    // lives on that map's rail).
    await page.goto("/");
    await loadRideTcx(page);

    const toggle = page.getByTestId("map-heatmap-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();

    // The lazy backfill parses both stored sessions, then the wash
    // lands: visible, one MultiPoint per session, 12 points each.
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__gpxMapController!.getTestState()))
            .heatmap,
        { timeout: 30_000 },
      )
      .toMatchObject({ visible: true, featureCount: 2, pointCount: 22 });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // The legend panel collapses by design (the entries stay in the
    // DOM) — same attached-assertion discipline as the compare ghost.
    await expect(page.getByTestId("map-legend-heatmap")).toBeAttached();

    // Off is off — the layer hides, the legend entry goes.
    await toggle.click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__gpxMapController!.getTestState()))
            .heatmap.visible,
      )
      .toBe(false);
    await expect(page.getByTestId("map-legend-heatmap")).toBeHidden();
  });

  test("segment create → match → PR (the stretch door), then the draw door's honest empty", async ({
    page,
  }) => {
    await seedLibrary(page, ["Morning Ride", "Second Ride"]);

    await page.goto("/");
    await loadRideTcx(page);
    const box = await canvasBox(page);

    // The stretch door: Segments tab → "From the loaded track" → the
    // dialog closes → the chip instructs → two map clicks.
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("library-tab-segments").click();
    await page.getByTestId("segments-new-stretch").click();
    await expect(page.getByTestId("sessions-manager")).toBeHidden();
    await expect(page.getByTestId("segment-draft-chip")).toBeVisible();
    await waitForMapClear(page, box);

    // The fixture's first and last trackpoints (document order).
    await clickAt(page, -37.95, 145.1, box);
    await clickAt(page, -37.945995, 145.100243, box);

    // The naming step: save under a name.
    const nameInput = page.getByTestId("segment-name-input");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Café loop");
    await page.getByTestId("segment-name-save").click();
    await expect(page.getByTestId("segment-name-dialog")).toBeHidden();

    // The matcher runs over both seeded sessions (identical geometry:
    // two efforts, the same elapsed time, the PR on the first).
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("library-tab-segments").click();
    const row = page.getByTestId("segment-row");
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row).toContainText("Café loop");
    // The PR badge reads ELAPSED time: the fixture's two time gaps
    // (06:00:18 → 06:05:00 → 06:11:00) are paid in full — 11:03, the
    // clock-does-not-stop rule proving itself in one assertion.
    await expect(row).toContainText("11:03", { timeout: 30_000 });
    await row.getByRole("button", { name: /^Café loop/i }).click();
    await expect(page.getByTestId("segment-effort")).toHaveCount(2, {
      timeout: 20_000,
    });
    // The rules disclosure states the drift tolerance + the repair
    // dividend (§25.4's sentence, readable in place).
    await page.getByText("How efforts are matched").click();
    await expect(page.getByText(/within 40 m of an anchor/i)).toBeVisible();
    await expect(
      page.getByText(/a data gap inside a segment breaks matching/i),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // The draw door: anchors OFF the track match nothing — the honest
    // empty table, never a fabricated effort.
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("library-tab-segments").click();
    await page.getByTestId("segments-new-draw").click();
    await expect(page.getByTestId("segments-manager")).toBeHidden();
    await expect(page.getByTestId("segment-draft-chip")).toBeVisible();
    await waitForMapClear(page, box);
    await expect(page.getByTestId("segment-draft-confirm")).toBeDisabled();
    await clickAt(page, -37.955, 145.098, box);
    await clickAt(page, -37.952, 145.099, box);
    await expect(page.getByTestId("segment-draft-confirm")).toBeEnabled();
    await page.getByTestId("segment-draft-confirm").click();
    await page.getByTestId("segment-name-input").fill("Drawn sprint");
    await page.getByTestId("segment-name-save").click();
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("library-tab-segments").click();
    await expect(page.getByTestId("segment-row")).toHaveCount(2, {
      timeout: 20_000,
    });
    const drawn = page.getByTestId("segment-row").nth(1);
    await expect(drawn).toContainText("Drawn sprint");
    await drawn.getByRole("button", { name: /^Drawn sprint/i }).click();
    await expect(drawn).toContainText(
      /No saved session covers this segment yet/i,
    );
  });

  test("axe: zero critical violations on the segments tab", async ({
    page,
  }) => {
    await seedLibrary(page, ["Morning Ride"]);
    await page.goto("/");
    await loadRideTcx(page);
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("library-tab-segments").click();
    await expect(page.getByTestId("segments-card")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(results), JSON.stringify(criticals(results))).toEqual([]);
    await page.keyboard.press("Escape");
  });
});
