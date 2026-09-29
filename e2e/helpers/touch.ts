import type { Page } from "@playwright/test";

/**
 * Phase 8 — synthetic TOUCH input for Playwright specs.
 *
 * Playwright's own APIs are mouse-shaped (`page.mouse`); its
 * `touchscreen` supports taps only. The MapLibre controller's touch
 * layer (and MapLibre's own touch handlers) only ever see REAL
 * TouchEvents — mouse input takes the mouse paths — so the touch
 * specs drive the Chrome DevTools Protocol's `Input.dispatchTouchEvent`,
 * which produces genuine touch events with full multi-touch control.
 *
 * All coordinates are page (viewport) coordinates, exactly like
 * `page.mouse`. Multi-touch events carry the FULL active-touch list
 * (CDP semantics: every event re-states every finger).
 */

export interface TouchPoint {
  x: number;
  y: number;
  /** Stable touch identifier (CDP assigns none — every event
   * re-states every finger with the SAME id). */
  id?: number;
}

export interface TouchSession {
  /** Move the ONLY finger (single-touch sessions). */
  move: (point: TouchPoint) => Promise<void>;
  /** End the gesture (lift every finger). */
  end: () => Promise<void>;
}

async function dispatch(
  page: Page,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  touchPoints: TouchPoint[],
): Promise<void> {
  const cdp = await sessionFor(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: touchPoints.map((p, index) => ({
      x: p.x,
      y: p.y,
      id: p.id ?? index + 1,
      // A little radius/force realism — some handlers read them.
      radiusX: 2,
      radiusY: 2,
      force: 1,
    })),
  });
}

/** One CDP session per page (created on first use, left attached). */
const sessions = new WeakMap<Page, Awaited<ReturnType<typeof pageSession>>>();
async function pageSession(page: Page) {
  return page.context().newCDPSession(page);
}

async function sessionFor(page: Page) {
  let session = sessions.get(page);
  if (!session) {
    session = await pageSession(page);
    sessions.set(page, session);
  }
  return session;
}

/** A single tap (press + release at the same spot). */
export async function touchTap(page: Page, point: TouchPoint): Promise<void> {
  await dispatch(page, "touchStart", [point]);
  await page.waitForTimeout(40);
  await dispatch(page, "touchEnd", []);
}

/**
 * A long press — press, hold past the app's long-press window, lift.
 * (Default hold exceeds the controller's 480 ms threshold.)
 */
export async function touchLongPress(
  page: Page,
  point: TouchPoint,
  holdMs = 620,
): Promise<void> {
  await dispatch(page, "touchStart", [point]);
  await page.waitForTimeout(holdMs);
  await dispatch(page, "touchEnd", []);
}

/**
 * A single-finger drag through the given waypoints (press → moves →
 * lift). Use for freehand Curve-pen strokes and Move-mode handle
 * drags.
 */
export async function touchDrag(
  page: Page,
  points: TouchPoint[],
  options?: { stepMs?: number },
): Promise<void> {
  if (points.length === 0) return;
  const stepMs = options?.stepMs ?? 24;
  await dispatch(page, "touchStart", [points[0]]);
  for (const point of points.slice(1)) {
    await page.waitForTimeout(stepMs);
    await dispatch(page, "touchMove", [point]);
  }
  await page.waitForTimeout(stepMs);
  await dispatch(page, "touchEnd", []);
}

/**
 * Start a single-finger gesture that stays DOWN (for interleaved
 * assertions and second-finger scenarios). Every `move` re-states the
 * finger; `end` lifts it.
 */
export async function touchHoldStart(
  page: Page,
  point: TouchPoint,
): Promise<TouchSession> {
  await dispatch(page, "touchStart", [point]);
  return {
    move: async (next) => {
      await dispatch(page, "touchMove", [next]);
    },
    end: async () => {
      await dispatch(page, "touchEnd", []);
    },
  };
}

/**
 * A two-finger pan: both fingers land, travel together by (dx, dy)
 * across `steps` moves, then lift. Assert the camera moved (and any
 * single-finger gesture was cancelled) around this.
 */
export async function twoFingerPan(
  page: Page,
  a: TouchPoint,
  b: TouchPoint,
  dx: number,
  dy: number,
  options?: { steps?: number; stepMs?: number },
): Promise<void> {
  const steps = options?.steps ?? 8;
  const stepMs = options?.stepMs ?? 24;
  await dispatch(page, "touchStart", [a, b]);
  for (let i = 1; i <= steps; i += 1) {
    await page.waitForTimeout(stepMs);
    await dispatch(page, "touchMove", [
      { x: a.x + (dx * i) / steps, y: a.y + (dy * i) / steps },
      { x: b.x + (dx * i) / steps, y: b.y + (dy * i) / steps },
    ]);
  }
  await page.waitForTimeout(stepMs);
  await dispatch(page, "touchEnd", []);
}
