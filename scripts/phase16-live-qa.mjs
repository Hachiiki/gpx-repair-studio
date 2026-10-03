/**
 * Phase 16 (track surgery & input freedom) — live QA: the two new
 * surfaces + the keyboard milestone's primitives, in BOTH themes,
 * against the dev server on :3000.
 *
 *   1. sample load → the surgery card sits in the tools column with
 *      its four operations — light + dark screenshots;
 *   2. the split flow end-to-end: form → resolution line → preview →
 *      confirm → the stats "Modified:" note + the segment list gains
 *      the derived id → undo restores;
 *   3. the duplicate flow → the export bytes carry the copy (the
 *      coordinates appear twice) + the note discloses it;
 *   4. the draw editor's vertex forms: add by coordinates, nudge with
 *      the arrow keys (the input refreshes), the step selector, the
 *      insert form's midpoint prefill;
 *   5. mobile width (390) — the surgery card stacks readably;
 *   6. zero console/page errors throughout.
 *
 * Screenshots land in download/phase16-* for the VLM critique.
 */
import { chromium } from "@playwright/test";

const OUT = "download";
const errors = [];
const pageErrors = [];
const checks = [];

function ok(name, condition) {
  checks.push([name, Boolean(condition)]);
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);
}

const browser = await chromium.launch();

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
  await page.screenshot({ path: `${OUT}/phase16-${name}.png`, fullPage });
}

function watchConsole(page) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
}

async function segmentIds(page) {
  return page
    .getByTestId("segment-list")
    .locator("[data-seg-id]")
    .evaluateAll((rows) => rows.map((r) => r.dataset.segId ?? ""));
}

async function loadSample(page) {
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) {
    await card.click();
  }
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles(
    "src/features/gpx/fixtures/files/multi-segment.gpx",
  );
  await page.getByTestId("surgery-card").waitFor({ state: "visible" });
}

// ---------------------------------------------------------------------------
// 1-3 — the surgery card, both themes
// ---------------------------------------------------------------------------
for (const theme of ["light", "dark"]) {
  const context = await themedContext({ width: 1280, height: 900 }, theme);
  const page = await context.newPage();
  watchConsole(page);

  await loadSample(page);
  const card = page.getByTestId("surgery-card");
  ok(
    `[${theme}] the surgery card renders with four operations`,
    (await card.getByTestId("surgery-tab-split").isVisible()) &&
      (await card.getByTestId("surgery-tab-range").isVisible()) &&
      (await card.getByTestId("surgery-tab-duplicate").isVisible()) &&
      (await card.getByTestId("surgery-tab-reorder").isVisible()),
  );
  await capture(page, `surgery-card-${theme}`);

  // The split flow end-to-end.
  await card.getByTestId("surgery-split-segment").selectOption("t0s0");
  await card.getByTestId("surgery-split-number").fill("2");
  ok(
    `[${theme}] the split form shows the live resolution`,
    await card.getByTestId("surgery-split-resolution").isVisible(),
  );
  await card.getByTestId("surgery-split-apply").click();
  const dialog = page.getByTestId("fix-preview-dialog");
  await dialog.waitFor({ state: "visible" });
  await capture(page, `surgery-preview-${theme}`);
  await dialog.getByTestId("fix-preview-confirm").click();
  ok(
    `[${theme}] the split applies — the derived id appears`,
    (await segmentIds(page)).includes("t0s0~s1"),
  );
  ok(
    `[${theme}] the stats panel labels the split`,
    (await page
      .getByTestId("stats-working-note")
      .innerText()).includes("1 segment split"),
  );
  await page.getByTestId("deep-undo-last").click();
  ok(
    `[${theme}] undo restores the pristine segments`,
    (await segmentIds(page)).join(",") === "t0s0,t0s1,t0s2",
  );

  // The duplicate flow → export bytes.
  await card.getByTestId("surgery-tab-duplicate").click();
  await card.getByTestId("surgery-duplicate-button-t0s1").click();
  await page
    .getByTestId("fix-preview-dialog")
    .getByTestId("fix-preview-confirm")
    .click();
  ok(
    `[${theme}] the duplicate applies`,
    (await segmentIds(page)).includes("t0s1~d1"),
  );
  await page.getByTestId("open-export-button").click();
  const exportDialog = page.getByTestId("export-dialog");
  await exportDialog.waitFor({ state: "visible" });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportDialog.getByTestId("export-download-button").click(),
  ]);
  const path = await download.path();
  const xml = path
    ? (await import("node:fs")).readFileSync(path, "utf8")
    : "";
  ok(
    `[${theme}] the export carries the copy (coordinates twice)`,
    (xml.match(/52\.520141/g) ?? []).length === 2,
  );
  ok(
    `[${theme}] the export note discloses the copy`,
    xml.includes("1 segment copy was inserted"),
  );

  await context.close();
}

// ---------------------------------------------------------------------------
// 4 — the draw editor's vertex forms (light theme, single run)
// ---------------------------------------------------------------------------
{
  const context = await themedContext({ width: 1280, height: 900 }, "light");
  const page = await context.newPage();
  watchConsole(page);

  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles(
    "src/features/gpx/fixtures/files/time-gap.gpx",
  );
  await page.getByTestId("gap-list").waitFor({ state: "visible" });

  await page.getByTestId("open-editor-button").first().click();
  await page.getByTestId("draw-editor-panel").waitFor({ state: "visible" });

  // Add two points by coordinates.
  await page.getByTestId("vertex-add-form-lat").fill("52.5199");
  await page.getByTestId("vertex-add-form-lon").fill("13.4044");
  await page.getByTestId("vertex-add-form-button").click();
  await page.getByTestId("vertex-add-form-lat").fill("52.5202");
  await page.getByTestId("vertex-add-form-lon").fill("13.4049");
  await page.getByTestId("vertex-add-form-button").click();
  ok(
    "[forms] two points typed by coordinates",
    (await page.getByTestId("vertex-row").count()) === 2,
  );

  // Nudge the first point — the input refreshes with the new position.
  const firstLat = page
    .getByTestId("vertex-row")
    .nth(0)
    .getByTestId("vertex-lat-input");
  await page.getByTestId("vertex-nudge-handle").first().focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  ok(
    "[forms] arrow nudges move the point (the input refreshes)",
    (await firstLat.inputValue()) !== "52.5199",
  );

  // The step selector persists a choice.
  await page.getByTestId("nudge-step-select").selectOption("1");
  await page.getByTestId("vertex-nudge-handle").first().focus();
  await page.keyboard.press("ArrowUp");
  const nudged = await firstLat.inputValue();
  ok(
    "[forms] the 1 m step nudges finer than the 10 m default did",
    Number(nudged) < 52.5199 + 3 * (10 / 111320),
  );

  // The insert form prefills the geodesic midpoint.
  await page.getByTestId("vertex-insert-toggle").first().click();
  const insertLat = await page
    .getByTestId("vertex-insert-form-lat")
    .inputValue();
  ok(
    "[forms] the insert form prefills the midpoint",
    Math.abs(Number(insertLat) - 52.52005) < 1e-4,
  );
  await capture(page, "vertex-forms");

  // A bad coordinate is refused honestly.
  await page.getByTestId("vertex-insert-form-lat").fill("120");
  await page.getByTestId("vertex-insert-form-button").click();
  ok(
    "[forms] an out-of-bounds latitude is refused with the bound named",
    (await page.getByTestId("vertex-insert-form-error").innerText()).includes(
      "-90 and 90",
    ),
  );
  await capture(page, "vertex-forms-error");

  await context.close();
}

// ---------------------------------------------------------------------------
// 5 — mobile width
// ---------------------------------------------------------------------------
{
  const context = await themedContext({ width: 390, height: 844 }, "light");
  const page = await context.newPage();
  watchConsole(page);
  await loadSample(page);
  // Expand the tools sheet and scroll to the card.
  const toggle = page.getByTestId("mobile-tools-toggle");
  if (await toggle.isVisible()) {
    await toggle.click();
  }
  await page.getByTestId("surgery-card").scrollIntoViewIfNeeded();
  await capture(page, "surgery-card-mobile");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok("[mobile] no horizontal document overflow", overflow <= 0);
  await context.close();
}

await browser.close();

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
const failed = checks.filter(([, passed]) => !passed);
console.log("\n—— Phase 16 live QA ——");
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (errors.length > 0) {
  console.log(`console errors (${errors.length}):`);
  for (const message of errors.slice(0, 5)) console.log(`  ${message}`);
}
if (pageErrors.length > 0) {
  console.log(`page errors (${pageErrors.length}):`);
  for (const message of pageErrors.slice(0, 5)) console.log(`  ${message}`);
}
if (failed.length > 0 || errors.length > 0 || pageErrors.length > 0) {
  console.log("RESULT: FAIL");
  process.exit(1);
}
console.log("RESULT: PASS — zero console/page errors");
