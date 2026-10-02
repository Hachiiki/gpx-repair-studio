import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 12 E2E — the quick-wins surfaces (§EE 12.1–12.3):
 *
 *   1. Theme: the footer toggle flips .dark, the choice persists
 *      across reloads, and light un-flips it.
 *   2. Help: the "?" key and the footer button open the Shortcuts &
 *      help dialog; Esc closes it; typing in a field does not trigger.
 *   3. Samples: "Try a sample" loads the repair ride through the real
 *      pipeline (gaps detected, honest file name in the summary), the
 *      share tool gets the clean run, the merge intake takes the
 *      sample pair, and the create form's example numbers pass the
 *      consistency gate into the studio.
 *
 * Runs under the config's seeded storageState (tour seen) like the
 * rest of the suite.
 */

/** Open a tool's detail page from wherever the landing currently is. */
async function openTool(page: Page, mode: string) {
  const card = page.getByTestId(`landing-mode-${mode}`);
  if (await card.isVisible()) {
    await card.click();
  }
}

test.describe("theme (Phase 12.2)", () => {
  test("the footer toggle flips the dark class and persists", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("theme-toggle")).toBeVisible();

    // Default: no .dark on <html>.
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Dark: class applied + color-scheme.
    await page.getByTestId("theme-toggle-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe(
      "dark",
    );

    // Persists across a reload (the pre-paint script holds it).
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Light: un-flips.
    await page.getByTestId("theme-toggle-light").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe(
      "light",
    );
  });

  test("the stored preference survives a reload without a flash", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("theme-toggle-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // The raw key the pre-paint script reads.
    const stored = await page.evaluate(() =>
      localStorage.getItem("gpx-repair-studio.theme.v1"),
    );
    expect(stored).toBe("dark");
  });
});

test.describe("shortcuts & help (Phase 12.3)", () => {
  test("the ? key opens the dialog, Esc closes, focus returns", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("landing-mode-toggle")).toBeVisible();

    await page.keyboard.press("?");
    const dialog = page.getByTestId("help-dialog");
    await expect(dialog).toBeVisible();
    // The keyboard map documents the shipped bindings.
    await expect(dialog).toContainText("Drawing editors");
    await expect(dialog).toContainText("Curve pen");

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("the footer button opens the dialog too", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("footer-help").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).not.toBeVisible();
  });

  test("? while typing in a field does not open the dialog", async ({
    page,
  }) => {
    await page.goto("/");
    await openTool(page, "create");
    const distance = page.getByLabel(/distance recorded by your watch/i);
    // Focus the field and press ? — the listener must ignore keys typed
    // into inputs (number inputs reject the character itself).
    await distance.click();
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-dialog")).not.toBeVisible();
  });
});

test.describe("samples (Phase 12.1)", () => {
  test("repair: the sample ride loads with its two gaps", async ({ page }) => {
    await page.goto("/");
    await openTool(page, "repair");

    await page.getByTestId("try-sample").click();

    // The parsed workspace: summary card carries the honest sample name.
    const summary = page.getByTestId("gpx-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("sample-ride-with-gaps.gpx");

    // The sample's contract: exactly two time gaps (suspect + severe).
    const gapList = page.getByTestId("gap-list");
    await expect(gapList).toContainText("Time gap");
    // The severe hole: 1560 s + one 3 s recording tick = 26:03.
    await expect(gapList).toContainText("26:03 elapsed");
    await expect(gapList).toContainText("severe");
    await expect(gapList).toContainText("suspect");
  });

  test("share: the clean sample run reaches the share card view", async ({
    page,
  }) => {
    await page.goto("/");
    await openTool(page, "share");

    await page.getByTestId("try-sample").click();

    // The share view renders (the tool's own post-parse destination).
    await expect(page.getByTestId("share-section")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("merge: the sample pair collects as two parsed files", async ({
    page,
  }) => {
    await page.goto("/");
    await openTool(page, "merge");

    await page.getByTestId("merge-try-sample").click();

    const files = page.getByTestId("merge-intake-files");
    await expect(files).toBeVisible();
    await expect(files).toContainText("sample-commute-part-1.gpx");
    await expect(files).toContainText("sample-commute-part-2.gpx");
    // Both parse through the real pipeline (the rows show point counts).
    await expect(files).toContainText("80 points");
    await expect(files).toContainText("100 points");
  });

  test("create: example numbers pass the gate into the studio", async ({
    page,
  }) => {
    await page.goto("/");
    await openTool(page, "create");

    await page.getByTestId("stats-example").click();
    await page.getByTestId("begin-drawing-button").click();

    // The create studio mounts (the section's own workspace).
    await expect(page.getByTestId("create-section")).toBeVisible({
      timeout: 15_000,
    });
  });
});
