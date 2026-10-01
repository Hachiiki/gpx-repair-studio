import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { enterRepairTool } from "./helpers/landing";

/**
 * Phase 8 E2E — accessibility scans (WCAG 2.1 AA, axe-core).
 *
 * The master plan's Phase 8 acceptance: axe scans on the primary
 * states with ZERO critical violations. Each scan pins the SAME
 * primary states the plan names — empty (the landing), loaded
 * (parsed + inspected), editing (the draw editor open), and the
 * export dialog — on desktop, plus one mobile pass over the
 * sheet-based editing state (the Phase 8 layout).
 *
 * Violations are asserted at the "serious + critical" bar: minor
 * (contrast polish on decorative tokens, best-practice hints) are
 * reported to the log but do not fail the run — the plan's bar is
 * "no critical violations". Everything found is fixed in the app,
 * not silenced here: no disable-rules, no exclusions.
 *
 * Task 53 note — scroll-driven reveals: below-the-fold sections fade
 * in via `animation-timeline: view()` (reveal-on-scroll), so their
 * opacity is SCRUBBED by scroll position. A scan at the top of a long
 * page measures near-invisible (≈3%) text and flags phantom contrast
 * violations; `revealSettled` steps the page to its bottom first so
 * every reveal completes, and the scan sees the page as a scrolling
 * user does. (An environment drift — Chromium honoring view() — made
 * this load-bearing; the CSS predates Phase 8's green runs.)
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

async function upload(page: Page, path = join(FIXTURES, "time-gap.gpx")) {
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles(path);
}

async function settleMap(page: Page) {
  for (;;) {
    const ready = await page
      .evaluate(() => {
        const c = window.__gpxMapController;
        return c ? c.getTestState().ready : false;
      })
      .catch(() => false);
    if (ready) return;
    await page.waitForTimeout(150);
  }
}

function scan(page: Page) {
  return new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
}

/** Serious/critical only — the plan's bar. */
function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

/**
 * Step the page to its bottom so every scroll-driven reveal completes
 * (see the Task 53 note in the header) — the scan then measures fully
 * revealed text instead of a scroll-scrubbed 3% ghost.
 */
async function revealSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const root = document.scrollingElement ?? document.documentElement;
    const step = Math.max(200, Math.floor(root.clientHeight * 0.8));
    for (let y = 0; y <= root.scrollHeight; y += step) {
      root.scrollTo(0, y);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }
    root.scrollTo(0, root.scrollHeight);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}

test.describe("accessibility — desktop", () => {
  test("the landing (empty state) has no critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-repair").waitFor({ state: "visible" });
    const results = await scan(page).analyze();
    report(results);
    expect(criticals(results)).toEqual([]);
  });

  test("a tool page has no critical violations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-repair").click();
    await page.getByTestId("upload-zone").waitFor({ state: "visible" });
    // The tool page's "How it works" section is below the fold and
    // scroll-revealed — settle the reveals before scanning (header note).
    await revealSettled(page);
    const results = await scan(page).analyze();
    report(results);
    expect(criticals(results)).toEqual([]);
  });

  test("the loaded workspace (inspection state) has no critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await settleMap(page);
    await page.getByTestId("gap-list").waitFor({ state: "visible" });
    const results = await scan(page).analyze();
    report(results);
    expect(criticals(results)).toEqual([]);
  });

  test("the editing state (draw editor open) has no critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await settleMap(page);
    await page.getByTestId("open-editor-button").first().click();
    await page
      .getByTestId("pen-mode-group")
      .waitFor({ state: "visible" });
    const results = await scan(page).analyze();
    report(results);
    expect(criticals(results)).toEqual([]);
  });

  test("the export dialog (open) has no critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await settleMap(page);
    await page.getByTestId("open-export-button").click();
    await page.getByTestId("export-dialog").waitFor({ state: "visible" });
    const results = await scan(page).analyze();
    report(results);
    expect(criticals(results)).toEqual([]);
  });
});

test.describe("accessibility — mobile (the tools sheet)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the mobile editing state (sheet expanded) has no critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await settleMap(page);
    await page.getByTestId("open-editor-button").first().click();
    await page
      .getByTestId("pen-mode-group")
      .waitFor({ state: "visible" });
    const results = await scan(page).analyze();
    report(results);
    expect(criticals(results)).toEqual([]);
  });
});

function report(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  if (results.violations.length > 0) {
    console.log(
      `axe: ${results.violations.length} violation(s) ` +
        `(${criticals(results).length} serious/critical)`,
    );
    for (const violation of results.violations) {
      console.log(
        `  [${violation.impact}] ${violation.id}: ${violation.help} — ` +
          violation.nodes
            .slice(0, 3)
            .map((n) => JSON.stringify(n.target))
            .join(", "),
      );
    }
  } else {
    console.log("axe: clean");
  }
}
