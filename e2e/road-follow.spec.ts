import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  abortRoadRouting,
  haversineM,
  mockOsrmBulge,
  type OsrmCallLog,
} from "./helpers/road-follow";

/**
 * Road follow ("snap to road") — E2E acceptance for the user's contract:
 *
 *   "I click first point and then a very long 2nd point and it detects
 *    the right way — click before the curve and after the curve and the
 *    drawn route follows the road. And I can drag the clicked points
 *    around to adjust."
 *
 *   1. one-anchor "Add missing route" + clicks OUTSIDE the recording →
 *      the solid line follows the (mocked) road between the clicks —
 *      road interior points render between the EXACT clicked nodes;
 *   2. the clicked chain (WYSIWYG data) stays exactly the user's clicks —
 *      the road is geometry, the clicks are truth;
 *   3. the distance badge measures the ROAD path, not the chord;
 *   4. dragging a clicked point commits the move and re-routes both
 *      adjacent legs (new OSRM requests, new road geometry);
 *   5. "Straight lines" mode renders plain geodesic legs;
 *   6. a failed routing service falls back to straight lines honestly
 *      (status surfaced, chain unchanged in node count).
 *
 * OSRM is mocked with an echo of the request's own waypoints plus a
 * northward bulged midpoint — deterministic, tile-independent, no live
 * service. Assertions read the controller's test bridge.
 */

const DEMO = join("download", "demo-clean-run.gpx");

/** The clean run's last recorded point (the one-anchor flow anchors here). */
function tailPoint(): { lat: number; lon: number } {
  const xml = readFileSync(DEMO, "utf8");
  const matches = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
  const m = matches[matches.length - 1];
  if (!m) throw new Error("demo file has no track points");
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

interface DrawSessionState {
  gapId: string;
  drawMode: boolean;
  vertexCount: number;
  chainCoordinates: [number, number][];
  renderedChainCoordinates: [number, number][];
  closingCoordinates: [number, number][];
  handleScreenPositions: { vertexId: string; x: number; y: number }[];
}

interface BridgeState {
  status: string;
  ready: boolean;
  routeFeatureCount: number;
  reconstructionLineCount: number;
  moving: boolean;
  lastCameraAction: string | null;
  pickSession: { active: boolean; mode: string } | null;
  drawSession: DrawSessionState | null;
}

async function bridge(page: Page): Promise<BridgeState | null> {
  try {
    return await page.evaluate(() =>
      window.__gpxMapController
        ? (window.__gpxMapController.getTestState() as never)
        : null,
    );
  } catch {
    return null;
  }
}

async function pollBridge(
  page: Page,
  predicate: (state: BridgeState) => boolean,
  timeoutMs = 15_000,
): Promise<BridgeState> {
  const started = Date.now();
  for (;;) {
    const state = await bridge(page);
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `bridge predicate not met within ${timeoutMs} ms; last state: ${JSON.stringify(state)}`,
      );
    }
    await page.waitForTimeout(150);
  }
}

async function upload(page: Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

async function project(page: Page, lat: number, lon: number) {
  return page.evaluate(
    ([lat_, lon_]) =>
      window.__gpxMapController!.projectLatLon(lat_ as number, lon_ as number),
    [lat, lon] as const,
  );
}

async function canvasBox(page: Page) {
  await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function clickAt(
  page: Page,
  lat: number,
  lon: number,
  box: { x: number; y: number },
) {
  const { x, y } = await project(page, lat, lon);
  await page.mouse.click(box.x + x, box.y + y);
}

/** Open the one-anchor editor on the demo tail and frame the draw area. */
async function openTailEditor(page: Page) {
  const tail = tailPoint();
  await page.getByTestId("begin-pick-anchor-button").click();
  await pollBridge(
    page,
    (s) => s.pickSession?.active === true && s.pickSession.mode === "anchor",
  );
  const box = await canvasBox(page);
  await clickAt(page, tail.lat, tail.lon, box);
  const editor = page.getByTestId("draw-editor-panel");
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Added route");
  await pollBridge(
    page,
    (s) => s.drawSession !== null && s.drawSession.drawMode === true,
  );
  await pollBridge(page, (s) => !s.moving);
  // Frame the north-east working area (the drawn route extends beyond the
  // recorded extent — same drive as the one-anchor spec).
  await page.evaluate(
    ([lat, lon]) =>
      window.__gpxMapController!.fitBounds(
        {
          minLat: (lat as number) - 0.001,
          minLon: (lon as number) - 0.001,
          maxLat: (lat as number) + 0.004,
          maxLon: (lon as number) + 0.005,
        },
        { maxZoom: 17, action: "test-fit-road-follow" },
      ),
    [tail.lat, tail.lon] as const,
  );
  await pollBridge(
    page,
    (s) => !s.moving && s.lastCameraAction === "test-fit-road-follow",
  );
  // Clicks must land exactly where intended: disable the snap magnet.
  await page.getByTestId("snap-toggle").click();
  return { tail, editor };
}

test.describe("road follow — clicks trace the road between them", () => {
  test("the drawn line follows the road; clicks stay the truth; the badge measures the road", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmBulge(page, { offsetLat: 0.0004, log });

    const { tail, editor } = await openTailEditor(page);

    // Two clicks, far apart, BEFORE and AFTER a (mocked) curve.
    const box = await canvasBox(page);
    const v1 = { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 };
    const v2 = { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 };
    await clickAt(page, v1.lat, v1.lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    await clickAt(page, v2.lat, v2.lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // Both legs routed: anchor→v1 and v1→v2 each gained one road point.
    const routed = await pollBridge(
      page,
      (s) => s.drawSession?.renderedChainCoordinates.length === 5,
    );
    const rendered = routed.drawSession!.renderedChainCoordinates;
    const mid1 = {
      lat: (tail.lat + v1.lat) / 2 + 0.0004,
      lon: (tail.lon + v1.lon) / 2,
    };
    const mid2 = {
      lat: (v1.lat + v2.lat) / 2 + 0.0004,
      lon: (v1.lon + v2.lon) / 2,
    };
    // Rendered order: [anchor, road1, v1, road2, v2] — the EXACT clicked
    // nodes bracket each road interior (WYSIWYG stitching).
    expect(rendered[0][0]).toBeCloseTo(tail.lon, 6);
    expect(rendered[1][0]).toBeCloseTo(mid1.lon, 4);
    expect(rendered[1][1]).toBeCloseTo(mid1.lat, 4);
    expect(rendered[2][0]).toBeCloseTo(v1.lon, 4);
    expect(rendered[3][0]).toBeCloseTo(mid2.lon, 4);
    expect(rendered[3][1]).toBeCloseTo(mid2.lat, 4);
    expect(rendered[4][0]).toBeCloseTo(v2.lon, 4);

    // The CLICKED chain is untouched by the road: exactly anchor + clicks.
    const chain = routed.drawSession!.chainCoordinates;
    expect(chain).toHaveLength(3);
    expect(chain[0][0]).toBeCloseTo(tail.lon, 6);
    expect(chain[1][0]).toBeCloseTo(v1.lon, 4);
    expect(chain[2][0]).toBeCloseTo(v2.lon, 4);

    // Both legs were actually requested from the router.
    expect(log.count).toBeGreaterThanOrEqual(2);

    // The badge measures the ROAD path (with its bulges), not the chord.
    const roadLength =
      haversineM(tail, mid1) +
      haversineM(mid1, v1) +
      haversineM(v1, mid2) +
      haversineM(mid2, v2);
    const chordLength = haversineM(tail, v1) + haversineM(v1, v2);
    expect(roadLength).toBeGreaterThan(chordLength);
    const badgeText = await page.getByTestId("draw-distance").innerText();
    const badgeM = Number.parseFloat(badgeText.replace(/[^\d.]/g, ""));
    expect(badgeM).toBeGreaterThan(chordLength * 0.9);
    expect(badgeM).toBeLessThan(roadLength * 1.1);

    // The idle status teaches the drag affordance.
    await expect(page.getByTestId("road-follow-status")).toContainText(
      "Drag any point",
    );

    // Commit: the reconstruction line renders (the committed geometry with
    // road points is pinned by unit tests — resample + buildRouteView).
    await page.getByTestId("done-editing-button").click();
    await expect(editor).toHaveCount(0);
    await pollBridge(page, (s) => s.reconstructionLineCount === 1);
  });

  test("dragging a clicked point re-routes both adjacent legs", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmBulge(page, { offsetLat: 0.0004, log });

    const { tail } = await openTailEditor(page);
    const box = await canvasBox(page);
    const v1 = { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 };
    const v2 = { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 };
    await clickAt(page, v1.lat, v1.lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    await clickAt(page, v2.lat, v2.lon, box);
    const beforeDrag = await pollBridge(
      page,
      (s) => s.drawSession?.renderedChainCoordinates.length === 5,
    );
    const routesAfterDraw = log.count;

    // Drag the FIRST clicked point south-east.
    const handle = beforeDrag.drawSession!.handleScreenPositions[0];
    const target = { lat: tail.lat + 0.0004, lon: tail.lon + 0.0026 };
    const targetXY = await project(page, target.lat, target.lon);
    await page.mouse.move(box.x + handle.x, box.y + handle.y);
    await page.mouse.down();
    await page.mouse.move(box.x + targetXY.x, box.y + targetXY.y, {
      steps: 8,
    });
    await page.mouse.up();

    // The move committed: the chain's node 1 is the dropped position.
    const moved = await pollBridge(
      page,
      (s) =>
        s.drawSession?.vertexCount === 2 &&
        Math.abs(s.drawSession.chainCoordinates[1][1] - target.lat) < 0.0002,
    );
    expect(moved.drawSession!.chainCoordinates[1][0]).toBeCloseTo(
      target.lon,
      3,
    );

    // Both adjacent legs re-routed with the NEW endpoints.
    await pollBridge(
      page,
      (s) => s.drawSession?.renderedChainCoordinates.length === 5,
    );
    expect(log.count).toBeGreaterThan(routesAfterDraw);
    const reRouted = log.legs.slice(-2).map((leg) => leg.a);
    expect(
      reRouted.some(
        (a) => Math.abs(a.lat - target.lat) < 0.0002 && Math.abs(a.lon - target.lon) < 0.0002,
      ),
    ).toBe(true);
  });

  test("Straight lines mode renders plain geodesic legs", async ({ page }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmBulge(page, { log });

    const { tail } = await openTailEditor(page);

    // Switch road follow OFF before drawing.
    await page.getByTestId("road-follow-off").click();

    const box = await canvasBox(page);
    const v1 = { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 };
    const v2 = { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 };
    await clickAt(page, v1.lat, v1.lon, box);
    await clickAt(page, v2.lat, v2.lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );

    // Rendered == clicked nodes; no road interior anywhere; no requests.
    expect(drawn.drawSession!.renderedChainCoordinates).toHaveLength(3);
    expect(drawn.drawSession!.renderedChainCoordinates).toEqual(
      drawn.drawSession!.chainCoordinates,
    );
    expect(log.count).toBe(0);
    expect(await page.getByTestId("road-follow-status").count()).toBe(0);
  });

  test("a failed routing service falls back to straight lines honestly", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // Every routing request dies — offline / rate-limited provider.
    await abortRoadRouting(page);

    const { tail } = await openTailEditor(page);
    const box = await canvasBox(page);
    const v1 = { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 };
    const v2 = { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 };
    await clickAt(page, v1.lat, v1.lon, box);
    await clickAt(page, v2.lat, v2.lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );

    // Straight legs, clicked nodes only — never a silent detour.
    expect(drawn.drawSession!.renderedChainCoordinates).toHaveLength(3);
    expect(drawn.drawSession!.renderedChainCoordinates).toEqual(
      drawn.drawSession!.chainCoordinates,
    );
    // The failure is surfaced, not hidden.
    await expect(page.getByTestId("road-follow-status")).toContainText(
      "unavailable right now",
    );
  });
});
