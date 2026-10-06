/**
 * Phase 24 E2E — the training library (§24 verification):
 *
 *   1. the seeded shelf (through the NEW bundle-import door — a
 *      .gpxrepair-library.json of two ride.tcx sessions): both index
 *      on dialog open, and the cards carry their numbers (distance,
 *      time, pace, gain, avg HR — the metrics-bearing fixture has
 *      them all);
 *   2. filter + sort + multi-select: the bulk bar counts, the bundle
 *      downloads as a .gpxrepair-library.json, and a bulk delete
 *      removes the selection;
 *   3. the records tab: the three value tiles, the best-efforts
 *      ladder (the fixture covers 400 m … 10 km), the rules
 *      disclosure, and the opt-in Riegel predictions with the
 *      formula and caveat in place;
 *   4. the trends tab: the volume bars with the keyboard readout and
 *      the textual twin, the gated fitness line with its honest
 *      counts;
 *   5. the CSV export downloads with the library's rows;
 *   6. axe: zero critical violations on all three tabs.
 *
 * Seeding rides the same import door a user's backup would (saving
 * through the manager needs actual repair work — §EE 18's WORK
 * predicate — which phase18's spec already covers). No network.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");

function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "critical");
}

/**
 * Seed the shelf with N named ride.tcx sessions by importing a
 * portable library bundle — the Phase 24 import door.
 */
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
  const dir = await mkdtemp(join(tmpdir(), "gpxr-phase24-"));
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
  await expect(page.getByTestId("sessions-row")).toHaveCount(names.length);
}

test.describe("Phase 24 — the training library", () => {
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
    // The shelf belongs to this spec alone.
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

  test("seed → cards index with their numbers; filter, sort, bulk, CSV", async ({
    page,
  }) => {
    await seedLibrary(page, ["Morning Ride", "Second Ride"]);

    // The backfill indexes both rows (they appear as cards with stats).
    await expect(page.getByTestId("library-card-stats").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("library-card-stats")).toHaveCount(2);
    const stats = page.getByTestId("library-card-stats").first();
    await expect(stats).toContainText("11.45 km");
    await expect(stats).toContainText("0:24");
    await expect(stats).toContainText("/km");
    await expect(stats).toContainText("145");
    await expect(stats).toContainText("May 1, 2024");

    // The filter narrows; clearing restores.
    await page.getByTestId("library-filter").fill("second");
    await expect(page.getByTestId("sessions-row")).toHaveCount(1);
    await page.getByTestId("library-filter").fill("");
    await expect(page.getByTestId("sessions-row")).toHaveCount(2);

    // Sorting by name reorders (Morning before Second).
    await page.getByTestId("library-sort").selectOption("name");
    const names = await page.getByTestId("sessions-row").allInnerTexts();
    expect(names[0]!).toContain("Morning Ride");
    expect(names[1]!).toContain("Second Ride");

    // Multi-select: one checkbox, the bundle download, then delete it.
    await page
      .locator('[data-testid="library-card-select"]')
      .nth(1)
      .check();
    await expect(page.getByTestId("library-bulk-bar")).toContainText(
      "1 selected",
    );
    const [bundleDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("library-bulk-export").click(),
    ]);
    const bundleJson = readFileSync(await bundleDownload.path(), "utf8");
    const bundle = JSON.parse(bundleJson) as {
      format: string;
      sessions: { name: string }[];
    };
    expect(bundle.format).toBe("gpxrepair-library");
    expect(bundle.sessions).toHaveLength(1);
    expect(bundle.sessions[0]!.name).toBe("Second Ride");

    await page.getByTestId("library-bulk-delete").click();
    await page.getByTestId("library-bulk-delete-confirm").click();
    await expect(page.getByTestId("sessions-row")).toHaveCount(1);
    await expect(page.getByTestId("sessions-row")).toContainText(
      "Morning Ride",
    );

    // The CSV export carries the indexed rows.
    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("library-export-csv").click(),
    ]);
    const csv = readFileSync(await csvDownload.path(), "utf8");
    expect(csv).toContain("name,section,saved_at,activity_start");
    expect(csv).toContain("Morning Ride");
    expect(csv).toContain("best_effort_1k_s");

    await page.keyboard.press("Escape");
  });

  test("records tab: tiles, ladder, rules, and the opt-in Riegel predictions", async ({
    page,
  }) => {
    await seedLibrary(page, ["Morning Ride"]);
    await expect(page.getByTestId("library-card-stats").first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId("library-tab-records").click();
    const records = page.getByTestId("records-card");
    await expect(records).toBeVisible();

    // The three tiles with the recorded-only numbers.
    await expect(page.getByTestId("records-farthest")).toContainText(
      "Morning Ride",
    );
    await expect(page.getByTestId("records-longest")).toContainText("0:24");
    await expect(page.getByTestId("records-mostgain")).toContainText("2");

    // The ladder: the fixture covers 400 m … 10 km.
    await expect(page.getByTestId("records-effort-400")).toBeVisible();
    await expect(page.getByTestId("records-effort-1000")).toBeVisible();
    await expect(
      page.getByTestId("records-effort-1609.344"),
    ).toBeVisible();
    await expect(page.getByTestId("records-effort-10000")).toBeVisible();
    await expect(records).toContainText("10 km");

    // The rules disclosure states the elapsed + exclusion rules.
    await expect(records.getByText(/clock does not stop/i)).toBeVisible();
    await expect(
      records.getByText(/drawn-in gap is not a record/i),
    ).toBeVisible();

    // Riegel is opt-in: nothing until asked.
    await expect(page.getByTestId("riegel-table")).toBeHidden();
    await page.getByTestId("riegel-enable").click();
    await expect(page.getByTestId("riegel-table")).toBeVisible();
    // The seed defaults to the longest covered distance (10 km).
    await expect(page.getByTestId("riegel-seed")).toHaveValue("10000");
    await expect(page.getByTestId("riegel-row-5000")).toBeVisible();
    await expect(page.getByTestId("riegel-row-42195")).toBeVisible();
    await expect(records.getByText(/\^1\.06/)).toBeVisible();
    await expect(records.getByText(/not a coach/i)).toBeVisible();

    // Axe: zero critical violations.
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(results), JSON.stringify(criticals(results))).toEqual([]);
    await page.keyboard.press("Escape");
  });

  test("trends tab: volume bars, the twin, and the gated fitness line", async ({
    page,
  }) => {
    await seedLibrary(page, ["Morning Ride", "Second Ride"]);
    await expect(page.getByTestId("library-card-stats").first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId("library-tab-trends").click();
    const trends = page.getByTestId("trends-card");
    await expect(trends).toBeVisible();

    // Both sessions share the fixture's activity date → one bucket,
    // two activities, the summed distance.
    await expect(page.getByTestId("trends-volume-bar")).toHaveCount(1);
    // The keyboard readout speaks the bucket (the chart discipline).
    const svg = page.getByTestId("trends-volume-svg");
    await svg.focus();
    await svg.press("ArrowRight");
    const readout = page.getByTestId("trends-volume-readout");
    await expect(readout).toContainText("22.89");
    await expect(readout).toContainText("2 activities");

    // The textual twin of the same series.
    await page.getByTestId("trends-volume-table-toggle").click();
    await expect(page.getByTestId("trends-volume-table")).toBeVisible();
    await expect(page.getByTestId("trends-volume-table")).toContainText("2");

    // The fitness line is gated: 2 sessions < the 8 minimum.
    await expect(page.getByTestId("trends-fitness-gated")).toBeVisible();
    await expect(page.getByTestId("trends-fitness-gated")).toContainText("2");
    await expect(page.getByTestId("trends-fitness-svg")).toBeHidden();

    // Axe: zero critical violations.
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(results), JSON.stringify(criticals(results))).toEqual([]);
    await page.keyboard.press("Escape");
  });
});
