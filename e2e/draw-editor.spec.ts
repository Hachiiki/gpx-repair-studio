import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

/**
 * Phase 4 E2E — the reconstruction drawing editor acceptance criteria:
 *
 *   1. draw → the dashed emerald route connects the anchors exactly
 *      (first/last path coordinates are the gap boundary points);
 *   2. distance updates live; vertex count / cap surfaced;
 *   3. draw → edit (drag, midpoint insert, row delete) → undo → redo →
 *      clear all functional;
 *   4. reconstruction is visibly distinct (own layer set) and the original
 *      store is untouched (recorded route/span counts and stats unchanged
 *      — the Phase 4 immutability test);
 *   5. closing the editor commits the line (span replaced); skipping
 *      brings the unknown span back;
 *   6. the Draw/Pan toggle gates pointer input;
 *   7. drawing works at a mobile (375 px) viewport.
 *
 * Assertions read the controller's test bridge (draw-session snapshot +
 * projectLatLon/unprojectXY) — no pixel diffs, deliberately tile-independent.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

/** The time-gap fixture's gap boundaries (points 3 → 4, a 5-min pause). */
const BEFORE = { lat: 52.520141, lon: 13.405164 };
const AFTER = { lat: 52.520186, lon: 13.405234 };

/** Hand-picked draw positions, well clear of handles/midpoints/anchors. */
const DRAW_POINTS = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
];

interface DrawSessionState {
  gapId: string;
  drawMode: boolean;
  vertexCount: number;
  pathCoordinates: [number, number][];
  handleScreenPositions: { vertexId: string; x: number; y: number }[];
  midpointScreenPositions: { insertIndex: number; x: number; y: number }[];
  rubberBandVisible: boolean;
}

interface BridgeState {
  status: string;
  ready: boolean;
  routeFeatureCount: number;
  gapSpanCount: number;
  reconstructionLineCount: number;
  selectedGapId: string | null;
  lastCameraAction: string | null;
  moving: boolean;
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

async function upload(page: Page, path = join(FIXTURES, "time-gap.gpx")) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

/** Project a lat/lon to canvas pixels via the bridge. */
async function project(page: Page, lat: number, lon: number) {
  return page.evaluate(
    ([lat_, lon_]) =>
      window.__gpxMapController!.projectLatLon(lat_ as number, lon_ as number),
    [lat, lon] as const,
  );
}

/** Open the draw editor for the (single) detected gap and settle. */
async function openEditor(page: Page): Promise<BridgeState> {
  await page.getByTestId("open-editor-button").first().click();
  return pollBridge(
    page,
    (s) => s.drawSession !== null && s.drawSession.drawMode === true,
  );
}

/** Click a geographic position on the canvas (synthetic pointer drawing). */
async function clickAt(
  page: Page,
  lat: number,
  lon: number,
  canvasBox: { x: number; y: number },
) {
  const { x, y } = await project(page, lat, lon);
  await page.mouse.click(canvasBox.x + x, canvasBox.y + y);
}

async function canvasBox(page: Page) {
  // Panel interactions (snap toggle, vertex rows…) scroll the page; on the
  // mobile layout the map can end up off-screen, and page.mouse at
  // negative page-y never reaches the canvas. Re-anchoring is idempotent.
  await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe("draw editor — desktop", () => {
  test("drawing connects the anchors exactly, updates live, and never touches the original", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const beforeStats = await page
      .getByTestId("stats-panel")
      .innerText()
      .catch(() => "");
    const originalRouteFeatures = 2;

    await openEditor(page);
    const session = (await bridge(page))!.drawSession!;
    expect(session.vertexCount).toBe(0);

    // Deterministic positions: disable the snap magnet first.
    await page.getByTestId("snap-toggle").click();

    const box = await canvasBox(page);
    const badge = page.getByTestId("draw-distance-badge");
    const initialDistanceText = await badge
      .getByTestId("badge-distance")
      .innerText();

    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );

    // The anchors are ALWAYS connected: first/last path coordinates are the
    // gap boundary points, in order, exactly.
    const path = drawn.drawSession!.pathCoordinates;
    expect(path[0][0]).toBeCloseTo(BEFORE.lon, 6);
    expect(path[0][1]).toBeCloseTo(BEFORE.lat, 6);
    expect(path[path.length - 1][0]).toBeCloseTo(AFTER.lon, 6);
    expect(path[path.length - 1][1]).toBeCloseTo(AFTER.lat, 6);
    // …and the two drawn vertices sit between them (4 dp ≈ 7 m — clicks
    // are pixel-quantized, so sub-pixel precision is not meaningful).
    expect(path).toHaveLength(4);
    expect(path[1][0]).toBeCloseTo(DRAW_POINTS[0].lon, 4);
    expect(path[2][0]).toBeCloseTo(DRAW_POINTS[1].lon, 4);

    // Live distance grew beyond the straight line and the badge updated.
    const drawnDistanceText = await badge
      .getByTestId("badge-distance")
      .innerText();
    expect(drawnDistanceText).not.toBe(initialDistanceText);
    expect(
      Number.parseFloat(drawnDistanceText.replace(/[^\d.]/g, "")),
    ).toBeGreaterThan(
      Number.parseFloat(initialDistanceText.replace(/[^\d.]/g, "")),
    );

    // The rubber band follows the pointer while drawing.
    expect(drawn.drawSession!.rubberBandVisible).toBe(true);

    // IMMUTABILITY: the recorded route and the recorded stats are
    // untouched by the edits. (The gap SPAN is a derived rendering — it
    // yields to the draft once authored geometry exists, by design.)
    expect(drawn.routeFeatureCount).toBe(originalRouteFeatures);
    expect(drawn.gapSpanCount).toBe(0);
    const afterStats = await page
      .getByTestId("stats-panel")
      .innerText()
      .catch(() => "");
    expect(afterStats).toBe(beforeStats);

    // The panel reports the same live state.
    expect(page.getByTestId("vertex-count")).toHaveText(/2 \/ 128 points/);
  });

  test("undo, redo, and clear all work from the panel", async ({ page }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);

    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // Undo twice → empty; redo once → one vertex again; clear → empty.
    await page.getByTestId("undo-button").click();
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    await page.getByTestId("undo-button").click();
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 0);
    expect(await page.getByTestId("undo-button").isDisabled()).toBe(true);

    await page.getByTestId("redo-button").click();
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);

    await page.getByTestId("clear-button").click();
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 0);
    expect(await page.getByTestId("clear-button").isDisabled()).toBe(true);
  });

  test("editing: drag a handle, insert at a midpoint, delete from the panel", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);

    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    const two = await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // Drag the first handle 40 px east / 24 px north. The canvas box is
    // re-read fresh: layout shifts (editor panel growing) can move the
    // canvas between steps, and a stale box would drag at stale pixels.
    const dragBox = await canvasBox(page);
    const handle = two.drawSession!.handleScreenPositions[0];
    await page.mouse.move(dragBox.x + handle.x, dragBox.y + handle.y);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + handle.x + 40, dragBox.y + handle.y - 24, {
      steps: 6,
    });
    await page.mouse.up();
    const moved = await pollBridge(
      page,
      (s) =>
        s.drawSession !== null &&
        s.drawSession.pathCoordinates[1][0] !==
          two.drawSession!.pathCoordinates[1][0],
    );
    expect(moved.drawSession!.vertexCount).toBe(2); // a move, not an add

    // Insert at the first midpoint handle → 3 vertices.
    const midBox = await canvasBox(page);
    const midpoints = moved.drawSession!.midpointScreenPositions;
    expect(midpoints.length).toBe(3); // 4 path points → 3 legs
    await page.mouse.click(
      midBox.x + midpoints[1].x,
      midBox.y + midpoints[1].y,
    );
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);

    // Delete the first row from the panel (the accessible path).
    await page.getByTestId("delete-vertex-button").first().click();
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // Undo restores it.
    await page.getByTestId("undo-button").click();
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);
  });

  test("closing the editor commits a distinct reconstruction; skipping restores the span", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);

    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);

    // Commit: the dashed emerald line replaces the unknown span.
    await page.getByTestId("done-editing-button").click();
    const committed = await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );
    expect(committed.gapSpanCount).toBe(0);
    await expect(page.getByTestId("draw-editor-panel")).toBeHidden();
    await expect(page.getByTestId("gap-row")).toContainText("Reconstructed");
    await expect(page.getByTestId("open-editor-button")).toHaveText(
      "Edit route",
    );

    // Reopen: the committed line becomes the editable draft again.
    await page.getByTestId("open-editor-button").first().click();
    const reopened = await pollBridge(
      page,
      (s) =>
        s.drawSession !== null &&
        s.drawSession.vertexCount === 1 &&
        s.reconstructionLineCount === 0,
    );
    expect(reopened.gapSpanCount).toBe(0); // still authored, not unknown

    // Skip: the editor closes, the repair is parked, the span returns.
    await page.getByTestId("skip-gap-button").click();
    const skipped = await pollBridge(
      page,
      (s) => s.drawSession === null && s.gapSpanCount === 1,
    );
    expect(skipped.reconstructionLineCount).toBe(0);
    await expect(page.getByTestId("gap-row")).toContainText("Skipped");

    // Editing again implies repairing (skip withdrawn on open).
    await page.getByTestId("open-editor-button").first().click();
    await pollBridge(page, (s) => s.drawSession !== null);
    await expect(page.getByTestId("gap-row")).toContainText("Editing");
  });

  test("the Draw/Pan toggle gates pointer input", async ({ page }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);

    // Pan mode: clicks navigate, they never draw.
    await page.getByTestId("draw-mode-pan").click();
    await pollBridge(page, (s) => s.drawSession?.drawMode === false);
    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await page.waitForTimeout(300);
    expect((await bridge(page))!.drawSession!.vertexCount).toBe(0);

    // Draw mode: the same click adds a vertex.
    await page.getByTestId("draw-mode-draw").click();
    await pollBridge(page, (s) => s.drawSession?.drawMode === true);
    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
  });
});

test.describe("draw editor — mobile viewport", () => {
  test("drawing works at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await openEditor(page);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);

    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );

    const path = drawn.drawSession!.pathCoordinates;
    expect(path[0][0]).toBeCloseTo(BEFORE.lon, 6);
    expect(path[path.length - 1][0]).toBeCloseTo(AFTER.lon, 6);

    // The editor panel stays reachable below the map (single column).
    await expect(page.getByTestId("draw-editor-panel")).toBeVisible();
    await expect(page.getByTestId("draw-distance-badge")).toBeVisible();
  });
});
