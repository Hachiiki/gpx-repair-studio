import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { enterRepairTool } from "./helpers/landing";

/**
 * Phase 18 E2E — batch & portable sessions (§EE verification):
 *
 *   1. the multi-file queue: drop a defective file, a clean file, and
 *      a bad one — per-file statuses (parsed with findings / parsed
 *      clean / failed with the typed error), one bad file never
 *      blocking the rest, and the honest cap refusal;
 *   2. the studio: the aggregate line's derived numbers;
 *   3. the batch preset: per-file preview (nothing applied yet) →
 *      confirm → the file's status word flips to fixed, the queue
 *      summary counts it, and undo reverts one step;
 *   4. the ZIP export: the downloaded archive unzips to one repaired
 *      GPX per parsed file + MANIFEST.txt, with the fixed file's GPX
 *      carrying the honest repair note and the clean file's manifest
 *      line saying "no changes";
 *   5. the portable session: a repair fix → export .gpxrepair.json →
 *      reset → open the file → the fix log and the original file name
 *      come back;
 *   6. the sessions manager: save under a name → the shelf row with
 *      rename and delete.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

async function openBatchTool(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("landing-mode-batch").click();
  await page.getByTestId("batch-intake").waitFor({ state: "visible" });
}

async function dropFiles(page: Page, files: readonly string[]): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("batch-intake-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(files.map((f) => join(FIXTURES, f)));
}

test("batch: the queue reports per-file statuses; one bad file never blocks the rest", async ({
  page,
}) => {
  await openBatchTool(page);
  await dropFiles(page, ["deep-defects.gpx", "valid-1.1.gpx", "not-gpx.gpx"]);

  await page
    .locator('[data-testid="batch-intake-files"] li')
    .first()
    .waitFor({ timeout: 20_000 });
  await expect
    .poll(async () => page.locator('[data-testid^="batch-file-"]').count(), {
      timeout: 20_000,
    })
    .toBe(3);

  // All three settle: two parsed, one failed with the typed error.
  await expect
    .poll(
      async () =>
        page
          .locator('[data-testid^="batch-file-"]')
          .filter({ hasText: "points" })
          .count(),
      { timeout: 20_000 },
    )
    .toBe(2);
  await expect(
    page.locator('[data-testid^="batch-file-"]', { hasText: "Not a GPX" }),
  ).toHaveCount(1);

  // The gate counts the parsed files.
  await expect(page.getByTestId("batch-enter-studio")).toContainText(
    "2 parsed",
  );
});

test("batch: the cap refuses honestly (nothing silently dropped)", async ({
  page,
}) => {
  await openBatchTool(page);
  // 51 files at once — one past the 50-file cap.
  const many = Array.from({ length: 51 }, (_, i) => join(FIXTURES, "valid-1.1.gpx"));
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("batch-intake-zone").click();
  (await chooser).setFiles(many);

  await expect(page.getByTestId("batch-intake-refused")).toContainText(
    "was not added — the queue holds at most 50 files",
  );
  await expect
    .poll(async () => page.locator('[data-testid^="batch-file-"]').count(), {
      timeout: 30_000,
    })
    .toBe(50);
});

test("batch: preset preview → apply → fixed status → undo, then the honest ZIP", async ({
  page,
}) => {
  await openBatchTool(page);
  await dropFiles(page, ["deep-defects.gpx", "valid-1.1.gpx"]);
  await expect(page.getByTestId("batch-enter-studio")).toContainText(
    "2 parsed",
    { timeout: 20_000 },
  );
  await page.getByTestId("batch-enter-studio").click();
  await page.getByTestId("batch-section").waitFor({ state: "visible" });

  // The aggregate line: both files parsed, one with findings, one clean.
  await expect(page.getByTestId("batch-aggregate")).toContainText("2 parsed");
  await expect(page.getByTestId("batch-aggregate")).toContainText(
    "1 with findings",
  );
  await expect(page.getByTestId("batch-aggregate")).toContainText("1 clean");

  // The preset preview: per-file rows, the clean file says "nothing to do".
  await page.getByTestId("batch-preset-spike-sweep").click();
  await page.getByTestId("batch-preset-dialog").waitFor({ state: "visible" });
  await expect(page.getByTestId("batch-preset-file")).toHaveCount(2);
  await expect(
    page
      .getByTestId("batch-preset-file")
      .filter({ hasText: "valid-1.1.gpx" }),
  ).toContainText("nothing to do");
  await expect(
    page
      .getByTestId("batch-preset-file")
      .filter({ hasText: "deep-defects.gpx" }),
  ).toContainText("step");

  // Confirm → the defective file's status word flips to Fixed.
  await page.getByTestId("batch-preset-confirm").click();
  await expect(
    page.locator('[data-testid="batch-queue-row"][data-status="fixed"]'),
  ).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByTestId("batch-aggregate")).toContainText("1 fixed");

  // Undo reverts the chain one fix at a time (the log IS the undo
  // stack — spike-sweep chains two fixes, so two undos empty it; the
  // first undo pops the newer step and the older one becomes "last").
  const fixedRow = page.locator(
    '[data-testid="batch-queue-row"][data-status="fixed"]',
  );
  await fixedRow.getByTestId(/^batch-undo-/).click();
  await expect(fixedRow).toContainText("Last fix: Remove 2 speed spikes");
  await fixedRow.getByTestId(/^batch-undo-/).click();
  await expect(
    page.locator('[data-testid="batch-queue-row"][data-status="fixed"]'),
  ).toHaveCount(0);

  // Re-apply for the export leg of the test.
  await page.getByTestId("batch-preset-spike-sweep").click();
  await page.getByTestId("batch-preset-confirm").click();
  await expect(
    page.locator('[data-testid="batch-queue-row"][data-status="fixed"]'),
  ).toHaveCount(1, { timeout: 10_000 });

  // The ZIP: one repaired GPX per parsed file + the manifest.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("batch-download-zip").click(),
  ]);
  const bytes = new Uint8Array(readFileSync(await download.path()));
  const unzipped = unzipSync(bytes);
  expect(Object.keys(unzipped).sort()).toEqual([
    "MANIFEST.txt",
    "deep-defects.repaired.gpx",
    "valid-1.1.repaired.gpx",
  ]);

  // The fixed file's export carries the honest note; the manifest's
  // per-file lines agree with it.
  const fixedGpx = new TextDecoder().decode(
    unzipped["deep-defects.repaired.gpx"]!,
  );
  expect(fixedGpx).toContain("Repaired with GPX Repair Studio");
  const manifest = new TextDecoder().decode(unzipped["MANIFEST.txt"]!);
  expect(manifest).toContain("— deep-defects.gpx");
  expect(manifest).toContain("applied: Spike & outlier sweep");
  expect(manifest).toContain("— valid-1.1.gpx");
  expect(manifest).toContain("no changes (exported as recorded)");
  expect(manifest).toContain("1 of 2 files changed");

  // The export is a fact, not a lock: the rows keep working.
  await expect(
    page.getByTestId("batch-export-card").getByText(/Last export covered/),
  ).toBeVisible();
});

test("portable session: export the repair work, reset, open the file — everything comes back", async ({
  page,
}) => {
  // A repair session with one confirmed fix (work worth carrying).
  await page.goto("/");
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles([join(FIXTURES, "deep-defects.gpx")]);
  await page.getByTestId("deep-validation-card").waitFor({
    timeout: 20_000,
  });
  await page.getByTestId("deep-issue-fix-remove-spikes").first().click();
  await page.getByTestId("fix-preview-confirm").click();
  await expect(page.getByTestId("deep-change-row")).toHaveCount(1);

  // Export the session file from the manager.
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
  const [sessionDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("sessions-export-current").click(),
  ]);
  const sessionJson = readFileSync(await sessionDownload.path(), "utf8");
  const doc = JSON.parse(sessionJson) as {
    format: string;
    version: number;
    session: { workingEdits: unknown[]; kind: string };
    source?: { name: string };
  };
  expect(doc.format).toBe("gpxrepair-session");
  expect(doc.version).toBe(1);
  expect(doc.session.kind).toBe("file");
  expect(doc.session.workingEdits).toHaveLength(1);
  expect(doc.source?.name).toBe("deep-defects.gpx");
  await page.keyboard.press("Escape");

  // Reset, then open the exported file through the manager's door.
  await page.getByTestId("header-reset-button").click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("sessions-open-file-button").click(),
  ]);
  await fileChooser.setFiles([
    {
      name: "deep-defects.gpxrepair.json",
      mimeType: "application/json",
      buffer: Buffer.from(sessionJson, "utf8"),
    },
  ]);

  // The fix log and the original file name are back.
  await page.getByTestId("deep-validation-card").waitFor({
    timeout: 20_000,
  });
  await expect(page.getByTestId("deep-change-row")).toHaveCount(1);
  await expect(page.getByTestId("app-header")).toContainText(
    "deep-defects.gpx",
  );
});

test("sessions manager: save under a name, rename, delete", async ({
  page,
}) => {
  // A repair session with work (one fix).
  await page.goto("/");
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles([join(FIXTURES, "deep-defects.gpx")]);
  await page.getByTestId("deep-validation-card").waitFor({
    timeout: 20_000,
  });
  await page.getByTestId("deep-issue-fix-remove-spikes").first().click();
  await page.getByTestId("fix-preview-confirm").click();
  await expect(page.getByTestId("deep-change-row")).toHaveCount(1);

  // Save under a name → the shelf row appears with the section label.
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-save-name").fill("Morning fixes");
  await page.getByTestId("sessions-save-button").click();
  await expect(page.getByTestId("sessions-row")).toHaveCount(1);
  await expect(page.getByTestId("sessions-row")).toContainText(
    "Morning fixes",
  );
  await expect(page.getByTestId("sessions-row")).toContainText("Repair");

  // Rename inline.
  await page.getByTestId("sessions-rename-button").click();
  await page.getByTestId("sessions-rename-input").fill("Evening fixes");
  await page.getByTestId("sessions-rename-commit").click();
  await expect(page.getByTestId("sessions-row")).toContainText(
    "Evening fixes",
  );

  // Delete with the confirm.
  await page.getByTestId("sessions-delete-button").click();
  await page.getByTestId("sessions-delete-confirm").click();
  await expect(page.getByTestId("sessions-row")).toHaveCount(0);
  await expect(page.getByTestId("sessions-list")).toHaveCount(0);
});

test("sessions manager: a foreign file is refused with a plain sentence", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("sessions-import-button").click(),
  ]);
  await fileChooser.setFiles([join(FIXTURES, "valid-1.1.gpx")]);
  await expect(page.getByTestId("sessions-notice")).toContainText(
    "not a session file",
  );
});
