/**
 * Phase 14 — disprove-or-confirm the two VLM claims by measurement:
 *
 *   A. (mobile picker) "Download button below the fold with no
 *      affordance" → measure: is the dialog scrollable and does the
 *      button enter the viewport after one scroll?
 *   B. (TCX workspace) "missing Summary/Stats dashboard" → measure:
 *      do the summary card and stats panel exist, and are they visible?
 *
 * Run against the dev server on :3000.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const checks = [];
const check = (label, ok) => {
  checks.push(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (!ok) process.exitCode = 1;
};

// --- A: mobile dialog scrollability ----------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles("src/features/formats/fixtures/files/ride.tcx");
  await page.getByTestId("gpx-summary").waitFor({ timeout: 15_000 });

  await page.getByTestId("open-export-button").click();
  const dialog = page.getByTestId("export-dialog");
  await dialog.waitFor({ state: "visible" });

  const button = page.getByTestId("export-download-button");
  const before = await button.boundingBox();
  const scrollable = await dialog.evaluate((el) => el.scrollHeight > el.clientHeight);
  check("mobile: dialog is internally scrollable", scrollable);
  check(
    "mobile: download button exists in the DOM",
    before !== null,
  );
  // Scroll the dialog to the bottom; the button must become visible.
  await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(300);
  check("mobile: download button visible after one scroll", await button.isVisible());
  const after = await button.boundingBox();
  check(
    "mobile: download button enters the viewport",
    after !== null && after.y + after.height <= 844,
  );
  await context.close();
}

// --- B: the TCX workspace's summary + stats ---------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles("src/features/formats/fixtures/files/ride.tcx");
  await page.getByTestId("gpx-summary").waitFor({ timeout: 15_000 });

  check("workspace: summary card visible", await page.getByTestId("gpx-summary").isVisible());
  const stats = page.getByTestId("stats-panel");
  const statsVisible = await stats.isVisible().catch(() => false);
  const statsInDom = (await stats.count()) === 1;
  check("workspace: stats panel present", statsInDom);
  if (statsInDom && !statsVisible) {
    // It may live below the fold of the scrollable details column.
    await stats.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    check("workspace: stats panel visible after scroll", await stats.isVisible());
  } else {
    check("workspace: stats panel visible", statsVisible);
  }
  const mapVisible = await page
    .getByTestId("map-canvas")
    .isVisible()
    .catch(() => false);
  check("workspace: map visible", mapVisible);
  await context.close();
}

await browser.close();
console.log(checks.join("\n"));
