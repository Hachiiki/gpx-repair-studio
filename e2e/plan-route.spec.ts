import { expect, test, type Page, type Route } from "@playwright/test";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * E2E — the "Plan a route" workflow (the sixth tool, Task 50):
 *
 *   1. the landing's plan tool page: hero + start card (no upload zone,
 *      no statistics form) — the map is the input;
 *   2. the full happy path: start planning → the studio (map + guide +
 *      draw panel + estimates) → draw a route with the Default pen on
 *      straight lines → the live distance, the crow-flies comparison,
 *      and the vertex list all agree;
 *   3. the pace calculator: enter a time → the pace, speed, and even
 *      splits it implies (the "Planned" badge — never a measured claim);
 *      clear resets it;
 *   4. the section's defining contract: NO export and NO share — no
 *      export card, no share button in the header, no download of any
 *      kind, anywhere;
 *   5. elevation estimation: opt-in, disclosure-gated, summary lands —
 *      and goes honestly stale when the route changes;
 *   6. the header's "Start over" clears back to the tool page.
 *
 * Road routing is stubbed off (straight legs — deterministic geometry);
 * the elevation API is route-mocked with a request log for the
 * privacy assertion.
 */

interface DrawSessionState {
  gapId: string;
  drawMode: boolean;
  vertexCount: number;
  chainCoordinates: [number, number][];
}

interface BridgeState {
  status: string;
  ready: boolean;
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

/** Frame Berlin at a drawing scale (the plan map starts at world view). */
async function frameBerlin(page: Page) {
  await page.evaluate(() => {
    window.__gpxMapController!.fitBounds(
      {
        minLat: 52.51,
        maxLat: 52.535,
        minLon: 13.39,
        maxLon: 13.47,
      },
      { maxZoom: 14, action: "e2e-frame" },
    );
  });
}

/** The drawn L: ~4.50 km inside the framed box. */
const ROUTE_POINTS = [
  { lat: 52.52, lon: 13.405 },
  { lat: 52.53, lon: 13.405 },
  { lat: 52.53, lon: 13.455 },
];

/** Haversine in meters (the spec's own distance arithmetic). */
function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const ROUTE_DISTANCE_M = ROUTE_POINTS.slice(1).reduce(
  (sum, point, index) => sum + haversineM(ROUTE_POINTS[index], point),
  0,
);

async function drawRoute(page: Page, points: { lat: number; lon: number }[]) {
  await frameBerlin(page);
  const box = await canvasBox(page);
  for (const point of points) {
    await clickAt(page, point.lat, point.lon, box);
  }
  await pollBridge(page, (s) => s.drawSession?.vertexCount === points.length);
}

/** Enter the studio from wherever the landing currently is. */
async function enterStudio(page: Page) {
  await page.goto("/");
  const card = page.getByTestId("landing-mode-plan");
  if (await card.isVisible()) {
    await card.click();
    await page.getByTestId("plan-start-card").waitFor({ state: "visible" });
  }
  await page.getByTestId("plan-start-button").click();
  await expect(page.getByTestId("plan-section")).toBeVisible();
  await pollBridge(page, (s) => s.drawSession !== null && s.drawSession.drawMode === true);
}

/** Mock the Open-Meteo Elevation API (batch-stable, the create spec's). */
function mockElevation(page: Page): { requests: string[] } {
  const requests: string[] = [];
  void page.route("**/api.open-meteo.com/**", async (route: Route) => {
    const isFirstRequest = requests.length === 0;
    requests.push(route.request().url());
    const url = new URL(route.request().url());
    const count = (url.searchParams.get("latitude") ?? "").split(",").length;
    const elevation = Array.from({ length: count }, (_, i) =>
      isFirstRequest && i === 0 ? 48 : 52,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ elevation }),
    });
  });
  return { requests };
}

test.beforeEach(async ({ page }) => {
  // Road follow defaults to ON ("car"): draw specs must never depend on a
  // live routing service — straight legs, deterministic geometry.
  await abortRoadRouting(page);
});

test.describe("plan a route", () => {
  test("the plan tool page swaps the intake for the start card", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-plan").click();

    await expect(
      page.getByRole("heading", { name: "Plan a route, read its numbers" }),
    ).toBeVisible();
    await expect(page.getByTestId("plan-start-card")).toBeVisible();
    // No file input, no statistics form — the map is the input.
    await expect(page.getByTestId("upload-zone")).toHaveCount(0);
    await expect(page.getByTestId("activity-stats-form")).toHaveCount(0);
    // The no-export/no-share contract is stated up front.
    await expect(page.getByTestId("plan-start-card")).toContainText(
      /no export and no share/i,
    );
  });

  test("draw a route — live distance, crow-flies, and the vertex list", async ({
    page,
  }) => {
    await enterStudio(page);

    // Straight lines: deterministic geometry with routing aborted.
    await page.getByTestId("road-follow-off").click();

    await drawRoute(page, ROUTE_POINTS);

    // The live distance over the rendered join (~4.50 km).
    await expect(page.getByTestId("draw-distance")).toContainText("4.5");
    await expect(page.getByTestId("vertex-count")).toContainText(
      "3 / 128 points",
    );
    const rows = page.getByTestId("plan-vertex-row");
    await expect(rows).toHaveCount(3);

    // The crow-flies comparison: the straight line is shorter, the path
    // is ~1.3× it.
    const crow = page.getByTestId("plan-crowflies");
    await expect(crow).toContainText("3.5");
    await expect(crow).toContainText(/1\.[23]/);
    await expect(crow).toContainText("4.5");
  });

  test("the pace calculator — enter a time, read the plan", async ({
    page,
  }) => {
    await enterStudio(page);
    await page.getByTestId("road-follow-off").click();
    await drawRoute(page, ROUTE_POINTS);

    // Before a time: the honest hint, no number.
    await expect(page.getByTestId("plan-pace-hint")).toContainText(
      /enter a time above/i,
    );
    await expect(page.getByTestId("plan-pace-result")).toContainText("—");

    // 30:00 over ~4.50 km → ~6:40 /km, ~9.0 km/h, 4 splits + a tail.
    await page.getByTestId("plan-time-hours").fill("0");
    await page.getByTestId("plan-time-minutes").fill("30");
    await page.getByTestId("plan-time-seconds").fill("0");

    const result = page.getByTestId("plan-pace-result");
    await expect(result).toContainText(/6:[34]\d \/km/);
    await expect(result).toContainText(/9\.0 km\/h/);
    await expect(page.getByTestId("plan-pace-planned-badge")).toContainText(
      "Planned",
    );
    const splits = page.getByTestId("plan-split-row");
    await expect(splits).toHaveCount(5); // 4 whole km + the tail
    await expect(splits.first()).toContainText("1 km");

    // Clear resets the plan.
    await page.getByTestId("plan-time-clear").click();
    await expect(page.getByTestId("plan-pace-hint")).toContainText(
      /enter a time above/i,
    );
  });

  test("no export and no share exist anywhere in the section", async ({
    page,
  }) => {
    await enterStudio(page);
    await page.getByTestId("road-follow-off").click();
    await drawRoute(page, ROUTE_POINTS);
    await page.getByTestId("plan-time-minutes").fill("30");

    // No export card, no share view, no download controls in the tools.
    await expect(page.getByTestId("export-card")).toHaveCount(0);
    await expect(page.getByTestId("export-button")).toHaveCount(0);
    await expect(page.getByTestId("finish-route-button")).toHaveCount(0);
    // The header offers no share and no workspace switch — only reset.
    await expect(page.getByTestId("header-create-share")).toHaveCount(0);
    await expect(page.getByTestId("header-merge-share")).toHaveCount(0);
    await expect(page.getByTestId("header-share-link")).toHaveCount(0);
    await expect(page.getByTestId("header-repair-link")).toHaveCount(0);
    await expect(page.getByTestId("section-nav")).toHaveCount(0);

    // No download of any kind was offered: nothing to intercept, and
    // the plan section's own copy says so.
    await expect(page.getByTestId("plan-guide-card")).toContainText(
      /no export, no share/i,
    );
    await expect(page.getByTestId("plan-estimates-card")).toContainText(
      /nothing is exported/i,
    );
  });

  test("elevation is opt-in, disclosure-gated, and honestly stale", async ({
    page,
  }) => {
    const elevation = mockElevation(page);
    await enterStudio(page);
    await page.getByTestId("road-follow-off").click();
    await drawRoute(page, ROUTE_POINTS);

    // Nothing left the browser before the disclosure confirmed.
    await page.getByTestId("elevation-estimate-button").click();
    await expect(page.getByTestId("elevation-disclosure-dialog")).toBeVisible();
    expect(elevation.requests).toHaveLength(0);

    await page.getByTestId("elevation-disclosure-confirm").click();
    await expect(page.getByTestId("elevation-disclosure-dialog")).toBeHidden();
    await expect
      .poll(() => elevation.requests.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(page.getByTestId("elevation-status-badge")).toContainText(
      "Estimated",
      { timeout: 15_000 },
    );
    // The batch-stable terrain: 48 m → 52 m, a +4 m climb (▲ 4 m up).
    await expect(page.getByTestId("elevation-gap-summary")).toContainText(
      "▲ 4 m",
    );

    // A vertex edit stales the record honestly (re-estimate offered).
    await clickAt(page, 52.525, 13.43, await canvasBox(page));
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 4);
    await expect(page.getByTestId("elevation-status-badge")).toContainText(
      "Stale",
    );
  });

  test("Start over clears back to the tool page", async ({ page }) => {
    await enterStudio(page);
    await page.getByTestId("road-follow-off").click();
    await drawRoute(page, ROUTE_POINTS);

    await page.getByTestId("header-reset-button").click();
    // The remembered tool page is showing again — a fresh start is one
    // click away, and the studio is gone.
    await expect(page.getByTestId("plan-start-card")).toBeVisible();
    await expect(page.getByTestId("plan-section")).toHaveCount(0);
  });
});
