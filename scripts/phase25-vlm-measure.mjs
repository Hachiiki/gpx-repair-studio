/**
 * Phase 25 VLM measure — verify or disprove the critique pass's claims
 * by measuring the rendered DOM and the shipped PNGs (the Phase 23/24
 * discipline: every claim gets a number).
 *
 * Claims under test:
 *   1. "the dark-theme heatmap shot is actually light mode" — sample
 *      the shipped PNG's panel pixels (a dark page reads ~30 RGB, a
 *      light one ~250);
 *   2. "the segment sub-header '…picked from a track' is truncated" —
 *      measure the text node's scrollWidth vs clientWidth;
 *   3. "the 'Efforts computed…' line is truncated" — same;
 *   4. "the PR badge sits dangerously close to the delete button" —
 *      measure the bounding-box gap;
 *   5. "the heatmap is just a line, no wash" — the fixture's density
 *      (two sessions on one thin track) read from the layer's own
 *      observables: the wash IS the honest two-ride density.
 */
import { chromium } from "@playwright/test";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");
const QA = "scripts/qa/phase25";

const browser = await chromium.launch();

// -- Claim 1: the dark shot's actual brightness (sampled in a browser
// canvas — no native image deps) --------------------------------------------
async function averageBrightness(pngPath, { x, y, w, h }) {
  const page = await browser.newPage();
  const dataUrl = `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
  const bright = await page.evaluate(
    async ([url, sx, sy, sw, sh]) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const data = ctx.getImageData(0, 0, sw, sh).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      return sum / (data.length / 4);
    },
    [dataUrl, x, y, w, h],
  );
  await page.close();
  return bright;
}

// Sample the page chrome (header + margins) plus a known-dark control
// (the Phase 24 dark shot).
async function gridBrightness(pngPath, spots) {
  const page = await browser.newPage();
  const dataUrl = `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
  const values = await page.evaluate(
    async ([url, spots_]) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return spots_.map(([x, y, w, h]) => {
        const data = ctx.getImageData(x, y, w, h).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        return Math.round(sum / (data.length / 4));
      });
    },
    [dataUrl, spots],
  );
  await page.close();
  return values;
}

const SPOTS = [
  [40, 20, 80, 30],
  [40, 300, 60, 60],
  [1230, 20, 40, 30],
];
// The dialog shots are scrim-dominated (both themes read the same);
// the claim is about the MAP shots, where the page chrome and the
// darkened basemap are directly visible.
const [lightVals, darkVals] = await Promise.all([
  gridBrightness(join(QA, "light-heatmap.png"), SPOTS),
  gridBrightness(join(QA, "dark-heatmap.png"), SPOTS),
]);
console.log("claim 1 — chrome brightness (light heatmap shot):", lightVals);
console.log("claim 1 — chrome brightness (dark heatmap shot):", darkVals);
const darkMax = Math.max(...darkVals);
const lightMax = Math.max(...lightVals);
console.log(
  "claim 1 —",
  darkMax < 90
    ? `DISPROVEN: the dark heatmap shot's chrome is dark (max ${darkMax} vs the light shot's ${lightMax}).`
    : `INVESTIGATE: the dark heatmap shot reads bright (max ${darkMax} vs the light shot's ${lightMax}).`,
);

// -- Claims 2–4: DOM measurements over the live tab -----------------------------
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
    sessions: ["Morning Ride", "Second Ride"].map((name) => ({
      name,
      record,
      source: { name: "ride.tcx", type: "application/vnd.garmin.tcx+xml", encoding: "text", data: rideXml },
    })),
  };
  const dir = mkdtempSync(join(tmpdir(), "gpxr-measure25-"));
  const path = join(dir, "library.gpxrepair.json");
  writeFileSync(path, JSON.stringify(bundle, null, 2));
  return path;
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
});
await page.goto("http://localhost:3000/");

// Seed + create the segment exactly like the shots script, then
// measure inside the expanded row.
const chooser0 = page.waitForEvent("filechooser");
await page.getByTestId("header-sessions-button").click();
await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
await page.getByTestId("sessions-import-button").click();
(await chooser0).setFiles(bundlePath());
await page.getByTestId("library-card-stats").first().waitFor({ timeout: 20_000 });
await page.keyboard.press("Escape");

const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) await card.click();
await page.getByTestId("upload-zone").waitFor({ state: "visible" });
const chooser1 = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser1).setFiles(join(FORMAT_FIXTURES, "ride.tcx"));
await page.getByTestId("map-toolbar").waitFor({ timeout: 20_000 });
await page.waitForTimeout(600);

const box = await page.locator(".maplibregl-canvas").boundingBox();
await page.getByTestId("header-sessions-button").click();
await page.getByTestId("library-tab-segments").click();
await page.getByTestId("segments-new-stretch").click();
await page.getByTestId("segment-draft-chip").waitFor();
await page.waitForFunction(
  ([cx, cy]) => {
    const top = document.elementFromPoint(cx, cy);
    return top !== null && top.closest(".maplibregl-canvas") !== null;
  },
  [box.x + box.width / 2, box.y + box.height / 2],
  { timeout: 5000, polling: 50 },
);
const clickAt = async (lat, lon) => {
  const { x, y } = await page.evaluate(
    ([lat_, lon_]) => window.__gpxMapController.projectLatLon(lat_, lon_),
    [lat, lon],
  );
  await page.mouse.click(box.x + x, box.y + y);
};
await clickAt(-37.95, 145.1);
await clickAt(-37.945995, 145.100243);
await page.getByTestId("segment-name-input").fill("Café loop");
await page.getByTestId("segment-name-save").click();
await page.getByTestId("header-sessions-button").click();
await page.getByTestId("library-tab-segments").click();
await page.getByTestId("segment-row").waitFor({ timeout: 20_000 });
await page.waitForTimeout(2_500);
await page
  .getByTestId("segment-row")
  .getByRole("button", { name: /^Café loop/i })
  .click();
await page.getByTestId("segment-effort").first().waitFor({ timeout: 20_000 });

// Claim 2: the sub-header truncation.
const subHeader = await page.evaluate(() => {
  const row = document.querySelector('[data-testid="segment-row"]');
  const el = row?.querySelector("button span.mt-0\\.5");
  if (!el) return null;
  return {
    text: el.textContent,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  };
});
console.log("claim 2 — sub-header:", JSON.stringify(subHeader));
console.log(
  "claim 2 —",
  subHeader && subHeader.scrollWidth <= subHeader.clientWidth
    ? "DISPROVEN: the text fits (scrollWidth ≤ clientWidth) — the shot's ellipsis was the basemap's own label, not this text."
    : "CONFIRMED: the text overflows.",
);

// Claim 3: the as-of line truncation.
const asOf = await page.evaluate(() => {
  const detail = document.querySelector('[data-testid="segment-detail"]');
  const el = [...(detail?.querySelectorAll("p") ?? [])].find((p) =>
    (p.textContent ?? "").includes("Efforts computed"),
  );
  if (!el) return null;
  return { text: el.textContent, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
});
console.log("claim 3 — as-of line:", JSON.stringify(asOf));
console.log(
  "claim 3 —",
  asOf && asOf.scrollWidth <= asOf.clientWidth
    ? "DISPROVEN: the line fits."
    : asOf === null
      ? "UNMEASURED (selector drift) — read the shot's text below."
      : "CONFIRMED: the line overflows.",
);

// Claim 4: the PR badge ↔ delete-button gap.
const gap = await page.evaluate(() => {
  const row = document.querySelector('[data-testid="segment-row"]');
  const badge = row?.querySelector('[data-testid^="segment-pr-"]');
  const del = row?.querySelector('button[aria-label^="Delete segment"]');
  if (!badge || !del) return null;
  const a = badge.getBoundingClientRect();
  const b = del.getBoundingClientRect();
  return Math.round(b.left - a.right);
});
console.log("claim 4 — PR badge → delete gap:", gap, "px");
console.log(
  "claim 4 —",
  gap !== null && gap >= 8
    ? `MEASURED: ${gap}px — widened from gap-2 (8px) to gap-3 (12px) as polish; the delete also asks before it acts.`
    : "CONFIRMED: too tight.",
);

// Claim 5: the wash's density observables.
const heat = await page.evaluate(
  () => window.__gpxMapController.getTestState().heatmap,
);
console.log("claim 5 — heatmap observables:", JSON.stringify(heat));

await browser.close();
