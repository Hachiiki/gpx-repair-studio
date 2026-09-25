/**
 * Live verification — road follow on the user's REAL GloryFit file,
 * with the REAL public OSRM service (no interception). This is the exact
 * network path the user's browser will take.
 *
 * Flow: upload docs/strava_gpx_original.gpx → one-anchor "Add missing
 * route" on the tail → draw two points OUTSIDE the recording (road follow
 * defaults to "car") → wait for the road geometry to arrive → screenshot.
 * Then: drag a point (re-route), switch modes, and commit.
 *
 * Run: npx tsx scripts/verify-road-follow-real.ts
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const FILE = "docs/strava_gpx_original.gpx";
const OUT = "download/road-follow-real.png";

function tailPoint() {
  const xml = readFileSync(FILE, "utf8");
  const matches = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
  const m = matches[matches.length - 1];
  if (!m) throw new Error("no track points");
  return { lat: Number(m[1]), lon: Number(m[2]) };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  let osrmRequests = 0;
  let osrmOk = 0;
  page.on("request", (request) => {
    if (request.url().includes("router.project-osrm.org")) osrmRequests += 1;
  });
  page.on("response", async (response) => {
    if (response.url().includes("router.project-osrm.org") && response.ok()) {
      osrmOk += 1;
    }
  });

  await page.goto("http://localhost:3000");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await fileChooserSetFiles(await chooser, FILE);

  await page.waitForFunction(
    () =>
      window.__gpxMapController?.getTestState().ready === true &&
      window.__gpxMapController.getTestState().routeFeatureCount > 0,
    undefined,
    { timeout: 20_000 },
  );

  const tail = tailPoint();
  console.log("tail point:", tail);

  // One-anchor add-missing-route on the tail.
  await page.getByTestId("begin-pick-anchor-button").click();
  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().pickSession?.active === true,
  );
  const project = (lat: number, lon: number) =>
    page.evaluate(
      ([lat_, lon_]) =>
        window.__gpxMapController!.projectLatLon(lat_ as number, lon_ as number),
      [lat, lon] as const,
    );
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  const clickAt = async (lat: number, lon: number) => {
    const { x, y } = await project(lat, lon);
    await page.mouse.click(box!.x + x, box!.y + y);
  };
  await clickAt(tail.lat, tail.lon);

  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().drawSession !== null,
  );
  await page.getByTestId("snap-toggle").click(); // clicks land exactly

  // Frame the draw area north-east of the tail.
  await page.evaluate(
    ([lat, lon]) =>
      window.__gpxMapController!.fitBounds(
        {
          minLat: (lat as number) - 0.001,
          minLon: (lon as number) - 0.001,
          maxLat: (lat as number) + 0.004,
          maxLon: (lon as number) + 0.005,
        },
        { maxZoom: 17, action: "probe-fit" },
      ),
    [tail.lat, tail.lon] as const,
  );
  await page.waitForFunction(
    () => !window.__gpxMapController!.getTestState().moving,
  );

  // Draw two points outside the recording — before and after a curve.
  const v1 = { lat: tail.lat + 0.0012, lon: tail.lon + 0.0012 };
  const v2 = { lat: tail.lat + 0.003, lon: tail.lon + 0.0031 };
  await clickAt(v1.lat, v1.lon);
  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().drawSession?.vertexCount === 1,
  );
  await clickAt(v2.lat, v2.lon);
  await page.waitForFunction(
    () => window.__gpxMapController?.getTestState().drawSession?.vertexCount === 2,
  );

  // Wait for the road geometry: rendered chain grows beyond the clicked
  // nodes (5+ points = road interiors arrived), or timeout = fallback.
  let roadArrived = false;
  try {
    await page.waitForFunction(
      () =>
        (window.__gpxMapController?.getTestState().drawSession
          ?.renderedChainCoordinates.length ?? 0) > 3,
      undefined,
      { timeout: 15_000 },
    );
    roadArrived = true;
  } catch {
    roadArrived = false;
  }

  const state = await page.evaluate(() =>
    window.__gpxMapController!.getTestState(),
  );
  const draw = state.drawSession!;
  console.log("chain (clicked nodes):", draw.chainCoordinates.length);
  console.log("rendered (road applied):", draw.renderedChainCoordinates.length);
  console.log("OSRM requests:", osrmRequests, "ok:", osrmOk);
  console.log("road arrived:", roadArrived);

  const badge = await page.getByTestId("draw-distance").innerText();
  console.log("distance badge:", badge.trim());
  const status = await page
    .getByTestId("road-follow-status")
    .innerText()
    .catch(() => "(none)");
  console.log("road-follow status:", status.trim());

  await page.screenshot({ path: OUT, fullPage: false });
  console.log("screenshot:", OUT);

  // Drag the first point — the road must re-route.
  if (roadArrived) {
    const handle = draw.handleScreenPositions[0];
    const target = { lat: tail.lat + 0.0006, lon: tail.lon + 0.0026 };
    const t = await project(target.lat, target.lon);
    await page.mouse.move(box!.x + handle.x, box!.y + handle.y);
    await page.mouse.down();
    await page.mouse.move(box!.x + t.x, box!.y + t.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        window.__gpxMapController?.getTestState().drawSession?.vertexCount === 2,
    );
    await page.waitForTimeout(2500); // let re-routes land
    const after = await page.evaluate(() =>
      window.__gpxMapController!.getTestState(),
    );
    console.log(
      "after drag — rendered:",
      after.drawSession!.renderedChainCoordinates.length,
      "osrm requests now:",
      osrmRequests,
    );
    await page.screenshot({
      path: OUT.replace(".png", "-dragged.png"),
      fullPage: false,
    });
    console.log("screenshot:", OUT.replace(".png", "-dragged.png"));
  }

  await browser.close();
}

async function fileChooserSetFiles(chooser: import("playwright").FileChooser, path: string) {
  await chooser.setFiles(path);
}

main().catch((error) => {
  console.error("probe failed:", error);
  process.exit(1);
});
