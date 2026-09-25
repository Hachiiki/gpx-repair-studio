import { expect, test } from "@playwright/test";
import { join } from "node:path";

/**
 * Real-world Strava samples — E2E upload coverage (user-supplied files).
 *
 * docs/strava_gpx_original.gpx is THE regression that motivated the parser's
 * undeclared-prefix recovery: a GloryFit watch original whose gpxtpx:
 * extensions carry no xmlns declaration. Before the fix this upload died on
 * "Not well-formed XML" (unbound prefix) — the exact user-visible symptom
 * "only certain GPX formats can be understood".
 *
 * Both files describe the SAME training run, exported two ways:
 *   - original: GloryFit device file (GPX 1.0, undeclared gpxtpx, hr+cad)
 *   - export:   Strava's processed copy (GPX 1.1, declared namespaces, hr)
 */

const DOCS = join("docs");

/** Upload a file through the zone's file picker. */
async function upload(page: import("@playwright/test").Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

test.describe("real Strava files", () => {
  test("GloryFit original (undeclared gpxtpx) uploads, warns, and renders", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(DOCS, "strava_gpx_original.gpx"));

    // The recovery worked: summary, not an error.
    await expect(page.getByTestId("session-error")).toHaveCount(0);
    const summary = page.getByTestId("gpx-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("strava_gpx_original.gpx");
    await expect(summary).toContainText("GloryFitPro");
    await expect(summary).toContainText("320"); // track points

    // The recovery is surfaced honestly as one warning, naming the prefix.
    const report = page.getByTestId("validation-report");
    await expect(report).toBeVisible();
    await expect(report).toContainText("1 warning");
    await expect(report).toContainText("Undeclared namespace prefix");
    await expect(report).toContainText("gpxtpx");

    // The run itself is intact: one segment, ~3.7 km, map rendered.
    await expect(page.getByTestId("segment-list")).toContainText(
      "1 segment across 1 track",
    );
    await expect(page.getByTestId("stats-panel")).toContainText("3.6");
    await expect(page.getByTestId("map-canvas")).toBeVisible();

    // No gaps detected here — and the repair tools are available anyway
    // (draw-anywhere; detection is a helper, never a gate).
    await expect(page.getByTestId("gap-list")).toContainText(
      "No gaps detected",
    );
    await expect(page.getByTestId("begin-pick-anchor-button")).toBeVisible();
    await expect(page.getByTestId("begin-pick-pair-button")).toBeVisible();

    await page.screenshot({ path: "download/strava-gloryfit-recovered.png" });
  });

  test("Strava processed export uploads clean with no findings", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(DOCS, "strava_gpx_export.gpx"));

    await expect(page.getByTestId("session-error")).toHaveCount(0);
    const summary = page.getByTestId("gpx-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("strava_gpx_export.gpx");
    await expect(summary).toContainText("StravaGPX");
    await expect(summary).toContainText("320");

    // Track name surfaces in the segment list (Strava puts it on <trk>,
    // not in <metadata> — the summary card is file-level only).
    await expect(page.getByTestId("segment-list")).toContainText(
      "5th Day Week 2 Sub 30 Training",
    );

    // Namespaces were properly declared: nothing to report.
    const report = page.getByTestId("validation-report");
    await expect(report).toContainText("No problems found");

    await expect(page.getByTestId("segment-list")).toContainText(
      "1 segment across 1 track",
    );
    await expect(page.getByTestId("stats-panel")).toContainText("3.6");
    await expect(page.getByTestId("map-canvas")).toBeVisible();
  });

  test("GloryFit original never overflows the mobile viewport (URI wrap)", async ({
    page,
  }) => {
    // Regression: the undeclared-namespace warning embeds
    // xmlns:gpxtpx="http://www.garmin.com/xmlschemas/…" — one long
    // unbreakable token. It used to push the workspace grid to ~614 px
    // on a 390 px viewport (the reported "UI and layout is broken").
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await upload(page, join(DOCS, "strava_gpx_original.gpx"));

    // The warning (and its URI) is present…
    const report = page.getByTestId("validation-report");
    await expect(report).toBeVisible();
    await expect(report).toContainText("Undeclared namespace prefix");
    await expect(report).toContainText("garmin.com/xmlschemas");

    // …and the page never scrolls horizontally because of it.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
