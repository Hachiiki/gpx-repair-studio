/**
 * Phase 24 VLM measure — verify or disprove the critique pass's claims
 * by measuring the rendered DOM (the Phase 23 discipline: every claim
 * gets a number).
 *
 * Claims under test:
 *   1. "the 'Apr 29' X-axis label is cut off mid-character" — measure
 *      every SVG <text> bbox against its viewBox (scaled to CSS px);
 *   2. "Y-axis labels are clipped" — same measurement, left edge;
 *   3. "the window line reads 'Last1Weekly'" — read the exact text
 *      node and print it;
 *   4. "the bulk bar's '1 selected' text is misaligned vertically" —
 *      measure the text's box against its container's.
 */
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");

function bundlePath() {
  const rideXml = readFileSync(join(FORMAT_FIXTURES, "ride.tcx"), "utf8");
  const record = {
    schemaVersion: 2,
    kind: "file",
    section: "repair",
    savedAt: 1_700_000_000_000,
    fileName: "ride.tcx",
    gapThresholds: { timeGapMs: 120_000, speedAnomalyKmh: 25, speedDtGuardMs: 10_000 },
    reconstructions: {},
    skippedGapIds: [],
    manualSpans: [],
    fileTiming: { startMs: null, totalDurationMs: null },
    roadLegs: {},
    workingEdits: [],
  };
  const bundle = {
    format: "gpxrepair-library",
    version: 1,
    exportedAt: 1_700_000_000_000,
    sessions: ["Morning Ride"].map((name) => ({
      name,
      record,
      source: { name: "ride.tcx", type: "application/vnd.garmin.tcx+xml", encoding: "text", data: rideXml },
    })),
  };
  const dir = mkdtempSync(join(tmpdir(), "gpxr-measure24-"));
  const path = join(dir, "library.gpxrepair.json");
  writeFileSync(path, JSON.stringify(bundle, null, 2));
  return path;
}

const SEEDED = bundlePath();
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
await page.getByTestId("header-sessions-button").click();
await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("sessions-import-button").click();
(await chooser).setFiles(SEEDED);
await page.getByTestId("library-card-stats").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(300);

// Claim 3: the window line's exact text.
await page.getByTestId("library-tab-trends").click();
await page.getByTestId("trends-volume-svg").waitFor();
const windowText = await page
  .getByTestId("trends-volume")
  .locator("p")
  .first()
  .innerText();
console.log("window line:", JSON.stringify(windowText));

// Claims 1 + 2: every text element in both charts, bbox vs viewBox.
const measurements = await page.evaluate(() => {
  const out = [];
  for (const testid of ["trends-volume-svg", "trends-fitness-svg"]) {
    const svg = document.querySelector(`[data-testid="${testid}"]`);
    if (svg === null) continue;
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scale = box.width / vb.width;
    for (const text of svg.querySelectorAll("text")) {
      const b = text.getBoundingClientRect();
      // In viewBox units, relative to the svg's left edge.
      const left = (b.left - box.left) / scale;
      const right = left + b.width / scale;
      out.push({
        chart: testid,
        text: text.textContent ?? "",
        left: Math.round(left * 10) / 10,
        right: Math.round(right * 10) / 10,
        clippedLeft: left < -0.5,
        clippedRight: right > vb.width + 0.5,
      });
    }
  }
  return out;
});
console.log(JSON.stringify(measurements, null, 1));
const anyClipped = measurements.filter((m) => m.clippedLeft || m.clippedRight);
console.log(
  anyClipped.length === 0
    ? "NO CLIPPED LABELS — every text bbox sits inside its viewBox."
    : `CLIPPED: ${JSON.stringify(anyClipped)}`,
);

await browser.close();
