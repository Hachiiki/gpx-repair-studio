import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Live verification of Task 20 (the share card) on the user's REAL
 * GloryFit/Strava original — the same session a user would run:
 *
 *   1. desktop: landing toggle → upload → the share view renders the
 *      card on its dark stage; the PREVIEW canvas is pixel-probed
 *      in-page (transparent background, orange route, white artwork);
 *   2. download the 1× PNG → decode with sharp → same assertions on
 *      the actual file + exact 1080×1920 IHDR;
 *   3. the 2× export → 2160×3840;
 *   4. mobile viewport: the stage stacks, no horizontal overflow;
 *   5. screenshots of every state for visual review (download/).
 */

const REAL = join(process.cwd(), "docs", "strava_gpx_original.gpx");
const OUT = join(process.cwd(), "download");
const BASE = "http://localhost:3000";

function classifyPixels(data, width, height) {
  let transparent = 0;
  let orange = 0;
  let white = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) transparent += 1;
    if (a > 200 && r > 220 && g > 30 && g < 130 && b < 60) orange += 1;
    if (a > 200 && r > 230 && g > 230 && b > 230) white += 1;
    if (a > 200 && r < 40 && g < 40 && b < 40) dark += 1;
  }
  const total = width * height;
  return { transparent, orange, white, dark, total };
}

async function probePreviewCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="share-card-canvas"]');
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    let orange = 0;
    let white = 0;
    let dark = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const a = image.data[i + 3];
      if (a === 0) transparent += 1;
      if (a > 200 && r > 220 && g > 30 && g < 130 && b < 60) orange += 1;
      if (a > 200 && r > 230 && g > 230 && b > 230) white += 1;
      if (a > 200 && r < 40 && g < 40 && b < 40) dark += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      transparent,
      orange,
      white,
      dark,
      total: canvas.width * canvas.height,
    };
  });
}

async function waitForPaint(page, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    const probe = await probePreviewCanvas(page);
    if (probe && probe.orange > 100) return probe;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`card never painted; last probe: ${JSON.stringify(probe)}`);
    }
    await page.waitForTimeout(200);
  }
}

async function uploadRealFile(page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fc = await chooser;
  await fc.setFiles(REAL);
}

const browser = await chromium.launch();
const failures = [];
const check = (name, ok, detail = "") => {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// --- 1. Desktop: the full share session on the real file. ---
console.log("\n1) Desktop 1440×900 — share session on the real GloryFit file");
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto(BASE);
await desktop.getByTestId("landing-mode-share").click();
await uploadRealFile(desktop);
await desktop.getByTestId("share-section").waitFor();
const summary = {
  distance: await desktop.getByTestId("share-summary-distance").innerText(),
  pace: await desktop.getByTestId("share-summary-pace").innerText(),
  time: await desktop.getByTestId("share-summary-time").innerText(),
};
console.log(`  card trio: ${summary.distance} | ${summary.pace} | ${summary.time}`);

const painted = await waitForPaint(desktop);
check("preview canvas is 1080×1920", painted.width === 1080 && painted.height === 1920);
check(
  "preview background transparent",
  painted.transparent / painted.total > 0.5,
  `${((painted.transparent / painted.total) * 100).toFixed(1)}%`,
);
check("preview route painted in orange", painted.orange > 500, `${painted.orange}px`);
check("preview casing painted black", painted.dark > painted.orange * 0.15, `${painted.dark}px`);
check("preview casing is a ring, not a slab", painted.dark < painted.orange * 1.5, `${painted.dark}px vs ${painted.orange}px orange`);
check("preview artwork painted white", painted.white > 1000, `${painted.white}px`);
check(
  "no console errors during the session",
  await (async () => {
    const errors = [];
    desktop.on("pageerror", (err) => errors.push(String(err)));
    await desktop.waitForTimeout(300);
    return errors.length === 0;
  })(),
);

await desktop.screenshot({
  path: join(OUT, "share-card-live-desktop.png"),
  fullPage: true,
});

// --- 2. The 1× download: the file is the contract. ---
console.log("\n2) Download 1× — decoding the actual PNG");
const [download1x] = await Promise.all([
  desktop.waitForEvent("download"),
  desktop.getByTestId("share-download").click(),
]);
const png1xPath = join(OUT, "share-card-live-1x.png");
writeFileSync(png1xPath, readFileSync(await download1x.path()));
const png1x = readFileSync(png1xPath);
check("PNG signature", [...png1x.subarray(0, 8)].join(",") === "137,80,78,71,13,10,26,10");
check("IHDR 1080×1920", png1x.readUInt32BE(16) === 1080 && png1x.readUInt32BE(20) === 1920);
check("suggested filename", download1x.suggestedFilename() === "strava_gpx_original.share-card.png", download1x.suggestedFilename());

const decoded = await sharp(png1xPath).raw().toBuffer({ resolveWithObject: true });
const stats1x = classifyPixels(decoded.data, decoded.info.width, decoded.info.height);
check(
  "exported background transparent",
  stats1x.transparent / stats1x.total > 0.5,
  `${((stats1x.transparent / stats1x.total) * 100).toFixed(1)}%`,
);
check("exported route orange", stats1x.orange > 500, `${stats1x.orange}px`);
check("exported casing black", stats1x.dark > stats1x.orange * 0.15, `${stats1x.dark}px`);
check("exported casing is a ring, not a slab", stats1x.dark < stats1x.orange * 1.5, `${stats1x.dark}px vs ${stats1x.orange}px orange`);
check("exported artwork white", stats1x.white > 1000, `${stats1x.white}px`);

// --- 3. The 2× export. ---
console.log("\n3) Download 2× — doubled resolution");
await desktop.getByTestId("share-scale-2x").click();
const [download2x] = await Promise.all([
  desktop.waitForEvent("download"),
  desktop.getByTestId("share-download").click(),
]);
const png2xPath = join(OUT, "share-card-live-2x.png");
writeFileSync(png2xPath, readFileSync(await download2x.path()));
const png2x = readFileSync(png2xPath);
check("IHDR 2160×3840", png2x.readUInt32BE(16) === 2160 && png2x.readUInt32BE(20) === 3840);

await desktop.close();

// --- 4. Mobile: the stage stacks, nothing overflows. ---
console.log("\n4) Mobile 390×844 — stacked layout");
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE);
await mobile.getByTestId("landing-mode-share").click();
await uploadRealFile(mobile);
await mobile.getByTestId("share-section").waitFor();
await waitForPaint(mobile);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth);
check("no horizontal overflow", overflow <= 390, `scrollWidth ${overflow}`);
await mobile.screenshot({ path: join(OUT, "share-card-live-mobile.png"), fullPage: true });
await mobile.close();

await browser.close();

console.log(
  failures.length === 0
    ? "\nALL LIVE CHECKS PASSED"
    : `\n${failures.length} CHECK(S) FAILED: ${failures.join(", ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
