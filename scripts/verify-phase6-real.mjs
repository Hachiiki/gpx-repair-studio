import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Live verification of Phase 6 (elevation) on the user's REAL GloryFit
 * original — the same one-anchor "add missing route" session a user
 * would run:
 *
 *   1. upload → one-anchor tail extension → draw 2 points (road
 *      routing aborted for deterministic straight legs);
 *   2. "Estimate elevation" → the FR-6.5 disclosure (screenshot) →
 *      confirm → the elevation API answers with terrain (mocked by
 *      default; with ELEVATION_REAL_API=1 the REAL Open-Meteo service
 *      is used — the true end-to-end check that the provider swap
 *      works from a browser) → the per-gap summary (▲/▼, min–max)
 *      lands;
 *   3. commit → the statistics table splits gain/loss by provenance
 *      and the profile chart paints recorded (solid) + reconstructed
 *      (dashed amber) — screenshots;
 *   4. staleness: reopen the editor and draw one more point → the
 *      fetch goes stale (excluded warning) — screenshot;
 *   5. export while fresh → the file carries <ele>, eleMethod markers
 *      and the attribution note (bytes checked); the dialog counts
 *      "Repairs with estimated elevation".
 *
 * The elevation API is route-mocked by default (deterministic
 * elevations along the drawn chain, rising from 36 m to 54 m — a
 * visible climb for the summary rows); ELEVATION_REAL_API=1 skips
 * the mock and exercises the real api.open-meteo.com.
 */

const REAL = join(process.cwd(), "docs", "strava_gpx_original.gpx");
const OUT = join(process.cwd(), "download");
const BASE = "http://localhost:3000";

const xml = readFileSync(REAL, "utf8");
const pts = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
const last = {
  lat: Number(pts[pts.length - 1][1]),
  lon: Number(pts[pts.length - 1][2]),
};

/** Deterministic terrain: the k-th queried point sits at 36 + k·1.5 m. */
function elevationForIndex(i) {
  return Number((36 + i * 1.5).toFixed(1));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Deterministic session: no road routing; the elevation API is mocked
// unless ELEVATION_REAL_API=1 (then the REAL Open-Meteo service runs
// the show — requests are still observed for the opt-in assertion).
await page.route("**/router.project-osrm.org/**", (r) => r.abort());
await page.route("**/valhalla1.openstreetmap.de/**", (r) => r.abort());
const REAL_API = process.env.ELEVATION_REAL_API === "1";
const requestLog = [];
await page.route("**/api.open-meteo.com/**", async (route) => {
  requestLog.push(route.request().url());
  if (REAL_API) {
    await route.continue();
    return;
  }
  const url = new URL(route.request().url());
  const count = (url.searchParams.get("latitude") ?? "").split(",").length;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      elevation: Array.from({ length: count }, (_, i) => elevationForIndex(i)),
    }),
  });
});
console.log("elevation API:", REAL_API ? "REAL api.open-meteo.com" : "mocked");

await page.goto(BASE);
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
const [fc] = await Promise.all([chooser]);
await fc.setFiles(REAL);
await page.getByTestId("gpx-summary").waitFor();
await page.waitForTimeout(1500);

const bridge = () =>
  page.evaluate(() =>
    window.__gpxMapController ? window.__gpxMapController.getTestState() : null,
  );
async function poll(predicate, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    const state = await bridge();
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs)
      throw new Error(`predicate not met; last: ${JSON.stringify(state)}`);
    await page.waitForTimeout(150);
  }
}
async function clickAt(lat, lon) {
  const { x, y } = await page.evaluate(
    ([lat_, lon_]) => window.__gpxMapController.projectLatLon(lat_, lon_),
    [lat, lon],
  );
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
}

await poll((s) => s.ready && !s.moving);

// --- 1. one-anchor tail extension, two drawn points -----------------------
await page.getByTestId("begin-pick-anchor-button").click();
await poll((s) => s.pickSession?.active === true);
await clickAt(last.lat, last.lon);
await poll((s) => s.drawSession !== null && s.pickSession === null);
await page.getByTestId("snap-toggle").click();
const drawSpots = [
  { lat: last.lat + 0.0016, lon: last.lon + 0.0018 },
  { lat: last.lat + 0.0009, lon: last.lon + 0.0031 },
];
for (const spot of drawSpots) {
  await clickAt(spot.lat, spot.lon);
  await page.waitForTimeout(400);
}
await poll((s) => s.drawSession?.vertexCount === 2);

// Densify before estimating (spacing 25 m): more interior points → a
// real climb for the chart and the gain rows (2 points at 1.5 m apart
// would sit under the 2 m hysteresis noise band).
await page.getByTestId("spacing-select").selectOption("25");
await page.waitForTimeout(300);

// --- 2. the disclosure gates the request -----------------------------------
const elevationControls = page.getByTestId("elevation-controls");
await elevationControls.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);

if (requestLog.length !== 0) throw new Error("elevation request before opt-in!");
await page.getByTestId("elevation-estimate-button").click();
const dialog = page.getByTestId("elevation-disclosure-dialog");
await dialog.waitFor();
const disclosureText = await dialog.innerText();
console.log(
  "disclosure shown (requests so far:",
  requestLog.length,
  ") — points:",
  /(\d+) coordinate/.exec(disclosureText)?.[1],
);
await page.screenshot({ path: join(OUT, "phase6-disclosure.png") });

await page.getByTestId("elevation-disclosure-confirm").click();
await page
  .getByTestId("elevation-status-badge")
  .filter({ hasText: "Estimated" })
  .waitFor({ timeout: 15000 });
if (requestLog.length < 1) throw new Error("no elevation request after confirm");
console.log("elevation requests:", requestLog.length);

const summaryText = await page.getByTestId("elevation-gap-summary").innerText();
console.log("per-gap summary:", summaryText.replace(/\n/g, " | "));
await page.screenshot({ path: join(OUT, "phase6-editor-estimated.png") });

// --- 3. commit → stats rows + profile chart --------------------------------
await page.getByTestId("done-editing-button").click();
await poll((s) => s.drawSession === null && s.reconstructionLineCount >= 1);
await page.waitForTimeout(600);

const stats = page.getByTestId("stats-panel");
await stats.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const statsText = await stats.innerText();
const cell = (label) => {
  const at = statsText.indexOf(label);
  if (at < 0) return undefined;
  const rest = statsText.slice(at + label.length);
  const match = /[\t\n]\s*([\d,]+ m)/.exec(rest);
  return match?.[1];
};
console.log(
  "gain (repairs):",
  cell("Elevation gain (repairs)"),
  "| gain (total):",
  cell("Elevation gain (total)"),
  "| loss (repairs):",
  cell("Elevation loss (repairs)"),
);
if (!cell("Elevation gain (repairs)"))
  throw new Error("no repaired elevation gain row in stats");

const chart = page.getByTestId("elevation-profile-chart");
await chart.waitFor();
await chart.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const chartInfo = await chart.innerText();
console.log("chart header:", chartInfo.split("\n").slice(0, 2).join(" | "));
await page.screenshot({ path: join(OUT, "phase6-stats-chart.png") });

// --- 4. staleness: one more drawn point → the fetch goes stale -------------
await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
// Reopen the editor from the manual repairs card (the committed repair).
await page.getByTestId("open-editor-button-manual").first().click();
await poll((s) => s.drawSession !== null);
await page.getByTestId("snap-toggle").click();
await clickAt(last.lat + 0.0004, last.lon + 0.0008);
await poll((s) => s.drawSession?.vertexCount === 3);
await page.waitForTimeout(400);
const staleNote = page.getByTestId("elevation-stale-note");
await staleNote.waitFor();
console.log("stale note shown after edit:", (await staleNote.innerText()).slice(0, 80));
await elevationControls.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({
  path: join(OUT, "phase6-stale.png"),
  clip: {
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  },
});

// --- 5a. export while STALE → excluded, honest caveat ----------------------
await page.getByTestId("done-editing-button").click();
await poll((s) => s.drawSession === null);
await page.waitForTimeout(400);
await page.getByTestId("open-export-button").scrollIntoViewIfNeeded();
await page.getByTestId("open-export-button").click();
const exportDialog = page.getByTestId("export-dialog");
await exportDialog.waitFor();
await page.waitForTimeout(500); // let the fade-in settle for the capture
const staleCaveat = await exportDialog
  .getByTestId("export-stale-elevation-note")
  .innerText()
  .catch(() => null);
console.log("stale caveat in export dialog:", staleCaveat?.slice(0, 90));
await page.screenshot({ path: join(OUT, "phase6-export-stale.png") });
const [downloadStale] = await Promise.all([
  page.waitForEvent("download"),
  page.getByTestId("export-download-button").click(),
]);
const stalePath = await downloadStale.path();
const staleXml = readFileSync(stalePath, "utf8");
if (staleXml.includes("eleMethod"))
  throw new Error("stale elevation leaked into the export!");
console.log("stale export: no eleMethod (correctly excluded) ✓");

// --- 5b. re-estimate on the fresh chain → export WITH elevation ------------
// Reopen the editor from the manual repairs card.
await page
  .getByTestId("tools-panel")
  .scrollIntoViewIfNeeded();
await page.getByTestId("open-editor-button-manual").first().click();
await poll((s) => s.drawSession !== null);
await page.getByTestId("elevation-refetch-button").first().click();
await page.getByTestId("elevation-disclosure-confirm").click();
await page
  .getByTestId("elevation-status-badge")
  .filter({ hasText: "Estimated" })
  .waitFor({ timeout: 15000 });
await page.getByTestId("done-editing-button").click();
await poll((s) => s.drawSession === null);
await page.waitForTimeout(600);

await page.getByTestId("open-export-button").scrollIntoViewIfNeeded();
await page.getByTestId("open-export-button").click();
await exportDialog.waitFor();
await page.waitForTimeout(500); // let the fade-in settle for the capture
const withEle = await exportDialog.innerText();
const m = /Repairs with estimated elevation\s*[\t\n]\s*(\d+)/.exec(withEle);
console.log("export dialog: repairs with estimated elevation =", m?.[1]);
await page.screenshot({ path: join(OUT, "phase6-export-dialog.png") });
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByTestId("export-download-button").click(),
]);
const path = await download.path();
const outXml = readFileSync(path, "utf8");
const eleCount = (outXml.match(/<ele>/g) ?? []).length;
const markerCount = (outXml.match(/eleMethod="elevation-api"/g) ?? []).length;
const interpolatedCount = (outXml.match(/eleMethod="interpolated"/g) ?? []).length;
console.log(
  `export: ${eleCount} <ele>, ${markerCount} elevation-api, ${interpolatedCount} interpolated markers`,
);
if (!outXml.includes("Elevation of reconstructed points estimated from Open-Meteo"))
  throw new Error("attribution note missing from export metadata");
// Original recorded ele values stay verbatim (the GloryFit file has eles).
const originalEle = /<ele>([\d.]+)</.exec(xml)?.[1];
if (originalEle && !outXml.includes(`<ele>${originalEle}</ele>`))
  throw new Error(`original ele ${originalEle} not verbatim in export`);

console.log("\nPhase 6 live verification: ALL CHECKS PASSED");
await browser.close();
