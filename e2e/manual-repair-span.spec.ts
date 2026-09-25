import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * Manual repair spans (draw-anywhere) — E2E acceptance:
 *
 * The user's contract: repairing is NEVER gated on detection. The demo
 * clean file detects zero gaps; the draw tools must still be reachable:
 *
 *   1. "Redraw a stretch" starts the two-click pick mode (chip on map);
 *   2. two clicks on recorded points open the standard draw editor with
 *      the picked anchors;
 *   3. "Add missing route" needs ONE click — the anchor — and the editor
 *      opens immediately with NO far boundary: no closing segment ever
 *      renders, the drawn chain is exactly what the repair will be
 *      (WYSIWYG, the user's interaction design);
 *   4. drawing + committing works exactly like a detected-gap repair
 *      (reconstruction renders; the manual card shows "Reconstructed");
 *   5. the original recording is untouched (immutability);
 *   6. Esc cancels pick mode cleanly.
 *
 * Assertions read the controller's test bridge (pick-session snapshot +
 * projectLatLon) — no pixel diffs, deliberately tile-independent.
 */

const DEMO = join("download", "demo-clean-run.gpx");

/** Extract the nth track point's lat/lon from a GPX file (node side). */
function pointAt(n: number): { lat: number; lon: number } {
  const xml = readFileSync(DEMO, "utf8");
  const matches = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
  const m = matches[n];
  if (!m) throw new Error(`demo file has no point #${n}`);
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

interface PickSessionState {
  active: boolean;
  mode: "anchor" | "pair";
  hasAnchor: boolean;
}

interface BridgeState {
  status: string;
  ready: boolean;
  routeFeatureCount: number;
  gapSpanCount: number;
  boundaryMarkerCount: number;
  reconstructionLineCount: number;
  moving: boolean;
  lastCameraAction: string | null;
  pickSession: PickSessionState | null;
  drawSession: {
    gapId: string;
    drawMode: boolean;
    vertexCount: number;
    chainCoordinates: [number, number][];
    closingCoordinates: [number, number][];
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

// Road follow defaults to ON ("car"): draw specs must never depend on a
// live routing service — abort every routing request so the editor draws
// straight legs deterministically (the WYSIWYG straight fallback).
test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("manual repair spans — draw anywhere, no detection required", () => {
  test("pick two points, draw, commit — the clean-file scenario", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // The clean file detects nothing — and the repair tools are still here.
    const gapList = page.getByTestId("gap-list");
    await expect(gapList).toContainText("No gaps detected");
    const manualCard = page.getByTestId("manual-repairs-card");
    await expect(manualCard).toContainText("No manual repairs yet");
    await expect(page.getByTestId("begin-pick-anchor-button")).toBeVisible();
    await expect(page.getByTestId("begin-pick-pair-button")).toBeVisible();

    const statsBefore = await page.getByTestId("stats-panel").innerText();
    expect(statsBefore).toContain("2.51 km"); // the clean run's original distance

    // -- pair pick mode: two clicks on recorded points ---------------------
    await page.getByTestId("begin-pick-pair-button").click();
    await expect(page.getByTestId("pick-mode-chip")).toBeVisible();
    await expect(page.getByTestId("cancel-pick-button")).toBeVisible();
    await pollBridge(
      page,
      (s) => s.pickSession?.active === true && s.pickSession.mode === "pair",
    );

    const box = await canvasBox(page);
    const anchorA = pointAt(120);
    const anchorB = pointAt(520); // a long stretch, well within the run
    await clickAt(page, anchorA.lat, anchorA.lon, box);
    await pollBridge(page, (s) => s.pickSession?.hasAnchor === true);

    await clickAt(page, anchorB.lat, anchorB.lon, box);

    // The editor opened for the picked span — the standard draw editor.
    const editor = page.getByTestId("draw-editor-panel");
    await expect(editor).toBeVisible();
    await expect(editor).toContainText("Manual repair");
    await expect(editor).toContainText("Editing");
    const session = await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.drawMode === true,
    );
    expect(session.drawSession!.gapId).toMatch(/^gap\//);
    expect(session.drawSession!.vertexCount).toBe(0);
    // Pick mode is over.
    await expect(page.getByTestId("pick-mode-chip")).toHaveCount(0);

    // The manual card now lists the span.
    await expect(manualCard.getByTestId("manual-repair-row")).toHaveCount(1);

    // -- draw a vertex (snap off for determinism) --------------------------
    await page.getByTestId("snap-toggle").click();
    const mid = {
      lat: (anchorA.lat + anchorB.lat) / 2 + 0.0012,
      lon: (anchorA.lon + anchorB.lon) / 2 + 0.0012,
    };
    await clickAt(page, mid.lat, mid.lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    await expect(page.getByTestId("draw-distance")).toContainText("m");

    // -- commit --------------------------------------------------------------
    await page.getByTestId("done-editing-button").click();
    await expect(editor).toHaveCount(0);
    await pollBridge(page, (s) => s.reconstructionLineCount === 1);

    // The manual row reflects the repair.
    await expect(manualCard.getByTestId("manual-repair-row")).toHaveCount(1);
    await expect(manualCard).toContainText("Reconstructed");
    await expect(manualCard.getByTestId("open-editor-button-manual")).toHaveText(
      "Edit route",
    );

    // Immutability of the recorded values (Phase 5 contract): the
    // original rows keep their numbers; committed repairs only ADD
    // estimated/mixed rows — nothing recorded is rewritten.
    const statsAfter = await page.getByTestId("stats-panel").innerText();
    expect(statsAfter).toContain("2.51 km"); // the recorded distance value
    const movingTime = statsBefore.match(/Recorded moving time\s+([^\n]+)/)?.[1];
    expect(movingTime).toBeTruthy();
    expect(statsAfter).toContain(movingTime!);
    expect(statsAfter).toContain("Repaired distance"); // additive join
    expect(statsAfter).toContain("Repair time");
  });

  test("Esc cancels pick mode without creating anything", async ({ page }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await page.getByTestId("begin-pick-pair-button").click();
    await expect(page.getByTestId("pick-mode-chip")).toBeVisible();
    await pollBridge(page, (s) => s.pickSession?.active === true);

    // One anchor picked, then cancelled.
    const box = await canvasBox(page);
    const anchorA = pointAt(200);
    await clickAt(page, anchorA.lat, anchorA.lon, box);
    await pollBridge(page, (s) => s.pickSession?.hasAnchor === true);

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("pick-mode-chip")).toHaveCount(0);
    await expect(page.getByTestId("begin-pick-pair-button")).toBeVisible();
    await pollBridge(page, (s) => s.pickSession === null);
    // Nothing was created.
    await expect(page.getByTestId("manual-repair-row")).toHaveCount(0);
    await expect(page.getByTestId("draw-editor-panel")).toHaveCount(0);
    const manualCard = page.getByTestId("manual-repairs-card");
    await expect(manualCard).toContainText("No manual repairs yet");
  });

  test("the empty detected-gaps list cross-links into manual repairing", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    await page.getByTestId("empty-list-begin-pick").click();
    await expect(page.getByTestId("pick-mode-chip")).toBeVisible();
    // The cross-link starts the ONE-CLICK tool (the simpler flow).
    await pollBridge(
      page,
      (s) => s.pickSession?.active === true && s.pickSession.mode === "anchor",
    );
  });

  test("add missing route — one click, then draw into the open (the user's flow)", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, DEMO);
    await pollBridge(page, (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    const statsBefore = await page.getByTestId("stats-panel").innerText();
    const manualCard = page.getByTestId("manual-repairs-card");

    // -- ONE click on the LAST recorded point = the route's tail ----------
    await page.getByTestId("begin-pick-anchor-button").click();
    await expect(page.getByTestId("pick-mode-chip")).toContainText(
      "one point",
    );
    await pollBridge(
      page,
      (s) => s.pickSession?.active === true && s.pickSession.mode === "anchor",
    );

    const box = await canvasBox(page);
    const tail = pointAt(899); // the clean run's last point (900 total)
    await clickAt(page, tail.lat, tail.lon, box);

    // The editor opened IMMEDIATELY — no second pick click.
    const editor = page.getByTestId("draw-editor-panel");
    await expect(editor).toBeVisible();
    await expect(editor).toContainText("Added route");
    await expect(editor).toContainText("Editing");
    await expect(editor.getByTestId("open-end-instructions")).toBeVisible();
    const session = await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.drawMode === true,
    );
    // The open extension's id carries the anchor + "end".
    expect(session.drawSession!.gapId).toMatch(/\/end$/);
    expect(session.drawSession!.vertexCount).toBe(0);
    await expect(page.getByTestId("pick-mode-chip")).toHaveCount(0);
    // Let any residual camera easing settle before pixel-exact clicks.
    await pollBridge(page, (s) => !s.moving);

    // The manual card lists the open span.
    await expect(manualCard.getByTestId("manual-repair-row")).toHaveCount(1);
    await expect(manualCard).toContainText("Open end");

    // Frame the working area (the drawn route extends BEYOND the recorded
    // extent — a real user pans/zooms first; the test drives the same
    // public fitBounds the toolbar uses).
    await page.evaluate(
      ([lat, lon]) =>
        window.__gpxMapController!.fitBounds(
          {
            // The drawn route extends NORTH-EAST beyond the tail — frame
            // that side generously (a real user pans before drawing on).
            minLat: (lat as number) - 0.001,
            minLon: (lon as number) - 0.001,
            maxLat: (lat as number) + 0.004,
            maxLon: (lon as number) + 0.005,
          },
          { maxZoom: 17, action: "test-fit-extension" },
        ),
      [tail.lat, tail.lon] as const,
    );
    await pollBridge(
      page,
      (s) => !s.moving && s.lastCameraAction === "test-fit-extension",
    );

    // -- draw freely OUTSIDE the recorded route ---------------------------
    await page.getByTestId("snap-toggle").click();
    const drawBox = await canvasBox(page);
    const drawn = [
      { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 },
      { lat: tail.lat + 0.0022, lon: tail.lon + 0.002 },
      { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 },
    ];
    for (const point of drawn) {
      await clickAt(page, point.lat, point.lon, drawBox);
    }
    const afterDraw = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 3,
    );

    // WYSIWYG: the chain is anchor + the three clicks — and there is NO
    // closing segment anywhere (nothing to reconnect to).
    expect(afterDraw.drawSession!.chainCoordinates).toHaveLength(4);
    expect(afterDraw.drawSession!.closingCoordinates).toHaveLength(0);
    const chain = afterDraw.drawSession!.chainCoordinates;
    expect(chain[0][0]).toBeCloseTo(tail.lon, 6);
    expect(chain[3][0]).toBeCloseTo(drawn[2].lon, 4);
    await expect(page.getByTestId("draw-distance")).toContainText("m");

    // -- commit: the drawn chain becomes the repair, nothing else ----------
    await page.getByTestId("done-editing-button").click();
    await expect(editor).toHaveCount(0);
    const committed = await pollBridge(
      page,
      (s) => s.reconstructionLineCount === 1,
    );
    // One boundary marker only: the seam at the anchor (no far side).
    expect(committed.boundaryMarkerCount).toBe(1);
    await expect(manualCard).toContainText("Reconstructed");

    // Immutability of the recorded values (Phase 5 contract).
    const statsAfter = await page.getByTestId("stats-panel").innerText();
    expect(statsAfter).toContain("2.51 km");
    const movingTime = statsBefore.match(/Recorded moving time\s+([^\n]+)/)?.[1];
    expect(movingTime).toBeTruthy();
    expect(statsAfter).toContain(movingTime!);
    expect(statsAfter).toContain("Repaired distance");
    expect(statsAfter).toContain("Repair time");
  });
});
