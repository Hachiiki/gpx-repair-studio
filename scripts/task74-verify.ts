/**
 * Task 74/75 verification screenshots —
 *   1. the draw panel's Human-like GPS group (chips, applied stretch),
 *   2. the review with a wobbled line + (elevation noise via the preview),
 *   3. the finished-on-export banner with its three exits + save row.
 * Mirrors the passing e2e spec's helpers (straight legs, framed Berlin).
 */
import { chromium, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";

const stateExpr = `(() => {
  try { return window.__gpxMapController.getTestState(); } catch { return null; }
})()`;

interface BridgeState {
  drawSession: { vertexCount: number; drawMode: boolean } | null;
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
    "Total time minutes": "32",
    "Total time seconds": "35",
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

  // Screenshot 1 — the draw panel's wobble group.
  const wobbleGroup = page.getByTestId("wobble-plan-group");
  await wobbleGroup.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await wobbleGroup.screenshot({ path: "download/task74-wobble-group.png" });

  // Finish → review.
  await page.getByTestId("finish-route-button").click();
  await page.getByTestId("use-drawn-distance-button").click();
  await page.getByTestId("route-review-card").waitFor({ state: "visible" });
  await page.waitForTimeout(500);

  // Screenshot 2 — the review column (the wobbled line on the map).
  await page.getByTestId("create-section").screenshot({
    path: "download/task74-wobble-review.png",
  });

  // Export → the finished banner.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-gpx-button").click(),
  ]);
  await page.getByTestId("session-finished-banner").waitFor({ state: "visible" });
  await page.waitForTimeout(300);

  // Open the save row before the screenshot (the full banner).
  await page.getByTestId("session-finished-save").click();
  await page.waitForTimeout(200);

  // Screenshot 3 — the banner with all exits + the name row.
  const banner = page.getByTestId("session-finished-banner");
  await banner.scrollIntoViewIfNeeded();
  await banner.screenshot({ path: "download/task75-finished-banner.png" });

  // And the map-wide view with the banner in the tools column.
  await page.getByTestId("create-section").screenshot({
    path: "download/task75-finished-workspace.png",
  });

  console.log("download:", download.suggestedFilename());
  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
