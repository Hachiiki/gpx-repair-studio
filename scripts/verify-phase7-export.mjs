import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Live verification of Phase 7 (merge & export) on the user's REAL
 * Strava original — no interception: the real OSRM routing service
 * answers the road-follow legs, exactly as a user session would.
 *
 *   1. upload → one-anchor tail extension on the route's last point →
 *      draw 2 road-followed points → enter a manual duration (§J-1
 *      Case 2 — the anchor is timed, the far side is open) → commit;
 *   2. review the pre-export dialog (repairs, distance, caveats) and
 *      download the repaired GPX;
 *   3. verify the exported bytes: gpxr markers on every reconstructed
 *      point, the metadata repair note, verbatim original values,
 *      well-formed XML (xmllint when available);
 *   4. re-upload the downloaded file → the original/reconstructed
 *      distinction survives (stats note, map styling, seam-suppressed
 *      detection, the "Previously repaired" report entry);
 *   5. screenshots at every meaningful state for visual review.
 */

const REAL = join(process.cwd(), "docs", "strava_gpx_original.gpx");
const OUT = join(process.cwd(), "download");
const EXPORT_PATH = join(OUT, "phase7-live-export.repaired.gpx");
const BASE = "http://localhost:3000";

const xml = readFileSync(REAL, "utf8");
const pts = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
const last = {
  lat: Number(pts[pts.length - 1][1]),
  lon: Number(pts[pts.length - 1][2]),
};
// Two draw targets past the route end (the same offsets the Phase 5
// script used — inside the map viewport after the anchor fit).
const DRAW = [
  { lat: last.lat + 0.0016, lon: last.lon + 0.0021 },
  { lat: last.lat + 0.0031, lon: last.lon + 0.0038 },
];

const browser = await chromium.launch();
const consoleErrors = [];

async function fresh(width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  await page.goto(BASE);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const [fc] = await Promise.all([chooser]);
  await fc.setFiles(file);
  await page.getByTestId("gpx-summary").waitFor();
  await page.waitForTimeout(1500);
  return page;
}

async function bridge(page) {
  return page.evaluate(() =>
    window.__gpxMapController
      ? window.__gpxMapController.getTestState()
      : null,
  );
}

async function poll(page, predicate, timeoutMs = 25_000) {
  const started = Date.now();
  for (;;) {
    const state = await bridge(page);
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`predicate not met; last: ${JSON.stringify(state)}`);
    }
    await page.waitForTimeout(150);
  }
}

async function clickAt(page, lat, lon) {
  const { x, y } = await page.evaluate(
    ([lat_, lon_]) => window.__gpxMapController.projectLatLon(lat_, lon_),
    [lat, lon],
  );
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
}

// ---------------------------------------------------------------------------
// 1 — repair the tail of the real file (live OSRM road-follow)
// ---------------------------------------------------------------------------
const page = await fresh(1440, 900, REAL);
await poll(page, (s) => s.ready && !s.moving);

await page.getByTestId("begin-pick-anchor-button").click();
await poll(page, (s) => s.pickSession?.active === true);
await clickAt(page, last.lat, last.lon);
await poll(page, (s) => s.drawSession !== null && s.pickSession === null);

// Straight-line draw points; road-follow (car, the default) resolves the
// real road geometry around them while the clicks stay deterministic.
await page.getByTestId("snap-toggle").click();
for (const point of DRAW) await clickAt(page, point.lat, point.lon);
await poll(page, (s) => s.drawSession?.vertexCount === 2);
// Let the live OSRM legs resolve.
await poll(
  page,
  (s) => s.drawSession !== null && s.drawSession.vertexCount === 2,
  1000,
).catch(() => {});
await page.waitForTimeout(4000);

// §J-1 Case 2: one timed anchor — a manual duration for the tail (the
// add-duration affordance, as the Phase 5 flow established).
const controls = page.getByTestId("time-strategy-controls");
await controls.scrollIntoViewIfNeeded();
await page.getByTestId("add-duration-button").click();
await page.getByTestId("duration-minutes").fill("10");
await page.getByTestId("save-duration-button").click();
await page.waitForTimeout(300);

// Commit the repair.
await page.getByTestId("done-editing-button").click();
await poll(
  page,
  (s) => s.drawSession === null && s.reconstructionLineCount === 1,
);

const stats = page.getByTestId("stats-panel");
if (!(await stats.getByText("Repaired distance").isVisible())) {
  throw new Error("stats do not show the repaired distance row");
}
await page.waitForTimeout(600);
await page.screenshot({
  path: join(OUT, "phase7-live-repaired-stats.png"),
  fullPage: true,
});

// ---------------------------------------------------------------------------
// 2 — review & download
// ---------------------------------------------------------------------------
const card = page.getByTestId("export-card");
if (!(await card.getByText("Repairs to include").isVisible())) {
  throw new Error("export card missing its summary");
}
await page.getByTestId("open-export-button").click();
const dialog = page.getByTestId("export-dialog");
await dialog.waitFor();
for (const expected of [
  "repair inserted",
  "never modified",
  "provenance markers",
]) {
  if (!(await dialog.getByText(expected, { exact: false }).first().isVisible())) {
    throw new Error(`export dialog missing: ${expected}`);
  }
}
await page.screenshot({ path: join(OUT, "phase7-live-export-dialog.png") });

const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByTestId("export-download-button").click(),
]);
const downloadedPath = await download.path();
const exportedXml = readFileSync(downloadedPath, "utf8");
writeFileSync(EXPORT_PATH, exportedXml);
console.log(`exported: ${EXPORT_PATH} (${exportedXml.length} bytes)`);

// ---------------------------------------------------------------------------
// 3 — verify the exported bytes
// ---------------------------------------------------------------------------
const markerCount = (exportedXml.match(/<gpxr:reconstructed/g) ?? []).length;
if (markerCount === 0) {
  throw new Error("no gpxr:reconstructed markers in the export");
}
if (!exportedXml.includes('creator="GPX Repair Studio"')) {
  throw new Error("export is not branded GPX Repair Studio");
}
if (!exportedXml.includes("Repaired with GPX Repair Studio")) {
  throw new Error("metadata repair note missing");
}
if (!/timeMethod="manual"/.test(exportedXml)) {
  throw new Error("manual duration method not exported on markers");
}
// Original values verbatim: a handful of raw spellings from the source.
for (const probe of [
  /lat="[-\d.]+"/, // coordinate attributes at all
  /<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/time>/,
]) {
  if (!probe.test(exportedXml)) throw new Error(`probe failed: ${probe}`);
}
const originalLat = pts[0][1];
if (!exportedXml.includes(`lat="${originalLat}"`)) {
  throw new Error("first original lat spelling not preserved verbatim");
}
// Mode A default: the tail extension is its own final <trkseg>.
const segCount = (exportedXml.match(/<trkseg>/g) ?? []).length;
if (segCount < 2) {
  throw new Error("expected the reconstruction as its own trkseg (Mode A)");
}
// Well-formedness via xmllint when available (the external validator).
try {
  execFileSync("xmllint", ["--noout", EXPORT_PATH], { stdio: "pipe" });
  console.log("xmllint: well-formed ✓");
} catch (err) {
  if (err.code === "ENOENT") {
    console.log("xmllint not available — skipped (re-parse check below)");
  } else {
    throw new Error(`xmllint rejected the export: ${err.stderr}`);
  }
}

// ---------------------------------------------------------------------------
// 4 — re-upload the exported file: the distinction survives
// ---------------------------------------------------------------------------
await page.getByRole("button", { name: "New file" }).click();
await page.getByTestId("upload-zone").waitFor({ state: "visible" });
{
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const [fc] = await Promise.all([chooser]);
  await fc.setFiles(EXPORT_PATH);
}
await page.getByTestId("gpx-summary").waitFor();
await poll(page, (s) => s.ready && !s.moving);

if (!(await page.getByTestId("reimport-note").isVisible())) {
  throw new Error("re-import note missing from stats");
}
const reimported = await poll(page, (s) => s.reconstructionLineCount >= 1);
console.log(
  `re-import: ${reimported.reconstructionLineCount} reconstruction line(s), ` +
    `${(await page.getByTestId("reimport-note").textContent()).trim()}`,
);
const report = page.getByTestId("validation-report");
if (!(await report.getByText("Previously repaired").isVisible())) {
  throw new Error("validation report missing the previously-repaired entry");
}
await page.waitForTimeout(800);
await page.screenshot({
  path: join(OUT, "phase7-live-reimported.png"),
  fullPage: true,
});

if (consoleErrors.length > 0) {
  throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
}

await browser.close();
console.log("Phase 7 live verification passed ✓");
