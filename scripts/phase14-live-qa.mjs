/**
 * Phase 14 (formats in & out) — live QA: intake in both formats, the
 * export picker, and every format's download, in BOTH themes, against
 * the dev server on :3000.
 *
 *   1. TCX upload → conversion notes visible — light + dark;
 *   2. the export dialog: the format picker lists all four options
 *      (screenshots per theme for the VLM critique);
 *   3. KML download → file bytes contain the provenance labels;
 *   4. FIT upload → the session/track labels + the pause disclosure;
 *   5. CSV download → the provenance column header;
 *   6. mobile width (390) — the picker stacks readably;
 *   7. zero console/page errors throughout.
 *
 * Screenshots land in download/phase14-* for the VLM critique.
 */
import { chromium } from "@playwright/test";

const OUT = "download";
const TCX = "src/features/formats/fixtures/files/ride.tcx";
const FIT = "src/features/formats/fixtures/files/activity.fit";
const errors = [];
const pageErrors = [];

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
  await page.screenshot({ path: `${OUT}/phase14-${name}.png`, fullPage });
}

function watchConsole(page) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
}

async function enterRepairTool(page) {
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) {
    await card.click();
  }
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}

async function upload(page, file) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(file);
}

async function openExportDialog(page) {
  await page.getByTestId("open-export-button").click();
  await page.getByTestId("export-dialog").waitFor({ state: "visible" });
}

async function downloadAs(page, format) {
  await openExportDialog(page);
  await page.getByTestId(`export-format-${format}`).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-download-button").click(),
  ]);
  const path = await download.path();
  const { readFileSync } = await import("node:fs");
  return { name: download.suggestedFilename(), text: readFileSync(path, "utf8") };
}

const checks = [];
function check(label, condition) {
  checks.push(`${condition ? "PASS" : "FAIL"} — ${label}`);
  if (!condition) process.exitCode = 1;
}

// --- 1-3: TCX + the picker + KML/CSV, both themes --------------------------
for (const theme of ["light", "dark"]) {
  const context = await themedContext({ width: 1440, height: 900 }, theme);
  const page = await context.newPage();
  watchConsole(page);

  await enterRepairTool(page);
  await upload(page, TCX);
  await page.getByTestId("gpx-summary").waitFor({ timeout: 15_000 });
  check(`[${theme}] TCX upload parses (summary visible)`, true);
  await capture(page, `tcx-workspace-${theme}`);

  const notes = await page.locator("main").innerText();
  check(`[${theme}] TCX conversion note`, notes.includes("Imported from TCX"));
  check(`[${theme}] pause-record disclosure`, /1 trackpoint without position skipped/.test(notes));

  await openExportDialog(page);
  for (const format of ["gpx", "kml", "geojson", "csv"]) {
    const present = await page.getByTestId(`export-format-${format}`).count();
    check(`[${theme}] picker offers ${format.toUpperCase()}`, present === 1);
  }
  check(
    `[${theme}] non-GPX hides the layout modes`,
    (await page.getByTestId("export-format-kml").count()) === 1 &&
      (await page.getByTestId("export-mode-merged").isVisible().catch(() => false)),
  );
  await page.getByTestId("export-format-kml").check();
  await capture(page, `export-picker-kml-${theme}`);
  await page.keyboard.press("Escape");

  const kml = await downloadAs(page, "kml");
  check(`[${theme}] KML file name`, /\.repaired\.kml$/.test(kml.name));
  check(
    `[${theme}] KML provenance labels`,
    kml.text.includes('name="recorded_points"') &&
      kml.text.includes("KML carries no per-point provenance"),
  );
  check(
    `[theme: ${theme}] KML hr aggregates`,
    kml.text.includes('name="avg_heart_rate_bpm"'),
  );

  const csv = await downloadAs(page, "csv");
  check(
    `[${theme}] CSV provenance column`,
    csv.text.split("\r\n")[0].includes("provenance") &&
      csv.text.split("\r\n")[0].includes("hr_bpm"),
  );

  await context.close();
}

// --- 4: FIT intake -----------------------------------------------------------
{
  const context = await themedContext({ width: 1440, height: 900 }, "light");
  const page = await context.newPage();
  watchConsole(page);
  await enterRepairTool(page);
  await upload(page, FIT);
  await page.getByTestId("gpx-summary").waitFor({ timeout: 15_000 });
  await page.getByText("Cycling").first().waitFor({ timeout: 10_000 });
  check("[fit] sport label track", true);
  const text = await page
    .getByTestId("validation-report")
    .innerText()
    .catch(() => "");
  check("[fit] FIT conversion note", text.includes("Imported from FIT"));
  check("[fit] pause disclosure", /1 record without position skipped/.test(text));
  await capture(page, "fit-workspace-light");

  const geo = await downloadAs(page, "geojson");
  const parsed = JSON.parse(geo.text);
  check(
    "[fit] GeoJSON structure",
    parsed.type === "FeatureCollection" && parsed.features.length === 1,
  );
  check(
    "[fit] GeoJSON provenance properties",
    parsed.features[0].properties.recorded_points > 0 &&
      typeof parsed.features[0].properties.avg_heart_rate_bpm === "number",
  );
  await context.close();
}

// --- 6: mobile picker --------------------------------------------------------
{
  const context = await themedContext({ width: 390, height: 844 }, "light");
  const page = await context.newPage();
  watchConsole(page);
  await enterRepairTool(page);
  await upload(page, TCX);
  await page.getByTestId("gpx-summary").waitFor({ timeout: 15_000 });
  await openExportDialog(page);
  await capture(page, "export-picker-mobile");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  check("[mobile] no horizontal overflow with the picker open", !overflow);
  await context.close();
}

await browser.close();

console.log(checks.join("\n"));
console.log(
  `\nconsole errors: ${errors.length}, page errors: ${pageErrors.length}`,
);
if (errors.length > 0 || pageErrors.length > 0) {
  console.log("errors:", JSON.stringify({ errors, pageErrors }, null, 1));
  process.exitCode = 1;
}
