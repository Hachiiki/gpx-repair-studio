import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

/**
 * QoL workspace-layout E2E — the two-section redesign:
 *
 *   1. section 1 "Repair": tall map with the tool rail + sticky tools
 *      panel side by side on desktop;
 *   2. the scroll cue navigates to section 2 "Details";
 *   3. statistics and file details render there and stay reachable;
 *   4. the header section nav links work.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

async function upload(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const [file] = await Promise.all([chooser]);
  await file.setFiles(join(FIXTURES, "time-gap.gpx"));
}

test("workspace: map-first layout with a sticky tools column", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await page.getByTestId("gpx-summary").waitFor();

  // Section 1 exists and hosts the map and the tools side by side (lg+).
  const repair = page.getByTestId("repair-section");
  await expect(repair).toBeVisible();
  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await expect(page.getByTestId("tools-panel")).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1024) {
    const mapBox = await page.getByTestId("map-canvas").boundingBox();
    const toolsBox = await page.getByTestId("tools-panel").boundingBox();
    expect(mapBox).not.toBeNull();
    expect(toolsBox).not.toBeNull();
    // The map dominates: wider than the tools column and taller than
    // the old fixed 540 px panel (viewport-tall minus the sticky header).
    expect(mapBox!.width).toBeGreaterThan(toolsBox!.width);
    expect(mapBox!.height).toBeGreaterThan(500);
  }
});

test("workspace: the scroll cue leads to statistics and details", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await page.getByTestId("gpx-summary").waitFor();

  // The details section starts below the fold.
  const cue = page.getByTestId("scroll-cue");
  await expect(cue).toBeVisible();
  await cue.click();
  await page.waitForURL(/#details/);

  // Section 2 content renders and is on screen.
  await expect(page.getByTestId("details-section")).toBeVisible();
  const stats = page.getByTestId("stats-panel");
  await expect(stats).toBeVisible();
  await expect(stats).toBeInViewport();
  await expect(page.getByTestId("gpx-summary")).toBeInViewport();

  // The back link returns to the map section.
  await page.getByTestId("back-to-map-link").click();
  await page.waitForURL(/#repair/);
  await expect(page.getByTestId("map-canvas")).toBeInViewport();
});

test("workspace: header section nav jumps straight to statistics", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await page.getByTestId("gpx-summary").waitFor();

  await page
    .getByRole("link", { name: "Statistics", exact: true })
    .click();
  await page.waitForURL(/#details/);
  await expect(page.getByTestId("stats-panel")).toBeInViewport();
});
