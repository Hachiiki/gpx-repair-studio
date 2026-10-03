import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";

/**
 * Phase 13 E2E — deep validation & repair presets: the full
 * find → preview → fix → export flow (§EE verification).
 *
 *   1. the defective fixture reports every damage kind, grouped by
 *      severity with counts, and the textual point list is the map's
 *      a11y equivalent;
 *   2. Jump moves the camera to the issue (asserted through the map
 *      controller's test bridge — zoom and center both change);
 *   3. a fix previews its plan, applies only on Confirm, clears its
 *      finding, and lands in the change log — Undo restores it;
 *   4. a preset previews the whole chain and applies every step;
 *   5. the stats panel labels the working copy as modified;
 *   6. the export carries the fixes: deleted points absent, smoothed
 *      elevation labeled (gpxr:modified), the metadata note disclosing
 *      every change;
 *   7. reload → restore brings the fix log back (schema v2 autosave).
 *
 * No network: the fixture triggers no routing (gap detection stays
 * quiet by construction — see the generator script).
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const DEFECTS = join(FIXTURES, "deep-defects.gpx");

async function uploadDefects(page: Page): Promise<void> {
  await page.goto("/");
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(DEFECTS);
  // The workspace appears with the deep card leading the tools column.
  await expect(page.getByTestId("deep-validation-card")).toBeVisible({
    timeout: 20_000,
  });
}

interface MapCamera {
  zoom: number;
  center: { lat: number; lon: number } | null;
}

async function camera(page: Page): Promise<MapCamera | null> {
  try {
    return await page.evaluate(() =>
      window.__gpxMapController
        ? (window.__gpxMapController.getTestState() as {
            zoom: number;
            center: { lat: number; lon: number } | null;
          })
        : null,
    );
  } catch {
    return null;
  }
}

async function waitForSaved(page: Page, section: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() =>
          window.__gpxrSessionRecovery
            ? (window.__gpxrSessionRecovery.getTestState() as {
                saved: Record<string, number>;
                pending: boolean;
              })
            : null,
        );
        return state !== null && !state.pending && (state.saved[section] ?? 0) > 0;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  // The fixture triggers no road routing; abort anyway for determinism.
  await page.route(/router\.project-osrm\.org|valhalla1\.openstreetmap\.de/, (route) =>
    route.abort(),
  );
});

test.describe("the report", () => {
  test("lists every damage kind, errors first, with counts", async ({ page }) => {
    await uploadDefects(page);
    const rows = page.getByTestId("deep-issue-row");
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toHaveAttribute("data-kind", "speed-spike");
    await expect(rows.first()).toContainText("×2");
    await expect(rows.nth(5)).toHaveAttribute("data-kind", "missing-elevation");
  });

  test("the textual point list expands with ids and coordinates", async ({ page }) => {
    await uploadDefects(page);
    const row = page.getByTestId("deep-issue-row").filter({
      hasText: "Speed spikes",
    });
    await row.getByTestId("deep-issue-list-toggle").click();
    await expect(row.getByText("t0s0:10")).toBeVisible();
    await expect(row.getByText(/52\.53/)).toBeVisible();
  });

  test("missing elevation is reported without a fix action", async ({ page }) => {
    await uploadDefects(page);
    const row = page.getByTestId("deep-issue-row").filter({
      hasText: "Missing elevation",
    });
    await expect(row.getByTestId(/deep-issue-fix-/)).toHaveCount(0);
  });
});

test.describe("jump to map", () => {
  test("moves the camera onto the issue point", async ({ page }) => {
    await uploadDefects(page);
    await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
    await expect
      .poll(async () => (await camera(page))?.zoom ?? 0, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const before = await camera(page);
    const spikeRow = page.getByTestId("deep-issue-row").filter({
      hasText: "Speed spikes",
    });
    await spikeRow.getByTestId("deep-issue-jump").click();
    await expect
      .poll(async () => {
        const after = await camera(page);
        return (
          after !== null &&
          before !== null &&
          (after.zoom !== before.zoom ||
            Math.abs((after.center?.lat ?? 0) - (before.center?.lat ?? 0)) > 1e-6 ||
            Math.abs((after.center?.lon ?? 0) - (before.center?.lon ?? 0)) > 1e-6)
        );
      }, { timeout: 10_000 })
      .toBe(true);
    // The camera settles ON the flagged point (52.53, 13.41).
    await expect
      .poll(async () => {
        const after = await camera(page);
        return (
          after !== null &&
          after.center !== null &&
          Math.abs(after.center.lat - 52.53) < 0.005 &&
          Math.abs(after.center.lon - 13.41) < 0.008
        );
      }, { timeout: 10_000 })
      .toBe(true);
  });
});

test.describe("fix flow — preview, confirm, log, undo", () => {
  test("remove-spikes previews, applies, clears the finding, and undoes", async ({ page }) => {
    await uploadDefects(page);

    // Preview gate: the dialog opens with the plan's own words.
    await page.getByTestId("deep-issue-fix-remove-spikes").click();
    const dialog = page.getByTestId("fix-preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("2 recorded points leave the working copy");
    await expect(dialog).toContainText("t0s0:10");

    // Cancel changes nothing.
    await page.getByTestId("fix-preview-cancel").click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId("deep-issue-row")).toHaveCount(6);

    // Confirm applies.
    await page.getByTestId("deep-issue-fix-remove-spikes").click();
    await page.getByTestId("fix-preview-confirm").click();
    await expect(page.getByTestId("deep-issue-row")).toHaveCount(5);
    const log = page.getByTestId("deep-change-row");
    await expect(log).toHaveCount(1);
    await expect(log.first()).toContainText("Remove 2 speed spikes");
    await expect(log.first()).toContainText("(newest)");

    // Undo restores the finding.
    await page.getByTestId("deep-undo-last").click();
    await expect(page.getByTestId("deep-issue-row")).toHaveCount(6);
    await expect(page.getByTestId("deep-change-row")).toHaveCount(0);
  });
});

test.describe("presets", () => {
  test("drift-cleanup applies its chain and clears both findings", async ({ page }) => {
    await uploadDefects(page);
    await page.getByTestId("deep-preset-drift-cleanup").click();
    const dialog = page.getByTestId("fix-preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Preset — Drift cleanup");
    // The compound preview shows both steps.
    await expect(page.getByTestId("fix-preview-plan")).toHaveCount(2);
    await page.getByTestId("fix-preview-confirm").click();

    await expect(page.getByTestId("deep-issue-row")).toHaveCount(4);
    const kinds = await page
      .getByTestId("deep-issue-row")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-kind")));
    expect(kinds).not.toContain("gps-drift");
    expect(kinds).not.toContain("duplicate-cluster");
    // Two log entries — one per step.
    await expect(page.getByTestId("deep-change-row")).toHaveCount(2);
  });
});

test.describe("stats + export carry the working copy", () => {
  test("the stats panel labels the modification", async ({ page }) => {
    await uploadDefects(page);
    await page.getByTestId("deep-issue-fix-remove-spikes").click();
    await page.getByTestId("fix-preview-confirm").click();
    const note = page.getByTestId("stats-working-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("2 points removed");
  });

  test("the export carries deletions, smoothing, and the honest note", async ({ page }) => {
    await uploadDefects(page);

    // Spike sweep preset: removal + smoothing in one chain.
    await page.getByTestId("deep-preset-spike-sweep").click();
    await page.getByTestId("fix-preview-confirm").click();
    await expect(page.getByTestId("deep-issue-row")).toHaveCount(4);

    await page.getByTestId("open-export-button").click();
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("export-working-note")).toContainText(
      "2 points removed",
    );
    await expect(page.getByTestId("export-working-note")).toContainText(
      "1 elevation smoothed",
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-download-button").click(),
    ]);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const xml = readFileSync(path, "utf8");

    // The teleport pair is gone (43 points remain).
    expect((xml.match(/<trkpt/g) ?? []).length).toBe(43);
    // The smoothed elevation is labeled with the gpxr:modified marker.
    expect(xml).toContain("gpxr:modified");
    expect(xml).toContain('eleMethod="interpolated"');
    // The recorded 118 m spike value is gone.
    expect(xml).not.toContain("<ele>118</ele>");
    // The metadata note discloses both changes.
    expect(xml).toContain("Working copy:");
    expect(xml).toContain(
      "2 points were removed (by fixes or manual range deletions)",
    );
    expect(xml).toContain("1 elevation was smoothed");
  });
});

test.describe("reload restores the fix log (schema v2)", () => {
  test("fix → autosave → reload → prompt → restore → log intact", async ({ page }) => {
    await uploadDefects(page);
    await page.getByTestId("deep-issue-fix-remove-spikes").click();
    await page.getByTestId("fix-preview-confirm").click();
    await expect(page.getByTestId("deep-change-row")).toHaveCount(1);

    await waitForSaved(page, "repair");
    await page.reload();

    const prompt = page.getByTestId("restore-prompt");
    await expect(prompt).toBeVisible();
    await expect(page.getByTestId("restore-offer-repair")).toContainText(
      "1 fix",
    );
    await page.getByTestId("restore-accept-repair").click();

    await expect(page.getByTestId("deep-validation-card")).toBeVisible({
      timeout: 20_000,
    });
    // The restored working copy already has the fix applied.
    await expect(page.getByTestId("deep-issue-row")).toHaveCount(5);
    await expect(page.getByTestId("deep-change-row")).toHaveCount(1);
  });
});
