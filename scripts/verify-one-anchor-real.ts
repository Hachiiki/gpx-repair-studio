import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One-off live verification (Task 14): the one-anchor "add missing route"
 * flow on the user's REAL GloryFit original — extend the run's tail into
 * the open, screenshot the states for the user report.
 */

const REAL = join("docs", "strava_gpx_original.gpx");

function firstAndLast(): {
  first: { lat: number; lon: number };
  last: { lat: number; lon: number };
} {
  const xml = readFileSync(REAL, "utf8");
  const matches = [
    ...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g),
  ];
  const at = (i: number) => ({
    lat: Number(matches[i][1]),
    lon: Number(matches[i][2]),
  });
  return { first: at(0), last: at(matches.length - 1) };
}

async function bridge(page: Page) {
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
  predicate: (state: never) => boolean,
  timeoutMs = 15_000,
) {
  const started = Date.now();
  for (;;) {
    const state = await bridge(page);
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`predicate not met: ${JSON.stringify(state)}`);
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

test("real GloryFit file — extend the tail with one click", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page, REAL);
  await pollBridge(page, (s: never) => {
    const st = s as { ready: boolean; routeFeatureCount: number; moving: boolean };
    return st.ready && st.routeFeatureCount > 0 && !st.moving;
  });

  const { last } = firstAndLast();
  const statsBefore = await page.getByTestId("stats-panel").innerText();

  // The new primary tool.
  await page.getByTestId("begin-pick-anchor-button").click();
  await pollBridge(page, (s: never) => {
    const st = s as { pickSession: { active: boolean; mode: string } | null };
    return st.pickSession?.active === true && st.pickSession.mode === "anchor";
  });

  // Frame the tail + the area we will draw into.
  await page.evaluate(
    ([lat, lon]) =>
      window.__gpxMapController!.fitBounds(
        {
          minLat: (lat as number) - 0.001,
          minLon: (lon as number) - 0.002,
          maxLat: (lat as number) + 0.003,
          maxLon: (lon as number) + 0.003,
        },
        { maxZoom: 17, action: "probe-fit" },
      ),
    [last.lat, last.lon] as const,
  );
  await pollBridge(page, (s: never) => {
    const st = s as { moving: boolean; lastCameraAction: string | null };
    return !st.moving && st.lastCameraAction === "probe-fit";
  });

  const box = await page.locator(".maplibregl-canvas").boundingBox();
  const { x, y } = await project(page, last.lat, last.lon);
  await page.mouse.click(box!.x + x, box!.y + y);

  // The editor opens IMMEDIATELY with the open-end instruction.
  const editor = page.getByTestId("draw-editor-panel");
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Added route");
  await expect(editor.getByTestId("open-end-instructions")).toBeVisible();
  const state = (await pollBridge(page, (s: never) => {
    const st = s as { drawSession: { gapId: string } | null };
    return st.drawSession !== null;
  })) as { drawSession: { gapId: string } | null } | null;
  console.log("span id:", state?.drawSession?.gapId);
  expect(state?.drawSession?.gapId).toMatch(/\/end$/);

  await page.screenshot({
    path: "download/one-anchor-editor-open.png",
    fullPage: false,
  });

  // Draw three points into the open (snap off for determinism).
  await page.getByTestId("snap-toggle").click();
  const drawBox = await page.locator(".maplibregl-canvas").boundingBox();
  const drawn = [
    { lat: last.lat + 0.0006, lon: last.lon + 0.0008 },
    { lat: last.lat + 0.0012, lon: last.lon + 0.0016 },
    { lat: last.lat + 0.0018, lon: last.lon + 0.0024 },
  ];
  for (const point of drawn) {
    const p = await project(page, point.lat, point.lon);
    await page.mouse.click(drawBox!.x + p.x, drawBox!.y + p.y);
  }
  const drawn2 = (await pollBridge(page, (s: never) => {
    const st = s as { drawSession: { vertexCount: number } | null };
    return st.drawSession?.vertexCount === 3;
  })) as {
    drawSession: {
      chainCoordinates: [number, number][];
      closingCoordinates: [number, number][];
    } | null;
  } | null;
  console.log(
    "chain:",
    drawn2?.drawSession?.chainCoordinates.length,
    "closing:",
    drawn2?.drawSession?.closingCoordinates.length,
  );
  expect(drawn2?.drawSession?.chainCoordinates).toHaveLength(4);
  expect(drawn2?.drawSession?.closingCoordinates).toHaveLength(0);

  await page.screenshot({
    path: "download/one-anchor-drawing.png",
    fullPage: false,
  });

  // Commit.
  await page.getByTestId("done-editing-button").click();
  await pollBridge(page, (s: never) => {
    const st = s as { reconstructionLineCount: number };
    return st.reconstructionLineCount === 1;
  });
  await expect(page.getByTestId("manual-repairs-card")).toContainText(
    "Reconstructed",
  );

  const statsAfter = await page.getByTestId("stats-panel").innerText();
  console.log("stats unchanged:", statsAfter === statsBefore);
  expect(statsAfter).toBe(statsBefore);

  await page.screenshot({
    path: "download/one-anchor-committed.png",
    fullPage: false,
  });
});
