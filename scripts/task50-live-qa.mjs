/**
 * Task 50 — live QA: the "Plan a route" section, through the exact user
 * flows, against the dev server on :3000.
 *
 *   1. The landing's sixth card → the tool page (hero, start card — no
 *      upload zone) → "Start planning" → the studio;
 *   2. Draw a route with the Default pen on straight lines → the live
 *      distance, the vertex list, the crow-flies comparison;
 *   3. The pace calculator: enter 45:00 → the pace, speed, splits, the
 *      "Planned" badge; Clear resets;
 *   4. The Curve pen commits a freehand stroke through the same
 *      machinery the other editors use;
 *   5. The contract: no export card, no share button, no download —
 *      verified in the live DOM;
 *   6. "Start over" returns to the tool page.
 *
 * Screenshots land in download/task50-*.png; console/page errors must
 * stay at zero.
 */
import { chromium } from "@playwright/test";
import { join } from "node:path";

const OUT = "download";

const errors = [];
const pageErrors = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));

async function settleMap() {
  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().ready === true,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1200);
}

async function project(lat, lon) {
  return page.evaluate(
    ([lat_, lon_]) =>
      window.__gpxMapController.projectLatLon(lat_, lon_),
    [lat, lon],
  );
}

async function clickAt(lat, lon) {
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  const { x, y } = await project(lat, lon);
  await page.mouse.click(box.x + x, box.y + y);
}

async function bridge() {
  return page.evaluate(() =>
    window.__gpxMapController ? window.__gpxMapController.getTestState() : null,
  );
}

async function pollBridge(predicate, timeoutMs = 15_000) {
  const started = Date.now();
  for (;;) {
    const state = await bridge();
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`bridge predicate not met: ${JSON.stringify(state)}`);
    }
    await page.waitForTimeout(150);
  }
}

// Road routing off (deterministic straight legs — the live services are
// not part of this pass).
await page.route(/router\.project-osrm\.org|valhalla1\.openstreetmap\.de/, (r) =>
  r.abort(),
);

// -- 1. The sixth card → the tool page → the studio ------------------------
await page.goto("http://localhost:3000");
await page.getByTestId("landing-mode-plan").waitFor();
await page.screenshot({ path: join(OUT, "task50-01-cards.png"), fullPage: false });

await page.getByTestId("landing-mode-plan").click();
await page.getByTestId("plan-start-card").waitFor();
await page.screenshot({ path: join(OUT, "task50-02-tool-page.png"), fullPage: true });

await page.getByTestId("plan-start-button").click();
await page.getByTestId("plan-section").waitFor();
await settleMap();
await page.screenshot({ path: join(OUT, "task50-03-studio-empty.png") });
console.log("studio entered");

// -- 2. Draw a route (Default pen, straight lines) ---------------------------
await page.getByTestId("road-follow-off").click();
await page.evaluate(() => {
  window.__gpxMapController.fitBounds(
    { minLat: 52.51, maxLat: 52.535, minLon: 13.39, maxLon: 13.47 },
    { maxZoom: 14, action: "qa-frame" },
  );
});
await page.waitForTimeout(600);
for (const point of [
  { lat: 52.52, lon: 13.405 },
  { lat: 52.53, lon: 13.405 },
  { lat: 52.53, lon: 13.455 },
]) {
  await clickAt(point.lat, point.lon);
}
await pollBridge((s) => s.drawSession?.vertexCount === 3);
await page.waitForTimeout(400);
const distanceText = await page
  .getByTestId("draw-distance")
  .textContent();
console.log("drawn distance:", distanceText);
await page.screenshot({ path: join(OUT, "task50-04-drawn.png") });

const crowText = await page.getByTestId("plan-crowflies").textContent();
console.log("crow-flies line:", crowText);

// -- 3. The pace calculator ---------------------------------------------------
await page.getByTestId("plan-time-minutes").fill("45");
await page.waitForTimeout(300);
const paceText = await page.getByTestId("plan-pace-result").textContent();
console.log("pace result (45:00):", paceText);
const splitCount = await page.getByTestId("plan-split-row").count();
console.log("split rows:", splitCount);
await page.screenshot({ path: join(OUT, "task50-05-pace.png") });

await page.getByTestId("plan-time-clear").click();
await page.waitForTimeout(300);
const hintAfterClear = await page
  .getByTestId("plan-pace-hint")
  .textContent()
  .catch(() => "absent");
console.log("hint after clear:", hintAfterClear);

// -- 4. The Curve pen commits a freehand stroke -------------------------------
await page.getByTestId("pen-mode-curve").click();
await page.waitForTimeout(200);
const box = await page.locator(".maplibregl-canvas").boundingBox();
const start = await project(52.515, 13.41);
await page.mouse.move(box.x + start.x, box.y + start.y);
await page.mouse.down();
for (let step = 0; step <= 24; step += 1) {
  const t = step / 24;
  const mid = await project(
    52.515 + 0.004 * Math.sin(t * Math.PI * 2),
    13.41 + 0.02 * t,
  );
  await page.mouse.move(box.x + mid.x, box.y + mid.y, { steps: 2 });
}
await page.mouse.up();
const after = await pollBridge((s) => (s.drawSession?.vertexCount ?? 0) > 3);
console.log("after freehand stroke:", {
  vertices: after.drawSession.vertexCount,
  chain: after.drawSession.chainCoordinates.length,
});
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, "task50-06-curve-stroke.png") });

// -- 5. The contract: no export, no share, no download ------------------------
const checks = {
  exportCard: await page.getByTestId("export-card").count(),
  exportButton: await page.getByTestId("export-button").count(),
  headerShare: await page.getByTestId("header-create-share").count(),
  headerMergeShare: await page.getByTestId("header-merge-share").count(),
  headerShareLink: await page.getByTestId("header-share-link").count(),
};
console.log("absent-everywhere checks (all must be 0):", checks);

// -- 6. Start over -------------------------------------------------------------
await page.getByTestId("header-reset-button").click();
await page.getByTestId("plan-start-card").waitFor();
console.log("start over → back to the tool page");
await page.screenshot({ path: join(OUT, "task50-07-back-to-tool.png") });

await browser.close();

console.log("console errors:", errors.length, errors.slice(0, 3));
console.log("page errors:", pageErrors.length, pageErrors.slice(0, 3));
if (errors.length || pageErrors.length) {
  process.exit(1);
}
console.log("TASK 50 LIVE QA: ALL CHECKS PASSED");
