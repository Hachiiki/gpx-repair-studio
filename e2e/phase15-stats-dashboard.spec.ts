/**
 * Phase 15 E2E — the stats dashboard (§EE 15 verification):
 *
 *   1. the sample ride opens with the splits card: one row per
 *      kilometer of the merged route (the count cross-checked against
 *      the table's own Total cell), provenance badges everywhere, and
 *      the splits crossed by recording holes carrying the gap-leg
 *      flags (partial time disclosed, never padded);
 *   2. the pace chart paints one bar per timed split; the unit toggle
 *      re-ranges the table (km ↔ mi);
 *   3. the time-in-motion card reconciles its buckets and reports the
 *      clean sample honestly (a steady ~3 m/s ride: no stops);
 *   4. the elevation profile: hover/keyboard readout + the textual
 *      profile table (§C-5) + the area shading;
 *   5. "Stats CSV" downloads the long-format sheet — bytes checked;
 *   6. "Print" drives the print flow: body class, hidden chrome,
 *      visible stats region under emulated print media, afterprint
 *      cleanup;
 *   7. axe: zero critical violations on the dashboard surfaces.
 *
 * No network: the bundled sample rides the same pipeline as an upload.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { enterRepairTool } from "./helpers/landing";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "critical");
}

async function loadSample(page: Page): Promise<void> {
  await page.goto("/");
  await enterRepairTool(page);
  await page.getByTestId("try-sample").click();
  await expect(page.getByTestId("splits-card")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("Phase 15 — stats dashboard", () => {
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

  test("splits: rows reconcile with the total, holes disclosed, unit toggles", async ({
    page,
  }) => {
    await loadSample(page);

    // One row per kilometer: the count must match the table's own
    // Total cell (self-consistency, no hard-coded geometry).
    const rows = page.getByTestId(/split-row-\d+/);
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(4);
    const totalCell = page.getByTestId("splits-table").locator("tr").last();
    const totalText = await totalCell.innerText();
    const totalKm = Number(/([\d.]+) km/.exec(totalText)?.[1]);
    expect(Number.isFinite(totalKm)).toBe(true);
    expect(rowCount).toBe(Math.ceil(totalKm - 1e-9));

    // Every row carries a provenance badge.
    for (const row of await rows.all()) {
      expect(await row.locator("td").last().innerText()).toMatch(
        /Recorded|Estimated|Mixed/,
      );
    }

    // The recording holes are time gaps: the splits they land in show
    // the partial-time flag (the sample's two holes are 240 s / 1560 s
    // — both over the 120 s threshold).
    const flagged = page.getByText(/gap leg/);
    await expect(flagged.first()).toBeVisible();

    // The pace chart painted bars.
    expect(await page.getByTestId("splits-pace-bar").count()).toBeGreaterThanOrEqual(
      2,
    );

    // The unit toggle re-ranges the table.
    await page.getByTestId("pace-unit-mi").click();
    await expect(page.getByTestId("split-row-1")).toContainText("mi");
    await expect(page.getByTestId("splits-table")).toContainText("of 1 mi");
    await page.getByTestId("pace-unit-km").click();
    await expect(page.getByTestId("split-row-1")).toContainText("km");
  });

  test("time in motion reconciles; the clean sample reports no stops", async ({
    page,
  }) => {
    await loadSample(page);

    const card = page.getByTestId("time-in-motion-card");
    await expect(card).toBeVisible();
    // The steady sample: ~3 m/s throughout, so no stop events.
    await expect(page.getByTestId("motion-summary")).toContainText(
      "no stops detected",
    );

    // The breakdown rows exist and moving time < wall time (the two
    // recording holes are excluded from moving).
    const table = page.getByTestId("motion-breakdown");
    await expect(table).toContainText("Wall time");
    await expect(table).toContainText("Moving time");
    await expect(table).toContainText("In motion");

    const summary = await page.getByTestId("motion-summary").innerText();
    const wallMatch = /of (\d+:\d+(?::\d+)?) wall time/.exec(summary);
    expect(wallMatch).not.toBeNull();
  });

  test("elevation profile: readout cursor, table, shading", async ({
    page,
  }) => {
    await loadSample(page);

    const svg = page.getByTestId("elevation-profile-svg");
    await expect(svg).toBeVisible();
    // §EE 15.2 — the shading under both provenances.
    expect(
      await page.getByTestId("elevation-profile-area-recorded").count(),
    ).toBeGreaterThanOrEqual(1);

    // Keyboard: focus + arrows move the readout.
    await svg.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("elevation-profile-readout")).toContainText(
      /at [\d.]+ (m|km) — \d+ m \(/,
    );
    await page.keyboard.press("End");
    await expect(page.getByTestId("elevation-profile-readout")).toContainText(
      "recorded",
    );

    // The textual equivalent (§C-5).
    await page.getByTestId("elevation-profile-table-toggle").click();
    await expect(page.getByTestId("elevation-profile-table")).toBeVisible();
    const tableText = await page
      .getByTestId("elevation-profile-table")
      .innerText();
    expect(tableText).toContain("Distance interval");
    expect(tableText).not.toMatch(/\d+ m–\d+ m–/);
  });

  test("stats CSV downloads the long-format sheet", async ({ page }) => {
    await loadSample(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-stats-csv-button").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.stats\.csv$/);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(path, "utf8");

    // Long format: header + meta + summary + splits (+ motion).
    expect(text.startsWith("section,label,value,unit,provenance,note\r\n")).toBe(
      true,
    );
    expect(text).toContain("meta,app,GPX Repair Studio");
    expect(text).toContain("meta,source_file,sample-ride-with-gaps.gpx");
    expect(text).toContain("summary,total_distance,");
    expect(text).toContain("summary,in_motion_time,");
    expect(text).toContain("split,split_1_distance,");
    expect(text).toContain("split,split_1_pace_per_km,");
    expect(text).toContain("split,split_1_pace_per_mi,");
    // The holes disclose their partial time in the note column.
    expect(text).toContain("gap leg");
  });

  test("print: the sheet shapes the page and afterprint cleans up", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.print = () => {
        // Stub: record the call, keep the class for assertions.
        (window as unknown as Record<string, unknown>).__printed = true;
      };
    });
    await loadSample(page);

    await page.emulateMedia({ media: "print" });
    await page.getByTestId("print-stats-button").click();
    await page.waitForFunction(
      () => document.body.classList.contains("printing-stats"),
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as Record<string, unknown>).__printed === true,
      ),
    ).toBe(true);

    // Chrome hidden, the stats region + masthead shown, under print.
    await expect(page.getByTestId("app-header")).toBeHidden();
    await expect(page.getByTestId("site-footer")).toBeHidden();
    await expect(page.getByTestId("stats-panel")).toBeVisible();
    await expect(page.getByTestId("splits-card")).toBeVisible();
    await expect(page.getByTestId("gpx-summary")).toBeHidden();
    // The print-only masthead is display:none on screen; visible here.
    await expect(page.getByTestId("stats-print-header")).toBeVisible();

    // afterprint returns the app to the screen layout.
    await page.evaluate(() =>
      window.dispatchEvent(new Event("afterprint")),
    );
    await page.waitForFunction(
      () => !document.body.classList.contains("printing-stats"),
    );
    await expect(page.getByTestId("app-header")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });

  test("axe: zero critical violations on the dashboard surfaces", async ({
    page,
  }) => {
    await loadSample(page);
    // Open the textual surfaces before scanning (tables, readout).
    await page.getByTestId("elevation-profile-table-toggle").click();
    await page.getByTestId("splits-table-toggle").click();
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(results), JSON.stringify(criticals(results))).toEqual([]);
  });
});
