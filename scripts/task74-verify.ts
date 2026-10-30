/**
 * Task 74 re-verification screenshots (the "line stays straight" fix) —
 *   1. draw phase: the live wobbled draft right after "Add wobble",
 *   2. the same draft zoomed to street level (the wander up close),
 *   3. the review map's wobbled reconstruction line (the WYSIWYG fix),
 *   4. the review line zoomed to street level.
 * Mirrors the e2e spec's helpers (straight legs, framed Berlin).
 */
import { chromium, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";

const stateExpr = `(() => {
  try { return window.__gpxMapController.getTestState(); } catch { return null; }
})()`;

interface BridgeState {
  drawSession: {
    vertexCount: number;
    drawMode: boolean;
    renderedChainCoordinates: [number, number][];
  } | null;
  reconstructionLineCoords: [number, number][];
  moving: boolean;
}

async function poll(
  page: Page,
  predicate: (s: BridgeState) => boolean,
  timeoutMs = 15000,
) {
  const started = Date.now();
  for (;;) {
    const s = (await page.evaluate(stateExpr)) as BridgeState | null;
    if (s && predicate(s)) return s;
    if (Date.now() - started > timeoutMs)
      throw new Error("timeout: " + JSON.stringify(s)?.slice(0, 300));
    await page.waitForTimeout(150);
  }
}

const ROUTE_POINTS = [
  { lat: 52.52, lon: 13.405 },
  { lat: 52.53, lon: 13.405 },
  { lat: 52.53, lon: 13.455 },
];

const WOBBLED_LEG = {
  minLat: 52.5185,
  maxLat: 52.5315,
  minLon: 13.402,
  maxLon: 13.408,
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem(
      "gpx-repair-studio.tool-tours.v1",
      JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen" }),
    );
  });
  await page.route(/router\.project-osrm\.org|valhalla1\.openstreetmap\.de/, (route) =>
    route.abort(),
  );

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("landing-mode-create").click();
  await page.getByTestId("activity-stats-form").waitFor({ state: "visible" });

  const fields: Record<string, string> = {
    "Distance recorded by your watch": "5.23",
    "Pace minutes per unit": "6",
    "Pace seconds per unit": "14",
    "Total time hours": "0",
    "Total time minutes": "0",
    "Total time seconds": "32",
  };
  for (const [label, value] of Object.entries(fields)) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByLabel(/Start/).fill("2026-09-20T05:30");
  await page.getByTestId("begin-drawing-button").click();

  await page.getByTestId("create-section").waitFor({ state: "visible" });
  await poll(page, (s) => s.drawSession !== null && s.drawSession.drawMode === true);

  await page.evaluate(() => {
    window.__gpxMapController!.fitBounds(
      { minLat: 52.51, maxLat: 52.535, minLon: 13.39, maxLon: 13.47 },
      { maxZoom: 14, action: "e2e-frame" },
    );
  });
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  if (!box) throw new Error("map canvas not found");
  for (const point of ROUTE_POINTS) {
    const { x, y } = await page.evaluate(
      ([lat, lon]) =>
        window.__gpxMapController!.projectLatLon(lat as number, lon as number),
      [point.lat, point.lon] as const,
    );
    await page.mouse.click(box.x + x, box.y + y);
    await page.waitForTimeout(200);
  }
  await poll(page, (s) => s.drawSession?.vertexCount === 3);

  // Wobble points 1–2 at Strong.
  const rows = page.getByTestId("create-vertex-row");
  await rows.nth(0).getByTestId("create-vertex-select").click();
  await rows.nth(1).getByTestId("create-vertex-select").click();
  await page.getByTestId("wobble-intensity-strong").click();
  await page.getByTestId("wobble-apply-button").click();
  await page.waitForTimeout(300);

  // The live wobbled draft must be on the bridge (the fix's headline).
  const draft = await poll(
    page,
    (s) => (s.drawSession?.renderedChainCoordinates.length ?? 0) > 10,
  );
  console.log(
    "draft points:",
    draft.drawSession!.renderedChainCoordinates.length,
  );

  // Screenshot 1 — the draw phase, overview: the wobbled leg drawn live.
  await page.waitForTimeout(600);
  await page.getByTestId("create-section").screenshot({
    path: "download/task74-fix-draw-live.png",
  });

  // Screenshot 2 — the wobbled leg at street zoom (the wander up close).
  await page.evaluate((bounds) => {
    window.__gpxMapController!.fitBounds(bounds as never, {
      maxZoom: 16.5,
      action: "e2e-frame",
    });
  }, WOBBLED_LEG);
  await poll(page, (s) => !s.moving);
  await page.waitForTimeout(800);
  await page.getByTestId("create-section").screenshot({
    path: "download/task74-fix-draw-street.png",
  });

  // Back out, finish → review.
  await page.evaluate(() => {
    window.__gpxMapController!.fitBounds(
      { minLat: 52.51, maxLat: 52.535, minLon: 13.39, maxLon: 13.47 },
      { maxZoom: 14, action: "e2e-frame" },
    );
  });
  await page.getByTestId("finish-route-button").click();
  await page.getByTestId("use-drawn-distance-button").click();
  await page.getByTestId("route-review-card").waitFor({ state: "visible" });

  // The review map's reconstruction line must carry the wobble.
  await poll(page, (s) => s.reconstructionLineCoords.length > 10);
  console.log("review line points:", (await page.evaluate(stateExpr) as BridgeState).reconstructionLineCoords.length);
  await page.waitForTimeout(800);
  await page.getByTestId("create-section").screenshot({
    path: "download/task74-fix-review-live.png",
  });

  // Screenshot 4 — the review line at street zoom.
  await page.evaluate((bounds) => {
    window.__gpxMapController!.fitBounds(bounds as never, {
      maxZoom: 16.5,
      action: "e2e-frame",
    });
  }, WOBBLED_LEG);
  await poll(page, (s) => !s.moving);
  await page.waitForTimeout(800);
  await page.getByTestId("create-section").screenshot({
    path: "download/task74-fix-review-street.png",
  });

  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
