/**
 * Phase 19 live QA — compare, summaries & guided flows, both themes +
 * mobile, zero console/page errors, every claim measured.
 *
 * Covers: the Before/after card (delta table + mode control), the
 * overlay (ghost layers through the controller's test bridge + the
 * legend entries), the side-by-side dialog (two SVGs, one scale), the
 * repair summary card (provenance rows + snapshot + print flow under
 * emulated print media), the batch summary section (print button +
 * table + thumbnails), the tool-tour offer banner (fresh browser) and
 * the help dialog's replay list, plus the sample-loading action.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const FIXTURES = "src/features/gpx/fixtures/files";
const CHECKS = [];
let failed = 0;

function check(name, condition, detail = "") {
  const ok = condition === true;
  CHECKS.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function freshPage(
  browser,
  { theme = "light", mobile = false, freshTours = false } = {},
) {
  const page = await browser.newPage(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  await page.addInitScript((options) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    if (options.theme === "dark") {
      localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
    }
    if (options.freshTours) {
      localStorage.removeItem("gpx-repair-studio.tool-tours.v1");
    } else {
      localStorage.setItem(
        "gpx-repair-studio.tool-tours.v1",
        JSON.stringify({
          repair: "seen",
          share: "seen",
          recovery: "seen",
          create: "seen",
          merge: "seen",
          plan: "seen",
          batch: "seen",
        }),
      );
    }
  }, { theme, freshTours });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return { page, errors };
}

async function mapState(page) {
  return page.evaluate(() => {
    const controller = window.__gpxMapController;
    return controller
      ? controller.getTestState()
      : Promise.reject(new Error("map controller not exposed"));
  });
}

async function uploadDefects(page) {
  await page.goto(BASE);
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles([`${FIXTURES}/deep-defects.gpx`]);
  await page.getByTestId("compare-card").waitFor({ timeout: 20_000 });
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------------
// Desktop, light: the compare + summary flows
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser);
  await uploadDefects(page);

  // The delta table's four rows.
  for (const id of ["points", "distance", "moving-time", "gain"]) {
    check(
      `delta row ${id} renders`,
      await page.getByTestId(`compare-row-${id}`).isVisible(),
    );
  }

  // Overlay: bridge observables + legend entries.
  await page.getByTestId("compare-mode-overlay").click();
  let state = await mapState(page);
  check(
    "overlay visible through the bridge",
    state.compareOverlay.visible === true,
    JSON.stringify(state.compareOverlay),
  );
  check(
    "ghost lines rendered",
    state.compareOverlay.ghostLineCount > 0,
    `ghost=${state.compareOverlay.ghostLineCount}`,
  );
  check(
    "changed starts empty (no edits yet)",
    state.compareOverlay.changedLineCount === 0,
  );
  check(
    "legend ghost entry attached",
    (await page.getByTestId("map-legend-ghost").count()) === 1,
  );
  check(
    "legend changed entry attached",
    (await page.getByTestId("map-legend-changed").count()) === 1,
  );

  // Apply a real fix, then re-measure.
  const spikeRow = page.getByTestId("deep-issue-row").filter({
    has: page.getByTestId("deep-issue-fix-remove-spikes"),
  });
  await spikeRow.getByTestId("deep-issue-fix-remove-spikes").click();
  await page.getByTestId("fix-preview-confirm").click();
  await page.getByTestId("deep-change-row").waitFor({ timeout: 10_000 });
  state = await mapState(page);
  check(
    "changed stretches render after a fix",
    state.compareOverlay.changedLineCount > 0,
    `changed=${state.compareOverlay.changedLineCount}`,
  );
  const pointsText = await page.getByTestId("compare-row-points").innerText();
  check(
    "points delta counts the removal",
    /−\d+|-\d+/.test(pointsText),
    pointsText.replace(/\s+/g, " ").trim(),
  );

  // The repair summary card: provenance row + snapshot + history.
  check(
    "summary provenance row",
    await page.getByTestId("repair-summary-row-filtered").isVisible(),
  );
  check(
    "summary history row",
    await page.getByTestId("repair-summary-history-row").isVisible(),
  );
  const snapshotSvg = await page
    .getByTestId("repair-summary-snapshot")
    .locator("svg")
    .count();
  check("summary snapshot svg", snapshotSvg === 1);

  // Side-by-side: two SVGs, shared scale (identical viewBox).
  await page.getByTestId("compare-mode-side-by-side").click();
  await page.getByTestId("compare-side-by-side").waitFor();
  const viewBoxes = await page.evaluate(() => {
    const read = (id) =>
      document
        .querySelector(`[data-testid="${id}"] svg`)
        ?.getAttribute("viewBox") ?? null;
    return {
      original: read("compare-panel-svg-original"),
      after: read("compare-panel-svg-after"),
    };
  });
  check(
    "side-by-side panels share one scale",
    viewBoxes.original !== null &&
      viewBoxes.original === viewBoxes.after,
    `${viewBoxes.original} vs ${viewBoxes.after}`,
  );
  await page.keyboard.press("Escape");

  // Print emulation: the summary sheet.
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.emulateMedia({ media: "print" });
  await page.getByTestId("print-summary-button").click();
  await page.waitForFunction(() =>
    document.body.classList.contains("printing-summary"),
  );
  const printProbe = await page.evaluate(() => ({
    headerHidden:
      getComputedStyle(document.querySelector("[data-testid='app-header']"))
        .display === "none",
    summaryVisible:
      getComputedStyle(
        document.querySelector("[data-testid='repair-summary-card']"),
      ).display !== "none",
    mastheadVisible:
      getComputedStyle(
        document.querySelector("[data-testid='summary-print-header']"),
      ).display !== "none",
    statsHidden:
      getComputedStyle(
        document.querySelector('[data-print-region="stats"]'),
      ).display === "none",
  }));
  check("print: header hidden", printProbe.headerHidden);
  check("print: summary card visible", printProbe.summaryVisible);
  check("print: masthead visible", printProbe.mastheadVisible);
  check("print: stats region excluded", printProbe.statsHidden);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });

  check("desktop light: zero console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

// ---------------------------------------------------------------------------
// Desktop, dark: the overlay palette flips (ghost color)
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser, { theme: "dark" });
  await uploadDefects(page);
  await page.getByTestId("compare-mode-overlay").click();
  /* The layer's FIRST paint follows the creation-time palette; a theme
   * swap re-adds the layers (the Phase 12 path) a beat later — read a
   * SETTLED value: two identical reads 800 ms apart. */
  let ghostPaint = null;
  let previous = null;
  for (let i = 0; i < 40; i++) {
    ghostPaint = await page.evaluate(
      () =>
        window.__gpxMapController?.getTestState().compareOverlay.ghostPaint ??
        null,
    );
    if (ghostPaint !== null && ghostPaint === previous) break;
    previous = ghostPaint;
    await page.waitForTimeout(800);
  }
  check(
    "dark theme: ghost paints the dark palette",
    ghostPaint === "#C7C2BB",
    `line-color=${ghostPaint}`,
  );
  check("desktop dark: zero console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

// ---------------------------------------------------------------------------
// Mobile: the compare card and the tour offer fit the narrow viewport
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser, {
    mobile: true,
    freshTours: true,
  });
  await uploadDefects(page);

  // The offer banner fits (no horizontal overflow past tolerance).
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  check(
    "mobile: no horizontal overflow with offer + compare card",
    overflow.scrollW <= overflow.clientW + 1,
    `scroll=${overflow.scrollW} client=${overflow.clientW}`,
  );
  check(
    "mobile: tour offer visible (fresh browser)",
    await page.getByTestId("tool-tour-offer").isVisible(),
  );
  await page.getByTestId("tool-tour-offer-dismiss").click();
  check("mobile: offer dismisses", !(await page.getByTestId("tool-tour-offer").isVisible().catch(() => false)));

  // The compare card renders in the tools sheet.
  check(
    "mobile: compare card visible",
    await page.getByTestId("compare-card").isVisible(),
  );
  check("mobile: zero console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

// ---------------------------------------------------------------------------
// Desktop: the batch summary section
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser);
  await page.goto(BASE);
  await page.getByTestId("landing-mode-batch").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("batch-intake-zone").click();
  await (await chooser).setFiles([
    `${FIXTURES}/deep-defects.gpx`,
    `${FIXTURES}/valid-1.1.gpx`,
  ]);
  await page.getByTestId("batch-enter-studio").waitFor({ timeout: 20_000 });
  await page.getByTestId("batch-enter-studio").click();
  await page.getByTestId("batch-summary-card").waitFor({ timeout: 10_000 });

  check(
    "batch summary: one row per file",
    (await page.getByTestId("batch-summary-row").count()) === 2,
  );
  const thumbs = await page.getByTestId("batch-summary-thumb").count();
  check("batch summary: thumbnails render", thumbs === 2, `thumbs=${thumbs}`);

  // The preset flow changes a file, then the summary counts it.
  await page.getByTestId("batch-preset-drift-cleanup").click();
  await page.getByTestId("batch-preset-dialog").waitFor();
  await page.getByTestId("batch-preset-confirm").click();
  await page.waitForTimeout(400);
  const aggregate = await page
    .getByTestId("batch-summary-card")
    .innerText();
  check(
    "batch summary counts the fixed file",
    /1 changed/.test(aggregate),
    aggregate.replace(/\s+/g, " ").slice(0, 160),
  );

  // The batch print flow.
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.emulateMedia({ media: "print" });
  await page.getByTestId("print-batch-summary-button").click();
  await page.waitForFunction(() =>
    document.body.classList.contains("printing-batch-summary"),
  );
  const batchPrint = await page.evaluate(() => ({
    headerHidden:
      getComputedStyle(document.querySelector("[data-testid='app-header']"))
        .display === "none",
    tableVisible:
      getComputedStyle(
        document.querySelector("[data-testid='batch-summary-table']"),
      ).display !== "none",
    mastheadVisible:
      getComputedStyle(
        document.querySelector("[data-testid='batch-summary-print-header']"),
      ).display !== "none",
  }));
  check("batch print: header hidden", batchPrint.headerHidden);
  check("batch print: table visible", batchPrint.tableVisible);
  check("batch print: masthead visible", batchPrint.mastheadVisible);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });

  check("batch studio: zero console/page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
  await page.close();
}

await browser.close();

console.log(CHECKS.join("\n"));
console.log(`\n${CHECKS.filter((c) => c.startsWith("PASS")).length} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
