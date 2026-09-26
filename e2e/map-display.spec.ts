import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSyntheticGpx } from "../src/features/gpx/fixtures/generators";

/**
 * Phase 3 E2E — the map display acceptance criteria:
 *
 *   1. route visible with distinct gap styling and markers (asserted via
 *      controller state — no pixel diffs), attribution visible;
 *   2. selecting a gap (list → map) focuses the map on the gap;
 *   3. clicking a gap span on the map selects it in the gap list (sync);
 *   4. mobile viewport renders a usable map panel;
 *   5. blocked basemap requests degrade gracefully (offline notice, route
 *      still drawn over the local fallback, app functional);
 *   6. the basemap provider switches without losing overlays;
 *   7. pan/zoom stay responsive on a 50k-point fixture.
 *
 * Assertions read the controller's test bridge
 * (`window.__gpxMapController`, attached outside production builds) —
 * the master plan's "controller state, no pixel diff" approach. They are
 * deliberately tile-independent: GeoJSON overlays render regardless of
 * whether the remote basemap is reachable.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const GENERATED_DIR = join("e2e", "fixtures");
const LARGE_FILE = join(GENERATED_DIR, "synthetic-50k.generated.gpx");

test.beforeAll(() => {
  mkdirSync(GENERATED_DIR, { recursive: true });
  // Deterministic (fixed seed): 50k points, one 5-minute gap after 25k.
  writeFileSync(
    LARGE_FILE,
    generateSyntheticGpx({
      pointCount: 50_000,
      seed: 7,
      withTime: true,
      withEle: true,
      timeGapAfter: 25_000,
      timeGapSeconds: 300,
    }),
  );
});

/** Upload a file through the zone's file picker. */
async function upload(page: Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

interface BridgeState {
  status: "initializing" | "ready" | "unsupported";
  ready: boolean;
  offline: boolean;
  provider: string;
  layerIds: string[];
  routeFeatureCount: number;
  gapSpanCount: number;
  boundaryMarkerCount: number;
  selectedGapId: string | null;
  zoom: number;
  center: { lat: number; lon: number } | null;
  lastCameraAction: string | null;
  spanScreenPositions: { gapId: string; x: number; y: number }[];
  moving: boolean;
}

async function bridge(page: Page): Promise<BridgeState | null> {
  try {
    return await page.evaluate(() =>
      window.__gpxMapController
        ? (window.__gpxMapController.getTestState() as never)
        : null,
    );
  } catch {
    // The bridge can transiently reject while the page remounts the map
    // (controller recreation); treat as "not ready yet".
    return null;
  }
}

/** Poll the bridge until `predicate` holds (default 15 s budget). */
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

const ROUTE_RENDERED = (s: BridgeState) =>
  s.ready && s.routeFeatureCount > 0;

/** Route rendered *and* the camera has settled (no fit animation). */
const CAMERA_SETTLED = (s: BridgeState) =>
  s.ready && s.routeFeatureCount > 0 && !s.moving;

test.describe("map display", () => {
  test("renders route, gap span, and boundary markers with attribution", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));

    const state = await pollBridge(
      page,
      (s) =>
        s.ready &&
        s.routeFeatureCount > 0 &&
        s.gapSpanCount === 1 &&
        s.boundaryMarkerCount === 2,
    );

    // All overlay layers exist on the (style-loaded) map.
    for (const layerId of [
      "gpxr-route",
      "gpxr-gap-span",
      "gpxr-gap-boundary-before",
      "gpxr-gap-boundary-after",
    ]) {
      expect(state.layerIds).toContain(layerId);
    }

    // The recorded line splits around the gap: 2 pieces for 8 points.
    expect(state.routeFeatureCount).toBe(2);

    // Attribution is visible (MapLibre control).
    await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();

    // Legend and toolbar are rendered.
    await expect(page.getByTestId("map-legend")).toBeVisible();
    await expect(page.getByTestId("map-toolbar")).toBeVisible();
  });

  test("selecting a gap in the list highlights and focuses the map", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, CAMERA_SETTLED);

    await page.getByTestId("gap-row").click();

    const state = await pollBridge(
      page,
      (s) =>
        s.selectedGapId !== null &&
        s.lastCameraAction?.startsWith("fit-gap:") === true,
    );
    expect(state.selectedGapId).toContain("gap/");

    // The selected-gap chip is visible and the row reports selection.
    await expect(page.getByTestId("gap-highlight-overlay")).toBeVisible();
    await expect(page.getByTestId("gap-row")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Deselect via the chip.
    await page.getByRole("button", { name: "Clear gap selection" }).click();
    await pollBridge(page, (s) => s.selectedGapId === null);
    await expect(page.getByTestId("gap-highlight-overlay")).toBeHidden();
  });

  test("clicking a gap span on the map selects it in the gap list", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));

    // Wait for the fit-activity animation to settle before reading the
    // projected span position (otherwise the click lands on stale pixels).
    const state = await pollBridge(
      page,
      (s) => s.ready && s.spanScreenPositions.length > 0 && !s.moving,
    );

    const box = await page.locator(".maplibregl-canvas").boundingBox();
    expect(box).not.toBeNull();
    const { x, y } = state.spanScreenPositions[0];
    await page.mouse.click(box!.x + x, box!.y + y);

    await pollBridge(page, (s) => s.selectedGapId !== null);
    await expect(page.getByTestId("gap-row")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("gap-highlight-overlay")).toBeVisible();
  });

  test("renders a usable map panel at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));

    await pollBridge(page, ROUTE_RENDERED);

    const box = await page.getByTestId("map-canvas").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(300);
    expect(box!.width).toBeLessThanOrEqual(375);

    // The gap list remains reachable below the map (single column).
    await expect(page.getByTestId("gap-list")).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
  });

  test("degrades gracefully when basemap requests are blocked", async ({
    page,
  }) => {
    await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));

    // Offline notice appears…
    await expect(page.getByTestId("map-offline-notice")).toBeVisible();

    // …and the route + gap overlays still render (local blank fallback).
    const state = await pollBridge(
      page,
      (s) => s.ready && s.routeFeatureCount > 0 && s.offline,
    );
    expect(state.gapSpanCount).toBe(1);
    expect(state.boundaryMarkerCount).toBe(2);
    expect(state.lastCameraAction).toBe("fit-activity");

    // The app stays fully functional: gaps listed, selection works.
    await expect(page.getByTestId("gap-row")).toHaveCount(1);
    await page.getByTestId("gap-row").click();
    await pollBridge(page, (s) => s.selectedGapId !== null);
    await expect(page.getByTestId("gap-highlight-overlay")).toBeVisible();
  });

  test("switching the basemap provider keeps all overlays", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, ROUTE_RENDERED);

    // Switch to the OSM raster fallback (usage-policy note visible).
    await page.getByRole("button", { name: "Basemap provider" }).click();
    await expect(page.getByTestId("map-provider-menu")).toBeVisible();
    await expect(page.getByTestId("map-provider-menu")).toContainText(
      "strict usage policies",
    );
    await page
      .getByTestId("map-provider-menu")
      .getByRole("button", { name: "OSM Standard (raster)" })
      .click();

    const switched = await pollBridge(
      page,
      (s) => s.provider === "osm-raster" && s.routeFeatureCount > 0,
    );
    expect(switched.gapSpanCount).toBe(1);
    expect(switched.boundaryMarkerCount).toBe(2);

    // …and back to OpenFreeMap.
    await page.getByRole("button", { name: "Basemap provider" }).click();
    await page
      .getByTestId("map-provider-menu")
      .getByRole("button", { name: "OpenFreeMap (Positron)" })
      .click();
    await pollBridge(
      page,
      (s) => s.provider === "openfreemap" && s.routeFeatureCount > 0,
    );
  });

  test("pan and zoom stay responsive on a 50k-point fixture", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, LARGE_FILE);

    // Route renders for the large file (loose budget).
    const initial = await pollBridge(
      page,
      CAMERA_SETTLED,
      30_000,
    );
    expect(initial.routeFeatureCount).toBe(2); // split at the 5-min gap
    expect(initial.gapSpanCount).toBe(1);

    // Programmatic zoom completes (responsiveness probe).
    await page.evaluate(() => window.__gpxMapController?.zoomIn());
    const zoomed = await pollBridge(
      page,
      (s) => s.zoom > initial.zoom,
      10_000,
    );
    expect(zoomed.lastCameraAction).toBe("zoom-in");

    // A real drag-pan moves the camera and records user interaction.
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 40, { steps: 8 });
    await page.mouse.up();

    const panned = await pollBridge(
      page,
      (s) =>
        s.lastCameraAction === "user" &&
        s.center !== null &&
        initial.center !== null &&
        (Math.abs(s.center.lat - initial.center.lat) > 1e-7 ||
          Math.abs(s.center.lon - initial.center.lon) > 1e-7),
      10_000,
    );
    expect(panned.lastCameraAction).toBe("user");
  });
});
