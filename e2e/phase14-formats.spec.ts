import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";
import { enterRepairTool } from "./helpers/landing";

/**
 * Phase 14 E2E — formats in & out (§EE 14):
 *
 *   1. TCX import rides the normal pipeline: gaps detected, the spike
 *      found by deep validation, one-click fix → change log — then the
 *      export dialog offers every format and each download carries the
 *      provenance labels (KML ExtendedData, GeoJSON properties, the CSV
 *      provenance column).
 *   2. FIT import parses (session → track, records → one segment, the
 *      pause record skipped + disclosed) and exports as GPX with the
 *      metrics passthrough in the bytes.
 *   3. An unknown format fails with the honest typed error.
 *
 * Assertions read the DOM and the downloaded bytes — the file is the
 * contract.
 */

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");

async function upload(page: Page, path: string) {
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

/** Open the export dialog, pick a format, download, and read the bytes. */
async function exportAs(
  page: Page,
  format: "gpx" | "kml" | "geojson" | "csv",
): Promise<{ text: string; fileName: string }> {
  await page.getByTestId("open-export-button").click();
  const dialog = page.getByTestId("export-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId(`export-format-${format}`).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-download-button").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`\\.repaired\\.${format === "geojson" ? "geojson" : format}$`),
  );
  const path = await download.path();
  if (path === null) throw new Error("download produced no file");
  return {
    text: readFileSync(path, "utf8"),
    fileName: download.suggestedFilename(),
  };
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("Phase 14 — formats in & out", () => {
  test("TCX import → deep-validation fix → export in every format", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FORMAT_FIXTURES, "ride.tcx"));

    // The converted model feeds the whole pipeline: summary + gaps.
    await expect(page.getByTestId("gpx-summary")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("gap-list")).toBeVisible();
    // The import disclosures surface in the parse report.
    await expect(page.getByText("Imported from TCX")).toBeVisible();
    await expect(page.getByText(/1 trackpoint without position skipped/)).toBeVisible();

    // The teleport point is found by deep validation; fix it (Phase 13
    // flow — preview → confirm → logged) so the exports carry a
    // working-copy disclosure.
    await expect(page.getByTestId("deep-validation-card")).toBeVisible({
      timeout: 15_000,
    });
    const spikeRow = page
      .getByTestId("deep-issue-row")
      .filter({ hasText: "teleport" });
    await expect(spikeRow).toHaveCount(1);
    await spikeRow.getByTestId("deep-issue-fix-remove-spikes").click();
    await expect(page.getByTestId("fix-preview-dialog")).toBeVisible();
    await page.getByTestId("fix-preview-confirm").click();
    await expect(page.getByTestId("deep-change-row")).toHaveCount(1);

    // --- KML --------------------------------------------------------------
    const kml = await exportAs(page, "kml");
    expect(kml.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(kml.text).toContain("<kml xmlns=\"http://www.opengis.net/xml/kml/2.2\">");
    expect(kml.text).toContain("<LineString>");
    expect(kml.text).toContain("145.1,-37.95,42");
    // Provenance labels + the working-copy disclosure.
    expect(kml.text).toContain('<Data name="recorded_points">');
    // The teleport is an out-and-back jump: BOTH damaged points leave.
    expect(kml.text).toContain("2 damaged points were removed");
    expect(kml.text).toContain("KML carries no per-point provenance");
    // The hr passthrough shows up as per-track aggregates.
    expect(kml.text).toContain('name="avg_heart_rate_bpm"');

    // --- GeoJSON ------------------------------------------------------------
    const geo = await exportAs(page, "geojson");
    const collection = JSON.parse(geo.text);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].geometry.type).toBe("MultiLineString");
    expect(collection.features[0].properties.recorded_points).toBeGreaterThan(0);
    expect(collection.features[0].properties.modified_points).toBe(0);
    expect(collection.properties.note).toContain("Per-point provenance");

    // --- CSV ----------------------------------------------------------------
    const csv = await exportAs(page, "csv");
    const lines = csv.text.split("\r\n");
    expect(lines[0]).toBe(
      "track,segment,point,latitude,longitude,elevation_m,time_iso,provenance,hr_bpm,cadence_rpm,power_w",
    );
    // Point 1 is recorded with hr; the spike point is gone.
    expect(lines[1]).toContain("-37.95,145.1,42,");
    expect(lines[1]).toContain(",recorded,");
    expect(csv.text).toContain("2024-05-01T06:00:00Z");
    expect(csv.text).not.toContain("-37.89822"); // the teleport coordinate

    // --- GPX still the full-fidelity export ----------------------------------
    const gpx = await exportAs(page, "gpx");
    expect(gpx.text).toContain("<trkpt");
    // Deletions are disclosed in the note (points are simply absent);
    // the metrics passthrough rides the standard gpxtpx extension.
    expect(gpx.text).toContain("2 damaged points were removed");
    expect(gpx.text).not.toContain("-37.89822"); // the teleport coordinate
    expect(gpx.text).toContain(
      '<extensions xmlns="http://www.topografix.com/GPX/1/1"><gpxtpx:TrackPointExtension',
    );
    expect(gpx.text).toContain("<gpxtpx:hr>120</gpxtpx:hr>");

    // The export format persists (a remembered ui-store setting — the
    // picker wrote each choice; the last export was GPX).
    const stored = await page.evaluate(() =>
      localStorage.getItem("gpx-repair-studio.settings.v1"),
    );
    expect(stored).toContain('"exportFormat":"gpx"');
    expect(stored).toContain('"exportMode":"structure-preserving"');
  });

  test("FIT import parses and exports as GPX with the metrics passthrough", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FORMAT_FIXTURES, "activity.fit"));

    await expect(page.getByTestId("gpx-summary")).toBeVisible({
      timeout: 15_000,
    });
    // Session → track (sport label), 7 positioned points.
    await expect(page.getByText("Cycling")).toBeVisible();
    await expect(page.getByText("Imported from FIT")).toBeVisible();
    await expect(page.getByText(/1 record without position skipped/)).toBeVisible();

    const gpx = await exportAs(page, "gpx");
    expect(gpx.text).toContain("<trkpt");
    expect(gpx.text).toContain("<gpxtpx:hr>120</gpxtpx:hr>");
    expect(gpx.text).toContain("<gpxtpx:cad>82</gpxtpx:cad>");
    // Values, not bytes: the FIT semicircle degrees survive.
    expect(gpx.text).toContain('lat="-37.950000017881');

    // CSV carries the metrics columns for FIT imports too.
    const csv = await exportAs(page, "csv");
    expect(csv.text.split("\r\n")[0]).toContain("hr_bpm");
  });

  test("the truncated FIT recovers its records and discloses the damage", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FORMAT_FIXTURES, "truncated.fit"));

    await expect(page.getByTestId("gpx-summary")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/5 records? recovered/)).toBeVisible();
    await expect(page.getByText("File CRC mismatch")).toBeVisible();
  });

  test("an unknown format fails with the honest typed error", async ({ page }) => {
    await page.goto("/");
    await enterRepairTool(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    const fileChooser = await chooser;
    await fileChooser.setFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("just some plain text, no markup at all\n"),
    });
    await expect(page.getByText("Unsupported file format")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/unrecognized text content/)).toBeVisible();
  });

  test("the intake advertises every accepted format", async ({ page }) => {
    await page.goto("/");
    await enterRepairTool(page);
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute("accept", ".gpx,.tcx,.fit,.xml");
    await expect(page.getByTestId("upload-zone")).toContainText(
      "Drop your GPX, TCX, or FIT file here",
    );
  });
});
