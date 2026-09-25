import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Live verification of the share-card LAYOUT CORRECTION (Task 20
 * follow-up) on the user's real GloryFit file.
 *
 * The brief: only positions move. The route must stay EXACTLY as it
 * is (orange pixels identical to the previous export), while the
 * STRAVA logo centers on the 65% line, the stats row hangs
 * compactly below it, and the shoe icon centers on the 80% line —
 * with the reference's clear gap and nothing bottom-anchored.
 *
 *   1. band-probe the live preview canvas (in-page pixels);
 *   2. download the 1× PNG and repeat every probe on the file;
 *   3. route identity: orange masks of the OLD export (before the
 *      fix) and the NEW one must match pixel-for-pixel;
 *   4. screenshots for visual review.
 */

const REAL = join(process.cwd(), "docs", "strava_gpx_original.gpx");
const OLD_PNG = join(process.cwd(), "download", "share-card-live-1x.png");
const OUT = join(process.cwd(), "download");
const BASE = "http://localhost:3000";

const W = 1080;
const H = 1920;

// Mirrored from src/lib/share/layout.ts (assert-only — the module
// stays the single source of truth, this cross-checks the pixels).
const LOGO_CENTER_Y = H * 0.65; // 1248
const ICON_CENTER_Y = H * 0.8; // 1536
const BANDS = {
  logo: [1200, 1295], // logo rect: 1209.7 .. 1286.3
  stats: [1300, 1365], // stats row: 1310.3 .. 1355.4
  gap: [1380, 1505], // the reference's clear gap
  icon: [1506, 1570], // icon rect: 1512.2 .. 1559.8
  bottom: [1575, H], // empty: nothing is bottom-anchored anymore
};
const COLUMN_WINDOWS = [
  [204 - 120, 204 + 120],
  [540 - 120, 540 + 120],
  [876 - 120, 876 + 120],
];
const COLUMN_CENTERS = [204, 540, 876];

const isOrange = (r, g, b, a) => a > 200 && r > 220 && g > 30 && g < 130 && b < 60;
const isWhite = (r, g, b, a) => a > 200 && r > 230 && g > 230 && b > 230;

/**
 * Classify an RGBA buffer (W×H) into band stats, white bboxes per
 * tracked band, column-window counts, totals — and an orange mask.
 */
function report(data) {
  const bandStats = {};
  for (const name of Object.keys(BANDS)) bandStats[name] = { white: 0, orange: 0 };
  const whiteBBox = { logo: null, stats: null, icon: null };
  const track = (name, x, y) => {
    const bb = whiteBBox[name];
    if (bb === null) {
      whiteBBox[name] = { minX: x, maxX: x, minY: y, maxY: y };
    } else {
      if (x < bb.minX) bb.minX = x;
      if (x > bb.maxX) bb.maxX = x;
      if (y < bb.minY) bb.minY = y;
      if (y > bb.maxY) bb.maxY = y;
    }
  };
  const columnCounts = [0, 0, 0];
  const orangeMask = new Uint8Array(W * H);
  let whiteTotal = 0;
  let orangeTotal = 0;
  for (let y = 0; y < H; y += 1) {
    const inBand = {};
    for (const [name, [y0, y1]] of Object.entries(BANDS)) {
      inBand[name] = y >= y0 && y < y1;
    }
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const white = isWhite(r, g, b, a);
      const orange = isOrange(r, g, b, a);
      if (white) whiteTotal += 1;
      if (orange) {
        orangeTotal += 1;
        orangeMask[y * W + x] = 1;
      }
      for (const name of Object.keys(BANDS)) {
        if (!inBand[name]) continue;
        if (white) bandStats[name].white += 1;
        if (orange) bandStats[name].orange += 1;
      }
      if (white) {
        if (inBand.logo) track("logo", x, y);
        if (inBand.stats) track("stats", x, y);
        if (inBand.icon) track("icon", x, y);
        if (inBand.stats) {
          for (let c = 0; c < 3; c += 1) {
            const [x0, x1] = COLUMN_WINDOWS[c];
            if (x >= x0 && x < x1) columnCounts[c] += 1;
          }
        }
      }
    }
  }
  return { bandStats, whiteBBox, columnCounts, orangeMask, whiteTotal, orangeTotal };
}

const failures = [];
const check = (name, ok, detail = "") => {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

function assertLayout(an, label) {
  const { bandStats, whiteBBox, columnCounts } = an;
  check(
    `${label}: route painted in the top 60% (orange ≥ 500)`,
    an.orangeTotal >= 500,
    `${an.orangeTotal}px`,
  );
  check(
    `${label}: STRAVA logo on the 65% line (white in band)`,
    bandStats.logo.white > 300,
    `${bandStats.logo.white}px in rows ${BANDS.logo}`,
  );
  const logo = whiteBBox.logo;
  check(
    `${label}: logo centered on (540, ${LOGO_CENTER_Y})`,
    !!logo &&
      Math.abs((logo.minX + logo.maxX) / 2 - 540) < 40 &&
      Math.abs((logo.minY + logo.maxY) / 2 - LOGO_CENTER_Y) < 30,
    logo ? `bbox x ${logo.minX}..${logo.maxX}, y ${logo.minY}..${logo.maxY}` : "no bbox",
  );
  check(
    `${label}: stats row below the logo (white in band)`,
    bandStats.stats.white > 100,
    `${bandStats.stats.white}px in rows ${BANDS.stats}`,
  );
  for (let c = 0; c < 3; c += 1) {
    check(
      `${label}: stats column ${c + 1} has text near x ${COLUMN_CENTERS[c]}`,
      columnCounts[c] > 30,
      `${columnCounts[c]}px`,
    );
  }
  check(
    `${label}: clear gap between values and shoe (no white)`,
    bandStats.gap.white === 0,
    `${bandStats.gap.white}px in rows ${BANDS.gap}`,
  );
  check(
    `${label}: shoe icon on the 80% line (white in band)`,
    bandStats.icon.white > 200,
    `${bandStats.icon.white}px in rows ${BANDS.icon}`,
  );
  const icon = whiteBBox.icon;
  check(
    `${label}: icon centered on (540, ${ICON_CENTER_Y})`,
    !!icon &&
      Math.abs((icon.minX + icon.maxX) / 2 - 540) < 40 &&
      Math.abs((icon.minY + icon.maxY) / 2 - ICON_CENTER_Y) < 30,
    icon ? `bbox x ${icon.minX}..${icon.maxX}, y ${icon.minY}..${icon.maxY}` : "no bbox",
  );
  check(
    `${label}: nothing bottom-anchored (band below icon empty)`,
    bandStats.bottom.white === 0 && bandStats.bottom.orange === 0,
    `white ${bandStats.bottom.white}px, orange ${bandStats.bottom.orange}px`,
  );
}

const browser = await chromium.launch();

// --- 1. The live session on the real file. ---
console.log("\n1) Desktop 1440×900 — real GloryFit file, share mode");
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE);
await page.getByTestId("landing-mode-share").click();
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
await (await chooser).setFiles(REAL);
await page.getByTestId("share-section").waitFor();

// Wait for the painter (fonts, then draw), computing the report
// in-page so only the small summary crosses the bridge.
const pageReport = () =>
  page.evaluate(
    ({ W, H, BANDS, COLUMN_WINDOWS }) => {
      const canvas = document.querySelector('[data-testid="share-card-canvas"]');
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const isOrange = (r, g, b, a) => a > 200 && r > 220 && g > 30 && g < 130 && b < 60;
      const isWhite = (r, g, b, a) => a > 200 && r > 230 && g > 230 && b > 230;
      const bandStats = {};
      for (const name of Object.keys(BANDS)) bandStats[name] = { white: 0, orange: 0 };
      const whiteBBox = { logo: null, stats: null, icon: null };
      const track = (name, x, y) => {
        const bb = whiteBBox[name];
        if (bb === null) whiteBBox[name] = { minX: x, maxX: x, minY: y, maxY: y };
        else {
          if (x < bb.minX) bb.minX = x;
          if (x > bb.maxX) bb.maxX = x;
          if (y < bb.minY) bb.minY = y;
          if (y > bb.maxY) bb.maxY = y;
        }
      };
      const columnCounts = [0, 0, 0];
      let whiteTotal = 0;
      let orangeTotal = 0;
      for (let y = 0; y < H; y += 1) {
        const inBand = {};
        for (const [name, [y0, y1]] of Object.entries(BANDS)) {
          inBand[name] = y >= y0 && y < y1;
        }
        for (let x = 0; x < W; x += 1) {
          const i = (y * W + x) * 4;
          const r = image.data[i];
          const g = image.data[i + 1];
          const b = image.data[i + 2];
          const a = image.data[i + 3];
          const white = isWhite(r, g, b, a);
          const orange = isOrange(r, g, b, a);
          if (white) whiteTotal += 1;
          if (orange) orangeTotal += 1;
          for (const name of Object.keys(BANDS)) {
            if (!inBand[name]) continue;
            if (white) bandStats[name].white += 1;
            if (orange) bandStats[name].orange += 1;
          }
          if (white) {
            if (inBand.logo) track("logo", x, y);
            if (inBand.stats) track("stats", x, y);
            if (inBand.icon) track("icon", x, y);
            if (inBand.stats) {
              for (let c = 0; c < 3; c += 1) {
                const [x0, x1] = COLUMN_WINDOWS[c];
                if (x >= x0 && x < x1) columnCounts[c] += 1;
              }
            }
          }
        }
      }
      return { w: canvas.width, h: canvas.height, bandStats, whiteBBox, columnCounts, whiteTotal, orangeTotal };
    },
    { W, H, BANDS, COLUMN_WINDOWS },
  );

let preview = null;
for (let tries = 0; tries < 100; tries += 1) {
  preview = await pageReport();
  if (preview && preview.w === W && preview.h === H && preview.orangeTotal > 100) break;
  await page.waitForTimeout(200);
}
if (!preview || preview.w !== W || preview.h !== H) {
  console.error("card never painted at 1080×1920");
  process.exit(1);
}
assertLayout(preview, "preview");

await page
  .locator('[data-testid="share-card-canvas"]')
  .screenshot({ path: join(OUT, "share-card-layout-fixed.png") });

// --- 2. The 1× download: the file is the contract. ---
console.log("\n2) Download 1× — the exported PNG");
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByTestId("share-download").click(),
]);
const pngPath = join(OUT, "share-card-layout-fixed-1x.png");
writeFileSync(pngPath, readFileSync(await download.path()));
const decoded = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
if (decoded.info.width !== W || decoded.info.height !== H) {
  console.error(`unexpected PNG size ${decoded.info.width}×${decoded.info.height}`);
  process.exit(1);
}
const pngAnalysis = report(decoded.data);
assertLayout(pngAnalysis, "export");

// --- 3. Route identity: old vs new orange masks. ---
console.log("\n3) Route identity — orange pixels before vs after the fix");
const oldDecoded = await sharp(OLD_PNG).raw().toBuffer({ resolveWithObject: true });
if (oldDecoded.info.width !== W || oldDecoded.info.height !== H) {
  console.error(`old PNG has unexpected size ${oldDecoded.info.width}×${oldDecoded.info.height}`);
  process.exit(1);
}
const oldAnalysis = report(oldDecoded.data);
let maskDiff = 0;
for (let p = 0; p < W * H; p += 1) {
  if (oldAnalysis.orangeMask[p] !== pngAnalysis.orangeMask[p]) maskDiff += 1;
}
check(
  "route is identical to the previous export",
  maskDiff === 0,
  `${maskDiff} differing orange pixels (old ${oldAnalysis.orangeTotal}px / new ${pngAnalysis.orangeTotal}px)`,
);
check(
  "the UI cluster did move (white pixels differ)",
  pngAnalysis.whiteTotal !== oldAnalysis.whiteTotal,
  `old ${oldAnalysis.whiteTotal}px white / new ${pngAnalysis.whiteTotal}px white`,
);
check(
  "the fix is real: 65% band was empty before, holds the logo now",
  oldAnalysis.bandStats.logo.white === 0 && pngAnalysis.bandStats.logo.white > 300,
  `before ${oldAnalysis.bandStats.logo.white}px / after ${pngAnalysis.bandStats.logo.white}px in rows ${BANDS.logo}`,
);

await page.screenshot({
  path: join(OUT, "share-card-layout-fixed-desktop.png"),
  fullPage: true,
});
await page.close();
await browser.close();

console.log(
  failures.length === 0
    ? "\nALL LAYOUT CHECKS PASSED"
    : `\n${failures.length} CHECK(S) FAILED: ${failures.join(", ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
