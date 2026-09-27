import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * E2E — the "Create from activity stats" workflow (the fourth tab):
 *
 *   1. the landing's create tab replaces the upload zone with the
 *      statistics form;
 *   2. validation blocks an empty submit on the landing;
 *   3. an inconsistent triple (time ≁ distance × pace) shows the honest
 *      notice but still continues;
 *   4. the full happy path: stats → draw the whole route on the map →
 *      finish → reconcile → export → the DOWNLOADED FILE is the contract:
 *      GPX 1.1, one track, densified points, sequential timestamps
 *      spanning exactly the recorded duration, the distance scaled to the
 *      recorded value, gpxr markers on every point, no elevation;
 *   5. "Edit route" returns to the drawing phase; "Back to statistics"
 *      prefills the form.
 *
 * Road routing is stubbed off (straight legs — deterministic geometry).
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
  reconstructionLineCount: number;
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

/** Frame Berlin at a drawing scale (the create map starts at world view). */
async function frameBerlin(page: Page) {
  await page.evaluate(() => {
    window.__gpxMapController!.fitBounds(
      {
        minLat: 52.51,
        maxLat: 52.535,
        minLon: 13.39,
        maxLon: 13.465,
      },
      { maxZoom: 14, action: "e2e-frame" },
    );
  });
}

/** The drawn L: ~4.5 km inside the framed box. */
const ROUTE_POINTS = [
  { lat: 52.52, lon: 13.405 },
  { lat: 52.53, lon: 13.405 },
  { lat: 52.53, lon: 13.455 },
];

async function fillStats(page: Page, overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    "Distance recorded by your watch": "5.23",
    "Pace minutes per unit": "6",
    "Pace seconds per unit": "14",
    "Total time hours": "0",
    "Total time minutes": "32",
    "Total time seconds": "35",
    ...overrides,
  };
  for (const [label, value] of Object.entries(fields)) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByLabel(/Start/).fill("2026-09-20T05:30");
}

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

test.beforeEach(async ({ page }) => {
  // Road follow defaults to ON ("car"): draw specs must never depend on a
  // live routing service — straight legs, deterministic geometry.
  await abortRoadRouting(page);
});

test.describe("create from activity stats", () => {
  test("the create tab swaps the upload zone for the statistics form", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-create").click();

    await expect(
      page.getByRole("heading", { name: "Create an activity from its stats" }),
    ).toBeVisible();
    await expect(page.getByTestId("activity-stats-form")).toBeVisible();
    await expect(page.getByTestId("upload-zone")).toHaveCount(0);
    // The workflow trio teaches this tab's three steps.
    await expect(page.getByTestId("workflow-steps")).toContainText(
      "Enter your statistics",
    );
  });

  test("validation blocks an empty submit on the landing", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-create").click();
    await page.getByTestId("begin-drawing-button").click();

    await expect(
      page.getByText("Enter the distance your watch recorded."),
    ).toBeVisible();
    await expect(page.getByTestId("activity-stats-form")).toBeVisible();
    // Still on the landing — no section mounted.
    await expect(page.getByTestId("create-section")).toHaveCount(0);
  });

  test("an inconsistent triple shows the honest notice in the studio and still continues", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-create").click();
    await fillStats(page, { "Total time minutes": "52" });
    await page.getByTestId("begin-drawing-button").click();

    // 5.23 km × 6:14/km ≈ 32:33, entered 52:35 — flagged in the studio
    // (the form unmounts on submit, so the note lives where the user
    // works), never blocking: the studio mounted with the user's values.
    await expect(page.getByTestId("create-section")).toBeVisible();
    await expect(page.getByTestId("stats-consistency-notice")).toContainText(
      "don't quite agree",
    );
    // The user's entered values stand, verbatim, in the recap.
    await expect(page.getByTestId("create-stats-recap")).toContainText(
      "52:35",
    );
  });

  test("full path: stats → draw → finish → reconcile → export a valid GPX", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-create").click();
    await fillStats(page);
    await page.getByTestId("begin-drawing-button").click();

    // -- The drawing phase ------------------------------------------------
    await expect(page.getByTestId("create-section")).toBeVisible();
    await expect(page.getByTestId("create-guide-card")).toBeVisible();
    await expect(page.getByTestId("route-draw-panel")).toBeVisible();
    await expect(page.getByTestId("create-stats-recap")).toContainText(
      "5.23 km",
    );

    // The anchor-less draw session is live in draw mode from the start.
    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.drawMode === true,
    );

    await frameBerlin(page);
    const box = await canvasBox(page);
    for (const point of ROUTE_POINTS) {
      await clickAt(page, point.lat, point.lon, box);
    }
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);

    // The live distance compares against the recorded target.
    await expect(page.getByTestId("draw-distance")).toContainText("km");
    await expect(page.getByTestId("drawn-vs-recorded")).toContainText(
      /recorded 5\.23 km/,
    );

    // -- Finish → the review phase ----------------------------------------
    await page.getByTestId("finish-route-button").click();
    await expect(page.getByTestId("route-review-card")).toBeVisible();
    await expect(page.getByTestId("route-draw-panel")).toHaveCount(0);

    // The final track renders as the committed-reconstruction line and
    // the draw session ended (read-only review).
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount > 0,
    );

    const reconciliation = page.getByTestId("distance-reconciliation");
    await expect(reconciliation).toContainText("5.23 km"); // recorded
    await expect(reconciliation).toContainText("4.5"); // drawn ≈ 4.51 km
    await expect(page.getByTestId("match-distance-toggle")).toBeChecked();
    await expect(page.getByTestId("activity-summary")).toContainText(
      "32:35",
    );

    // -- Export: the downloaded file is the contract ------------------------
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-gpx-button").click(),
    ]);
    expect(download.suggestedFilename()).toBe("activity-2026-09-20.gpx");

    const xml = readFileSync(await download.path(), "utf8");

    // Structure: standalone GPX 1.1, one track, one segment.
    expect(xml).toContain('version="1.1"');
    expect(xml).toContain('creator="GPX Repair Studio"');
    expect(xml.match(/<trk>/g)).toHaveLength(1);
    expect(xml.match(/<trkseg>/g)).toHaveLength(1);

    // Points: densified (25 m spacing over ~4.5 km), every one marked.
    const trkpts = [...xml.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)">/g)];
    expect(trkpts.length).toBeGreaterThan(100);
    expect(xml.match(/gpxr:reconstructed/g)?.length).toBe(trkpts.length);
    // No elevation was recorded — none is invented.
    expect(xml).not.toContain("<ele>");

    // Timestamps: sequential, spanning exactly the recorded duration
    // (scoped to the track points — the metadata carries the start too).
    const times = [
      ...xml.matchAll(/<trkpt[^>]*>[\s\S]*?<time>([^<]+)<\/time>/g),
    ].map((m) => Date.parse(m[1]));
    expect(times.length).toBe(trkpts.length);
    const start = Date.parse("2026-09-20T05:30:00Z");
    expect(times[0]).toBe(start);
    expect(times[times.length - 1]).toBe(start + (32 * 60 + 35) * 1000);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }

    // Distance: the track was scaled to the recorded 5.23 km (±1%).
    let distance = 0;
    for (let i = 1; i < trkpts.length; i += 1) {
      distance += haversineM(
        { lat: Number(trkpts[i - 1][1]), lon: Number(trkpts[i - 1][2]) },
        { lat: Number(trkpts[i][1]), lon: Number(trkpts[i][2]) },
      );
    }
    expect(distance).toBeGreaterThan(5230 * 0.99);
    expect(distance).toBeLessThan(5230 * 1.01);

    await expect(page.getByTestId("export-success")).toContainText(
      "activity-2026-09-20.gpx",
    );
  });

  test("edit route returns to the drawing phase; back to statistics prefills", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-create").click();
    await fillStats(page);
    await page.getByTestId("begin-drawing-button").click();
    await expect(page.getByTestId("create-section")).toBeVisible();

    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.drawMode === true,
    );
    await frameBerlin(page);
    const box = await canvasBox(page);
    for (const point of ROUTE_POINTS) {
      await clickAt(page, point.lat, point.lon, box);
    }
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);
    await page.getByTestId("finish-route-button").click();
    await expect(page.getByTestId("route-review-card")).toBeVisible();

    // Edit route → back to the draw phase with the chain intact.
    await page.getByTestId("edit-route-button").click();
    await expect(page.getByTestId("route-draw-panel")).toBeVisible();
    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.vertexCount === 3,
    );

    // Back to statistics → the landing form, prefilled with the values.
    await page.getByTestId("back-to-stats-button").click();
    await expect(page.getByTestId("activity-stats-form")).toBeVisible();
    await expect(
      page.getByLabel("Distance recorded by your watch"),
    ).toHaveValue("5.23");
    await expect(page.getByLabel("Total time minutes")).toHaveValue("32");
  });
});
