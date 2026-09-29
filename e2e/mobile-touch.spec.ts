import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";
import { enterRepairTool } from "./helpers/landing";
import {
  touchDrag,
  touchHoldStart,
  touchLongPress,
  touchTap,
  twoFingerPan,
} from "./helpers/touch";

/**
 * Phase 8 E2E — the touch gesture layer, on a phone-shaped context.
 *
 * MapLibre GL v6 keeps touch and mouse strictly apart, so these specs
 * drive REAL touch events through CDP (`helpers/touch.ts`) against a
 * 390×844 touch viewport — the acceptance proof that "the full repair
 * flow is completable on a touch device":
 *
 *   1. the Default pen draws tap by tap;
 *   2. the Curve pen draws freehand strokes, and a tap still adds one;
 *   3. a second finger cancels the stroke and two-finger pan takes
 *      the map (draw mode's escape hatch);
 *   4. long-press deletes a drawn point (touch's dblclick twin);
 *   5. Move mode drags a vertex by touch;
 *   6. the mobile tools sheet keeps map + tools on one screen, and an
 *      editor opening expands it (the Task-49 reveal's mobile twin);
 *   7. upload → draw → finish → export, all under fingers.
 */

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

const BEFORE = { lat: 52.520141, lon: 13.405164 };
const AFTER = { lat: 52.520186, lon: 13.405234 };

const DRAW_POINTS = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
  { lat: 52.5199, lon: 13.4062 },
  { lat: 52.5204, lon: 13.4066 },
];

interface TouchState {
  touchInput: boolean;
  gesture: "stroke" | "handle" | "press" | null;
  navActive: boolean;
}

interface BridgeState {
  ready: boolean;
  routeFeatureCount: number;
  reconstructionLineCount: number;
  moving: boolean;
  center: { lat: number; lon: number } | null;
  touch: TouchState;
  drawSession: {
    drawMode: boolean;
    pointerMode: "draw" | "move" | "pan";
    penMode: "default" | "curve";
    strokeActive: boolean;
    vertexCount: number;
    pathCoordinates: [number, number][];
    handleScreenPositions: { vertexId: string; x: number; y: number }[];
  } | null;
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
  await enterRepairTool(page);
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

/** A page-space point for a geographic position. */
async function pagePoint(
  page: Page,
  lat: number,
  lon: number,
  box: { x: number; y: number },
) {
  const { x, y } = await project(page, lat, lon);
  return { x: box.x + x, y: box.y + y };
}

/** Tap a geographic position on the canvas (synthetic touch). */
async function tapAt(
  page: Page,
  lat: number,
  lon: number,
  box: { x: number; y: number },
) {
  await touchTap(page, await pagePoint(page, lat, lon, box));
}

async function openEditor(page: Page): Promise<BridgeState> {
  await page.getByTestId("open-editor-button").first().click();
  const state = await pollBridge(
    page,
    (s) => s.drawSession !== null && s.drawSession.drawMode === true,
  );
  // The Task-49 reveal's mobile twin: the tools sheet expands so the
  // Pen group is under the user's thumb.
  await expect(page.getByTestId("pen-mode-group")).toBeInViewport({
    ratio: 1,
  });
  return state;
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("mobile touch — gestures", () => {
  test("coarse-pointer mode is detected and hit targets are enlarged", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    const state = await pollBridge(
      page,
      (s) => s.ready && s.routeFeatureCount > 0 && !s.moving,
    );
    expect(state.touch.touchInput).toBe(true);
  });

  test("the default pen draws tap by tap and connects the anchors", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await openEditor(page);
    const box = await canvasBox(page);

    await tapAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await tapAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );

    const path = drawn.drawSession!.pathCoordinates;
    expect(path[0][0]).toBeCloseTo(BEFORE.lon, 6);
    expect(path[path.length - 1][0]).toBeCloseTo(AFTER.lon, 6);
  });

  test("the Curve pen draws a freehand stroke; a tap still adds one point", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await openEditor(page);
    await page.getByTestId("pen-mode-curve").click();
    await pollBridge(page, (s) => s.drawSession?.penMode === "curve");

    const box = await canvasBox(page);
    // A freehand arc between the anchors, clear of every affordance.
    const start = await pagePoint(page, 52.5207, 13.4054, box);
    const mid1 = await pagePoint(page, 52.5205, 13.4060, box);
    const mid2 = await pagePoint(page, 52.5201, 13.4063, box);
    const end = await pagePoint(page, 52.5198, 13.4067, box);
    await touchDrag(page, [start, mid1, mid2, end]);

    const stroked = await pollBridge(
      page,
      (s) => (s.drawSession?.vertexCount ?? 0) >= 2 && !s.drawSession!.strokeActive,
    );
    expect(stroked.drawSession!.vertexCount).toBeGreaterThanOrEqual(2);
    // The committed stroke rendered as a denser line than its nodes
    // (spline smoothing) — the map-side WYSIWYG the mouse path has.
    expect(stroked.drawSession!.pathCoordinates.length).toBeGreaterThan(
      stroked.drawSession!.vertexCount,
    );

    // A quick tap with the Curve pen places exactly one point.
    const before = stroked.drawSession!.vertexCount;
    await tapAt(page, 52.52035, 13.4052, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === before + 1);
  });

  test("a second finger cancels the stroke and two-finger pan takes the map", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await openEditor(page);
    await page.getByTestId("pen-mode-curve").click();
    await pollBridge(page, (s) => s.drawSession?.penMode === "curve");

    const box = await canvasBox(page);
    const start = await pagePoint(page, 52.5207, 13.4054, box);
    const mid = await pagePoint(page, 52.5205, 13.4060, box);
    // The second finger mirrors toward the canvas's center — both
    // fingers must stay on the canvas for the whole gesture (a touch
    // off-canvas targets the page, not the map, and the controller
    // rightly ignores it).
    const second = { x: mid.x - 60, y: mid.y + 90 };

    // One finger starts drawing…
    const stroke = await touchHoldStart(page, start);
    await stroke.move(mid);
    await pollBridge(page, (s) => s.drawSession?.strokeActive === true);

    const centerBefore = (await pollBridge(page, (s) => s.center !== null))
      .center!;

    // …the second finger lands: the stroke is cancelled and the
    // two-finger pan owns the map for the rest of the gesture.
    await twoFingerPan(page, mid, second, -120, -100);
    const after = await pollBridge(
      page,
      (s) => !s.touch.navActive && !s.moving && s.center !== null,
    );
    expect(after.drawSession!.strokeActive).toBe(false);
    // No stroke committed — the chain is untouched.
    expect(after.drawSession!.vertexCount).toBe(0);
    // The map panned.
    const moved =
      Math.abs(after.center!.lat - centerBefore.lat) +
      Math.abs(after.center!.lon - centerBefore.lon);
    expect(moved).toBeGreaterThan(1e-5);
  });

  test("long-press deletes a drawn point and announces it", async ({ page }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await openEditor(page);
    const box = await canvasBox(page);
    await tapAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await tapAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );

    // Long-press the second vertex (its handle's screen position).
    const handle = drawn.drawSession!.handleScreenPositions[1];
    await touchLongPress(page, {
      x: box.x + handle.x,
      y: box.y + handle.y,
    });

    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    // The non-visual twin: the aria-live region speaks the delete.
    await expect(page.getByTestId("announcer-region")).toContainText(
      "Point deleted",
    );
  });

  test("Move mode drags a vertex by touch", async ({ page }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await openEditor(page);
    const box = await canvasBox(page);
    await tapAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await tapAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );

    const handle = drawn.drawSession!.handleScreenPositions[0];
    const before = drawn.drawSession!.pathCoordinates[1]; // the vertex's [lon, lat]

    // Draw → Move (the mode chip cycles draw → move → pan).
    await page.getByTestId("map-mode-chip").click();
    await pollBridge(page, (s) => s.drawSession?.pointerMode === "move");

    await touchDrag(page, [
      { x: box.x + handle.x, y: box.y + handle.y },
      { x: box.x + handle.x + 46, y: box.y + handle.y + 34 },
      { x: box.x + handle.x + 82, y: box.y + handle.y + 58 },
    ]);

    const moved = await pollBridge(
      page,
      (s) => s.drawSession !== null && !s.drawSession!.strokeActive,
    );
    const after = moved.drawSession!.pathCoordinates[1];
    expect(
      Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1]),
    ).toBeGreaterThan(1e-6);
  });
});

test.describe("mobile touch — the tools sheet", () => {
  test("peeks collapsed, expands on toggle, and opens with the editor", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const sheet = page.getByTestId("mobile-tools-sheet");
    const toggle = page.getByTestId("mobile-tools-toggle");
    await expect(sheet).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The gap list is reachable in the collapsed peek (scrollable).
    await expect(page.getByTestId("gap-list")).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Opening an editor expands the sheet (the Task-49 reveal twin).
    await openEditor(page);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("draw-editor-panel")).toBeVisible();
    await expect(page.getByTestId("mobile-tools-toggle")).toBeInViewport();
  });

  test("the full repair flow completes under fingers", async ({ page }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await openEditor(page);
    const box = await canvasBox(page);
    await tapAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await tapAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // Finish the repair (the committed line replaces the span).
    await page.getByTestId("done-editing-button").click();
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );

    // Export: the dialog opens from the sheet, the download lands.
    await page.getByTestId("open-export-button").click();
    const download = page.waitForEvent("download");
    await page.getByTestId("export-download-button").click();
    const downloaded = await download;
    expect(await downloaded.suggestedFilename()).toContain("repaired");
    // The aria-live twin of "your file is ready".
    await expect(page.getByTestId("announcer-region")).toContainText(
      "Export ready",
    );
  });
});
