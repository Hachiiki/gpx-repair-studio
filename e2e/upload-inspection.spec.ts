import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSyntheticGpx } from "../src/features/gpx/fixtures/generators";

/**
 * Phase 2 E2E — the upload & inspection acceptance criteria:
 *
 *   1. upload fixture → gaps listed (with kind/elapsed/diagnostics)
 *   2. invalid file → actionable error
 *   3. no-timestamp file → "no timing data" mode
 *   4. threshold settings changes re-run detection (+ persistence)
 *   5. 100k-point fixture loads without freeze (loose timing)
 *
 * Fixtures are the committed corpus from Phase 1 (src/features/gpx/fixtures)
 * plus one large synthetic file regenerated deterministically per run
 * (gitignored — see .gitignore).
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const GENERATED_DIR = join("e2e", "fixtures");
const LARGE_FILE = join(GENERATED_DIR, "synthetic-100k.generated.gpx");

test.beforeAll(() => {
  mkdirSync(GENERATED_DIR, { recursive: true });
  // Deterministic (fixed seed): 100k points, one 10-minute recording gap
  // after point 50,000.
  writeFileSync(
    LARGE_FILE,
    generateSyntheticGpx({
      pointCount: 100_000,
      seed: 42,
      withTime: true,
      withEle: true,
      timeGapAfter: 50_000,
      timeGapSeconds: 600,
    }),
  );
});

/** Upload a file through the zone's file picker. */
async function upload(page: import("@playwright/test").Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

test.describe("upload & inspection", () => {
  test("valid file shows summary, gaps, and original-only stats", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));

    const summary = page.getByTestId("gpx-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("time-gap.gpx");
    await expect(summary).toContainText("Paused Watch");

    // The detected 5-minute pause, with elapsed time and boundaries.
    const gapList = page.getByTestId("gap-list");
    await expect(gapList).toContainText("Time gap");
    await expect(gapList).toContainText("5:00 elapsed");

    const stats = page.getByTestId("stats-panel");
    await expect(stats).toContainText("0:18"); // recorded moving time
    await expect(stats).toContainText("5:18"); // wall time
    await expect(stats).toContainText("Recorded");

    await expect(page.getByTestId("segment-list")).toContainText(
      "1 segment across 1 track",
    );
    await expect(page.getByTestId("validation-report")).toBeVisible();
  });

  test("malformed file shows a precise, actionable error", async ({ page }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "malformed.gpx"));

    const error = page.getByTestId("session-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("Not well-formed XML");
    // Retry is immediately possible.
    await expect(page.getByTestId("upload-zone")).toBeVisible();
  });

  test("non-GPX XML shows the not-a-GPX-file error", async ({ page }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "not-gpx.gpx"));

    await expect(page.getByTestId("session-error")).toContainText(
      "Not a GPX file",
    );
  });

  test("no-timestamp file enters the no-timing-data mode", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "no-time.gpx"));

    await expect(page.getByTestId("no-timing-data-badge")).toBeVisible();
    await expect(page.getByTestId("no-timing-note")).toBeVisible();
    const stats = page.getByTestId("stats-panel");
    await expect(stats).toContainText("Recorded moving time");
    // Time cells fall back to "—" — nothing is fabricated.
    await expect(
      stats.getByRole("row", { name: /Recorded moving time/ }),
    ).toContainText("—");
  });

  test("threshold changes re-run detection and persist across reloads", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await expect(page.getByTestId("gap-row")).toHaveCount(1);

    // Raise the time-gap threshold to 300 s: the 5-minute pause (exactly
    // 300 s) is no longer *strictly greater* than the threshold.
    await page.getByRole("button", { name: "Detection settings" }).click();
    const input = page.getByLabel("Time gap threshold", { exact: true });
    await input.fill("300");
    await input.blur();

    await expect(
      page.getByText("No gaps detected with the current thresholds."),
    ).toBeVisible();

    // Settings persist (localStorage, settings only) across a reload…
    await page.reload();
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await expect(
      page.getByText("No gaps detected with the current thresholds."),
    ).toBeVisible();

    // …and reset to defaults brings the gap back.
    await page.getByRole("button", { name: "Detection settings" }).click();
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.getByTestId("gap-row")).toHaveCount(1);
  });

  test("100k-point fixture loads without freezing (loose timing)", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, LARGE_FILE);

    // Loose budget: the page must reach the parsed state well inside 30 s
    // and remain interactive afterwards (no frozen main thread).
    const summary = page.getByTestId("gpx-summary");
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary).toContainText("100,000 points");

    // The injected 10-minute pause is detected on the large file.
    await expect(page.getByTestId("gap-row")).toHaveCount(1);

    // Interactivity check: the header action still responds.
    await page.getByRole("button", { name: "New file" }).click();
    await expect(page.getByTestId("upload-zone")).toBeVisible();
  });
});
