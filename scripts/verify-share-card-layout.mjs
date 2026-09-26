import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Live verification of the Task 23 share-card spec on the user's real
 * GloryFit file — every anchor measured from the reference card:
 *
 *   - route: the visible drawing (geometry + 16px casing) stays inside
 *     x 64–1012, y 219–1190 (contain, centered, aspect preserved);
 *   - STRAVA wordmark: ink exactly 330×55, top 1280, centered;
 *   - stats: row 1422–1515, columns at x 220 / 540 / 857;
 *   - shoe: 104px slot at 1605, ink contained and centered;
 *   - solid #000000 background — fully opaque, nothing transparent;
 *   - the vertical rhythm: 90 / 87 / ~90 gaps, ~211px empty below.
 *
 * On the black background the casing is invisible (black on black),
 * so the route's bounds are probed via the ORANGE pass only — the
 * geometry math (fit box inset by the casing half-width) is pinned
 * by unit tests instead.
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
const ROUTE_BOX = { x: 64, y: 219, width: 948, height: 971 }; // visible
const LOGO_INK = { x: 375, y: 1280, width: 330, height: 55 };
const STATS_TOP = 1422;
const STATS_BOTTOM = 1422 + 29 * 1.25 + 9 + 40 * 1.2; // 1515.25
const ICON_SLOT = { x: 488, y: 1605, size: 104 };
const CONTENT_BOTTOM = 1709;

const BANDS = {
  route: [219, 1190], // the route's visible box
  gapRouteLogo: [1191, 1279], // the 90px gap: empty of white/orange
  logo: [1280, 1336], // the wordmark's 330×55 ink
  gapLogoStats: [1337, 1421], // the 87px gap
  stats: [1422, 1516], // label + value lines
  gapStatsIcon: [1517, 1604], // the ~90px gap
  icon: [1605, 1710], // the shoe's 104px slot
  bottom: [1710, H], // ~211px of pure background
};
const COLUMN_CENTERS = [220, 540, 857];
const COLUMN_WINDOWS = COLUMN_CENTERS.map((c) => [c - 90, c + 90]);

const isOrange = (r, g, b, a) => a > 200 && r > 220 && g > 30 && g < 130 && b < 60;
const isWhite = (r, g, b, a) => a > 200 && r > 230 && g > 230 && b > 230;

/**
 * Classify an RGBA buffer (W×H): band stats, white bboxes for the
 * logo/icon bands, per-column text counts in the stats band, the
 * route's orange bounding box, and the global opacity census.
 */
function report(data) {
  const bandStats = {};
  for (const name of Object.keys(BANDS)) {
    bandStats[name] = { white: 0, orange: 0 };
  }
  const whiteBBox = { logo: null, icon: null, stats: null };
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
  let whiteTotal = 0;
  let transparent = 0;
  let routeMinX = W;
  let routeMaxX = 0;
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
      if (a < 16) transparent += 1;
      const white = isWhite(r, g, b, a);
      const orange = isOrange(r, g, b, a);
      if (white) whiteTotal += 1;
      if (orange) orangeTotal += 1;
      if (orange) {
        if (x < routeMinX) routeMinX = x;
        if (x > routeMaxX) routeMaxX = x;
        if (y < routeMinY) routeMinY = y;
        if (y > routeMaxY) routeMaxY = y;
      }
      for (const name of Object.keys(BANDS)) {
        if (!inBand[name]) continue;
        if (white) bandStats[name].white += 1;
        if (orange) bandStats[name].orange += 1;
      }
      if (white) {
        if (inBand.logo) track("logo", x, y);
        if (inBand.icon) track("icon", x, y);
        if (inBand.stats) {
          track("stats", x, y);
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
    whiteTotal,
    transparent,
    routeBBox:
      orangeTotal > 0
        ? { minX: routeMinX, maxX: routeMaxX, minY: routeMinY, maxY: routeMaxY }
        : null,
  };
}

const failures = [];
const check = (name, ok, detail = "") => {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

function assertLayout(an, label) {
  const { bandStats, whiteBBox, columnCounts, routeBBox } = an;

  // --- The black-background contract. ---
  check(
    `${label}: fully opaque (solid #000000 background)`,
    an.transparent === 0,
    `${an.transparent} transparent px`,
  );

  // --- Route: inside the visible box, centered, one dimension full. ---
  check(
    `${label}: route painted in orange`,
    bandStats.route.orange > 500,
    `${bandStats.route.orange}px in rows ${BANDS.route}`,
  );
  if (routeBBox) {
    const within =
      routeBBox.minX >= ROUTE_BOX.x - 1 &&
      routeBBox.maxX <= ROUTE_BOX.x + ROUTE_BOX.width + 1 &&
      routeBBox.minY >= ROUTE_BOX.y - 1 &&
      routeBBox.maxY <= ROUTE_BOX.y + ROUTE_BOX.height + 1;
    check(
      `${label}: route ink inside the visible box (64–1012 × 219–1190)`,
      within,
      `orange bbox x ${routeBBox.minX}..${routeBBox.maxX}, y ${routeBBox.minY}..${routeBBox.maxY}`,
    );
    const cx = (routeBBox.minX + routeBBox.maxX) / 2;
    check(
      `${label}: route horizontally centered`,
      Math.abs(cx - 540) <= 8,
      `center x ${cx.toFixed(1)}`,
    );
    const width = routeBBox.maxX - routeBBox.minX + 1;
    const height = routeBBox.maxY - routeBBox.minY + 1;
    // Contain: whichever dimension binds reaches the box (the orange
    // pass sits 3px inside the casing, hence the -6 tolerance).
    check(
      `${label}: route fills the binding dimension (contain)`,
      width >= ROUTE_BOX.width - 8 || height >= ROUTE_BOX.height - 8,
      `${width}×${height}`,
    );
    const cy = (routeBBox.minY + routeBBox.maxY) / 2;
    const boxCY = ROUTE_BOX.y + ROUTE_BOX.height / 2;
    check(
      `${label}: route vertically centered in the box`,
      Math.abs(cy - boxCY) <= 10,
      `center y ${cy.toFixed(1)} vs ${boxCY}`,
    );
  } else {
    check(`${label}: route bbox measurable`, false, "no orange pixels");
  }

  // --- The 90px route→logo gap: nothing but background. ---
  check(
    `${label}: 90px gap between route and logo`,
    bandStats.gapRouteLogo.white === 0 && bandStats.gapRouteLogo.orange === 0,
    `white ${bandStats.gapRouteLogo.white}px, orange ${bandStats.gapRouteLogo.orange}px in rows ${BANDS.gapRouteLogo}`,
  );

  // --- Logo: the 330×55 ink box at top 1280. ---
  check(
    `${label}: STRAVA logo in its band`,
    bandStats.logo.white > 300,
    `${bandStats.logo.white}px in rows ${BANDS.logo}`,
  );
  const logo = whiteBBox.logo;
  if (logo) {
    const width = logo.maxX - logo.minX + 1;
    const height = logo.maxY - logo.minY + 1;
    check(
      `${label}: logo ink is 330×55 at top 1280 (the reference box)`,
      Math.abs(width - LOGO_INK.width) <= 14 &&
        Math.abs(height - LOGO_INK.height) <= 10 &&
        Math.abs(logo.minY - LOGO_INK.y) <= 8,
      `bbox ${width}×${height} at y ${logo.minY}`,
    );
    const cx = (logo.minX + logo.maxX) / 2;
    check(
      `${label}: logo centered on x 540`,
      Math.abs(cx - 540) <= 20,
      `bbox x ${logo.minX}..${logo.maxX}, center ${cx.toFixed(1)}`,
    );
  } else {
    check(`${label}: logo bbox measurable`, false, "no white pixels");
  }

  // --- The 87px logo→stats gap. ---
  check(
    `${label}: 87px gap between logo and stats`,
    bandStats.gapLogoStats.white === 0 && bandStats.gapLogoStats.orange === 0,
    `white ${bandStats.gapLogoStats.white}px, orange ${bandStats.gapLogoStats.orange}px in rows ${BANDS.gapLogoStats}`,
  );

  // --- Stats: the trio at the pinned centers. ---
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
  const stats = whiteBBox.stats;
  if (stats) {
    check(
      `${label}: stats row spans the measured rows (1422–1515)`,
      stats.minY >= STATS_TOP - 8 && stats.maxY <= STATS_BOTTOM + 8,
      `bbox y ${stats.minY}..${stats.maxY}`,
    );
  }

  // --- The ~90px stats→shoe gap. ---
  check(
    `${label}: ~90px gap between stats and shoe`,
    bandStats.gapStatsIcon.white === 0 && bandStats.gapStatsIcon.orange === 0,
    `white ${bandStats.gapStatsIcon.white}px, orange ${bandStats.gapStatsIcon.orange}px in rows ${BANDS.gapStatsIcon}`,
  );

  // --- Shoe: contained and centered in the 104px slot. ---
  check(
    `${label}: shoe icon in its band`,
    bandStats.icon.white > 200,
    `${bandStats.icon.white}px in rows ${BANDS.icon}`,
  );
  const icon = whiteBBox.icon;
  if (icon) {
    const cx = (icon.minX + icon.maxX) / 2;
    const cy = (icon.minY + icon.maxY) / 2;
    const width = icon.maxX - icon.minX + 1;
    check(
      `${label}: shoe ink centered on (540, 1657), ~104 wide`,
      Math.abs(cx - 540) <= 15 &&
        Math.abs(cy - (ICON_SLOT.y + ICON_SLOT.size / 2)) <= 12 &&
        width >= 92,
      `bbox ${width}px wide, center (${cx.toFixed(1)}, ${cy.toFixed(1)})`,
    );
  } else {
    check(`${label}: icon bbox measurable`, false, "no white pixels");
  }

  // --- Nothing below the content bottom: ~211px of pure background. ---
  check(
    `${label}: content ends at 1709 — nothing below`,
    bandStats.bottom.white === 0 && bandStats.bottom.orange === 0,
    `white ${bandStats.bottom.white}px, orange ${bandStats.bottom.orange}px in rows ${BANDS.bottom}`,
  );
  check(
    `${label}: white artwork total sane (logo + stats + icon)`,
    an.whiteTotal > 1000,
    `${an.whiteTotal}px`,
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
      const whiteBBox = { logo: null, icon: null, stats: null };
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
      let whiteTotal = 0;
      let transparent = 0;
      let routeMinX = W;
      let routeMaxX = 0;
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
          if (a < 16) transparent += 1;
          const white = isWhite(r, g, b, a);
          const orange = isOrange(r, g, b, a);
          if (white) whiteTotal += 1;
          if (orange) orangeTotal += 1;
          if (orange) {
            if (x < routeMinX) routeMinX = x;
            if (x > routeMaxX) routeMaxX = x;
            if (y < routeMinY) routeMinY = y;
            if (y > routeMaxY) routeMaxY = y;
          }
          for (const name of Object.keys(BANDS)) {
            if (!inBand[name]) continue;
            if (white) bandStats[name].white += 1;
            if (orange) bandStats[name].orange += 1;
          }
          if (white) {
            if (inBand.logo) track("logo", x, y);
            if (inBand.icon) track("icon", x, y);
            if (inBand.stats) {
              track("stats", x, y);
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
        whiteTotal,
        transparent,
        routeBBox:
          orangeTotal > 0
            ? { minX: routeMinX, maxX: routeMaxX, minY: routeMinY, maxY: routeMaxY }
            : null,
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
