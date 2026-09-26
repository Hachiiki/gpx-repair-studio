import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * Phase 6 E2E — elevation estimation acceptance:
 *
 *   1. the opt-in contract (FR-6.5): NO request leaves the browser
 *      until the disclosure is confirmed; the disclosure states the
 *      exact point count and destination;
 *   2. the happy path: confirm → OpenTopoData (mocked) → per-gap
 *      summary in the editor, provenance-split gain/loss rows + the
 *      profile chart in statistics, and `<ele>` + `eleMethod` markers
 *      + the attribution note in the exported file;
 *   3. the failure path: a dead service degrades honestly — a clear
 *      error, a retry, and the export still works WITHOUT elevation
 *      (never fabricated).
 *
 * Road routing is stubbed off (straight legs); the elevation API is
 * route-mocked with a request log for the privacy assertion.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const DRAW_POINTS = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
];

interface DrawSessionState {
  gapId: string;
  drawMode: boolean;
  vertexCount: number;
}
interface BridgeState {
  status: string;
  ready: boolean;
  routeFeatureCount: number;
  reconstructionLineCount: number;
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

async function clickAt(
  page: Page,
  lat: number,
  lon: number,
  box: { x: number; y: number },
) {
  const { x, y } = await project(page, lat, lon);
  await page.mouse.click(box.x + x, box.y + y);
}

async function canvasBox(page: Page) {
  await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/** Draw the two-vertex repair and commit it (editor stays open). */
async function drawRepair(page: Page) {
  await page.getByTestId("open-editor-button").first().click();
  await pollBridge(page, (s) => s.drawSession !== null && s.drawSession.drawMode);
  await page.getByTestId("snap-toggle").click();
  const box = await canvasBox(page);
  await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
  await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
  await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
}

/**
 * Mock the OpenTopoData API. Every request's locations are echoed back
 * as deterministic elevations (48 then 52 m — a visible +4 m climb),
 * and the request log enables the privacy assertion.
 */
function mockElevation(page: Page): { requests: string[] } {
  const requests: string[] = [];
  void page.route("**/api.opentopodata.org/**", async (route: Route) => {
    requests.push(route.request().url());
    const url = new URL(route.request().url());
    const count = (url.searchParams.get("locations") ?? "").split("|").length;
    const results = Array.from({ length: count }, (_, i) => ({
      elevation: i === 0 ? 48 : 52,
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "OK", results }),
    });
  });
  return { requests };
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("elevation estimation", () => {
  test("opt-in disclosure gates the request; happy path reaches the export", async ({
    page,
  }) => {
    const { requests } = mockElevation(page);
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await drawRepair(page);

    // The elevation section is present with the opt-in button — and
    // NOTHING has been sent (the disclosure gates every request).
    const controls = page.getByTestId("elevation-controls");
    await expect(controls).toBeVisible();
    await expect(page.getByTestId("elevation-estimate-button")).toBeVisible();
    expect(requests).toHaveLength(0);

    // The disclosure states exactly what leaves the browser (2 drawn
    // points, 1 request, OpenTopoData).
    await page.getByTestId("elevation-estimate-button").click();
    const dialog = page.getByTestId("elevation-disclosure-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("2 coordinates");
    await expect(dialog).toContainText("1 request");
    await expect(dialog).toContainText("OpenTopoData");
    expect(requests).toHaveLength(0); // still nothing before Confirm

    // Confirm → exactly one request with both reconstructed points.
    await page.getByTestId("elevation-disclosure-confirm").click();
    await expect
      .poll(() => requests.length, { timeout: 10_000 })
      .toBe(1);
    expect(requests[0]).toContain("api.opentopodata.org/v1/srtm30m?locations=");

    // The per-gap summary lands: +4 m up (48 → 52), estimated badge.
    await expect(page.getByTestId("elevation-status-badge")).toContainText(
      "Estimated",
      { timeout: 10_000 },
    );
    const summary = page.getByTestId("elevation-gap-summary");
    await expect(summary).toContainText("▲ 4 m");
    await expect(summary).toContainText("48 m – 52 m");

    // Commit the repair → the statistics table splits gain/loss by
    // provenance and the profile chart paints both lines.
    await page.getByTestId("done-editing-button").click();
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );

    const stats = await page.getByTestId("stats-panel").innerText();
    expect(stats).toContain("Elevation gain (repairs)");
    expect(stats).toContain("4 m");
    expect(stats).toContain("Elevation gain (total)");
    expect(stats).toContain("estimated from OpenTopoData terrain");

    const chart = page.getByTestId("elevation-profile-chart");
    await expect(chart).toBeVisible();
    expect(
      await chart.getByTestId("elevation-profile-reconstructed").count(),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await chart.getByTestId("elevation-profile-recorded").count(),
    ).toBeGreaterThanOrEqual(1);

    // Export: the reconstructed points carry <ele> + the eleMethod
    // marker, and the metadata credits the terrain source.
    await page.getByTestId("open-export-button").click();
    const exportDialog = page.getByTestId("export-dialog");
    await expect(exportDialog).toContainText("Repairs with estimated elevation");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-download-button").click(),
    ]);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const xml = readFileSync(path, "utf8");
    expect(xml).toContain("<ele>48</ele>");
    expect(xml).toContain("<ele>52</ele>");
    expect(xml).toContain('eleMethod="elevation-api"');
    expect(xml).toContain(
      "Elevation of reconstructed points estimated from OpenTopoData",
    );
    // Recorded ele values stay verbatim.
    expect(xml).toContain("<ele>41.6</ele>");
  });

  test("a dead service degrades honestly: error + retry, export without ele", async ({
    page,
  }) => {
    await page.route("**/api.opentopodata.org/**", (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await drawRepair(page);

    await page.getByTestId("elevation-estimate-button").click();
    await page.getByTestId("elevation-disclosure-confirm").click();

    // The provider retries with backoff (1s/2s/4s) before giving up —
    // poll generously for the honest failure state.
    await expect(page.getByTestId("elevation-failure")).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByTestId("elevation-failure")).toContainText(
      "no usable data",
    );
    await expect(page.getByTestId("elevation-retry-button")).toBeVisible();

    // The core flow is never blocked: commit + export still work, and
    // the file carries NO fabricated elevation.
    await page.getByTestId("done-editing-button").click();
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );

    await page.getByTestId("open-export-button").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-download-button").click(),
    ]);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const xml = readFileSync(path, "utf8");
    expect(xml).not.toContain("eleMethod");
    expect(xml).not.toContain("estimated from OpenTopoData");
  });
});
