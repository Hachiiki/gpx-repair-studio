import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * User pass 52 — the mode-honesty regression spec.
 *
 * The contract (Task 48): dragging a drawn point is Move mode's job and
 * ONLY its job. In Draw the pencil adds points; in Pan the map navigates.
 * The user report — "in draw mode I can still drag points" — probed out
 * as mode-BLIND affordances (pen chips that look live outside Draw, a
 * road-follow status that invites dragging in every mode, a legend that
 * says "drag to move" unconditionally). The gating itself was watertight;
 * this spec pins it so it STAYS that way, and pins the honest affordances
 * alongside: outside Draw the pen chips disable and the copy points at
 * Move instead of inviting a drag.
 *
 * Three editors, one contract each: Plan (the stats planner), Create (the
 * from-stats editor), Repair (the reconstruction editor — the panel the
 * Recovery tool also renders).
 */

interface DrawSessionState {
  pointerMode: "draw" | "move" | "pan";
  penMode: "default" | "curve";
  vertexCount: number;
  chainCoordinates: [number, number][];
  handleScreenPositions: { vertexId: string; x: number; y: number }[];
}

interface BridgeState {
  status: string;
  ready: boolean;
  routeFeatureCount: number;
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
        `bridge predicate not met; last: ${JSON.stringify(state)}`,
      );
    }
    await page.waitForTimeout(150);
  }
}

/** Wait until the drawn chain stops moving (road legs, snap round-trips,
 * store propagation all settled) — comparisons below must be stable. */
async function settledChain(
  page: Page,
  timeoutMs = 10_000,
): Promise<[number, number][]> {
  const started = Date.now();
  let last = "";
  for (;;) {
    const state = await pollBridge(page, (s) => s.drawSession !== null);
    const json = JSON.stringify(state.drawSession!.chainCoordinates);
    if (json === last) return state.drawSession!.chainCoordinates;
    last = json;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`chain never settled; last: ${json}`);
    }
    await page.waitForTimeout(300);
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

async function clickAt(
  page: Page,
  lat: number,
  lon: number,
  box: { x: number; y: number },
) {
  const { x, y } = await project(page, lat, lon);
  await page.mouse.click(box.x + x, box.y + y);
}

/** Mouse-drag the handle at `index` by (dx, dy) canvas pixels. */
async function dragHandle(
  page: Page,
  box: { x: number; y: number },
  index: number,
  dx: number,
  dy: number,
) {
  const state = await pollBridge(page, (s) => s.drawSession !== null);
  const target = state.drawSession!.handleScreenPositions[index];
  expect(target, `handle ${index} exists`).toBeDefined();
  await page.mouse.move(box.x + target.x, box.y + target.y);
  await page.mouse.down();
  await page.mouse.move(box.x + target.x + dx, box.y + target.y + dy, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** The drawn VERTICES of the chain (the repair editor prefixes its
 * before-anchor — drop it so all three editors compare alike). */
function vertexCoords(chain: [number, number][], dropAnchor: boolean) {
  return JSON.stringify(dropAnchor ? chain.slice(1) : chain);
}

function maxShift(a: [number, number][], b: [number, number][]) {
  let max = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    max = Math.max(
      max,
      Math.abs(a[i][0] - b[i][0]),
      Math.abs(a[i][1] - b[i][1]),
    );
  }
  return max;
}

const ROUTE_POINTS = [
  { lat: 52.52, lon: 13.405 },
  { lat: 52.53, lon: 13.405 },
  { lat: 52.53, lon: 13.455 },
];

/** The repair editor frames the (small) gap at high zoom — its draw
 * positions hug the gap instead of spanning the Berlin box above. */
const GAP_POINTS = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
  { lat: 52.5199, lon: 13.4062 },
];

/** The shared assertion body: a Draw-mode drag is a no-op, the affordances
 * go honest, and the same gesture in Move moves the point. */
async function assertModeGating(
  page: Page,
  dropAnchor: boolean,
  points: { lat: number; lon: number }[],
) {
  const box = await canvasBox(page);
  for (const point of points) {
    await clickAt(page, point.lat, point.lon, box);
  }
  await pollBridge(
    page,
    (s) => s.drawSession?.vertexCount === points.length,
  );
  const before = await settledChain(page);
  expect(before.length).toBeGreaterThanOrEqual(points.length);

  // --- Draw mode: dragging a handle moves nothing ----------------------
  await dragHandle(page, box, 1, 100, 60);
  let state = await pollBridge(page, (s) => s.drawSession !== null);
  expect(state.drawSession!.pointerMode).toBe("draw");
  expect(state.drawSession!.vertexCount).toBe(points.length);
  expect(vertexCoords(state.drawSession!.chainCoordinates, dropAnchor)).toBe(
    vertexCoords(before, dropAnchor),
  );

  // --- Switch to Move: the affordances turn honest ----------------------
  await page.getByTestId("draw-mode-move").click();
  state = await pollBridge(
    page,
    (s) => s.drawSession?.pointerMode === "move",
  );
  // The pen group is inert (user pass 52) — chips disabled, note honest.
  await expect(page.getByTestId("pen-mode-default")).toBeDisabled();
  await expect(page.getByTestId("pen-mode-curve")).toBeDisabled();
  await expect(page.getByTestId("pen-inactive-note")).toContainText(
    /drags your points/i,
  );
  // The road-follow status invites the drag ONLY here (straight-line
  // editors show no status — the panel copy check is unit-tested).
  const status = page.getByTestId("road-follow-status");
  if (await status.isVisible().catch(() => false)) {
    await expect(status).toContainText(/Drag any point to adjust/i);
  }
  // The "c" accelerator is a Draw-mode concern — Move ignores it.
  const penBefore = state.drawSession!.penMode;
  await page.keyboard.press("c");
  await page.waitForTimeout(250);
  state = await pollBridge(page, (s) => s.drawSession !== null);
  expect(state.drawSession!.penMode).toBe(penBefore);

  // --- Move mode: the same gesture moves the point ----------------------
  await dragHandle(page, box, 1, 100, 60);
  state = await pollBridge(page, (s) => s.drawSession !== null);
  expect(state.drawSession!.vertexCount).toBe(points.length);
  const shift = maxShift(state.drawSession!.chainCoordinates, before);
  expect(shift).toBeGreaterThan(1e-5);

  // --- Back to Draw: dragging is a no-op again ---------------------------
  await page.getByTestId("draw-mode-draw").click();
  await pollBridge(page, (s) => s.drawSession?.pointerMode === "draw");
  const settledAgain = await settledChain(page);
  await dragHandle(page, box, 1, -80, -50);
  state = await pollBridge(page, (s) => s.drawSession !== null);
  expect(vertexCoords(state.drawSession!.chainCoordinates, dropAnchor)).toBe(
    vertexCoords(settledAgain, dropAnchor),
  );
  // And the pen is live again.
  await expect(page.getByTestId("pen-mode-default")).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("pointer-mode gating (user pass 52)", () => {
  test("plan editor: dragging is Move-mode-only, the pen lives in Draw", async ({
    page,
  }) => {
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
      (s) => s.drawSession !== null && s.drawSession.pointerMode === "draw",
    );
    await page.getByTestId("road-follow-off").click();
    await page.evaluate(() => {
      window.__gpxMapController!.fitBounds(
        { minLat: 52.51, maxLat: 52.535, minLon: 13.39, maxLon: 13.47 },
        { maxZoom: 14, action: "e2e-frame" },
      );
    });
    await assertModeGating(page, false, ROUTE_POINTS);
  });

  test("create editor: dragging is Move-mode-only, the pen lives in Draw", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-create").click();
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
    await expect(page.getByTestId("create-section")).toBeVisible();
    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.pointerMode === "draw",
    );
    await page.getByTestId("road-follow-off").click();
    await page.evaluate(() => {
      window.__gpxMapController!.fitBounds(
        { minLat: 52.51, maxLat: 52.535, minLon: 13.39, maxLon: 13.47 },
        { maxZoom: 14, action: "e2e-frame" },
      );
    });
    await assertModeGating(page, false, ROUTE_POINTS);
  });

  test("repair editor: dragging is Move-mode-only, the pen lives in Draw", async ({
    page,
  }) => {
    await page.goto("/");
    await enterRepairTool(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    (await chooser).setFiles(
      join("src", "features", "gpx", "fixtures", "files", "time-gap.gpx"),
    );
    await pollBridge(
      page,
      (s) => s.ready && s.routeFeatureCount > 0 && !s.moving,
      20_000,
    );
    await page.getByTestId("open-editor-button").first().click();
    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.pointerMode === "draw",
    );
    // Deterministic positions: no snap magnet, no road legs.
    await page.getByTestId("snap-toggle").click();
    await page.getByTestId("road-follow-off").click();
    await assertModeGating(page, true, GAP_POINTS);
  });
});
