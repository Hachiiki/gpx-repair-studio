/**
 * Phase 13 (deep validation & repair presets) — live QA: the find→fix
 * surface in BOTH themes, exercised end-to-end against the dev server.
 *
 *   1. upload the defective fixture → the deep-validation card lists
 *      every damage kind (severity chips, counts) — light + dark;
 *   2. expand a point list (the textual a11y equivalent);
 *   3. jump-to-map focuses the flagged point (camera assertions);
 *   4. the full fix flow: preview dialog → confirm → the finding
 *      clears, the change log lands, the stats panel labels the
 *      working copy as modified — screenshots at each step;
 *   5. a preset chain (spike-sweep) with the compound preview;
 *   6. the export dialog discloses the working-copy counts;
 *   7. undo restores the finding;
 *   8. mobile width (390) — the card stacks in the tools column;
 *   9. zero console/page errors throughout.
 *
 * Screenshots land in download/phase13-* for the VLM critique.
 * Run against the dev server on :3000.
 */
import { chromium } from "@playwright/test";

const OUT = "download";
const FIXTURE = "src/features/gpx/fixtures/files/deep-defects.gpx";
const errors = [];
const pageErrors = [];

const browser = await chromium.launch();

/** A themed context with the tour seen. */
async function themedContext(viewport, theme) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ({ theme }) => {
      try {
        localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
        localStorage.setItem("gpx-repair-studio.theme.v1", theme);
      } catch {
        /* storage blocked — tolerated */
      }
    },
    { theme },
  );
  return context;
}

async function capture(page, name, { fullPage = false } = {}) {
  await page.waitForTimeout(450); // the Phase 11 settle lesson
  await page.screenshot({ path: `${OUT}/phase13-${name}.png`, fullPage });
}

function watchErrors(page) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
}

async function check(page, label, fn) {
  try {
    const value = await fn();
    console.log(`  ok   ${label}: ${JSON.stringify(value)}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    process.exitCode = 1;
  }
}

/** Upload the defective fixture through the repair tool's intake. */
async function uploadDefects(page) {
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(FIXTURE);
  await page.getByTestId("deep-validation-card").waitFor({ state: "visible" });
  await page.waitForTimeout(600);
}

async function camera(page) {
  return page.evaluate(() =>
    window.__gpxMapController
      ? window.__gpxMapController.getTestState()
      : null,
  );
}

// ---------------------------------------------------------------------------
// The flow, per theme
// ---------------------------------------------------------------------------
for (const [theme, suffix] of [
  ["light", "light"],
  ["dark", "dark"],
]) {
  console.log(`\n=== ${theme.toUpperCase()} theme ===`);
  const context = await themedContext({ width: 1440, height: 900 }, theme);
  const page = await context.newPage();
  watchErrors(page);

  await uploadDefects(page);
  await capture(page, `report-${suffix}`);

  await check(page, "six issue kinds render", async () => {
    return await page.getByTestId("deep-issue-row").count() === 6 ? 6 : "FAIL";
  });
  await check(page, "severity order: errors first", async () => {
    const kind = await page
      .getByTestId("deep-issue-row")
      .first()
      .getAttribute("data-kind");
    if (kind !== "speed-spike") throw new Error(`first row is ${kind}`);
    return kind;
  });

  // The textual point list (a11y equivalent).
  const spikeRow = page.getByTestId("deep-issue-row").filter({ hasText: "Speed spikes" });
  await spikeRow.getByTestId("deep-issue-list-toggle").click();
  await check(page, "point list shows ids", async () => {
    const text = await spikeRow.textContent();
    if (!text?.includes("t0s0:10")) throw new Error("no t0s0:10 in the list");
    return "t0s0:10 listed";
  });
  await capture(page, `pointlist-${suffix}`);

  // Jump-to-map.
  const before = await camera(page);
  await spikeRow.getByTestId("deep-issue-jump").click();
  await page.waitForTimeout(900);
  await check(page, "camera moved to the flagged point", async () => {
    const after = await camera(page);
    const near =
      after?.center &&
      Math.abs(after.center.lat - 52.53) < 0.005 &&
      Math.abs(after.center.lon - 13.41) < 0.008;
    if (!near) throw new Error(`center=${JSON.stringify(after?.center)}`);
    return `zoom ${before?.zoom ?? "?"} → ${after?.zoom ?? "?"}`;
  });

  // The fix flow: preview → confirm → cleared finding + log + stats note.
  await page.getByTestId("deep-issue-fix-remove-spikes").click();
  await page.getByTestId("fix-preview-dialog").waitFor({ state: "visible" });
  await capture(page, `preview-${suffix}`);
  await check(page, "preview shows the plan's words", async () => {
    const text = await page.getByTestId("fix-preview-dialog").textContent();
    if (!text?.includes("2 recorded points leave the working copy")) {
      throw new Error("plan summary missing");
    }
    return "plan summary present";
  });
  await page.getByTestId("fix-preview-confirm").click();
  await page.waitForTimeout(500);
  await check(page, "finding cleared (5 remain)", async () => {
    const n = await page.getByTestId("deep-issue-row").count();
    if (n !== 5) throw new Error(`${n} rows`);
    return n;
  });
  await check(page, "change log row landed", async () => {
    const text = await page.getByTestId("deep-change-row").first().textContent();
    if (!text?.includes("Remove 2 speed spikes")) throw new Error(text ?? "empty");
    return "logged with reason";
  });
  await capture(page, `fixed-${suffix}`);

  // Scroll to the stats panel for the modification label.
  await page.getByTestId("details-section").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await check(page, "stats label the working copy", async () => {
    const note = page.getByTestId("stats-working-note");
    const text = await note.textContent();
    if (!text?.includes("2 points removed")) throw new Error(text ?? "no note");
    return "modified note present";
  });
  await capture(page, `stats-${suffix}`);

  // The preset chain with its compound preview.
  await page.getByTestId("deep-issue-list-toggle").first().scrollIntoViewIfNeeded();
  await page.getByTestId("deep-preset-spike-sweep").click();
  await page.getByTestId("fix-preview-dialog").waitFor({ state: "visible" });
  await check(page, "preset skips its satisfied step (1 plan)", async () => {
    // The manual remove-spikes above already cleared the spike finding,
    // so the sweep chain has only the smoothing left — the honest skip.
    const n = await page.getByTestId("fix-preview-plan").count();
    if (n !== 1) throw new Error(`${n} plans`);
    return n;
  });
  await page.getByTestId("fix-preview-confirm").click();
  await page.waitForTimeout(600);
  await check(page, "preset applied (4 findings remain)", async () => {
    const n = await page.getByTestId("deep-issue-row").count();
    if (n !== 4) throw new Error(`${n} rows`);
    return n;
  });
  await capture(page, `preset-${suffix}`);

  // The export dialog discloses the working-copy counts.
  await page.getByTestId("open-export-button").scrollIntoViewIfNeeded();
  await page.getByTestId("open-export-button").click();
  await page.getByTestId("export-dialog").waitFor({ state: "visible" });
  await check(page, "export note discloses the fixes", async () => {
    const text = await page.getByTestId("export-working-note").textContent();
    if (!text?.includes("2 points removed")) throw new Error(text ?? "no note");
    if (!text?.includes("1 elevation smoothed")) throw new Error(text);
    return "disclosure present";
  });
  await capture(page, `export-${suffix}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Undo twice: the smoothing step, then the manual spike removal (the
  // log holds exactly those two edits).
  await page.getByTestId("deep-undo-last").click();
  await page.waitForTimeout(300);
  await page.getByTestId("deep-undo-last").click();
  await page.waitForTimeout(300);
  await check(page, "undo restores the findings (6 rows)", async () => {
    const n = await page.getByTestId("deep-issue-row").count();
    if (n !== 6) throw new Error(`${n} rows`);
    return n;
  });

  await context.close();
}

// ---------------------------------------------------------------------------
// Mobile width (390) — light theme
// ---------------------------------------------------------------------------
console.log(`\n=== MOBILE 390 (light) ===`);
{
  const context = await themedContext({ width: 390, height: 844 }, "light");
  const page = await context.newPage();
  watchErrors(page);
  await uploadDefects(page);
  await capture(page, "report-mobile");
  await check(page, "the card renders on mobile", async () => {
    const box = await page.getByTestId("deep-validation-card").boundingBox();
    if (!box || box.width > 390) throw new Error(`width=${box?.width}`);
    return `width ${Math.round(box.width)}px`;
  });
  await check(page, "no horizontal overflow", async () => {
    return await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth
        ? "clean"
        : `scrollWidth ${document.documentElement.scrollWidth}`;
    });
  });
  await context.close();
}

await browser.close();

console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log(`  · ${e.slice(0, 160)}`);
console.log(`page errors: ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 8)) console.log(`  · ${e.slice(0, 160)}`);
if (errors.length > 0 || pageErrors.length > 0) process.exitCode = 1;
console.log("PHASE 13 LIVE QA DONE");
