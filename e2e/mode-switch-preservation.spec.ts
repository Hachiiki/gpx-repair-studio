import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  grantRoadConsent,
  mockOsrmBulge,
  mockValhallaBulge,
  type OsrmCallLog,
} from "./helpers/road-follow";
import { enterRepairTool } from "./helpers/landing";

/**
 * E2E — the Phase 20 mode-switching fix: the drawing mode (Roads /
 * Footpaths / Straight) is a property of each SEGMENT, decided when it
 * is drawn and never re-derived.
 *
 * The contract under test (the user's report):
 *
 *   1. the user draws in Road mode, switches to Foot, draws, switches
 *      to Straight, draws, switches back to Road, draws — at ANY point,
 *      without losing or resetting anything already placed;
 *   2. switching must NOT clear, recalculate, or replace previously
 *      drawn segments — a road segment KEEPS its resolved road geometry
 *      while later segments draw under other modes;
 *   3. the final route is ONE continuous line containing every segment
 *      in draw order, and the distance badge measures the COMBINED
 *      rendered route;
 *   4. verified in TWO different studios: the plan editor (anchor-less)
 *      and the repair studio's draw editor (anchored, with a closing
 *      segment that follows the last drawn mode).
 *
 * OSRM answers with a small northward bulge (offset 0.0004°) and
 * Valhalla with a LARGER one (offset 0.0012°) — the two providers'
 * geometry is distinguishable by latitude, so the spec can assert each
 * segment kept ITS mode's geometry. Assertions read the controller's
 * test bridge; no pixel diffs.
 */

const DEMO = join("download", "demo-clean-run.gpx");

const CAR_BULGE = 0.0004;
const FOOT_BULGE = 0.0012;

interface DrawSessionState {
  gapId: string;
  drawMode: boolean;
  vertexCount: number;
  chainCoordinates: [number, number][];
  renderedChainCoordinates: [number, number][];
  closingCoordinates: [number, number][];
}

interface BridgeState {
  status: string;
  ready: boolean;
  moving: boolean;
  routeFeatureCount: number;
  reconstructionLineCount: number;
  pickSession: { active: boolean; mode: string; hasAnchor: boolean } | null;
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

/**
 * Click a geographic position on the map. The canvas box is re-measured
 * per click: chip interactions in the side panel can scroll the page,
 * and a stale box would send the click off-canvas (no vertex placed).
 */
async function clickAt(page: Page, lat: number, lon: number) {
  const box = await canvasBox(page);
  const { x, y } = await project(page, lat, lon);
  await page.mouse.click(box.x + x, box.y + y);
}

/** The plan studio's Berlin frame (the plan spec's own helper). */
async function frameBerlin(page: Page) {
  await page.evaluate(() => {
    window.__gpxMapController!.fitBounds(
      {
        minLat: 52.505,
        maxLat: 52.535,
        minLon: 13.39,
        maxLon: 13.47,
      },
      { maxZoom: 14, action: "e2e-frame" },
    );
  });
}

/** Count chain coordinates whose latitude sits at a bulge level. */
function countBulges(
  chain: readonly [number, number][],
  minLat: number,
  maxLat: number,
): number {
  return chain.filter(([, lat]) => lat >= minLat && lat <= maxLat).length;
}

test.describe("mode switching preserves every placed segment", () => {
  test("the plan editor: Road → Foot → Straight → Road, one continuous route", async ({
    page,
  }) => {
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmBulge(page, { offsetLat: CAR_BULGE, log });
    await mockValhallaBulge(page, { offsetLat: FOOT_BULGE });

    await page.goto("/");
    const card = page.getByTestId("landing-mode-plan");
    if (await card.isVisible()) {
      await card.click();
      await page.getByTestId("plan-start-card").waitFor({ state: "visible" });
    }
    await page.getByTestId("plan-start-button").click();
    await expect(page.getByTestId("plan-section")).toBeVisible();
    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.drawMode === true,
    );
    await grantRoadConsent(page);

    // The drawing plan: five clicks on a zig-zag that stays INSIDE the
    // framed canvas (a straight diagonal marches off the right edge at
    // this zoom), each ≥ ~60 px from its neighbor — clear of every
    // 16 px handle/midpoint hit target and of the corner chrome.
    const p1 = { lat: 52.512, lon: 13.400 };
    const p2 = { lat: 52.521, lon: 13.407 };
    const p3 = { lat: 52.530, lon: 13.415 };
    const p4 = { lat: 52.527, lon: 13.424 };
    const p5 = { lat: 52.516, lon: 13.425 };

    await frameBerlin(page);
    const box = await canvasBox(page);

    // The EXACT bulge latitudes the mocks produce (deterministic).
    const carBulge12 = (p1.lat + p2.lat) / 2 + CAR_BULGE;
    const footBulge23 = (p2.lat + p3.lat) / 2 + FOOT_BULGE;
    const carBulge45 = (p4.lat + p5.lat) / 2 + CAR_BULGE;
    // Bulge matching tolerance: mouse clicks round to integer pixels,
    // so the clicked nodes (and therefore the mocked bulge midpoints)
    // sit within ~1e-4° of the ideal — far tighter than the ~5e-4° the
    // two providers' bulge offsets differ by.
    const hasBulge = (chain: readonly [number, number][], lat: number) =>
      chain.some(([, chainLat]) => Math.abs(chainLat - lat) < 1e-4);

    // -- 1. Road mode (the default): one road segment --------------------
    await clickAt(page, p1.lat, p1.lon);
    await clickAt(page, p2.lat, p2.lon);
    // The OSRM bulge landed EXACTLY between the two clicks.
    await pollBridge(
      page,
      (s) =>
        (s.drawSession?.renderedChainCoordinates ?? []).some(
          ([, lat]) => Math.abs(lat - carBulge12) < 1e-4,
        ),
    );
    let state = await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
    expect(state.drawSession!.vertexCount).toBe(2);

    // -- 2. Foot mode: keep drawing, nothing resets ----------------------
    await page.getByTestId("road-follow-foot").click();
    await clickAt(page, p3.lat, p3.lon);
    // The Valhalla bulge landed for the NEW segment…
    await pollBridge(
      page,
      (s) =>
        (s.drawSession?.renderedChainCoordinates ?? []).some(
          ([, lat]) => Math.abs(lat - footBulge23) < 1e-4,
        ),
    );
    // …and the ROAD segment's bulge is still there — nothing was redrawn.
    state = await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);
    expect(hasBulge(state.drawSession!.renderedChainCoordinates, carBulge12)).toBe(
      true,
    );

    // -- 3. Straight mode: a local segment, no routing at all ------------
    const requestsBeforeStraight = log.count;
    await page.getByTestId("road-follow-off").click();
    await clickAt(page, p4.lat, p4.lon);
    state = await pollBridge(page, (s) => s.drawSession?.vertexCount === 4);
    await page.waitForTimeout(400); // any (unwanted) request would land
    expect(log.count).toBe(requestsBeforeStraight); // nothing re-routed
    const renderedAfterStraight = state.drawSession!.renderedChainCoordinates;
    // Both bulges survived the switch.
    expect(hasBulge(renderedAfterStraight, carBulge12)).toBe(true);
    expect(hasBulge(renderedAfterStraight, footBulge23)).toBe(true);
    // The straight segment contributes its node and nothing else: the
    // rendered chain is nodes + exactly two bulge interiors so far.
    expect(renderedAfterStraight).toHaveLength(4 + 2);

    // -- 4. Back to Road mode: the route keeps growing -------------------
    await page.getByTestId("road-follow-car").click();
    await clickAt(page, p5.lat, p5.lon);
    state = await pollBridge(page, (s) => s.drawSession?.vertexCount === 5);
    await pollBridge(
      page,
      (s) => hasBulge(s.drawSession?.renderedChainCoordinates ?? [], carBulge45),
    );
    // A new OSRM request fired for the NEW segment only.
    expect(log.count).toBeGreaterThan(requestsBeforeStraight);

    // -- 5. The combined route is what the numbers measure ---------------
    // (fresh read — the bulge poll above may have advanced the render)
    const finalState = (await bridge(page))!.drawSession!;
    expect(finalState.vertexCount).toBe(5);
    // The clicked chain is exactly the user's clicks (WYSIWYG truth).
    expect(finalState.chainCoordinates).toHaveLength(5);
    // Every bulge is still in place: car (p1→p2), foot (p2→p3), car
    // (p4→p5) — three interiors over five nodes.
    const final = finalState.renderedChainCoordinates;
    expect(hasBulge(final, carBulge12)).toBe(true);
    expect(hasBulge(final, footBulge23)).toBe(true);
    expect(hasBulge(final, carBulge45)).toBe(true);

    // The distance badge measures the COMBINED rendered route — with
    // three bulged interiors it exceeds the straight node chain.
    const distanceText = await page
      .getByTestId("draw-distance")
      .innerText();
    expect(distanceText).toMatch(/km|mi/);

    // The undo stack spans every placed segment (one step per click —
    // switching modes never pollutes it). The count rides the button's
    // accessible label.
    await expect(page.getByTestId("undo-button")).toBeEnabled();
    await expect(page.getByTestId("undo-button")).toHaveAttribute(
      "aria-label",
      "Undo (5 steps)",
    );
  });

  test("the repair editor: anchored drawing with the closing segment following the last mode", async ({
    page,
  }) => {
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmBulge(page, { offsetLat: CAR_BULGE, log });
    await mockValhallaBulge(page, { offsetLat: FOOT_BULGE });

    await page.goto("/");
    await enterRepairTool(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    const fileChooser = await chooser;
    await fileChooser.setFiles(DEMO);
    await pollBridge(
      page,
      (s) => s.ready && s.routeFeatureCount > 0 && !s.moving,
    );

    // -- pair pick mode: a bounded stretch to redraw (has BOTH anchors,
    //    so the closing segment exists and follows the last drawn mode).
    await page.getByTestId("begin-pick-pair-button").click();
    await pollBridge(
      page,
      (s) => s.pickSession?.active === true && s.pickSession.mode === "pair",
    );

    const xml = readFileSync(DEMO, "utf8");
    const matches = [
      ...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g),
    ];
    const anchorA = {
      lat: Number(matches[120]![1]),
      lon: Number(matches[120]![2]),
    };
    const anchorB = {
      lat: Number(matches[520]![1]),
      lon: Number(matches[520]![2]),
    };

    const box = await canvasBox(page);
    await clickAt(page, anchorA.lat, anchorA.lon);
    await pollBridge(page, (s) => s.pickSession?.hasAnchor === true);
    await clickAt(page, anchorB.lat, anchorB.lon);
    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.drawMode === true,
    );
    await expect(page.getByTestId("draw-editor-panel")).toBeVisible();
    await grantRoadConsent(page);

    // Deterministic clicking: snap OFF.
    await page.getByTestId("snap-toggle").click();

    /*
     * Clicks are planned in SCREEN SPACE, then unprojected: fractions
     * of the projected anchor chord with perpendicular pixel offsets.
     * The chord is guaranteed on-canvas (the fit framed it), so every
     * fraction point is too — no guessing canvas metrics.
     */
    const aScreen = await project(page, anchorA.lat, anchorA.lon);
    const bScreen = await project(page, anchorB.lat, anchorB.lon);
    const chord = {
      dx: bScreen.x - aScreen.x,
      dy: bScreen.y - aScreen.y,
    };
    const chordLen = Math.hypot(chord.dx, chord.dy) || 1;
    const perp = { x: -chord.dy / chordLen, y: chord.dx / chordLen };
    const screenPoint = async (t: number, offsetPx: number) => {
      const x = aScreen.x + t * chord.dx + offsetPx * perp.x;
      const y = aScreen.y + t * chord.dy + offsetPx * perp.y;
      return page.evaluate(
        ([x_, y_]) =>
          window.__gpxMapController!.unprojectXY(
            x_ as number,
            y_ as number,
          ),
        [x, y] as const,
      );
    };

    // -- 1. Road mode: two vertices = two road segments -----------------
    const v1 = await screenPoint(0.2, 60);
    const v2 = await screenPoint(0.48, 95);
    await clickAt(page, v1.lat, v1.lon);
    await clickAt(page, v2.lat, v2.lon);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
    /*
     * Road interiors are counted structurally: every mocked leg
     * contributes exactly ONE interior point, so
     * rendered − clicked = the number of resolved road legs. Robust to
     * which side of the chord the clicks sit on.
     */
    const interiorCount = (state: BridgeState) =>
      (state.drawSession?.renderedChainCoordinates.length ?? 0) -
      (state.drawSession?.chainCoordinates.length ?? 0);
    await pollBridge(
      page,
      (s) =>
        s.drawSession !== null &&
        s.drawSession.vertexCount === 2 &&
        interiorCount(s) === 2,
    );
    const bulgesAfterRoad = 2; // anchor→v1 and v1→v2, both car

    // -- 2. Straight mode: the LAST segment is straight — the CLOSING
    //      preview (v2 → far anchor) follows the last drawn mode, so it
    //      stays the plain dashed chord.
    await page.getByTestId("road-follow-off").click();
    const requestsBefore = log.count;
    const v3 = await screenPoint(0.74, 45);
    await clickAt(page, v3.lat, v3.lon);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);
    await page.waitForTimeout(400);
    // No re-routing of the placed road segments.
    expect(log.count).toBe(requestsBefore);
    // …their road interiors are all still rendered (the straight
    // segment added none).
    const straightState = (await bridge(page))!;
    expect(straightState.drawSession!.vertexCount).toBe(3);
    expect(interiorCount(straightState)).toBe(bulgesAfterRoad);
    // The closing preview is the plain chord (2 points, no road bulge).
    const closingStraight = (await bridge(page))!.drawSession!
      .closingCoordinates;
    expect(closingStraight).toHaveLength(2);

    // -- 3. Foot mode: draw one more — the closing preview follows the
    //      LAST drawn mode and gains the Valhalla road geometry.
    await page.getByTestId("road-follow-foot").click();
    const v4 = await screenPoint(0.9, 110);
    await clickAt(page, v4.lat, v4.lon);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 4);
    await pollBridge(
      page,
      (s) => (s.drawSession?.closingCoordinates ?? []).length === 3,
    );
    const closingRouted = (await bridge(page))!.drawSession!
      .closingCoordinates;
    // The closing interior is the EXACT Valhalla bulge between v4 and
    // the far anchor — the road-followed closing, not the chord.
    expect(closingRouted).toHaveLength(3);
    expect(closingRouted[1]![1]).toBeCloseTo(
      (v4.lat + anchorB.lat) / 2 + FOOT_BULGE,
      4,
    );

    // -- 4. The whole line survived: 4 vertices, every road bulge from
    //      the first two segments still rendered, one continuous chain.
    const final = (await bridge(page))!.drawSession!;
    expect(final.vertexCount).toBe(4);
    // The clicked chain = the before-anchor + the four placed vertices.
    expect(final.chainCoordinates).toHaveLength(5);
    // Two car interiors + one foot interior (v3→v4) — every placed
    // segment's geometry is still on the line.
    expect(final.renderedChainCoordinates).toHaveLength(5 + 3);
  });
});
