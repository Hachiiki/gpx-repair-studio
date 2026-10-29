/**
 * Task 73 verification screenshot — walks the draw-from-stats flow:
 * stats → draw 3 points → select 2 → plan 4:00/km → finish → review,
 * then screenshots the pace preview card (bars + dual-axis graph).
 * Mirrors the passing e2e spec's helpers (straight legs, framed Berlin).
 */
import { chromium, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";

const stateExpr = `(() => {
  try { return window.__gpxMapController.getTestState(); } catch { return null; }
})()`;

interface BridgeState {
  drawSession: { vertexCount: number; drawMode: boolean } | null;
  chartCursor: { visible: boolean; position: { lat: number; lon: number } | null };
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

  // Tours seen + road routing off (straight legs, deterministic geometry).
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

  // The landing's third tab: create from stats.
  await page.getByTestId("landing-mode-create").click();
  await page.getByTestId("activity-stats-form").waitFor({ state: "visible" });

  // Fill the stats (labels drive the accessible fields).
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

  // Frame Berlin, then draw the L (~4.5 km).
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

  // Select the first two vertices, plan 4:00 /km on them.
  const rows = page.getByTestId("create-vertex-row");
  await rows.nth(0).getByTestId("create-vertex-select").click();
  await rows.nth(1).getByTestId("create-vertex-select").click();
  await page.getByTestId("pace-minutes-input").fill("4");
  await page.getByTestId("pace-seconds-input").fill("0");
  await page.getByTestId("pace-apply-button").click();
  await page.waitForTimeout(300);

  // Finish → keep the drawn distance → review.
  await page.getByTestId("finish-route-button").click();
  await page.getByTestId("use-drawn-distance-button").click();
  await page.getByTestId("pace-preview-card").waitFor({ state: "visible" });
  await page.waitForTimeout(500);

  // Hover the graph — the interactive cursor + map dot.
  const graph = page.getByTestId("pace-graph-svg");
  await graph.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await graph.hover();
  await page.waitForTimeout(400);
  const cursorState = await poll(page, (s) => s.chartCursor?.visible === true);
  console.log("MAP CURSOR:", JSON.stringify(cursorState.chartCursor));

  await page.screenshot({ path: "download/task73-pace-review.png", fullPage: false });
  await page.getByTestId("pace-preview-card").screenshot({ path: "download/task73-pace-preview-card.png" });

  // Keyboard interaction proof.
  await graph.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  console.log("READOUT:", await page.getByTestId("pace-preview-readout").textContent());
  const heights = await page.getByTestId("pace-split-bar").evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute("height"))),
  );
  console.log("BAR HEIGHTS:", heights.join(", "));
  const distinct = new Set(heights.map((h) => Math.round(h))).size;
  console.log("DISTINCT BAR HEIGHTS:", distinct, "of", heights.length);

  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
