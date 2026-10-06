/**
 * Phase 23 VLM sweep — screenshots of the new surfaces (zones card,
 * metrics chart, settings popover) in both themes, saved under
 * scripts/qa/phase23/ for the VLM critique pass.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");
const OUT = "scripts/qa/phase23";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(theme, name, action) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript((t) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem(
      "gpx-repair-studio.tool-tours.v1",
      JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
    );
    localStorage.setItem("gpx-repair-studio.theme.v1", JSON.stringify({ state: { theme: t }, version: 0 }));
  }, theme);
  await page.goto("http://localhost:3000/");
  await page.getByText("Repair a recording").first().click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles(join(FORMAT_FIXTURES, "ride.tcx"));
  await page.getByTestId("zones-card").waitFor({ timeout: 20000 });
  await action(page);
  await page.screenshot({ path: join(OUT, `${theme}-${name}.png`), fullPage: false });
  await page.close();
}

await shot("light", "zones-hr", async (page) => {
  await page.getByTestId("zones-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
});
await shot("dark", "zones-hr", async (page) => {
  await page.getByTestId("zones-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
});
await shot("light", "metrics-chart", async (page) => {
  await page.getByTestId("metrics-chart").scrollIntoViewIfNeeded();
  await page.getByTestId("metrics-chart-svg").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
});
await shot("dark", "metrics-chart", async (page) => {
  await page.getByTestId("metrics-chart").scrollIntoViewIfNeeded();
  await page.getByTestId("metrics-tab-power").click();
  await page.waitForTimeout(200);
});
await shot("light", "zone-settings", async (page) => {
  await page.getByTestId("zone-settings-trigger").scrollIntoViewIfNeeded();
  await page.getByTestId("zone-settings-trigger").click();
  await page.getByTestId("zone-settings-popover").waitFor();
  await page.waitForTimeout(300);
});
await shot("dark", "zones-pace", async (page) => {
  await page.getByTestId("zones-tab-pace").click();
  await page.getByTestId("zones-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
});

await browser.close();
console.log("screenshots saved to", OUT);
