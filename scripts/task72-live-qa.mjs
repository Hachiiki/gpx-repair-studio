/**
 * Task 72 live QA — the "repeat a loop" feature's visual check.
 *
 * Drives the real dev server through the create-from-stats flow:
 * stats → draw a square loop → select all → copy → paste ×2 →
 * screenshots (desktop + mobile) of the workspace with the selection
 * painted on the map and the copy/paste group in the panel.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const FIELDS = {
  "Distance recorded by your watch": "5.23",
  "Pace minutes per unit": "6",
  "Pace seconds per unit": "14",
  "Total time hours": "0",
  "Total time minutes": "32",
  "Total time seconds": "35",
};
const LOOP = [
  { lat: 52.52, lon: 13.405 },
  { lat: 52.525, lon: 13.405 },
  { lat: 52.525, lon: 13.41 },
  { lat: 52.52, lon: 13.41 },
];

async function drawLoop(page) {
  await page.evaluate(() => {
    window.__gpxMapController.fitBounds(
      {
        minLat: 52.51,
        maxLat: 52.535,
        minLon: 13.39,
        maxLon: 13.47,
      },
      { maxZoom: 14, action: "qa-frame" },
    );
  });
  await page.waitForTimeout(700);
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  for (const point of LOOP) {
    const { x, y } = await page.evaluate(
      (pair) =>
        window.__gpxMapController.projectLatLon(pair[0], pair[1]),
      [point.lat, point.lon],
    );
    await page.mouse.click(box.x + x, box.y + y);
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => {
    const session = window.__gpxMapController?.getTestState?.()?.drawSession;
    return session !== null && session.vertexCount === 4;
  });
}

async function seedAndBegin(page) {
  await page.goto(BASE);
  await page.getByTestId("landing-mode-create").click();
  for (const [label, value] of Object.entries(FIELDS)) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByLabel(/Start/).fill("2026-09-20T05:30");
  await page.getByTestId("begin-drawing-button").click();
  await page.waitForSelector('[data-testid="create-section"]');
  await page.waitForFunction(() => {
    const session = window.__gpxMapController?.getTestState?.()?.drawSession;
    return session !== null && session.drawMode === true;
  });
}

async function main() {
  const browser = await chromium.launch();

  // -- desktop ---------------------------------------------------------------
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
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
  });
  await seedAndBegin(page);
  await drawLoop(page);

  await page.getByTestId("create-select-all").click();
  await page.getByTestId("create-copy-selection").click();
  await page.getByTestId("create-paste-clipboard").click();
  await page.waitForFunction(() => {
    const session = window.__gpxMapController?.getTestState?.()?.drawSession;
    return session !== null && session.vertexCount === 8;
  });
  await page.waitForTimeout(400);
  await page.getByTestId("create-paste-clipboard").click();
  await page.waitForFunction(() => {
    const session = window.__gpxMapController?.getTestState?.()?.drawSession;
    return session !== null && session.vertexCount === 12;
  });
  await page.waitForTimeout(700);

  await page.screenshot({
    path: "scripts/qa/task72/task72-desktop-selected.png",
  });
  const panel = page.getByTestId("route-draw-panel");
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: "scripts/qa/task72/task72-panel.png" });

  // -- mobile ----------------------------------------------------------------
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
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
  });
  await seedAndBegin(mobile);
  await drawLoop(mobile);
  const sheetToggle = mobile.getByTestId("tools-sheet-toggle");
  if ((await sheetToggle.count()) > 0) await sheetToggle.first().click();
  await mobile.getByTestId("create-select-all").click();
  await mobile.getByTestId("create-copy-selection").click();
  await mobile.getByTestId("create-paste-clipboard").click();
  await mobile.waitForFunction(() => {
    const session = window.__gpxMapController?.getTestState?.()?.drawSession;
    return session !== null && session.vertexCount === 8;
  });
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: "scripts/qa/task72/task72-mobile.png" });

  const state = await page.evaluate(() => {
    const session = window.__gpxMapController.getTestState().drawSession;
    return session
      ? { vertexCount: session.vertexCount, selected: session.selectedVertexIds.length }
      : null;
  });
  console.log("Bridge state:", JSON.stringify(state));
  await browser.close();
  console.log("QA shots written to scripts/qa/task72/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
