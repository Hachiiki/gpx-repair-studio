import { expect, test, type Page, type Route } from "@playwright/test";
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
 *   4. the full happy path (drawn-distance basis): stats → draw →
 *      finish → the reconciliation WARNING fires (drawn ≠ recorded) →
 *      "Use drawn distance" → export → the DOWNLOADED FILE is the
 *      contract: GPX 1.1, one track, densified points, sequential
 *      timestamps spanning exactly the recorded duration, the DRAWN
 *      route's distance (not rescaled), gpxr markers, no elevation;
 *   5. the escape hatch: "Use my watch's distance" scales the file
 *      back to the recorded value (the same contract, rescaled);
 *   6. no warning at all when the drawn route matches the recording
 *      (inside the 2% notice ratio);
 *   7. "Edit route" returns to the drawing phase; "Back to statistics"
 *      prefills the form;
 *   8. the header's Share flow: the warning dialog gates "export the
 *      GPX + open the share card" — confirm downloads the file and
 *      opens the card view (trio = the review's numbers, PNG download,
 *      back to the review);
 *   9. elevation estimation: opt-in, disclosure-gated, `<ele>` + method
 *      markers + attribution in the exported file — and honestly
 *      EXCLUDED again after a distance-basis change stales it.
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
        maxLon: 13.47,
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

/** An L measuring ~5.25 km — inside the 2% notice ratio of 5.23 km. */
const MATCHING_ROUTE_POINTS = [
  { lat: 52.52, lon: 13.405 },
  { lat: 52.53, lon: 13.405 },
  { lat: 52.53, lon: 13.466 },
];

async function drawRoute(page: Page, points: { lat: number; lon: number }[]) {
  await frameBerlin(page);
  const box = await canvasBox(page);
  for (const point of points) {
    await clickAt(page, point.lat, point.lon, box);
  }
  await pollBridge(page, (s) => s.drawSession?.vertexCount === points.length);
}

/** Parse the downloaded GPX into its contract pieces. */
function parseDownload(xml: string) {
  const trkpts = [...xml.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)">/g)];
  const times = [
    ...xml.matchAll(/<trkpt[^>]*>[\s\S]*?<time>([^<]+)<\/time>/g),
  ].map((m) => Date.parse(m[1]));
  let distance = 0;
  for (let i = 1; i < trkpts.length; i += 1) {
    distance += haversineM(
      { lat: Number(trkpts[i - 1][1]), lon: Number(trkpts[i - 1][2]) },
      { lat: Number(trkpts[i][1]), lon: Number(trkpts[i][2]) },
    );
  }
  return { trkpts, times, distance };
}

/** The shared structure assertions of every exported file. */
function expectValidGpx(
  xml: string,
  trkpts: RegExpMatchArray[],
  times: number[],
) {
  expect(xml).toContain('version="1.1"');
  expect(xml).toContain('creator="GPX Repair Studio"');
  expect(xml.match(/<trk>/g)).toHaveLength(1);
  expect(xml.match(/<trkseg>/g)).toHaveLength(1);
  expect(trkpts.length).toBeGreaterThan(100);
  expect(xml.match(/gpxr:reconstructed/g)?.length).toBe(trkpts.length);
  expect(xml).not.toContain("<ele>");
  expect(times.length).toBe(trkpts.length);
  const start = Date.parse("2026-09-20T05:30:00Z");
  expect(times[0]).toBe(start);
  expect(times[times.length - 1]).toBe(start + (32 * 60 + 35) * 1000);
  for (let i = 1; i < times.length; i += 1) {
    expect(times[i]).toBeGreaterThan(times[i - 1]);
  }
}

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

/**
 * Mock the Open-Meteo Elevation API (the elevation spec's helper, made
 * batch-stable): the route's FIRST point resolves 48 m and every later
 * point 52 m — a single visible +4 m climb, however the client batches
 * the requests (a per-request "first" would dip mid-route).
 */
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

/** Drive the workflow to the review card on the drawn-distance basis. */
async function reachReview(page: Page) {
  await page.goto("/");
  await page.getByTestId("landing-mode-create").click();
  await fillStats(page);
  await page.getByTestId("begin-drawing-button").click();

  await expect(page.getByTestId("create-section")).toBeVisible();
  await pollBridge(
    page,
    (s) => s.drawSession !== null && s.drawSession.drawMode === true,
  );
  await drawRoute(page, ROUTE_POINTS);

  await page.getByTestId("finish-route-button").click();
  const dialog = page.getByTestId("reconcile-distance-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("use-drawn-distance-button").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("route-review-card")).toBeVisible();
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
    await expect(page.getByTestId("create-stats-recap")).toContainText("52:35");
  });

  test("full path (drawn distance): stats → draw → finish → warning → export a valid GPX", async ({
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

    await drawRoute(page, ROUTE_POINTS);

    // The live distance compares against the recorded target.
    await expect(page.getByTestId("draw-distance")).toContainText("km");
    await expect(page.getByTestId("drawn-vs-recorded")).toContainText(
      /recorded 5\.23 km/,
    );

    // -- Finish → the reconciliation warning, then the review -------------
    await page.getByTestId("finish-route-button").click();

    // The drawn ~4.51 km vs the recorded 5.23 km (14% apart, past the 2%
    // ratio) earns the finish-time warning: it says the FILE will carry
    // the drawn distance, the recorded time stays, and the pace is
    // recomputed from the whole route.
    const dialog = page.getByTestId("reconcile-distance-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("5.23 km");
    await expect(dialog).toContainText("4.51 km");
    await expect(dialog).toContainText("14% shorter");
    await expect(dialog).toContainText("32:35");
    await expect(dialog).toContainText(/7:1\d \/km/);
    await page.getByTestId("use-drawn-distance-button").click();
    await expect(dialog).toBeHidden();

    await expect(page.getByTestId("route-review-card")).toBeVisible();
    await expect(page.getByTestId("route-draw-panel")).toHaveCount(0);

    // The final track renders as the committed-reconstruction line and
    // the draw session ended (read-only review). The "all coordinates
    // damaged" note stays away — this route is drawn, not damaged.
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount > 0,
    );
    await expect(page.getByTestId("map-empty-route")).toHaveCount(0);

    const reconciliation = page.getByTestId("distance-reconciliation");
    await expect(reconciliation).toContainText("5.23 km"); // recorded
    await expect(reconciliation).toContainText("4.5"); // drawn ≈ 4.51 km
    // The drawn distance is the basis — the watch's is the UNchecked
    // choice, and the summary carries the drawn number + its pace.
    await expect(page.getByTestId("match-distance-toggle")).not.toBeChecked();
    const summary = page.getByTestId("activity-summary");
    await expect(summary).toContainText("4.51 km");
    await expect(summary).toContainText("32:35");
    await expect(summary).toContainText(/7:1\d \/km/);

    // -- Export: the downloaded file is the contract ------------------------
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-gpx-button").click(),
    ]);
    expect(download.suggestedFilename()).toBe("activity-2026-09-20.gpx");

    const xml = readFileSync(await download.path(), "utf8");
    const { trkpts, times, distance } = parseDownload(xml);
    expectValidGpx(xml, trkpts, times);

    // Distance: the file carries the DRAWN route's distance (~4.51 km) —
    // NOT rescaled to the recorded 5.23 km.
    expect(distance).toBeGreaterThan(4500 * 0.97);
    expect(distance).toBeLessThan(4500 * 1.03);
    expect(distance).toBeLessThan(5000);

    await expect(page.getByTestId("export-success")).toContainText(
      "activity-2026-09-20.gpx",
    );
  });

  test("the escape hatch: the watch's distance scales the file back to it", async ({
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
    await drawRoute(page, ROUTE_POINTS);

    // The warning's escape hatch: the watch's distance wins instead.
    await page.getByTestId("finish-route-button").click();
    const dialog = page.getByTestId("reconcile-distance-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("use-recorded-distance-button").click();
    await expect(dialog).toBeHidden();

    await expect(page.getByTestId("match-distance-toggle")).toBeChecked();
    const summary = page.getByTestId("activity-summary");
    await expect(summary).toContainText("5.23 km");
    await expect(summary).toContainText("32:35");
    await expect(summary).toContainText("6:13 /km");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-gpx-button").click(),
    ]);
    const xml = readFileSync(await download.path(), "utf8");
    const { trkpts, times, distance } = parseDownload(xml);
    expectValidGpx(xml, trkpts, times);

    // Distance: scaled to the recorded 5.23 km (±1%).
    expect(distance).toBeGreaterThan(5230 * 0.99);
    expect(distance).toBeLessThan(5230 * 1.01);
  });

  test("no warning when the drawn route matches the recorded distance", async ({
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
    await drawRoute(page, MATCHING_ROUTE_POINTS);

    // The live comparison already says it matches (the same 2% ratio).
    await expect(page.getByTestId("drawn-vs-recorded")).toContainText(
      /Matches your recorded distance/,
    );

    // Finish goes straight into the review — no dialog, no choice, the
    // quiet "matches" line instead.
    await page.getByTestId("finish-route-button").click();
    await expect(page.getByTestId("route-review-card")).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByTestId("reconcile-distance-dialog")).toHaveCount(0);
    await expect(
      page.getByText(/matches your recorded distance/),
    ).toBeVisible();
    await expect(page.getByTestId("match-distance-toggle")).toHaveCount(0);
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
    await drawRoute(page, ROUTE_POINTS);
    await page.getByTestId("finish-route-button").click();

    // The warning fires (drawn ≠ recorded) — take the drawn basis so the
    // modal is out of the way of the interactions below.
    const dialog = page.getByTestId("reconcile-distance-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("use-drawn-distance-button").click();
    await expect(dialog).toBeHidden();
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

  test("the header's Share: warning first, then the GPX download + the share card", async ({
    page,
  }) => {
    await reachReview(page);

    // The Share button lives in the header exactly when the review does.
    const shareButton = page.getByTestId("header-create-share");
    await expect(shareButton).toBeVisible();
    await expect(shareButton).toContainText("Share card");

    // Click → the warning dialog says exactly what will happen (the file
    // name, the trio the card will show) — and nothing has downloaded.
    await shareButton.click();
    const dialog = page.getByTestId("create-share-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("activity-2026-09-20.gpx");
    await expect(dialog).toContainText("4.51 km");
    await expect(dialog).toContainText("32:35");
    await expect(dialog).toContainText(/7:1\d \/km/);
    await expect(dialog).toContainText("marked as reconstructed");

    // Cancel is a full no-op: still in the review, nothing downloaded.
    await page.getByTestId("create-share-cancel").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("route-review-card")).toBeVisible();

    // Confirm → the GPX downloads (the same contract as the Export
    // button) and the share card view opens with the review's numbers.
    await shareButton.click();
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("create-share-confirm").click(),
    ]);
    expect(download.suggestedFilename()).toBe("activity-2026-09-20.gpx");
    const xml = readFileSync(await download.path(), "utf8");
    const { trkpts, times } = parseDownload(xml);
    expectValidGpx(xml, trkpts, times);

    await expect(page.getByTestId("create-share-section")).toBeVisible();
    await expect(page.getByTestId("route-review-card")).toHaveCount(0);
    // The header now offers the way back.
    await expect(page.getByTestId("header-create-back")).toBeVisible();
    await expect(page.getByTestId("header-create-share")).toHaveCount(0);

    // The trio is the review's own arithmetic (drawn basis).
    await expect(
      page.getByTestId("create-share-summary-distance"),
    ).toContainText("4.51 km");
    await expect(page.getByTestId("create-share-summary-time")).toContainText(
      "32:35",
    );
    await expect(page.getByTestId("create-share-summary-pace")).toContainText(
      /7:1\d \/km/,
    );
    // The card itself is on the stage, and the notes are honest.
    await expect(page.getByTestId("share-card-canvas")).toBeVisible();
    await expect(page.getByTestId("create-share-tools")).toContainText(
      /reconstructed by hand/,
    );

    // The PNG downloads from the share view.
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("create-share-download").click(),
    ]);
    expect(png.suggestedFilename()).toBe(
      "activity-2026-09-20.share-card.png",
    );

    // Back to review — same track, no re-draw, the map returns.
    await page.getByTestId("create-share-back").click();
    await expect(page.getByTestId("route-review-card")).toBeVisible();
    await expect(page.getByTestId("create-share-section")).toHaveCount(0);
    await expect(page.getByTestId("header-create-share")).toBeVisible();
  });

  test("elevation estimation: opt-in, disclosure-gated, exported and labeled", async ({
    page,
  }) => {
    const { requests } = mockElevation(page);
    await reachReview(page);

    // The elevation section is present with the opt-in button — and
    // NOTHING has been sent (the disclosure gates every request).
    await expect(page.getByTestId("elevation-controls")).toBeVisible();
    await expect(page.getByTestId("elevation-estimate-button")).toBeVisible();
    expect(requests).toHaveLength(0);

    // The disclosure states what leaves (the track's points, Open-Meteo).
    await page.getByTestId("elevation-estimate-button").click();
    const disclosure = page.getByTestId("elevation-disclosure-dialog");
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toContainText(/coordinates/);
    await expect(disclosure).toContainText("Open-Meteo");
    expect(requests).toHaveLength(0);

    // Confirm → the requests fire against the FINAL track's points.
    await page.getByTestId("elevation-disclosure-confirm").click();
    await expect
      .poll(() => requests.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    expect(requests[0]).toContain("api.open-meteo.com/v1/elevation?latitude=");

    // The summary lands: +4 m up (48 → 52), the estimated label, and the
    // "file will carry" row states the elevation contract.
    await expect(page.getByTestId("elevation-status-badge")).toContainText(
      "Estimated",
      { timeout: 10_000 },
    );
    const summary = page.getByTestId("elevation-gap-summary");
    await expect(summary).toContainText("▲ 4 m");
    await expect(summary).toContainText("48 m – 52 m");
    await expect(page.getByTestId("summary-elevation-row")).toContainText(
      "▲ 4 m",
    );

    // Export → the file carries <ele> on every point, an estimation
    // method marker per point, and the attribution note. (Every point is
    // an exact sample hit under the 400-point cap, so the methods read
    // "elevation-api"; the interpolated label is covered by unit tests.)
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-gpx-button").click(),
    ]);
    const xml = readFileSync(await download.path(), "utf8");
    const eleCount = (xml.match(/<ele>/g) ?? []).length;
    const trkptCount = (xml.match(/<trkpt /g) ?? []).length;
    const methodCount = (xml.match(/eleMethod="/g) ?? []).length;
    expect(trkptCount).toBeGreaterThan(100);
    expect(eleCount).toBe(trkptCount);
    expect(methodCount).toBe(trkptCount);
    expect(xml).toContain("<ele>48</ele>");
    expect(xml).toContain("<ele>52</ele>");
    expect(xml.match(/eleMethod="elevation-api"/g)?.length ?? 0).toBeGreaterThan(0);
    expect(xml).toContain("estimated from Open-Meteo");
  });

  test("a distance-basis change stales the estimate — the export excludes it", async ({
    page,
  }) => {
    const { requests } = mockElevation(page);
    await reachReview(page);

    // Estimate on the drawn basis (as above, compressed).
    await page.getByTestId("elevation-estimate-button").click();
    await expect(page.getByTestId("elevation-disclosure-dialog")).toBeVisible();
    await page.getByTestId("elevation-disclosure-confirm").click();
    await expect(page.getByTestId("elevation-status-badge")).toContainText(
      "Estimated",
      { timeout: 10_000 },
    );
    expect(requests.length).toBeGreaterThanOrEqual(1);

    // Switch to the watch's distance — the shape scales, the estimate no
    // longer describes the file's geometry: STALE, excluded, re-offered.
    await page.getByTestId("match-distance-toggle").check();
    await expect(page.getByTestId("elevation-status-badge")).toContainText(
      "Stale",
    );
    const staleNote = page.getByTestId("elevation-stale-note");
    await expect(staleNote).toContainText(/route changed since the estimate/);
    await expect(page.getByTestId("summary-elevation-row")).toHaveCount(0);

    // The export is honest: no <ele> at all until a re-estimate.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-gpx-button").click(),
    ]);
    const xml = readFileSync(await download.path(), "utf8");
    expect(xml).not.toContain("<ele>");
    expect(xml).toContain("No elevation is included");
  });
});
