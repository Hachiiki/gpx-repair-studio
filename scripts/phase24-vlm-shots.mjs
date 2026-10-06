/**
 * Phase 24 VLM sweep — screenshots of the new surfaces (the library
 * cards + toolbar, the records tab, the trends tab) in both themes,
 * saved under scripts/qa/phase24/ for the VLM critique pass.
 *
 * Seeding rides the bundle-import door (same as the e2e): two
 * ride.tcx sessions onto the shelf, then the manager's tabs.
 */
import { chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");
const OUT = "scripts/qa/phase24";
mkdirSync(OUT, { recursive: true });

/** The two-session bundle (a user's backup file). */
function bundlePath() {
  const rideXml = readFileSync(join(FORMAT_FIXTURES, "ride.tcx"), "utf8");
  const record = {
    schemaVersion: 2,
    kind: "file",
    section: "repair",
    savedAt: 1_700_000_000_000,
    fileName: "ride.tcx",
    gapThresholds: {
      timeGapMs: 120_000,
      speedAnomalyKmh: 25,
      speedDtGuardMs: 10_000,
    },
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
    sessions: ["Morning Ride", "Second Ride", "Third Ride"].map((name) => ({
      name,
      record,
      source: {
        name: "ride.tcx",
        type: "application/vnd.garmin.tcx+xml",
        encoding: "text",
        data: rideXml,
      },
    })),
  };
  const dir = mkdtempSync(join(tmpdir(), "gpxr-vlm24-"));
  const path = join(dir, "library.gpxrepair.json");
  writeFileSync(path, JSON.stringify(bundle, null, 2));
  return path;
}

const SEEDED = bundlePath();
const browser = await chromium.launch();

async function shot(theme, name, action) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript((t) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem(
      "gpx-repair-studio.tool-tours.v1",
      JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
    );
    localStorage.setItem("gpx-repair-studio.theme.v1", JSON.stringify({ state: { theme: t }, version: 0 }));
  }, theme);
  await page.goto("http://localhost:3000/");

  // Seed the shelf through the import door, then open the manager.
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("sessions-import-button").click();
  (await chooser).setFiles(SEEDED);
  await page.getByTestId("library-card-stats").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);

  await action(page);
  await page.screenshot({ path: join(OUT, `${theme}-${name}.png`), fullPage: false });
  await page.close();
}

await shot("light", "library-cards", async (page) => {
  await page.waitForTimeout(200);
});
await shot("dark", "library-cards", async (page) => {
  await page.getByTestId("library-card-select").nth(0).check();
  await page.waitForTimeout(200);
});
await shot("light", "records", async (page) => {
  await page.getByTestId("library-tab-records").click();
  await page.getByTestId("records-card").waitFor();
  await page.waitForTimeout(300);
});
await shot("dark", "records", async (page) => {
  await page.getByTestId("library-tab-records").click();
  await page.getByTestId("riegel-enable").click();
  await page.getByTestId("riegel-table").waitFor();
  await page.waitForTimeout(300);
});
await shot("light", "trends", async (page) => {
  await page.getByTestId("library-tab-trends").click();
  await page.getByTestId("trends-volume-svg").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
});
await shot("dark", "trends", async (page) => {
  await page.getByTestId("library-tab-trends").click();
  await page.getByTestId("trends-volume-table-toggle").click();
  await page.waitForTimeout(300);
});

await browser.close();
console.log("screenshots saved to", OUT);
