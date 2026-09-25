import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * Phase 5 E2E — time & pace reconstruction acceptance:
 *
 *   1. a gap bracketed by timestamps → the derived span shows in the
 *      editor, the estimated pace renders badged "Estimated", the
 *      strategy switch works, and the Case-4 manual override surfaces
 *      its disagreement; committed repairs join the statistics with
 *      provenance labels;
 *   2. a file without timestamps → the file-level "no timing data"
 *      mode appears, the manual duration flow works end to end (pick →
 *      draw → add duration → pace), and the entered total drives the
 *      overall pace.
 *
 * Assertions read the DOM (the §J-2 honesty surface) and the
 * controller's test bridge for geometry — no pixel diffs, deliberately
 * tile-independent.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

/** The time-gap fixture: gap boundaries at points 3 → 4 (a 5-min pause). */
const BEFORE = { lat: 52.520141, lon: 13.405164 };
const AFTER = { lat: 52.520186, lon: 13.405234 };
const DRAW_POINTS = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
];

/** The no-time fixture's LAST recorded point (one-anchor extension). */
const NO_TIME_LAST = { lat: 52.520096, lon: 13.405094 };
const NO_TIME_DRAW = [
  { lat: 52.5205, lon: 13.4054 },
  { lat: 52.5203, lon: 13.4057 },
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
  pickSession: { active: boolean; mode: string } | null;
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

// Road follow defaults to ON ("car"): stub the routing network so the
// editor draws straight legs deterministically.
test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("time & pace reconstruction", () => {
  test("timestamped gap: estimated pace badged, strategies switch, Case-4 disagreement flagged, stats join", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // Open the detected gap's editor and draw two points.
    await page.getByTestId("open-editor-button").first().click();
    await pollBridge(page, (s) => s.drawSession !== null && s.drawSession.drawMode);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);
    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // §J-1 Case 1: the recorded 5-minute span is the gap duration…
    const duration = page.getByTestId("gap-duration");
    await expect(duration).toContainText("5:00");
    // …and the pace renders, badged Estimated (never as measured).
    const pace = page.getByTestId("gap-pace");
    await expect(pace).toContainText(/\/km/);
    await expect(pace).not.toContainText("—");
    await expect(pace.getByText("Estimated", { exact: true })).toBeVisible();
    await expect(
      page.getByTestId("time-strategy-distance-proportional"),
    ).toHaveAttribute("aria-pressed", "true");

    // Case 1b: the strategy switches without touching geometry.
    await page.getByTestId("time-strategy-uniform").click();
    await expect(page.getByTestId("time-strategy-uniform")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByTestId("time-strategy-distance-proportional"),
    ).toHaveAttribute("aria-pressed", "false");

    // The pace unit toggle re-formats every pace readout.
    await page.getByTestId("pace-unit-mi").click();
    await expect(pace).toContainText(/\/mi/);
    await page.getByTestId("pace-unit-km").click();
    await expect(pace).toContainText(/\/km/);

    // Case 4: override with a manual duration that disagrees.
    await page.getByTestId("time-strategy-manual-duration").click();
    await page.getByTestId("duration-minutes").fill("12");
    await page.getByTestId("save-duration-button").click();
    await expect(page.getByTestId("duration-discrepancy")).toContainText("12:00");
    await expect(page.getByTestId("duration-discrepancy")).toContainText("5:00");
    await expect(duration).toContainText("your estimate");

    // Commit; the stats join with provenance labels and the footnote.
    await page.getByTestId("done-editing-button").click();
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );

    const stats = page.getByTestId("stats-panel");
    await expect(stats).toContainText("Repaired distance");
    await expect(stats).toContainText("Total with repairs");
    await expect(stats).toContainText("Repair time");
    await expect(stats).toContainText("12:00"); // the manual value wins
    await expect(stats).toContainText("Moving time incl. repairs");
    await expect(stats).toContainText("12:18"); // 0:18 recorded + 12:00
    await expect(page.getByTestId("duration-discrepancy-note")).toContainText(
      /disagree/i,
    );
    const repairedPace = page.getByTestId("pace-row-repaired");
    await expect(repairedPace).toContainText(/\/km/);
    await expect(repairedPace).not.toContainText("—");
    await expect(page.getByTestId("pace-row-overall")).toContainText(/\/km/);

    // The strategy persists across editor sessions (a setting, §D-3.5).
    await page.getByTestId("open-editor-button").first().click();
    await pollBridge(page, (s) => s.drawSession !== null);
    await expect(page.getByTestId("gap-duration")).toContainText("12:00");
    await expect(page.getByTestId("gap-duration")).toContainText(
      "your estimate",
    );
  });

  test("no-timestamp file: file-level mode + the manual duration flow works", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "no-time.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // The file-level "no timing data" mode appears; the overall pace
    // prompts honestly (§J-2: "—" plus a prompt).
    const card = page.getByTestId("file-timing-card");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("pace-row-overall")).toContainText(
      /enter a total duration/i,
    );

    // Enter a start time and a 30-minute total (blur-commit).
    await page.getByTestId("file-start-input").fill("2024-05-01T07:00");
    await page.getByTestId("file-total-minutes").fill("30");
    await page.getByTestId("file-total-minutes").blur();

    const stats = page.getByTestId("stats-panel");
    await expect(stats).toContainText("Total duration (entered)");
    await expect(stats).toContainText("30:00");
    await expect(page.getByTestId("pace-row-overall")).toContainText(/\/km/);
    await expect(page.getByTestId("pace-row-overall")).not.toContainText(
      "enter a total duration",
    );

    // One-anchor flow on the route's last point (open extension).
    await page.getByTestId("begin-pick-anchor-button").click();
    await pollBridge(page, (s) => s.pickSession?.active === true);
    const pickBox = await canvasBox(page);
    await clickAt(page, NO_TIME_LAST.lat, NO_TIME_LAST.lon, pickBox);
    await pollBridge(page, (s) => s.drawSession !== null && s.pickSession === null);

    // No timestamps around this gap (§J-1 Case 3): the pace stays "—"
    // until a duration is entered.
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);
    await clickAt(page, NO_TIME_DRAW[0].lat, NO_TIME_DRAW[0].lon, box);
    await clickAt(page, NO_TIME_DRAW[1].lat, NO_TIME_DRAW[1].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    await expect(page.getByTestId("time-strategy-controls")).toContainText(
      /no timestamps around this gap/i,
    );
    await expect(page.getByTestId("gap-pace")).toContainText("—");

    // The manual duration answers the prompt; the pace appears badged.
    await page.getByTestId("add-duration-button").click();
    await page.getByTestId("duration-minutes").fill("12");
    await page.getByTestId("save-duration-button").click();
    const gapPace = page.getByTestId("gap-pace");
    await expect(gapPace).toContainText(/\/km/);
    await expect(gapPace.getByText("Estimated", { exact: true })).toBeVisible();
    await expect(page.getByTestId("gap-duration")).toContainText("12:00");

    // Commit: the repair's time is the manual 12:00, labeled estimated.
    await page.getByTestId("done-editing-button").click();
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );
    await expect(stats).toContainText("Repair time");
    await expect(stats).toContainText("12:00");
    await expect(page.getByTestId("pace-row-repaired")).toContainText(/\/km/);
    await expect(page.getByTestId("pace-row-repaired")).not.toContainText("—");
  });
});
