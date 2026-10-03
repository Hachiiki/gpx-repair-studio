import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";
import {
  grantRoadConsent,
  mockOsrmPolyline,
  type OsrmCallLog,
} from "./helpers/road-follow";

/**
 * Phase 17 — Road snapping, opt-in (§EE 17.1–17.4).
 *
 * The privacy-first upgrade of the realism feature:
 *
 *   1. THE CONSENT GATE (17.2, the plan's asserted verification): no
 *      routing request leaves before this session says yes — asserted
 *      by counting the mocked provider's calls; the enable notice is
 *      the draw tools' face of the gate; granting flows through the
 *      real dialog, and the footer states the on state.
 *   2. Decline keeps lines local (no calls, straight legs).
 *   3. The footer chip manages + revokes consent mid-session.
 *   4. THE SNAP ENGINE (17.3): a straight-drawn line snaps onto the
 *      (mocked) road in ONE whole-polyline request; the preview rides
 *      the rendered line + the honest numbers box; apply is ONE undo
 *      step that moves the geometry AND the path style; undo returns
 *      the exact drawing with no re-requests.
 *   5. OFFLINE (17.4): the snap control disables WITH an explanation;
 *      freehand drawing never stops.
 *   6. THE PROVIDER ABSTRACTION (17.1): a custom OSRM-compatible URL
 *      set in the privacy pane serves both profiles; the public demo
 *      server is not contacted.
 */

const DEMO = join("download", "demo-clean-run.gpx");

interface DrawSessionState {
  vertexCount: number;
  chainCoordinates: [number, number][];
  renderedChainCoordinates: [number, number][];
}

interface BridgeState {
  ready: boolean;
  moving: boolean;
  lastCameraAction: string | null;
  pickSession: { active: boolean; mode: string } | null;
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
        `bridge predicate not met within ${timeoutMs} ms; last: ${JSON.stringify(state)}`,
      );
    }
    await page.waitForTimeout(150);
  }
}

async function upload(page: Page) {
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(DEMO);
}

function tailPoint(): { lat: number; lon: number } {
  const xml = readFileSync(DEMO, "utf8");
  const matches = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
  const m = matches[matches.length - 1];
  if (!m) throw new Error("demo file has no track points");
  return { lat: Number(m[1]), lon: Number(m[2]) };
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
  const { x, y } = await page.evaluate(
    ([lat_, lon_]) =>
      window.__gpxMapController!.projectLatLon(lat_ as number, lon_ as number),
    [lat, lon] as const,
  );
  await page.mouse.click(box.x + x, box.y + y);
}

/** Open the one-anchor tail editor (the road-follow spec's flow). */
async function openTailEditor(page: Page) {
  const tail = tailPoint();
  await page.getByTestId("begin-pick-anchor-button").click();
  await pollBridge(
    page,
    (s) => s.pickSession?.active === true && s.pickSession.mode === "anchor",
  );
  const box = await canvasBox(page);
  await clickAt(page, tail.lat, tail.lon, box);
  const editor = page.getByTestId("draw-editor-panel");
  await expect(editor).toBeVisible();
  // Frame the north-east working area; disable the snap magnet so
  // clicks land exactly where intended (the road-follow spec's drive).
  await page.evaluate(
    ([lat, lon]) =>
      window.__gpxMapController!.fitBounds(
        {
          minLat: (lat as number) - 0.001,
          minLon: (lon as number) - 0.001,
          maxLat: (lat as number) + 0.004,
          maxLon: (lon as number) + 0.005,
        },
        { maxZoom: 17, action: "test-fit-phase17" },
      ),
    [tail.lat, tail.lon] as const,
  );
  await pollBridge(page, (s) => !s.moving);
  await page.getByTestId("snap-toggle").click();
  return { tail };
}

test.describe("phase 17 — the consent gate (§EE 17.2)", () => {
  test("no network call before consent — asserted; grant opens the road", async ({
    page,
  }) => {
    await page.goto("/");
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmPolyline(page, { log });

    await upload(page);
    await pollBridge(page, (s) => s.ready);
    const { tail } = await openTailEditor(page);

    // The default path style is Roads — the notice is the gate's face.
    await expect(page.getByTestId("road-consent-notice")).toBeVisible();
    await expect(page.getByTestId("road-consent-notice")).toContainText(
      /never your file/i,
    );

    // Draw two points. ZERO requests — the consent gate holds.
    const box = await canvasBox(page);
    const v1 = { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 };
    const v2 = { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 };
    await clickAt(page, v1.lat, v1.lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    await clickAt(page, v2.lat, v2.lon, box);
    const drawn = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );
    expect(log.count).toBe(0);
    // Straight legs — rendered == clicked nodes.
    expect(drawn.drawSession!.renderedChainCoordinates).toHaveLength(3);

    // Grant through the real dialog.
    await grantRoadConsent(page);
    await expect(page.getByTestId("road-consent-notice")).toBeHidden();

    // NOW the roads resolve (the legs re-request on grant).
    const routed = await pollBridge(
      page,
      (s) => (s.drawSession?.renderedChainCoordinates.length ?? 0) > 3,
    );
    expect(log.count).toBeGreaterThan(0);
    expect(routed.drawSession!.chainCoordinates).toHaveLength(3); // clicks stay the truth

    // The footer states the on state, with the hosts.
    const chip = page.getByTestId("footer-router-consent");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("router.project-osrm.org");
  });

  test("decline keeps lines local — no calls, straight legs, notice stays", async ({
    page,
  }) => {
    await page.goto("/");
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmPolyline(page, { log });

    await upload(page);
    await pollBridge(page, (s) => s.ready);
    const { tail } = await openTailEditor(page);

    await page.getByTestId("road-consent-enable").click();
    await expect(page.getByTestId("router-consent-dialog")).toBeVisible();
    await expect(page.getByTestId("router-consent-notice")).toContainText(
      /third-party router/i,
    );
    await page.getByTestId("router-consent-decline").click();
    await expect(page.getByTestId("router-consent-dialog")).toBeHidden();

    // Declined: the notice remains the honest state, nothing routes.
    await expect(page.getByTestId("road-consent-notice")).toBeVisible();
    const box = await canvasBox(page);
    await clickAt(page, tail.lat + 0.0012, tail.lon + 0.0012, box);
    await clickAt(page, tail.lat + 0.003, tail.lon + 0.0031, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
    expect(log.count).toBe(0);
    // No footer chip — consent is not on.
    await expect(page.getByTestId("footer-router-consent")).toBeHidden();
  });

  test("the footer chip manages consent — turn off stops the requests", async ({
    page,
  }) => {
    await page.goto("/");
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmPolyline(page, { log });

    await upload(page);
    await pollBridge(page, (s) => s.ready);
    const { tail } = await openTailEditor(page);
    await grantRoadConsent(page);
    await expect(page.getByTestId("footer-router-consent")).toBeVisible();

    // Manage mode: the dialog states the on state and offers turn-off.
    await page.getByTestId("footer-router-consent").click();
    await expect(page.getByTestId("router-consent-manage-note")).toBeVisible();
    await page.getByTestId("router-consent-revoke").click();
    await expect(page.getByTestId("footer-router-consent")).toBeHidden();

    // Routing stops again: a new point, zero new requests.
    const before = log.count;
    const box = await canvasBox(page);
    await clickAt(page, tail.lat + 0.002, tail.lon + 0.0021, box);
    await pollBridge(page, (s) => (s.drawSession?.vertexCount ?? 0) >= 1);
    await page.waitForTimeout(600);
    expect(log.count).toBe(before);
  });
});

test.describe("phase 17 — the snap engine (§EE 17.3)", () => {
  test("a straight line snaps onto the road: preview, apply, one-step undo", async ({
    page,
  }) => {
    await page.goto("/");
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmPolyline(page, { log });

    await upload(page);
    await pollBridge(page, (s) => s.ready);
    const { tail } = await openTailEditor(page);
    await grantRoadConsent(page);

    // Draw STRAIGHT (the style chip), two points.
    await page.getByTestId("road-follow-off").click();
    const box = await canvasBox(page);
    const v1 = { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 };
    const v2 = { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 };
    await clickAt(page, v1.lat, v1.lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    await clickAt(page, v2.lat, v2.lon, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
    const requestsBeforeSnap = log.count;

    // Snap: one whole-polyline request through all three nodes.
    await page.getByTestId("snap-to-road-button").click();
    await expect(page.getByTestId("snap-preview-box")).toBeVisible({
      timeout: 10_000,
    });
    expect(log.count).toBe(requestsBeforeSnap + 1);

    // The preview numbers box: your line vs the road, honest delta.
    const box2 = page.getByTestId("snap-preview-box");
    await expect(box2).toContainText(/Your line/i);
    await expect(box2).toContainText(/On the road/i);

    // The preview rides the rendered line: road interiors appear.
    await pollBridge(
      page,
      (s) => (s.drawSession?.renderedChainCoordinates.length ?? 0) > 3,
    );

    // Apply: geometry AND style move; the vertices become road waypoints.
    await page.getByTestId("snap-apply-button").click();
    await expect(page.getByTestId("snap-preview-box")).toBeHidden();
    const applied = await pollBridge(
      page,
      (s) => (s.drawSession?.vertexCount ?? 0) > 2,
    );
    expect(applied.drawSession!.vertexCount).toBeGreaterThanOrEqual(4);
    await expect(page.getByTestId("road-follow-car")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // No re-requests: the seeded legs serve the new pairs.
    await page.waitForTimeout(600);
    expect(log.count).toBe(requestsBeforeSnap + 1);

    // ONE undo step: the exact drawing AND the straight style return.
    await page.getByTestId("undo-button").click();
    const undone = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );
    expect(undone.drawSession!.renderedChainCoordinates).toHaveLength(3);
    await expect(page.getByTestId("road-follow-off")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.waitForTimeout(600);
    expect(log.count).toBe(requestsBeforeSnap + 1);
  });

  test("cancel restores the drawn line exactly", async ({ page }) => {
    await page.goto("/");
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmPolyline(page, { log });

    await upload(page);
    await pollBridge(page, (s) => s.ready);
    const { tail } = await openTailEditor(page);
    await grantRoadConsent(page);
    await page.getByTestId("road-follow-off").click();

    const box = await canvasBox(page);
    await clickAt(page, tail.lat + 0.0012, tail.lon + 0.0012, box);
    await clickAt(page, tail.lat + 0.003, tail.lon + 0.0031, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    await page.getByTestId("snap-to-road-button").click();
    await expect(page.getByTestId("snap-preview-box")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("snap-cancel-button").click();
    await expect(page.getByTestId("snap-preview-box")).toBeHidden();

    const cancelled = await pollBridge(
      page,
      (s) => s.drawSession?.vertexCount === 2,
    );
    expect(cancelled.drawSession!.renderedChainCoordinates).toHaveLength(3);
    await expect(page.getByTestId("road-follow-off")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("phase 17 — offline (§EE 17.4)", () => {
  test("the snap control disables with an explanation; freehand never stops", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    await pollBridge(page, (s) => s.ready);
    await openTailEditor(page);
    await grantRoadConsent(page);

    await page.context().setOffline(true);
    await expect(page.getByTestId("snap-to-road-button")).toBeDisabled();
    await expect(page.getByTestId("snap-status")).toContainText(/Offline/i);
    await expect(page.getByTestId("snap-status")).toContainText(
      /straight and curve lines keep working/i,
    );

    // Freehand drawing works offline.
    const tail = tailPoint();
    const box = await canvasBox(page);
    await clickAt(page, tail.lat + 0.0012, tail.lon + 0.0012, box);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);

    await page.context().setOffline(false);
    await expect(page.getByTestId("snap-to-road-button")).toBeEnabled();
  });
});

test.describe("phase 17 — the provider abstraction (§EE 17.1)", () => {
  test("a custom OSRM-compatible URL serves the request; the demo server is not contacted", async ({
    page,
  }) => {
    await page.goto("/");
    const publicLog: OsrmCallLog = { count: 0, legs: [] };
    const customLog: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmPolyline(page, { log: publicLog });
    await page.route(/osrm\.mine\.example/, async (route) => {
      customLog.count += 1;
      await route.fulfill({
        json: {
          code: "Ok",
          routes: [
            {
              distance: 1200,
              geometry: {
                coordinates: [
                  [13.405, 52.52],
                  [13.409, 52.5245],
                  [13.414, 52.527],
                ],
              },
            },
          ],
        },
      });
    });

    // Set the custom URL through the privacy pane.
    await page.getByTestId("footer-privacy").click();
    await expect(page.getByTestId("privacy-pane")).toBeVisible();
    await page.getByTestId("router-url-input").fill("https://osrm.mine.example");
    await page.getByTestId("router-url-apply").click();
    await expect(page.getByTestId("router-url-saved")).toBeVisible();
    await page.keyboard.press("Escape");

    await upload(page);
    await pollBridge(page, (s) => s.ready);
    const { tail } = await openTailEditor(page);
    await grantRoadConsent(page);

    const box = await canvasBox(page);
    await clickAt(page, tail.lat + 0.0012, tail.lon + 0.0012, box);
    await clickAt(page, tail.lat + 0.003, tail.lon + 0.0031, box);
    await pollBridge(
      page,
      (s) => (s.drawSession?.renderedChainCoordinates.length ?? 0) > 3,
    );

    expect(customLog.count).toBeGreaterThan(0);
    expect(publicLog.count).toBe(0);

    // The footer chip names the user's own host.
    await expect(page.getByTestId("footer-router-consent")).toContainText(
      "osrm.mine.example",
    );
  });

  test("an invalid URL is refused with a plain-language error", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("footer-privacy").click();
    await expect(page.getByTestId("privacy-pane")).toBeVisible();
    await page.getByTestId("router-url-input").fill("not-a-url");
    await page.getByTestId("router-url-apply").click();
    await expect(page.getByTestId("router-url-error")).toContainText(
      /must start with https:\/\//i,
    );
  });
});
