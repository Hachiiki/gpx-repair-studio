import { chromium } from "playwright";
import { join } from "node:path";

/**
 * High-DPI dialog-only crop for visual review: opens the export dialog
 * in its caveat-heavy state (a committed repair on a GPX 1.0 file → the
 * 1.0→1.1 upgrade notice) and screenshots just the dialog element.
 */

const FIXTURES = join(process.cwd(), "src", "features", "gpx", "fixtures", "files");
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
await page.goto("http://localhost:3000");
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
const [fc] = await Promise.all([chooser]);
await fc.setFiles(join(FIXTURES, "valid-1.0.gpx"));
await page.getByTestId("gpx-summary").waitFor();

// One-anchor manual repair to give the dialog content to summarize.
await page.getByTestId("begin-pick-anchor-button").click();
await page.waitForTimeout(300);
const box = await page.locator(".maplibregl-canvas").boundingBox();
const p = await page.evaluate(() =>
  window.__gpxMapController.projectLatLon(47.123456, 11.234567),
);
await page.mouse.click(box.x + p.x, box.y + p.y);
await page.waitForTimeout(500);
await page.getByTestId("snap-toggle").click();
const p2 = await page.evaluate(() =>
  window.__gpxMapController.projectLatLon(47.1239, 11.2351),
);
await page.mouse.click(box.x + p2.x, box.y + p2.y);
await page.waitForTimeout(300);
await page.getByTestId("done-editing-button").click();
await page.waitForTimeout(600);

await page.getByTestId("open-export-button").click();
await page.getByTestId("export-dialog").waitFor();
await page.waitForTimeout(500);
await page
  .locator('[data-testid="export-dialog"]')
  .screenshot({ path: join(process.cwd(), "download", "phase7-dialog-crop.png") });
await browser.close();
console.log("cropped");
