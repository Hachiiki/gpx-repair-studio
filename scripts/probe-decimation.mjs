#!/usr/bin/env node
// Verify decimation: rendered coords at fit zoom, full res on zoom-in.
import { chromium } from "playwright";
import { join } from "node:path";

const FILE = join(process.cwd(), "e2e", "fixtures", "synthetic-100k.generated.gpx");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3000/");
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) {
  await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(FILE);
await page.getByTestId("gpx-summary").waitFor({ state: "visible", timeout: 60_000 });
await page.waitForTimeout(3000);

const bridge = () =>
  page.evaluate(() => {
    const s = window.__gpxMapController.getTestState();
    return {
      zoom: s.zoom,
      features: s.routeFeatureCount,
      rendered: s.routeRenderedCoords,
      stride: s.routeStride,
    };
  });

console.log("at fit zoom:", JSON.stringify(await bridge()));

// Zoom in hard — stride should drop toward 1 (bands rebuild on zoomend).
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.__gpxMapController.zoomIn());
  await page.waitForTimeout(600);
}
const zoomedIn = await bridge();
console.log("after zoom-in x6:", JSON.stringify(zoomedIn));

await page.evaluate(() => window.__gpxMapController.zoomOut());
await page.waitForTimeout(600);
const zoomedBack = await bridge();
console.log("after one zoom-out:", JSON.stringify(zoomedBack));
await browser.close();
