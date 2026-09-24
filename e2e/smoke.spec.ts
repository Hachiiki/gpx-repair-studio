import { expect, test } from "@playwright/test";

/**
 * Phase 0 smoke test — the application shell renders.
 *
 * The shell is the only user-visible surface in Phase 0: header with the app
 * name, a main placeholder region, and a footer with the privacy note.
 * No product features exist yet (upload arrives in Phase 2).
 */

test.describe("app shell", () => {
  test("renders header, main, and footer with the app name", async ({
    page,
  }) => {
    await page.goto("/");

    const banner = page.getByRole("banner");
    await expect(banner).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "GPX Repair Studio" }),
    ).toBeVisible();

    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Foundation ready" }),
    ).toBeVisible();

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
    await expect(page.getByRole("main")).toBeVisible();
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

    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });
});
