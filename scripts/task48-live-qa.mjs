/**
 * Task 48 (user pass 48) — live QA: screenshots + console-error sweep of
 * the pen rework in the repair studio:
 *
 *   1. the draw editor panel with the new Pen group (Default / Curve)
 *      and the three path-style chips (Curves gone from the group);
 *   2. the Curve pen in action — a freehand stroke dragged across the
 *      map, committed as a smooth curve line (chip says "Curve pen");
 *   3. Move mode's oversized grab targets (the ONLY mode that drags).
 *
 * Run against the dev server on :3000 (the same target the e2e suite
 * uses). Screenshots land in download/ for the worklog + VLM critique.
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

async function project(lat, lon) {
  return page.evaluate(
    (args) => window.__gpxMapController.projectLatLon(args[0], args[1]),
    [lat, lon],
  );
}

async function canvasBox() {
  await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  return box;
}

// -- 1. The repair studio, editor open: Pen group + three path chips ------
await page.goto("http://localhost:3000");
await page.getByTestId("landing-mode-repair").waitFor();
await page.getByTestId("landing-mode-repair").click();
await upload(join(FIXTURES, "time-gap.gpx"));
await page.waitForFunction(
  () => window.__gpxMapController?.getTestState().ready === true,
  { timeout: 20_000 },
);
await page.waitForTimeout(1200); // camera settle
await page.getByTestId("open-editor-button").first().click();
await page.getByTestId("draw-editor-panel").waitFor();
await page.getByTestId("snap-toggle").click();
// The editor card sits below the gap list — bring it into view and
// screenshot the CARD itself (the chip groups live at its top).
await page.getByTestId("draw-editor-panel").scrollIntoViewIfNeeded();
await page.getByTestId("draw-editor-panel").screenshot({
  path: `${OUT}/task48-pen-group-panel.png`,
  // capture the whole card even when taller than the viewport
});
console.log("pen chips:", await page.getByTestId("pen-mode-curve").count());
console.log(
  "curve path chip gone:",
  (await page.getByTestId("road-follow-curve").count()) === 0,
);

// -- 2. The Curve pen: a freehand stroke becomes a smooth curve line ------
await page.getByTestId("road-follow-off").click(); // fully local
await page.getByTestId("pen-mode-curve").click();
await page.waitForTimeout(300);
const box = await canvasBox();
// Sweep a real arc across the gap area (10 interpolated waypoints —
// the freehand gesture a mouse makes when tracing a bend).
const p0 = { lat: 52.5206, lon: 13.4055 };
const p1 = { lat: 52.5197, lon: 13.4069 }; // control (south bulge)
const p2 = { lat: 52.5202, lon: 13.4058 };
const waypoints = [];
for (let i = 0; i <= 10; i += 1) {
  const t = i / 10;
  const u = 1 - t;
  waypoints.push({
    lat: u * u * p0.lat + 2 * u * t * p1.lat + t * t * p2.lat,
    lon: u * u * p0.lon + 2 * u * t * p1.lon + t * t * p2.lon,
  });
}
let first = true;
for (const point of waypoints) {
  const { x, y } = await project(point.lat, point.lon);
  const px = box.x + x;
  const py = box.y + y;
  if (first) {
    await page.mouse.move(px, py);
    await page.mouse.down();
    first = false;
  } else {
    await page.mouse.move(px, py, { steps: 3 });
  }
}
await page.mouse.up();
await page.waitForTimeout(800);
const stroked = await page.evaluate(() => {
  const s = window.__gpxMapController.getTestState().drawSession;
  return s
    ? {
        vertices: s.vertexCount,
        rendered: s.renderedChainCoordinates.length,
        chain: s.chainCoordinates.length,
        pen: s.penMode,
      }
    : null;
});
console.log("stroke committed:", JSON.stringify(stroked));
await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/task48-curve-pen-stroke.png` });

// -- 3. Move mode: the oversized grab targets ------------------------------
await page.getByTestId("draw-mode-move").click();
await page.waitForTimeout(400);
await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/task48-move-mode-handles.png` });

// Sweep: the whole pass must be console-error free.
await browser.close();
console.log("console errors:", errors.length ? errors : "none");
console.log("page errors:", pageErrors.length ? pageErrors : "none");
if (errors.length || pageErrors.length) process.exit(1);
