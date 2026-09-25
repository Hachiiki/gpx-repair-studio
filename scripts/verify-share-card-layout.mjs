import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Live verification of the Task 22 share-card spec revision on the
 * user's real GloryFit file:
 *
 *   - map: the contained route lives inside the fit box (15% padding
 *     inside the map box, route capped at 58% of the card);
 *   - route: two-pass casing — black 16px under orange 10px;
 *   - stack: map box −32px→ logo (270px) −20px→ stats (85% row,
 *     evenly distributed columns, 4px label→value) −28px→ shoe;
 *   - content ends ≈90% (1723.75) and NOTHING is drawn below it.
 *
 *   1. band-probe the live preview canvas (in-page pixels);
 *   2. download the 1× PNG and repeat every probe on the file;
 *   3. screenshots for visual review.
 */

const REAL = join(process.cwd(), "docs", "strava_gpx_original.gpx");
const OUT = join(process.cwd(), "download");
const BASE = "http://localhost:3000";

const W = 1080;
const H = 1920;

// Mirrored from src/lib/share/layout.ts (assert-only — the module
// stays the single source of truth, this cross-checks the pixels).
const PAD = 0.15 * (1080 - 96); // 147.6
const MAP_BOTTOM = 64 + 2 * PAD + 1920 * 0.58; // 1472.8
const BANDS = {
  mapInner: [212, 1325], // the contained route (fit box 211.6→1325.2)
  fitPadGap: [1332, 1500], // 15% padding + 32px map→logo gap: empty
  logo: [1500, 1582], // logo rect 1504.8→1578.6
  stats: [1594, 1652], // stats row 1598.6→1647.75
  gap28: [1652, 1673], // the 28px stats→shoe gap
  icon: [1672, 1726], // shoe slot 1675.75→1723.75
  bottom: [1730, H], // no spacer: content ends ≈90%, nothing below
};
const LOGO_CENTER_Y = 1504.8 + (270 * 164 / 600) / 2; // ≈1541.7
const ICON_CENTER_Y = 1675.75 + 24; // slot center ≈1699.75
const COLUMN_CENTERS = [234, 540, 846]; // thirds of the 918px row
const COLUMN_WINDOWS = COLUMN_CENTERS.map((c) => [c - 100, c + 100]);

const isOrange = (r, g, b, a) => a > 200 && r > 220 && g > 30 && g < 130 && b < 60;
const isWhite = (r, g, b, a) => a > 200 && r > 230 && g > 230 && b > 230;
const isBlack = (r, g, b, a) => a > 200 && r < 40 && g < 40 && b < 40;

/**
 * Classify an RGBA buffer (W×H) into band stats, white bboxes for the
 * logo/icon bands, per-column text counts in the stats band, and the
 * route's orange/black bounding box.
 */
function report(data) {
  const bandStats = {};
  for (const name of Object.keys(BANDS)) {
    bandStats[name] = { white: 0, orange: 0, black: 0 };
  }
  const whiteBBox = { logo: null, icon: null };
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
  let orangeTotal = 0;
  let blackTotal = 0;
  let whiteTotal = 0;
  let routeMinY = H;
  let routeMaxY = 0;
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
      const black = isBlack(r, g, b, a);
      if (white) whiteTotal += 1;
      if (orange) orangeTotal += 1;
      if (black) blackTotal += 1;
      if (orange || black) {
        if (y < routeMinY) routeMinY = y;
        if (y > routeMaxY) routeMaxY = y;
      }
      for (const name of Object.keys(BANDS)) {
        if (!inBand[name]) continue;
        if (white) bandStats[name].white += 1;
        if (orange) bandStats[name].orange += 1;
        if (black) bandStats[name].black += 1;
      }
      if (white) {
        if (inBand.logo) track("logo", x, y);
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
  return {
    bandStats,
    whiteBBox,
    columnCounts,
    orangeTotal,
    blackTotal,
    whiteTotal,
    routeMinY,
    routeMaxY,
  };
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
    `${label}: route painted in orange inside the fit box`,
    bandStats.mapInner.orange > 500,
    `${bandStats.mapInner.orange}px in rows ${BANDS.mapInner}`,
  );
  check(
    `${label}: casing painted black around the route`,
    // A real trace self-overlaps (orange covers black where it
    // crosses itself), so the visible ring sits well under the
    // naive straight-line ratio — 0.15x is presence, not shape.
    bandStats.mapInner.black > bandStats.mapInner.orange * 0.15,
    `${bandStats.mapInner.black}px black vs ${bandStats.mapInner.orange}px orange`,
  );
  check(
    `${label}: casing is a ring, not a slab`,
    an.blackTotal < an.orangeTotal * 1.5,
    `${an.blackTotal}px vs ${an.orangeTotal}px`,
  );
  check(
    `${label}: route confined to the map box (padding zone empty)`,
    bandStats.fitPadGap.orange === 0 && bandStats.fitPadGap.black === 0,
    `orange ${bandStats.fitPadGap.orange}px, black ${bandStats.fitPadGap.black}px in rows ${BANDS.fitPadGap}`,
  );
  check(
    `${label}: route stays within the 58% cap (bottom ≤ 1326)`,
    an.routeMaxY <= 1326,
    `route bottom ${an.routeMaxY}`,
  );
  check(
    `${label}: STRAVA logo in its band`,
    bandStats.logo.white > 300,
    `${bandStats.logo.white}px in rows ${BANDS.logo}`,
  );
  const logo = whiteBBox.logo;
  check(
    `${label}: logo centered on (540, ${LOGO_CENTER_Y.toFixed(0)})`,
    !!logo &&
      Math.abs((logo.minX + logo.maxX) / 2 - 540) < 40 &&
      Math.abs((logo.minY + logo.maxY) / 2 - LOGO_CENTER_Y) < 30,
    logo ? `bbox x ${logo.minX}..${logo.maxX}, y ${logo.minY}..${logo.maxY}` : "no bbox",
  );
  check(
    `${label}: stats row in its band`,
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
    `${label}: 28px gap between stats and shoe (no white)`,
    bandStats.gap28.white === 0,
    `${bandStats.gap28.white}px in rows ${BANDS.gap28}`,
  );
  check(
    `${label}: shoe icon in its band`,
    bandStats.icon.white > 200,
    `${bandStats.icon.white}px in rows ${BANDS.icon}`,
  );
  const icon = whiteBBox.icon;
  check(
    `${label}: icon centered on (540, ${ICON_CENTER_Y.toFixed(0)})`,
    !!icon &&
      Math.abs((icon.minX + icon.maxX) / 2 - 540) < 40 &&
      Math.abs((icon.minY + icon.maxY) / 2 - ICON_CENTER_Y) < 25,
    icon ? `bbox x ${icon.minX}..${icon.maxX}, y ${icon.minY}..${icon.maxY}` : "no bbox",
  );
  check(
    `${label}: content ends ≈90% — nothing below the shoe`,
    bandStats.bottom.white === 0 &&
      bandStats.bottom.orange === 0 &&
      bandStats.bottom.black === 0,
    `white ${bandStats.bottom.white}px, orange ${bandStats.bottom.orange}px, black ${bandStats.bottom.black}px in rows ${BANDS.bottom}`,
  );
  check(
    `${label}: nothing drawn right of the stack bounds either side`,
    an.routeMaxY <= MAP_BOTTOM,
    `route max y ${an.routeMaxY} vs map bottom ${MAP_BOTTOM}`,
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
      const isBlack = (r, g, b, a) => a > 200 && r < 40 && g < 40 && b < 40;
      const bandStats = {};
      for (const name of Object.keys(BANDS)) bandStats[name] = { white: 0, orange: 0, black: 0 };
      const whiteBBox = { logo: null, icon: null };
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
      let orangeTotal = 0;
      let blackTotal = 0;
      let routeMinY = H;
      let routeMaxY = 0;
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
          const black = isBlack(r, g, b, a);
          if (orange) orangeTotal += 1;
          if (black) blackTotal += 1;
          if (orange || black) {
            if (y < routeMinY) routeMinY = y;
            if (y > routeMaxY) routeMaxY = y;
          }
          for (const name of Object.keys(BANDS)) {
            if (!inBand[name]) continue;
            if (white) bandStats[name].white += 1;
            if (orange) bandStats[name].orange += 1;
            if (black) bandStats[name].black += 1;
          }
          if (white) {
            if (inBand.logo) track("logo", x, y);
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
      return {
        w: canvas.width,
        h: canvas.height,
        bandStats,
        whiteBBox,
        columnCounts,
        orangeTotal,
        blackTotal,
        routeMinY,
        routeMaxY,
      };
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
  .screenshot({ path: join(OUT, "share-card-spec-rev.png") });

// --- 2. The 1× download: the file is the contract. ---
console.log("\n2) Download 1× — the exported PNG");
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByTestId("share-download").click(),
]);
const pngPath = join(OUT, "share-card-spec-rev-1x.png");
writeFileSync(pngPath, readFileSync(await download.path()));
const decoded = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
if (decoded.info.width !== W || decoded.info.height !== H) {
  console.error(`unexpected PNG size ${decoded.info.width}×${decoded.info.height}`);
  process.exit(1);
}
const pngAnalysis = report(decoded.data);
assertLayout(pngAnalysis, "export");

await page.screenshot({
  path: join(OUT, "share-card-spec-rev-desktop.png"),
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
