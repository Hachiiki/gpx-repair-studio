import { expect, test } from "@playwright/test";

/**
 * Application smoke test — the shell renders and stays healthy.
 *
 * Phase 2 shell: header with the app name, the upload hero (empty state),
 * and the footer with the privacy note. Deeper flow coverage lives in
 * upload-inspection.spec.ts.
 */

test.describe("app shell", () => {
  test("renders header, tool cards home, and footer", async ({ page }) => {
    await page.goto("/");

    const banner = page.getByRole("banner");
    await expect(banner).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "GPX Repair Studio" }),
    ).toBeVisible();

    const main = page.getByRole("main");
    await expect(main).toBeVisible();

    // Task 42: the landing opens on the tool cards — five doors (the
    // merge card joined in Task 43), each with its illustration,
    // instead of the tab switcher.
    await expect(
      page.getByRole("heading", { name: "What would you like to do?" }),
    ).toBeVisible();
    const cards = page.getByTestId("landing-mode-toggle");
    await expect(cards).toBeVisible();
    await expect(cards.locator("button")).toHaveCount(6);
    await expect(cards.locator("img")).toHaveCount(6);

    // Opening the repair card enters its page: hero, intake, and the
    // three-step workflow (Inspect, Repair, and the honesty promise).
    await page.getByTestId("landing-mode-repair").click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Repair incomplete GPS recordings",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("upload-zone")).toBeVisible();
    const steps = page.getByTestId("workflow-steps");
    await expect(steps).toBeVisible();
    await expect(steps).toContainText("Inspect");
    await expect(steps).toContainText("Repair");
    await expect(steps).toContainText("Honest by default");

    // Keyboard users can jump past the header to the main landmark.
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toHaveAttribute("href", "#main-content");

    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();
    await expect(
      footer.getByText(/all processing happens in your browser/i),
    ).toBeVisible();
  });

  test("shell is responsive at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "GPX Repair Studio" }),
    ).toBeVisible();
    // The cards stack one per row on mobile; the repair card still
    // opens its page with the intake.
    await page.getByTestId("landing-mode-repair").click();
    await expect(page.getByTestId("upload-zone")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("loads without console or page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "GPX Repair Studio" }),
    ).toBeVisible();
    // Exercise the new front door once — the card click is part of the
    // interactive surface under test.
    await page.getByTestId("landing-mode-repair").click();
    await expect(
      page.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();

    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });
});
