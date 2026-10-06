/**
 * Phase 23 VLM-claim measurement (the repo discipline: every critique
 * claim gets measured; a claim is only real if the pixels/DOM say so).
 */
import { chromium } from "@playwright/test";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  localStorage.setItem(
    "gpx-repair-studio.tool-tours.v1",
    JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
  );
});
await page.goto("http://localhost:3000/");
await page.getByText("Repair a recording").first().click();
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(join(FORMAT_FIXTURES, "ride.tcx"));
await page.getByTestId("zones-card").waitFor({ timeout: 20000 });

const results = {};

// --- Claims 1/2 (light+dark zones): Z1/Z5 time cells show a clipped
// vertical bar instead of "0:00" -------------------------------------------
results.zoneZeroRows = await page.evaluate(() => {
  const out = [];
  for (const zone of [1, 5]) {
    const row = document.querySelector(`[data-testid="zone-row-${zone}"]`);
    if (row === null) { out.push({ zone, missing: true }); continue; }
    const cells = [...row.querySelectorAll("td")];
    const timeCell = cells[2]; // Zone | Range | Time | Share
    const text = timeCell?.textContent ?? "";
    const bar = row.querySelector(`[data-testid="zones-bar-${zone}"]`);
    const barBox = bar?.getBoundingClientRect();
    const cellBox = timeCell?.getBoundingClientRect();
    out.push({
      zone,
      text,
      textIncludesTime: /\d+:\d\d/.test(text),
      barWidthPx: barBox ? Math.round(barBox.width * 10) / 10 : null,
      barHeightPx: barBox ? Math.round(barBox.height * 10) / 10 : null,
      barInsideCell:
        barBox && cellBox
          ? barBox.right <= cellBox.right + 0.5 && barBox.left >= cellBox.left - 0.5
          : null,
      cellClipped:
        timeCell && timeCell.scrollWidth > timeCell.clientWidth + 1,
    });
  }
  return out;
});

// --- Claims (metrics chart): line/labels clipped ---------------------------
await page.getByTestId("metrics-chart").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
results.metricsChart = await page.evaluate(() => {
  const svg = document.querySelector('[data-testid="metrics-chart-svg"]');
  const viewBox = svg.viewBox.baseVal;
  const paths = [...svg.querySelectorAll('[data-testid="metrics-series"]')];
  const boxes = paths.map((p) => p.getBBox());
  const labels = [...svg.querySelectorAll("text")];
  const labelBoxes = labels.map((l) => ({ text: l.textContent, box: l.getBBox() }));
  return {
    viewBox: { width: viewBox.width, height: viewBox.height },
    seriesBBoxes: boxes.map((b) => ({
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      right: Math.round((b.x + b.width) * 10) / 10,
      bottom: Math.round((b.y + b.height) * 10) / 10,
    })),
    seriesInsideViewBox: boxes.every(
      (b) =>
        b.x >= -0.5 &&
        b.y >= -0.5 &&
        b.x + b.width <= viewBox.width + 0.5 &&
        b.y + b.height <= viewBox.height + 0.5,
    ),
    yAxisLabels: labelBoxes.filter((l) => /^\d+$/.test(l.text ?? "")),
    labelsInsideViewBox: labelBoxes.every(
      (l) =>
        l.box.x >= -0.5 &&
        l.box.y >= -0.5 &&
        l.box.x + l.box.width <= viewBox.width + 0.5 &&
        l.box.y + l.box.height <= viewBox.height + 0.5,
    ),
  };
});

// --- Claim (settings popover): content cut off / unreachable ----------------
await page.getByTestId("zone-settings-trigger").scrollIntoViewIfNeeded();
await page.getByTestId("zone-settings-trigger").click();
await page.getByTestId("zone-settings-popover").waitFor();
await page.waitForTimeout(300);
results.settingsPopover = await page.evaluate(() => {
  const pop = document.querySelector('[data-testid="zone-settings-popover"]');
  const box = pop.getBoundingClientRect();
  const style = getComputedStyle(pop);
  const toggle = document.querySelector('[data-testid="zone-calories-toggle"]');
  const reachable = toggle.getBoundingClientRect();
  return {
    popoverBottom: Math.round(box.bottom * 10) / 10,
    viewportHeight: innerHeight,
    fitsViewport: box.bottom <= innerHeight + 0.5,
    overflow: style.overflow,
    scrollable: pop.scrollHeight > pop.clientHeight,
    toggleInsidePopoverAndViewport:
      reachable.top >= box.top && reachable.bottom <= Math.min(box.bottom, innerHeight),
    toggleBottom: Math.round(reachable.bottom * 10) / 10,
  };
});
await page.keyboard.press("Escape");

console.log(JSON.stringify(results, null, 2));
await browser.close();
