import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual verification of the QoL workspace redesign on the user's real
 * GloryFit file: desktop map-first layout, scrolled details section,
 * editor session chrome (mode chip + icon rail), and mobile stacking.
 */

const FILE = join(process.cwd(), "docs", "strava_gpx_original.gpx");
const OUT = join(process.cwd(), "download");

const xml = readFileSync(FILE, "utf8");
const pts = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
const last = {
  lat: Number(pts[pts.length - 1][1]),
  lon: Number(pts[pts.length - 1][2]),
};

const browser = await chromium.launch();

async function fresh(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto("http://localhost:3000");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const [file] = await Promise.all([chooser]);
  await file.setFiles(FILE);
  await page.getByTestId("gpx-summary").waitFor();
  await page.waitForTimeout(1500);
  return page;
}

async function bridge(page) {
  return page.evaluate(() =>
    window.__gpxMapController
      ? window.__gpxMapController.getTestState()
      : null,
  );
}

async function poll(page, predicate, timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    const state = await bridge(page);
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) throw new Error("predicate not met");
    await page.waitForTimeout(150);
  }
}

// 1 — Desktop: map-first workspace, section 1.
const desktop = await fresh(1440, 900);
await poll(desktop, (s) => s.ready && !s.moving);
await desktop.screenshot({ path: join(OUT, "qol-desktop-repair.png") });

// 2 — Desktop: details section (scroll cue click).
await desktop.getByTestId("scroll-cue").click();
await desktop.waitForTimeout(1000);
await desktop.screenshot({ path: join(OUT, "qol-desktop-details.png") });

// 3 — Desktop: editor session (one-anchor tail extension) with mode chip.
await desktop.getByTestId("back-to-map-link").click();
await desktop.waitForTimeout(400);
await desktop.getByTestId("begin-pick-anchor-button").click();
await poll(desktop, (s) => s.pickSession?.active === true);

// Frame the tail, click the last recorded point.
await desktop.evaluate(([lat, lon]) => {
  window.__gpxMapController.fitBounds(
    {
      minLat: lat - 0.001,
      minLon: lon - 0.002,
      maxLat: lat + 0.0015,
      maxLon: lon + 0.002,
    },
    { maxZoom: 17, action: "probe-fit" },
  );
}, [last.lat, last.lon]);
await poll(desktop, (s) => !s.moving);

const box = await desktop.locator(".maplibregl-canvas").boundingBox();
const anchorPx = await desktop.evaluate(([lat, lon]) => {
  return window.__gpxMapController.projectLatLon(lat, lon);
}, [last.lat, last.lon]);
await desktop.mouse.click(box.x + anchorPx.x, box.y + anchorPx.y);
await poll(desktop, (s) => s.drawSession !== null);
await desktop.waitForTimeout(600);
await desktop.screenshot({ path: join(OUT, "qol-desktop-editor.png") });
console.log("editor session:", JSON.stringify((await bridge(desktop)).drawSession?.gapId));

// 4 — Mobile: stacked layout.
const mobile = await fresh(390, 844);
await mobile.screenshot({ path: join(OUT, "qol-mobile-repair.png") });

await browser.close();
console.log("screenshots written to download/");
