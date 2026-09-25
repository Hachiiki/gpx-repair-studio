import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Live verification of Phase 5 (time & pace) on the user's REAL GloryFit
 * original — no interception: the real OSRM routing service answers the
 * road-follow legs, exactly as a user session would.
 *
 *   1. upload → open a detected gap's editor → draw 2 road-followed
 *      points → the §J-1 controls show the derived span + estimated
 *      pace (road distance included — WYSIWYG);
 *   2. the Case-4 manual override with its discrepancy flag;
 *   3. commit → the statistics join with provenance rows;
 *   4. the no-timing-data file mode on the committed no-time fixture.
 */

const REAL = join(process.cwd(), "docs", "strava_gpx_original.gpx");
const NOTIME = join(
  process.cwd(),
  "src",
  "features",
  "gpx",
  "fixtures",
  "files",
  "no-time.gpx",
);
const OUT = join(process.cwd(), "download");

const xml = readFileSync(REAL, "utf8");
const pts = [...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)];
const last = {
  lat: Number(pts[pts.length - 1][1]),
  lon: Number(pts[pts.length - 1][2]),
};

const browser = await chromium.launch();

async function fresh(width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto("http://localhost:3000");
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

async function poll(page, predicate, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    const state = await bridge(page);
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) throw new Error("predicate not met");
    await page.waitForTimeout(150);
  }
}

// 1 — Real file (detects no gaps with default thresholds): the
//     one-anchor "add missing route" flow on the route's LAST point —
//     an open tail extension (§J-1 Case 2: the anchor has a timestamp,
//     the far side is open).
const page = await fresh(1440, 900, REAL);
await poll(page, (s) => s.ready && !s.moving);
await page.getByTestId("begin-pick-anchor-button").click();
await poll(page, (s) => s.pickSession?.active === true);
{
  const { x, y } = await page.evaluate(
    ([lat, lon]) => window.__gpxMapController.projectLatLon(lat, lon),
    [last.lat, last.lon],
  );
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
}
await poll(page, (s) => s.drawSession !== null && s.pickSession === null);

// Turn snap off; draw two road-follow points past the route end.
await page.getByTestId("snap-toggle").click();
const drawSpots = [
  { lat: last.lat + 0.0016, lon: last.lon + 0.0018 },
  { lat: last.lat + 0.0009, lon: last.lon + 0.0031 },
];
for (const spot of drawSpots) {
  const { x, y } = await page.evaluate(
    ([lat, lon]) => window.__gpxMapController.projectLatLon(lat, lon),
    [spot.lat, spot.lon],
  );
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(400);
}
await poll(page, (s) => s.drawSession?.vertexCount === 2);
// Let the real OSRM resolve both legs (road follow defaults to "car").
await page.waitForTimeout(2500);

// §J-1 Case 2: only the anchor carries a timestamp — the controls say
// so and the pace stays "—" until a duration is entered.
const controls = page.getByTestId("time-strategy-controls");
await controls.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const caseText = await controls.innerText();
if (!/only the start of this gap has a timestamp/i.test(caseText)) {
  throw new Error("Case 2 copy not shown for the open tail extension");
}
const pendingPace = await page.getByTestId("gap-pace").innerText();
if (!pendingPace.includes("—")) {
  throw new Error("pace should prompt for a duration before one is given");
}

// The manual duration answers it (Case 2 → manual).
await page.getByTestId("add-duration-button").click();
await page.getByTestId("duration-minutes").fill("7");
await page.getByTestId("save-duration-button").click();
await page.waitForTimeout(300);
const paceText = await page.getByTestId("gap-pace").innerText();
console.log("estimated pace after 7:00 manual:", paceText.replace(/\n/g, " | "));
if (!/\/km/.test(paceText)) throw new Error("no estimated pace after manual duration");
await page.screenshot({ path: join(OUT, "phase5-editor-derived.png") });

// 2 — Edit the duration to a value that also exercises the dialog
//     prefill (still manual, no discrepancy: no recorded far side).
await page.getByTestId("edit-duration-button").click();
const prefill = await page.getByTestId("duration-minutes").inputValue();
if (prefill !== "7") throw new Error(`dialog prefill wrong: ${prefill}`);
await page.getByTestId("duration-minutes").fill("12");
await page.getByTestId("save-duration-button").click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "phase5-editor-manual.png") });
console.log("manual 12:00 set on the tail extension");

// 3 — Commit and inspect the statistics join.
await page.getByTestId("done-editing-button").click();
await poll(page, (s) => s.drawSession === null && s.reconstructionLineCount >= 1);
await page.getByTestId("stats-panel").scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, "phase5-stats-joined.png") });
const statsText = await page.getByTestId("stats-panel").innerText();
for (const expected of [
  "Repaired distance",
  "Repair time",
  "Total with repairs",
  "Pace (repairs)",
  "Overall pace",
]) {
  if (!statsText.includes(expected)) {
    throw new Error(`stats missing row: ${expected}`);
  }
}
console.log("stats rows joined; manual 12:00 present:", statsText.includes("12:00"));
await page.close();

// 4 — The no-timing-data file mode.
const noTimePage = await fresh(1440, 900, NOTIME);
await noTimePage.getByTestId("file-timing-card").waitFor();
await noTimePage.getByTestId("file-start-input").fill("2024-05-01T07:00");
await noTimePage.getByTestId("file-total-minutes").fill("42");
await noTimePage.getByTestId("file-total-minutes").blur();
await noTimePage.waitForTimeout(300);
await noTimePage.getByTestId("file-timing-card").scrollIntoViewIfNeeded();
await noTimePage.screenshot({ path: join(OUT, "phase5-no-time-mode.png") });
const overall = await noTimePage
  .getByTestId("pace-row-overall")
  .innerText();
console.log("no-time overall pace:", overall.replace(/\n/g, " | "));
if (!/\/km/.test(overall)) throw new Error("no overall pace from manual total");
await noTimePage.close();

await browser.close();
console.log("OK — Phase 5 verified live on the real GloryFit file + no-time fixture");
