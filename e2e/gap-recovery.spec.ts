import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * Task 26 E2E (revised to the landing-tab entry) — the Gap Recovery
 * section's acceptance criteria:
 *
 *   1. the landing toggle is the only front door: three tabs (repair a
 *      recording / create a share card / recover a GPS gap), no header
 *      section switcher, and an upload from the recovery tab enters the
 *      section's own session;
 *   2. uploading an activity with a GPS tracking gap lists the missing
 *      section (interval boundaries + elapsed time);
 *   3. drawing the missing route on the map works exactly like the repair
 *      studio's editor (draft → commit → distinct committed line);
 *   4. the completed-route preview shows recalculated statistics with the
 *      original elapsed time marked unchanged;
 *   5. exporting downloads a corrected GPX whose generated points carry
 *      gpxr provenance and whose original values are verbatim;
 *   6. "New file" returns to the landing, where the repair tab opens the
 *      repair studio for the same file (sessions stay independent);
 *   7. the flow works at a mobile (375 px) viewport, tabs included.
 *
 * Road routing is stubbed off (straight legs — deterministic geometry).
 * Assertions read the DOM, the controller's test bridge, and the
 * downloaded bytes — the file is the contract.
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
  gapSpanCount: number;
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

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("Gap Recovery section", () => {
  test("full happy path: tab → detect → draw → preview → export, then the repair studio", async ({
    page,
  }) => {
    await page.goto("/");

    // -- the landing toggle is the only front door ---------------------------
    const toggle = page.getByTestId("landing-mode-toggle");
    await expect(toggle).toBeVisible();
    // The Task-26 header section switcher is gone — the tab is the door.
    await expect(page.getByTestId("section-switcher")).toHaveCount(0);
    await page.getByTestId("landing-mode-recovery").click();

    // The recovery hero teaches its workflow.
    await expect(
      page.getByRole("heading", { name: "Recover a missing GPS section" }),
    ).toBeVisible();
    const steps = page.getByTestId("workflow-steps");
    await expect(steps).toContainText("Detect the gap");
    await expect(steps).toContainText("Export the corrected file");
    await expect(page.getByTestId("upload-zone")).toBeVisible();

    // -- upload the activity with the GPS tracking gap -----------------------
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // The missing section: detected, listed with its interval evidence.
    const gapList = page.getByTestId("gap-list");
    await expect(gapList).toContainText("Time gap");
    await expect(gapList).toContainText("5:00 elapsed");
    const guide = page.getByTestId("recovery-guide-card");
    await expect(guide).toContainText("1 found");
    await expect(guide).toContainText("0 of 1 recovered");

    // The map renders the recording with the missing span dashed.
    await pollBridge(page, (s) => s.gapSpanCount === 1);

    // -- draw the missing route -----------------------------------------------
    await page.getByTestId("open-editor-button").first().click();
    await pollBridge(page, (s) => s.drawSession !== null && s.drawSession.drawMode);
    await page.getByTestId("snap-toggle").click();
    const box = await canvasBox(page);
    await clickAt(page, DRAW_POINTS[0].lat, DRAW_POINTS[0].lon, box);
    await clickAt(page, DRAW_POINTS[1].lat, DRAW_POINTS[1].lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // The reused editor panel shows the section's time plan (Case 1:
    // both boundaries timed — duration derived, not invented).
    const editor = page.getByTestId("draw-editor-panel");
    await expect(editor).toContainText("Reconstruct route");

    // Commit: closing the editor turns the draft into the recovered line.
    await page.getByTestId("done-editing-button").click();
    await pollBridge(
      page,
      (s) => s.drawSession === null && s.reconstructionLineCount === 1,
    );
    await expect(guide).toContainText("1 of 1 recovered");

    // -- the completed-route preview ------------------------------------------
    const preview = page.getByTestId("recovery-preview-card");
    await expect(preview).toContainText("1 of 1 missing section recovered");
    const previewStats = page.getByTestId("recovery-preview-stats");
    await expect(previewStats).toContainText("Missing time now covered");
    await expect(previewStats).toContainText("5:00");
    await expect(previewStats).toContainText("unchanged");
    await expect(previewStats).toContainText("Points generated");

    // -- export the corrected file ---------------------------------------------
    await page.getByTestId("open-export-button").click();
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-download-button").click(),
    ]);
    expect(download.suggestedFilename()).toBe("time-gap.repaired.gpx");
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const xml = readFileSync(path, "utf8");

    // The corrected file: provenance markers on the generated points,
    // original values verbatim, the summary of one inserted section.
    expect(xml).toContain("Repaired with GPX Repair Studio");
    expect(xml).toMatch(/<gpxr:reconstructed[^]*timeMethod="distance-proportional"/);
    expect(xml).toMatch(/<gpxr:summary[^]*gapCount="1"/);
    expect(xml).toContain('lat="52.520006"'); // verbatim original spelling
    expect(xml).toContain("<time>2024-05-01T07:00:09Z</time>"); // untouched anchor
    expect(xml).toContain("<time>2024-05-01T07:05:09Z</time>"); // untouched anchor

    // -- back to the landing, then into the repair studio ---------------------
    // "New file" resets the ACTIVE section (recovery) and returns to the
    // landing; the repair tab then opens the repair studio for the same
    // file — its own workspace, not the recovery section.
    await page.getByRole("button", { name: "New file" }).click();
    await expect(page.getByTestId("landing-mode-toggle")).toBeVisible();
    await page.getByTestId("landing-mode-repair").click();
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await expect(page.getByTestId("gap-list")).toContainText("Time gap");
    await expect(page.getByTestId("recovery-guide-card")).toHaveCount(0);
    await expect(page.getByTestId("manual-repairs-card")).toBeVisible();
  });

  test("re-uploading the corrected file recognizes the recovery", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-recovery").click();
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // Recover the section, then export.
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

    await page.getByTestId("open-export-button").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-download-button").click(),
    ]);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const xml = readFileSync(path, "utf8");

    // Round-trip: reset the section, upload the export itself — from the
    // remembered recovery tab (the intent survived the reset).
    await page.getByRole("button", { name: "New file" }).click();
    await page.getByTestId("upload-zone").waitFor({ state: "visible" });
    await expect(page.getByTestId("landing-mode-recovery")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const tempPath = join(process.cwd(), "e2e", ".recovery-roundtrip.gpx");
    writeFileSync(tempPath, xml);
    await upload(page, tempPath);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // The re-imported recovery reads as repaired, not recorded — and the
    // 5-minute pause the recovery replaced is no longer a missing section.
    const stats = page.getByTestId("stats-panel");
    await expect(stats).toContainText("Repaired distance");
    await expect(page.getByTestId("reimport-note")).toContainText(
      "points in this file were reconstructed",
    );
    const gapList = page.getByTestId("gap-list");
    await expect(gapList).toContainText("No gaps detected");
    // The marked stretch renders with the reconstruction treatment.
    await pollBridge(page, (s) => s.reconstructionLineCount >= 1);
  });

  test("works at a mobile viewport, three tabs on one row", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // The compact labels keep the trio on one 375 px row — the page
    // never scrolls horizontally because of the toggle (the URI-wrap
    // spec's overflow contract, applied to the landing).
    const toggle = page.getByTestId("landing-mode-toggle");
    await expect(toggle).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox).not.toBeNull();
    expect(toggleBox!.width).toBeLessThanOrEqual(375);

    // The compact label shows below sm; the tab still switches.
    await expect(page.getByTestId("landing-mode-recovery")).toContainText(
      "Recovery",
    );
    await page.getByTestId("landing-mode-recovery").click();
    await expect(
      page.getByRole("heading", { name: "Recover a missing GPS section" }),
    ).toBeVisible();

    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // The missing section is listed; drawing works with touch-sized
    // targets (the map canvas keeps its height).
    const gapList = page.getByTestId("gap-list");
    await expect(gapList).toContainText("Time gap");
    await expect(page.getByTestId("map-canvas")).toBeVisible();

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
    await expect(page.getByTestId("recovery-guide-card")).toContainText(
      "1 of 1 recovered",
    );
  });
});
