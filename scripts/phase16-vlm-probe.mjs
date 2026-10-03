/**
 * Phase 16 VLM probe — measure the critique's claims before acting on
 * them (the Task 13/14/15 lesson: viewport crops and font metrics lie).
 *
 * Claim 1 (critical): the longitude inputs visually truncate their
 * values. Measured: each coordinate input's scrollWidth vs clientWidth
 * (true clipping) + the computed font/box metrics.
 * Claim 2: the Step selector's purpose is unclear. Measured: the
 * select's accessible name (title + surrounding text).
 * Claim 3: insert vs add forms have identical weight. Measured: the
 * two forms' bounding boxes + indentation delta (layout truth).
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  } catch {
    /* tolerated */
  }
});
const page = await context.newPage();
await page.goto("http://localhost:3000/");
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) await card.click();
await page.getByTestId("upload-zone").waitFor({ state: "visible" });
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
await (await chooser).setFiles("src/features/gpx/fixtures/files/time-gap.gpx");
await page.getByTestId("gap-list").waitFor({ state: "visible" });

await page.getByTestId("open-editor-button").first().click();
await page.getByTestId("draw-editor-panel").waitFor({ state: "visible" });
await page.getByTestId("vertex-add-form-lat").fill("52.5199123456789");
await page.getByTestId("vertex-add-form-lon").fill("13.4044987654321");
await page.getByTestId("vertex-add-form-button").click();
await page.getByTestId("vertex-add-form-lat").fill("52.5202123456789");
await page.getByTestId("vertex-add-form-lon").fill("13.4049987654321");
await page.getByTestId("vertex-add-form-button").click();

// Claim 1 — true clipping in the row inputs (worst case: 7-decimal
// values, the longest the app ever shows after rounding).
const inputMetrics = await page.evaluate(() => {
  const read = (el) => ({
    value: el.value,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    clipped: el.scrollWidth > el.clientWidth + 1,
    font: getComputedStyle(el).fontSize,
  });
  const rows = [...document.querySelectorAll('[data-testid="vertex-row"]')];
  return {
    rowLat: rows.map((r) => read(r.querySelector('[data-testid="vertex-lat-input"]'))),
    rowLon: rows.map((r) => read(r.querySelector('[data-testid="vertex-lon-input"]'))),
    addLat: read(document.querySelector('[data-testid="vertex-add-form-lat"]')),
    addLon: read(document.querySelector('[data-testid="vertex-add-form-lon"]')),
  };
});

let clippedCount = 0;
for (const group of [inputMetrics.rowLat, inputMetrics.rowLon]) {
  for (const m of group) if (m.clipped) clippedCount += 1;
}
console.log("row lat metrics:", JSON.stringify(inputMetrics.rowLat));
console.log("row lon metrics:", JSON.stringify(inputMetrics.rowLon));
console.log("add-form metrics:", JSON.stringify([inputMetrics.addLat, inputMetrics.addLon]));
console.log(`CLIPPED row inputs: ${clippedCount} of ${inputMetrics.rowLat.length * 2}`);

// Claim 2 — the step select's accessible name.
const stepName = await page.evaluate(() => {
  const label = document
    .querySelector('[data-testid="nudge-step-select"]')
    ?.closest("label");
  return {
    text: label?.textContent?.trim() ?? null,
    title: label?.getAttribute("title") ?? null,
  };
});
console.log("step select labeling:", JSON.stringify(stepName));

// Claim 3 — the two forms' geometry.
const formGeometry = await page.evaluate(() => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
  };
  return {
    insert: null, // not open — measured only when open
    add: box(document.querySelector('[data-testid="vertex-add-form"]')),
  };
});
console.log("add-form geometry:", JSON.stringify(formGeometry.add));

await page.getByTestId("vertex-insert-toggle").first().click();
const insertGeometry = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="vertex-insert-form"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
});
console.log("insert-form geometry:", JSON.stringify(insertGeometry));
console.log(
  "indentation delta (insert inside list vs add below):",
  insertGeometry !== null ? insertGeometry.x - formGeometry.add.x : "n/a",
);

await browser.close();
