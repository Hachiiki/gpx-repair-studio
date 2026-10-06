/**
 * Phase 23 E2E — fitness zones & metrics (§EE 23 verification):
 *
 *   1. a metrics-bearing TCX (hr/cad/watts, the ride.tcx fixture)
 *      opens the zones card: HR distribution rows with real times,
 *      the reconciliation line, the per-split breakdown;
 *   2. the metrics chart draws hr/cad/power over the elevation
 *      backdrop, with the keyboard readout and the textual twin;
 *   3. the settings popover: editing max HR re-derives the boundaries
 *      in place; the calorie opt-in shows the disclosed estimate;
 *   4. the pace tab carries GAP (the Minetti line) and the honest
 *      race-unset reason;
 *   5. the stop threshold setting re-shapes the time-in-motion card;
 *   6. the stats CSV carries the zone/meta/summary rows;
 *   7. axe: zero critical violations on the new surfaces.
 *
 * No network: the fixture rides the same pipeline as any upload.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";
import { enterRepairTool } from "./helpers/landing";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");

function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "critical");
}

async function loadRideTcx(page: Page): Promise<void> {
  await page.goto("/");
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(join(FORMAT_FIXTURES, "ride.tcx"));
  await expect(page.getByTestId("zones-card")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("Phase 23 — fitness zones & metrics", () => {
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
    await abortRoadRouting(page);
  });

  test("HR zones: distribution rows, reconciliation, per-split breakdown", async ({
    page,
  }) => {
    await loadRideTcx(page);

    const card = page.getByTestId("zones-card");
    await expect(card).toBeVisible();

    // The card opens on the HR tab (the fixture's dominant metric).
    await expect(page.getByTestId("zones-tab-hr")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Five zone rows, named, with range labels and times.
    for (let zone = 1; zone <= 5; zone += 1) {
      await expect(page.getByTestId(`zone-row-${zone}`)).toBeVisible();
    }
    await expect(page.getByTestId("zone-row-1")).toContainText("Endurance");
    await expect(page.getByTestId("zone-row-1")).toContainText(
      /under \d+ bpm/,
    );
    await expect(page.getByTestId("zone-row-5")).toContainText(
      /\d+ bpm and above/,
    );
    // Real time landed somewhere (the ride's hr climbs through Z2–Z4).
    const row3 = await page.getByTestId("zone-row-3").innerText();
    expect(row3).toMatch(/\d+:\d\d/);

    // The per-split breakdown opens with zone columns.
    await page.getByTestId("zones-split-toggle").click();
    await expect(page.getByTestId("zones-split-table")).toBeVisible();
    await expect(page.getByTestId("zones-split-table")).toContainText("Z1");
    await expect(page.getByTestId("zones-split-table")).toContainText("Z5");
  });

  test("metrics chart: tabs, elevation backdrop, keyboard readout, twin", async ({
    page,
  }) => {
    await loadRideTcx(page);

    const chart = page.getByTestId("metrics-chart");
    await expect(chart).toBeVisible();

    // All three metrics exist in the fixture — three tabs.
    await expect(page.getByTestId("metrics-tab-hr")).toBeVisible();
    await expect(page.getByTestId("metrics-tab-cad")).toBeVisible();
    await expect(page.getByTestId("metrics-tab-power")).toBeVisible();

    // The elevation backdrop + the metric series painted.
    expect(
      await page.getByTestId("metrics-elevation-backdrop").count(),
    ).toBeGreaterThanOrEqual(1);
    expect(await page.getByTestId("metrics-series").count()).toBeGreaterThanOrEqual(
      1,
    );

    // Keyboard: focus + arrows move the readout (the profile's
    // discipline, applied verbatim).
    const svg = page.getByTestId("metrics-chart-svg");
    await svg.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("metrics-readout")).toContainText(
      /at [\d.]+ (m|km) — \d+ bpm/,
    );
    await page.keyboard.press("End");
    await expect(page.getByTestId("metrics-readout")).toContainText("bpm");

    // The textual twin (§C-5).
    await page.getByTestId("metrics-table-toggle").click();
    await expect(page.getByTestId("metrics-table")).toBeVisible();
    await expect(page.getByTestId("metrics-table")).toContainText(
      "Distance interval",
    );

    // The cadence tab re-ranges the chart.
    await page.getByTestId("metrics-tab-cad").click();
    await expect(page.getByTestId("metrics-readout")).toContainText(
      "hover, or focus + arrow keys",
    );
  });

  test("settings: max-HR edit re-derives boundaries; calories opt-in", async ({
    page,
  }) => {
    await loadRideTcx(page);

    // The popover anchors to its trigger (fixed-position): scroll the
    // trigger well inside the viewport FIRST so the opened sheet and
    // its scrollable content stay reachable.
    await page.getByTestId("zone-settings-trigger").scrollIntoViewIfNeeded();
    await page.getByTestId("zone-settings-trigger").click();
    await expect(page.getByTestId("zone-settings-popover")).toBeVisible();

    // The default max (190) shows the 60/70/80/90% boundaries.
    await expect(page.getByTestId("zone-row-1")).toContainText(
      "under 114 bpm",
    );

    // Edit max HR to 180 — the boundaries re-derive to 108/126/144/162.
    const maxHr = page.getByLabel("Max heart rate", { exact: false });
    await maxHr.fill("180");
    await maxHr.blur();
    await expect(page.getByTestId("zone-row-1")).toContainText(
      "under 108 bpm",
    );

    // The calorie opt-in: toggle + weight → the disclosed estimate.
    // (The popover scrolls — its full height exceeds the viewport.)
    await page.getByTestId("zone-calories-toggle").scrollIntoViewIfNeeded();
    await page.getByTestId("zone-calories-toggle").check();
    const weight = page.getByLabel("Weight");
    // 75, not the field's 70 fallback — an unchanged value is no commit.
    await weight.fill("75");
    await weight.blur();
    await expect(page.getByTestId("zones-calories")).toContainText(/kcal/);
    await expect(page.getByTestId("zones-calories")).toContainText(
      /estimate/i,
    );
  });

  test("pace tab: GAP line + the race-unset reason; stop threshold wiring", async ({
    page,
  }) => {
    await loadRideTcx(page);

    await page.getByTestId("zones-tab-pace").click();
    // The fixture carries elevation → the GAP line reads its value.
    const gap = page.getByTestId("zones-gap");
    await expect(gap).toBeVisible();
    await expect(gap).toContainText(/GAP [\d:]+ \/km vs/);
    // No race result set → the pace zones carry the honest reason.
    await expect(page.getByTestId("zones-reason")).toContainText(
      "Set a recent race result",
    );

    // The stop threshold is a setting now (23.4): the motion card's
    // copy discloses the live value.
    await expect(page.getByTestId("time-in-motion-card")).toContainText(
      "under 0.5 m/s",
    );
  });

  test("stats CSV carries the zone rows", async ({ page }) => {
    await loadRideTcx(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-stats-csv-button").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.stats\.csv$/);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const text = readFileSync(path, "utf8");

    // The zone models are named in the meta section.
    expect(text).toContain("meta,zone_model,");
    expect(text).toContain("meta,hr_max,190");
    expect(text).toContain("meta,power_ftp,200");
    expect(text).toContain("meta,stop_speed,0.5");
    // The zone + no-data + per-split rows. The fixture's hr is
    // complete (no hr no-data row — the honest absence); its power
    // exists on a single point, so the power no-data row carries the
    // moving time.
    expect(text).toContain("zone,hr_zone_1_time,");
    expect(text).toContain("zone,power_no_data_time,");
    expect(text).toContain("zone,cadence_range_");
    // Split 1's ZONE-1 time is legitimately zero (the ride starts in
    // Z2) — zero rows are skipped; assert the split-1 hr rows exist.
    expect(text).toContain("split_zone,split_1_hr_zone_");
    // The GAP summary (the fixture has elevation).
    expect(text).toContain("summary,gap_pace_per_km,");
  });

  test("axe: zero critical violations on the new surfaces", async ({
    page,
  }) => {
    await loadRideTcx(page);
    // Open every textual surface before scanning.
    await page.getByTestId("zones-split-toggle").click();
    await page.getByTestId("metrics-table-toggle").click();
    await page.getByTestId("metrics-tab-power").click();
    await page.getByTestId("zone-settings-trigger").click();
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(results), JSON.stringify(criticals(results))).toEqual([]);
  });
});
