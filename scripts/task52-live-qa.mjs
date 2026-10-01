/**
 * Task 52 (user pass 52) — live QA: screenshots + console-error sweep of
 * the mode-honest editor affordances:
 *
 *   1. the draw editor in MOVE mode — the pen group inert (chips dimmed
 *      and disabled) with the honest note ("the pointer drags your
 *      points"), the mode chip saying "Moving";
 *   2. the same editor back in DRAW mode — the pen live again (control
 *      shot: the difference must be visible at a glance);
 *   3. the map legend's corrected copy ("drag in Move mode").
 *
 * Run against the dev server on :3000. Screenshots land in download/ for
 * the worklog + VLM critique.
 */
import { chromium } from "@playwright/test";
import { join } from "node:path";

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
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

async function upload(path) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

async function settle(predicate, timeoutMs = 15_000) {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(() =>
      window.__gpxMapController
        ? window.__gpxMapController.getTestState()
        : null,
    );
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`predicate not met; last: ${JSON.stringify(state)}`);
    }
    await page.waitForTimeout(150);
  }
}

await page.goto("http://localhost:3000/");
await page.getByTestId("landing-mode-repair").click();
await upload(join(FIXTURES, "time-gap.gpx"));
await settle((s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

await page.getByTestId("open-editor-button").first().click();
await settle((s) => s.drawSession !== null && s.drawSession.pointerMode === "draw");

// Deterministic geometry: no snap magnet, straight legs.
await page.getByTestId("snap-toggle").click();
await page.getByTestId("road-follow-off").click();

// Draw a short line so the panel shows its full editing state.
const box = await page
  .getByTestId("map-canvas")
  .scrollIntoViewIfNeeded()
  .then(() => page.locator(".maplibregl-canvas").boundingBox());
const points = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
  { lat: 52.5199, lon: 13.4062 },
];
for (const p of points) {
  const { x, y } = await page.evaluate(
    (args) => window.__gpxMapController.projectLatLon(args[0], args[1]),
    [p.lat, p.lon],
  );
  await page.mouse.click(box.x + x, box.y + y);
}
await settle((s) => s.drawSession?.vertexCount === points.length);
await page.waitForTimeout(400);

// --- 1. MOVE mode: the honest editor ----------------------------------
await page.getByTestId("draw-mode-move").click();
await settle((s) => s.drawSession?.pointerMode === "move");
await page.waitForTimeout(300);
await page.getByTestId("pen-mode-group").scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, "task52-1-move-inert-pen.png") });

// --- 2. back to DRAW: the pen lives ------------------------------------
await page.getByTestId("draw-mode-draw").click();
await settle((s) => s.drawSession?.pointerMode === "draw");
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "task52-2-draw-live-pen.png") });

// --- 3. the legend's mode-honest copy ----------------------------------
await page.getByTestId("map-legend").scrollIntoViewIfNeeded();
await page.getByTestId("map-legend").click(); // pin it open
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "task52-3-legend.png") });

console.log("console errors:", errors.length, errors);
console.log("page errors:", pageErrors.length, pageErrors);
await browser.close();
if (errors.length || pageErrors.length) process.exit(1);
console.log("TASK52 LIVE QA DONE");
