/**
 * Task 49 (user pass 49 follow-up) — live QA: the editor REVEAL.
 *
 * The user could not see the requested features ("pen group, path chips")
 * in the drawing surfaces: in the repair studio the editor panel inserted
 * at the top of the tools column — off-screen ABOVE the user's scroll
 * position — and in the recovery studio it opened below the fold. This
 * pass proves the reveal end-to-end, through the exact user flows:
 *
 *   1. Repair — upload, click "Draw route" on the gap (scrolled down in
 *      the tools column), the column scrolls to the panel: Pen group
 *      leading the view, map untouched;
 *   2. Recovery — same flow through the recovery tool (panel below the
 *      guide/manual/gap cards);
 *   3. The Curve pen still draws after the reveal (repair).
 *
 * Run against the dev server on :3000. Screenshots land in download/.
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

async function settleMap() {
  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().ready === true,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1200);
}

async function penState() {
  return page.evaluate(() => {
    const pen = document.querySelector('[data-testid="pen-mode-group"]');
    if (!pen) return "absent";
    const r = pen.getBoundingClientRect();
    return {
      penTop: Math.round(r.top),
      fullyVisible: r.top >= 0 && r.bottom <= window.innerHeight,
    };
  });
}

// -- 1. Repair: the reveal ------------------------------------------------
await page.goto("http://localhost:3000");
await page.getByTestId("landing-mode-repair").waitFor();
await page.getByTestId("landing-mode-repair").click();
await page.getByTestId("upload-zone").waitFor();
await upload(join(FIXTURES, "time-gap.gpx"));
await settleMap();
// The user's exact flow: the gap list sits below the manual card — click
// its Draw route button without any other scrolling.
await page.getByTestId("open-editor-button").first().click();
await page.getByTestId("draw-editor-panel").waitFor();
await page.waitForTimeout(900); // smooth reveal settle
console.log("repair pen group:", JSON.stringify(await penState()));
await page.screenshot({ path: `${OUT}/task49-repair-reveal.png` });

// -- 2. The Curve pen after the reveal (features all present) -------------
await page.getByTestId("road-follow-off").click();
await page.getByTestId("pen-mode-curve").click();
await page.waitForTimeout(300);
await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
const box = await page.locator(".maplibregl-canvas").boundingBox();
const p0 = { lat: 52.5206, lon: 13.4055 };
const p1 = { lat: 52.5197, lon: 13.4069 };
const p2 = { lat: 52.5202, lon: 13.4058 };
let first = true;
for (let i = 0; i <= 10; i += 1) {
  const t = i / 10;
  const u = 1 - t;
  const { x, y } = await page.evaluate(
    (args) => window.__gpxMapController.projectLatLon(args[0], args[1]),
    [
      u * u * p0.lat + 2 * u * t * p1.lat + t * t * p2.lat,
      u * u * p0.lon + 2 * u * t * p1.lon + t * t * p2.lon,
    ],
  );
  if (first) {
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    first = false;
  } else {
    await page.mouse.move(box.x + x, box.y + y, { steps: 3 });
  }
}
await page.mouse.up();
await page.waitForTimeout(800);
const stroked = await page.evaluate(() => {
  const s = window.__gpxMapController.getTestState().drawSession;
  return s ? { vertices: s.vertexCount, pen: s.penMode } : null;
});
console.log("curve stroke committed:", JSON.stringify(stroked));
await page.screenshot({ path: `${OUT}/task49-curve-after-reveal.png` });

// -- 3. Recovery: the reveal ------------------------------------------------
await page.goto("http://localhost:3000");
await page.getByTestId("landing-mode-recovery").waitFor();
await page.getByTestId("landing-mode-recovery").click();
await page.getByTestId("upload-zone").waitFor();
await upload(join(FIXTURES, "time-gap.gpx"));
await settleMap();
await page.getByTestId("open-editor-button").first().click();
await page.getByTestId("draw-editor-panel").waitFor();
await page.waitForTimeout(900);
console.log("recovery pen group:", JSON.stringify(await penState()));
await page.screenshot({ path: `${OUT}/task49-recovery-reveal.png` });

await browser.close();
console.log("console errors:", errors.length ? errors : "none");
console.log("page errors:", pageErrors.length ? pageErrors : "none");
if (errors.length || pageErrors.length) process.exit(1);
