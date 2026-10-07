/**
 * Phase 25 VLM sweep — screenshots of the new surfaces (the map's
 * heatmap wash + the segments tab with its effort table) in both
 * themes, saved under scripts/qa/phase25/ for the VLM critique pass.
 *
 * Seeding rides the bundle-import door (same as the e2e): two
 * ride.tcx sessions onto the shelf. The heatmap shot loads the
 * fixture into the repair map and toggles the wash on; the segments
 * shot creates a segment through the stretch door (two projected
 * clicks), waits for the matcher, and opens the expanded row.
 */
import { chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");
const OUT = "scripts/qa/phase25";
mkdirSync(OUT, { recursive: true });

/** The two-session bundle (a user's backup file). */
function bundlePath() {
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
    sessions: ["Morning Ride", "Second Ride"].map((name) => ({
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
  const dir = mkdtempSync(join(tmpdir(), "gpxr-vlm25-"));
  const path = join(dir, "library.gpxrepair.json");
  writeFileSync(path, JSON.stringify(bundle, null, 2));
  return path;
}

const SEEDED = bundlePath();
const browser = await chromium.launch();

async function freshPage(theme) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript((t) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem(
      "gpx-repair-studio.tool-tours.v1",
      JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
    );
    // The theme key is a RAW string ("light" | "dark" | "system") —
    // a JSON object here silently falls back to "system" (the bug the
    // Phase 25 measure pass caught in the Phase 24 sweep's dark shots).
    localStorage.setItem("gpx-repair-studio.theme.v1", t);
  }, theme);
  await page.goto("http://localhost:3000/");
  return page;
}

async function seedShelf(page) {
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("sessions-import-button").click();
  (await chooser).setFiles(SEEDED);
  await page.getByTestId("library-card-stats").first().waitFor({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

/** Load the fixture into the repair map and return the canvas box. */
async function loadTrack(page) {
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles(join(FORMAT_FIXTURES, "ride.tcx"));
  await page.getByTestId("map-toolbar").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

async function shot(theme, name, action) {
  const page = await freshPage(theme);
  await seedShelf(page);
  await action(page);
  await page.screenshot({ path: join(OUT, `${theme}-${name}.png`), fullPage: false });
  await page.close();
  console.log(`${theme}-${name}.png saved`);
}

await shot("light", "heatmap", async (page) => {
  await loadTrack(page);
  await page.getByTestId("map-heatmap-toggle").click();
  // The wash lands after the lazy backfill (two sessions parsed).
  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().heatmap.visible === true,
    undefined,
    { timeout: 30_000 },
  );
  // Pin the legend open so the entry reads in the shot.
  await page.getByTestId("map-legend-toggle").click();
  await page.waitForTimeout(1_200);
});

await shot("dark", "heatmap", async (page) => {
  await loadTrack(page);
  await page.getByTestId("map-heatmap-toggle").click();
  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().heatmap.visible === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1_200);
});

/** The segments tab with a matched segment (created via the map door). */
async function segmentsShot(theme, name, expand) {
  await shot(theme, name, async (page) => {
    await loadTrack(page);
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("library-tab-segments").click();
    await page.getByTestId("segments-new-stretch").click();
    await page.getByTestId("segment-draft-chip").waitFor();
    // The dialog's exit animation keeps a full-page overlay mounted for
    // ~100 ms after close — wait until the canvas is the top element
    // again, or the pick clicks land on the fading scrim.
    await page.waitForFunction(
      ([cx, cy]) => {
        const top = document.elementFromPoint(cx, cy);
        return top !== null && top.closest(".maplibregl-canvas") !== null;
      },
      [box.x + box.width / 2, box.y + box.height / 2],
      { timeout: 5000, polling: 50 },
    );
    const clickAt = async (lat, lon) => {
      const { x, y } = await page.evaluate(
        ([lat_, lon_]) =>
          window.__gpxMapController.projectLatLon(lat_, lon_),
        [lat, lon],
      );
      await page.mouse.click(box.x + x, box.y + y);
    };
    await clickAt(-37.95, 145.1);
    await clickAt(-37.945995, 145.100243);
    await page.getByTestId("segment-name-input").waitFor();
    await page.getByTestId("segment-name-input").fill("Café loop");
    await page.getByTestId("segment-name-save").click();
    // The matcher over both sessions (the PR badge lands last).
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("library-tab-segments").click();
    await page.getByTestId("segment-row").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(2_500);
    if (expand) {
      await page
        .getByTestId("segment-row")
        .getByRole("button", { name: /^Café loop/i })
        .click();
      await page.getByTestId("segment-effort").first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(500);
    }
  });
}

await segmentsShot("light", "segments", true);
await segmentsShot("dark", "segments", true);

await browser.close();
console.log("screenshots saved to", OUT);
