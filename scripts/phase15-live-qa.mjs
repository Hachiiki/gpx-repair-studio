/**
 * Phase 15 (stats dashboard) — live QA: the three new surfaces + the two
 * sheet intents, in BOTH themes, against the dev server on :3000.
 *
 *   1. sample load → splits card, time-in-motion card, upgraded elevation
 *      profile all visible — light + dark screenshots;
 *   2. splits table: rows + the Total row reconcile; the provenance
 *      badges and honesty flags paint;
 *   3. elevation profile: pointer hover → crosshair + readout; keyboard
 *      Arrow focus → the readout follows (a11y parity);
 *   4. the profile table (the textual equivalent) opens;
 *   5. stats CSV download → the long-format header + split rows in the
 *      bytes;
 *   6. print emulation → printing-stats class, the print-only masthead,
 *      chrome hidden;
 *   7. mobile width (390) — the cards stack readably;
 *   8. zero console/page errors throughout.
 *
 * Screenshots land in download/phase15-* for the VLM critique.
 */
import { chromium } from "@playwright/test";

const OUT = "download";
const errors = [];
const pageErrors = [];
const checks = [];

function ok(name, condition) {
  checks.push([name, Boolean(condition)]);
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);
}

const browser = await chromium.launch();

/** A themed context with the tour seen. */
async function themedContext(viewport, theme) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ({ theme }) => {
      try {
        localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
        localStorage.setItem("gpx-repair-studio.theme.v1", theme);
      } catch {
        /* storage blocked — tolerated */
      }
    },
    { theme },
  );
  return context;
}

async function capture(page, name, { fullPage = false } = {}) {
  await page.waitForTimeout(450); // the Phase 11 settle lesson
  await page.screenshot({ path: `${OUT}/phase15-${name}.png`, fullPage });
}

function watchConsole(page) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
}

async function loadSample(page) {
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) {
    await card.click();
  }
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  await page.getByTestId("try-sample").click();
  await page.getByTestId("splits-card").waitFor({ state: "visible" });
}

// ---------------------------------------------------------------------------
// 1-4 — the dashboard surfaces, both themes
// ---------------------------------------------------------------------------
for (const theme of ["light", "dark"]) {
  const context = await themedContext({ width: 1280, height: 900 }, theme);
  const page = await context.newPage();
  watchConsole(page);
  await loadSample(page);

  // The three surfaces.
  ok(`[${theme}] splits card visible`, await page.getByTestId("splits-card").isVisible());
  ok(
    `[${theme}] time-in-motion card visible`,
    await page.getByTestId("time-in-motion-card").isVisible(),
  );
  ok(
    `[${theme}] elevation profile visible`,
    await page.getByTestId("elevation-profile-chart").isVisible(),
  );

  // Splits table reconciliation: row count vs the Total row's own text.
  const rowCount = await page.getByTestId(/split-row-\d+/).count();
  const tableText = await page.getByTestId("splits-table").innerText();
  const totalMatch = /(\d+) splits of 1 km/.exec(tableText);
  ok(
    `[${theme}] splits rows (${rowCount}) match the Total row (${totalMatch?.[1]})`,
    totalMatch !== null && Number(totalMatch[1]) === rowCount,
  );
  ok(
    `[theme ${theme}] honesty flags paint (gap legs disclosed)`,
    /gap leg/.test(tableText),
  );

  // Pace chart bars painted.
  const bars = await page.getByTestId("splits-pace-bar").count();
  ok(`[${theme}] pace chart bars painted (${bars})`, bars >= 2);

  // Elevation profile: hover crosshair + readout.
  await page.getByTestId("elevation-profile-svg").scrollIntoViewIfNeeded();
  const svg = page.getByTestId("elevation-profile-svg");
  const box = await svg.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
    await page.waitForTimeout(250);
  }
  const readoutHover = await page
    .getByTestId("elevation-profile-readout")
    .innerText();
  ok(
    `[${theme}] hover readout carries distance + elevation`,
    /km/.test(readoutHover) && /m/.test(readoutHover),
  );
  await capture(page, `${theme}-profile-hover`);

  // Keyboard cursor: tab to the profile wrapper, Arrow moves the readout.
  await page.getByTestId("elevation-profile-svg").click(); // focus via interaction
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const readoutKey = await page
    .getByTestId("elevation-profile-readout")
    .innerText();
  ok(
    `[${theme}] keyboard cursor moves the readout`,
    readoutKey !== readoutHover,
  );

  // The profile table (textual equivalent).
  await page.getByTestId("elevation-profile-table-toggle").click();
  await page.getByTestId("elevation-profile-table").waitFor({ state: "visible" });
  ok(
    `[${theme}] profile table opens (textual equivalent)`,
    await page.getByTestId("elevation-profile-table").isVisible(),
  );

  // Time in motion: the summary blocks + breakdown.
  const motionText = await page.getByTestId("time-in-motion-card").innerText();
  ok(
    `[${theme}] motion summary has In motion + Stopped`,
    /In motion/.test(motionText) && /Stopped/.test(motionText),
  );
  ok(
    `[${theme}] the 0.5 m/s stop rule is disclosed`,
    /0\.5 m\/s/.test(motionText),
  );

  await capture(page, `${theme}-dashboard`, { fullPage: true });
  await context.close();
}

// ---------------------------------------------------------------------------
// 5 — the stats CSV download
// ---------------------------------------------------------------------------
{
  const context = await themedContext({ width: 1280, height: 900 }, "light");
  const page = await context.newPage();
  watchConsole(page);
  await loadSample(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-stats-csv-button").click(),
  ]);
  await download.saveAs(`${OUT}/phase15-stats.csv`);
  const fs = await import("node:fs");
  const csv = fs.readFileSync(`${OUT}/phase15-stats.csv`, "utf8");
  const lines = csv.trim().split("\n");
  ok(
    "CSV: long-format header",
    lines[0].startsWith("section,label,value,unit,provenance,note"),
  );
  ok(
    "CSV: meta rows present",
    lines.some((l) => l.startsWith("meta,source")),
  );
  ok(
    "CSV: summary rows present",
    lines.some((l) => /^summary,/.test(l)),
  );
  ok("CSV: split rows present", lines.some((l) => /^split,/.test(l)));
  ok(
    "CSV: motion rows present (stopped + in-motion under summary)",
    lines.some((l) => /^summary,stopped_time/.test(l)) &&
      lines.some((l) => /^summary,in_motion_time/.test(l)),
  );
  await context.close();
}

// ---------------------------------------------------------------------------
// 6 — print emulation
// ---------------------------------------------------------------------------
{
  const context = await themedContext({ width: 1280, height: 900 }, "dark");
  const page = await context.newPage();
  watchConsole(page);
  await page.addInitScript(() => {
    window.print = () => {
      // Stub: never open a native dialog in QA.
    };
  });
  await loadSample(page);

  await page.emulateMedia({ media: "print" });
  await page.getByTestId("print-stats-button").click();
  await page.waitForFunction(() =>
    document.body.classList.contains("printing-stats"),
  );
  ok(
    "print: body carries printing-stats",
    await page.evaluate(() => document.body.classList.contains("printing-stats")),
  );
  ok(
    "print: chrome hidden (header)",
    !(await page.getByTestId("app-header").isVisible()),
  );
  ok(
    "print: the print-only masthead shows",
    await page.getByTestId("stats-print-header").isVisible(),
  );
  ok(
    "print: stats region shows",
    await page.getByTestId("stats-panel").isVisible(),
  );
  await capture(page, "print-sheet");
  await page.emulateMedia({ media: "screen" });
  await context.close();
}

// ---------------------------------------------------------------------------
// 7 — mobile width
// ---------------------------------------------------------------------------
{
  const context = await themedContext({ width: 390, height: 844 }, "light");
  const page = await context.newPage();
  watchConsole(page);
  await loadSample(page);
  await page.getByTestId("splits-card").scrollIntoViewIfNeeded();
  await capture(page, "mobile-dashboard");
  const cardBox = await page.getByTestId("splits-card").boundingBox();
  ok(
    "mobile: splits card fits the 390 viewport",
    cardBox !== null && cardBox.width <= 390,
  );
  ok(
    "mobile: no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await context.close();
}

await browser.close();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const failed = checks.filter(([, passed]) => !passed);
console.log("\n--- PHASE 15 LIVE QA ---");
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (errors.length > 0 || pageErrors.length > 0) {
  console.log("console errors:", errors);
  console.log("page errors:", pageErrors);
  process.exitCode = 1;
}
if (failed.length > 0) {
  console.log("failed checks:", failed.map(([name]) => name));
  process.exitCode = 1;
}
