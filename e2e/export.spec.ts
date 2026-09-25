import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * Phase 7 E2E — merge & export acceptance:
 *
 *   1. the full happy path: upload → repair a detected gap → review the
 *      export summary → download (intercepted) → assert the file: gpxr
 *      provenance markers, verbatim original values, the repair note →
 *      re-upload the downloaded file → the original/reconstructed
 *      distinction survives (stats split, map styling, seam-suppressed
 *      detection);
 *   2. a repair-free export is a structure-preserved copy (no markers,
 *      original creator kept);
 *   3. the merged mode + pretty-print settings shape the output.
 *
 * Road routing is stubbed off (straight legs — deterministic geometry).
 * Assertions read the DOM, the controller's test bridge, and the
 * downloaded bytes themselves — the file is the contract.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

/** The time-gap fixture: gap boundaries at points 3 → 4 (a 5-min pause). */
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

/** Click the export button and capture the download; returns its bytes. */
async function exportAndRead(
  page: Page,
  options: { mode?: "structure-preserving" | "merged"; pretty?: boolean } = {},
): Promise<{ xml: string; fileName: string }> {
  await page.getByTestId("open-export-button").click();
  const dialog = page.getByTestId("export-dialog");
  await expect(dialog).toBeVisible();

  if (options.mode === "merged") {
    await page.getByTestId("export-mode-merged").check();
  }
  if (options.pretty) {
    await page.getByTestId("export-pretty-print").click();
  }

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-download-button").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.repaired\.gpx$/);
  const path = await download.path();
  if (path === null) throw new Error("download produced no file");
  return {
    xml: readFileSync(path, "utf8"),
    fileName: download.suggestedFilename(),
  };
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("merge & export", () => {
  test("full happy path: repair → download → re-upload keeps the distinction", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // Repair the detected gap: open the editor, draw two vertices, commit.
    await page.getByTestId("open-editor-button").first().click();
    await pollBridge(page, (s) => s.drawSession !== null && s.drawSession.drawMode);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);
    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
    await page.getByTestId("done-editing-button").click();
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );

    // The export card reflects the committed repair.
    const card = page.getByTestId("export-card");
    await expect(card).toContainText("Repairs to include");
    await expect(card).toContainText("1");

    // Review & download (Mode A, compact — the defaults).
    const { xml, fileName } = await exportAndRead(page);
    expect(fileName).toBe("time-gap.repaired.gpx");

    // The file: valid GPX 1.1, our creator, the repair note, markers on
    // exactly the two reconstructed points, and every original value
    // byte-identical (spot-checks; the unit property suite is exhaustive).
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('version="1.1"');
    expect(xml).toContain('creator="GPX Repair Studio"');
    expect(xml).toContain("Repaired with GPX Repair Studio");
    expect(xml).toContain("Original creator: Paused Watch");
    expect(xml).toMatch(/<gpxr:reconstructed[^]*timeMethod="distance-proportional"/);
    const markerCount = xml.match(/<gpxr:reconstructed/g)?.length ?? 0;
    expect(markerCount).toBe(2);
    expect(xml).toContain('lat="52.520006"'); // verbatim original spelling
    expect(xml).toContain("<time>2024-05-01T07:05:09Z</time>");
    expect(xml).toMatch(/<gpxr:summary[^]*gapCount="1"/);
    // Mode A: the reconstruction is its own <trkseg> — three segments.
    expect((xml.match(/<trkseg>/g) ?? []).length).toBe(3);

    // Re-upload the downloaded file: start a new session, then upload the
    // export itself — the app must recognize its own repair.
    await page.getByRole("button", { name: "New file" }).click();
    await page.getByTestId("upload-zone").waitFor({ state: "visible" });

    // Write the exported XML to a temp file Playwright can upload.
    const tempPath = join(process.cwd(), "e2e", ".export-happy-path.gpx");
    writeFileSync(tempPath, xml);
    await upload(page, tempPath);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // 1. Stats: the re-imported repair counts as repaired, not recorded.
    const stats = page.getByTestId("stats-panel");
    await expect(stats).toContainText("Repaired distance");
    await expect(stats).toContainText("Total with repairs");
    await expect(page.getByTestId("reimport-note")).toContainText(
      "2 points in this file were reconstructed",
    );

    // 2. Map: the marked stretch renders as a reconstruction line (the
    //    same emerald treatment as editor repairs).
    await pollBridge(page, (s) => s.reconstructionLineCount >= 1);

    // 3. Detection: the repair seams are NOT gaps (the 5-minute pause the
    //    repair replaced is gone; nothing new is flagged).
    const gapList = page.getByTestId("gap-list");
    await expect(gapList).toContainText("No gaps detected");

    // 4. The validation report recognizes the previous repair.
    const report = page.getByTestId("validation-report");
    await expect(report).toContainText("Previously repaired");
  });

  test("repair-free export is a structure-preserved copy", async ({ page }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "valid-1.1.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const card = page.getByTestId("export-card");
    await expect(card).toContainText("Download the file as-is");

    const { xml } = await exportAndRead(page);
    expect(xml).not.toContain("gpx-repair.studio");
    expect(xml).not.toContain("Repaired with GPX Repair Studio");
    // The original creator is preserved (no repairs → no rebranding).
    expect(xml).toContain('creator="Garmin Connect"');
  });

  test("merged mode + pretty-print shape the output", async ({ page }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "multi-segment.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const { xml } = await exportAndRead(page, { mode: "merged", pretty: true });

    // One track → one merged <trkseg>, pretty-indented, all points kept.
    expect((xml.match(/<trkseg>/g) ?? []).length).toBe(1);
    expect((xml.match(/<trkpt /g) ?? []).length).toBe(7);
    expect(xml).toMatch(/\n {2}</);
    expect(xml).toContain('lat="52.520006"');
    expect(xml).toContain('lat="52.520276"');
  });
});
