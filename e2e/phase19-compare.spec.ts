/**
 * Phase 19 E2E — the compare view & repair summary (§EE 19.1/19.2
 * verification):
 *
 *   1. the deep-defects sample opens with the Before/after card: the
 *      delta table renders the four rows with honest "—" cells, and
 *      the mode control is a radiogroup;
 *   2. OVERLAY: the map gains the ghost layers — asserted through the
 *      controller's test bridge (layer ids + the compare observables)
 *      — and the legend gains its two entries;
 *   3. after confirming a real fix, the changed stretches render (the
 *      bridge's changedLineCount > 0) and the delta table shows the
 *      negative points delta with the modified flag;
 *   4. SIDE BY SIDE: the dialog opens with both panels at a shared
 *      scale and closes back to off;
 *   5. PRINT (repair summary): emulated print media — body class,
 *      hidden chrome, visible summary region + masthead, the STATS
 *      region hidden while the summary prints, afterprint cleanup;
 *   6. axe: zero critical violations on the compare surfaces.
 *
 * No network: the bundled fixtures ride the same pipelines as uploads.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const DEFECTS = join(FIXTURES, "deep-defects.gpx");

function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "critical");
}

async function mapState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const controller = (
      window as unknown as {
        __gpxMapController?: {
          getTestState: () => Record<string, unknown>;
        };
      }
    ).__gpxMapController;
    return controller
      ? controller.getTestState()
      : Promise.reject(new Error("map controller not exposed"));
  });
}

async function loadDefects(page: Page): Promise<void> {
  await page.goto("/");
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles([DEFECTS]);
  await expect(page.getByTestId("compare-card")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("Phase 19 — compare & repair summary", () => {
  test("delta table renders honestly before any edit", async ({ page }) => {
    await loadDefects(page);

    // The radiogroup with three modes, "off" checked.
    const mode = page.getByTestId("compare-mode");
    await expect(mode).toBeVisible();
    await expect(
      mode.getByRole("radio", { name: /Overlay/ }),
    ).toHaveAttribute("aria-checked", "false");

    // All four rows exist; pristine deltas are ±0 or "—".
    for (const id of ["points", "distance", "moving-time", "gain"]) {
      await expect(page.getByTestId(`compare-row-${id}`)).toBeVisible();
    }
    const pointsText = await page
      .getByTestId("compare-row-points")
      .innerText();
    expect(pointsText).toMatch(/±0|0/);
  });

  test("overlay: ghost layers render, legend explains them, changed spans appear after a fix", async ({
    page,
  }) => {
    await loadDefects(page);

    // Before overlay: the bridge reports no compare.
    const before = (await mapState(page)) as {
      compareOverlay: { visible: boolean };
      layerIds: string[];
    };
    expect(before.compareOverlay.visible).toBe(false);
    // The layers exist in the style (added hidden at layer-add time).
    expect(before.layerIds).toContain("gpxr-ghost");
    expect(before.layerIds).toContain("gpxr-changed");

    // Switch overlay on.
    await page.getByTestId("compare-mode-overlay").click();
    await expect(
      page.getByTestId("compare-overlay-note"),
    ).toBeVisible();

    const overlay = (await mapState(page)) as {
      compareOverlay: {
        visible: boolean;
        ghostLineCount: number;
        changedLineCount: number;
      };
    };
    expect(overlay.compareOverlay.visible).toBe(true);
    expect(overlay.compareOverlay.ghostLineCount).toBeGreaterThan(0);
    expect(overlay.compareOverlay.changedLineCount).toBe(0);

    // The legend gains its entries (the panel always stays in the DOM;
    // the entries are the contract).
    await expect(page.getByTestId("map-legend-ghost")).toBeAttached();
    await expect(page.getByTestId("map-legend-changed")).toBeAttached();

    // Apply a real fix: the first speed-spike removal.
    const spikeRow = page.getByTestId("deep-issue-row").filter({
      has: page.getByTestId("deep-issue-fix-remove-spikes"),
    });
    await spikeRow.getByTestId("deep-issue-fix-remove-spikes").click();
    await page.getByTestId("fix-preview-confirm").click();
    await expect(page.getByTestId("deep-change-row")).toHaveCount(1);

    // The changed stretches now render; the delta table counts them.
    await expect
      .poll(
        async () =>
          (
            (await mapState(page)) as {
              compareOverlay: { changedLineCount: number };
            }
          ).compareOverlay.changedLineCount,
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    const pointsText = await page
      .getByTestId("compare-row-points")
      .innerText();
    expect(pointsText).toMatch(/−\d+|-\d+/);
    expect(pointsText).toContain("removed by fixes");

    // The summary card counts the modification.
    await expect(page.getByTestId("repair-summary-card")).toBeVisible();
    await expect(
      page.getByTestId("repair-summary-row-filtered"),
    ).toBeVisible();
    await expect(page.getByTestId("repair-summary-snapshot")).toBeVisible();

    // Off restores the plain map.
    await page.getByTestId("compare-mode-off").click();
    await expect
      .poll(async () =>
        (
          (await mapState(page)) as {
            compareOverlay: { visible: boolean };
          }
        ).compareOverlay.visible,
      )
      .toBe(false);
  });

  test("side by side: both panels at a shared scale, close returns to off", async ({
    page,
  }) => {
    await loadDefects(page);

    await page.getByTestId("compare-mode-side-by-side").click();
    const dialog = page.getByTestId("compare-side-by-side");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("compare-panel-original")).toBeVisible();
    await expect(page.getByTestId("compare-panel-after")).toBeVisible();
    // Both panels carry an SVG (the shared-bounds snapshot).
    expect(
      await page.getByTestId("compare-panel-svg-original").locator("svg").count(),
    ).toBe(1);
    expect(
      await page.getByTestId("compare-panel-svg-after").locator("svg").count(),
    ).toBe(1);
    // The legend explains the encoding.
    await expect(
      page.getByTestId("compare-side-by-side-legend"),
    ).toBeVisible();

    // Esc closes and the mode returns to off.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByTestId("compare-mode").getByRole("radio", { name: /^Off/ }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("print: the repair-summary sheet shapes the page and afterprint cleans up", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.print = () => {
        (window as unknown as Record<string, unknown>).__printed = true;
      };
    });
    await loadDefects(page);

    await page.emulateMedia({ media: "print" });
    await page.getByTestId("print-summary-button").click();
    await page.waitForFunction(() =>
      document.body.classList.contains("printing-summary"),
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as Record<string, unknown>).__printed === true,
      ),
    ).toBe(true);

    // Chrome hidden, the summary region + masthead shown, under print.
    await expect(page.getByTestId("app-header")).toBeHidden();
    await expect(page.getByTestId("site-footer")).toBeHidden();
    await expect(page.getByTestId("repair-summary-card")).toBeVisible();
    await expect(page.getByTestId("summary-print-header")).toBeVisible();
    await expect(page.getByTestId("repair-summary-snapshot")).toBeVisible();
    // The STATS region stays out of the summary sheet.
    await expect(page.getByTestId("stats-panel")).toBeHidden();

    // afterprint returns the app to the screen layout.
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.waitForFunction(
      () => !document.body.classList.contains("printing-summary"),
    );
    await expect(page.getByTestId("app-header")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });

  test("axe: zero critical violations on the compare surfaces", async ({
    page,
  }) => {
    await loadDefects(page);
    // Open every compare surface before scanning.
    await page.getByTestId("compare-mode-overlay").click();
    await page.getByTestId("compare-mode-side-by-side").click();
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(results), JSON.stringify(criticals(results))).toEqual([]);
  });
});
