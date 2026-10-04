/**
 * Phase 19 E2E — the per-tool guided walkthroughs (§EE 19.3
 * verification: "tour replay e2e"):
 *
 *   1. the help dialog's walkthroughs section lists all seven tools
 *      and starts a tour (one dialog at a time — help closes first);
 *   2. the tour steps navigate (Next/Back), the sample action loads
 *      the teaching payload through the real pipeline, and finishing
 *      writes the seen-flag;
 *   3. replay works after the flag is seen (the help list's whole job);
 *   4. the first-visit OFFER: a fresh browser entering a tool's page
 *      sees the dismissible banner; Start opens the tour; Dismiss
 *      remembers exactly like finishing.
 *
 * The specs opt OUT of the seeded tool-tour flags (fresh browser per
 * test), exactly like the onboarding tour's spec.
 */
import { expect, test, type Page } from "@playwright/test";
import { enterRepairTool } from "./helpers/landing";

const FRESH_STATE = {
  cookies: [],
  origins: [
    {
      origin: "http://localhost:3000",
      localStorage: [
        { name: "gpx-repair-studio.tour.v1", value: "seen" },
        // NOTE: gpx-repair-studio.tool-tours.v1 deliberately NOT seeded.
      ],
    },
  ],
};

/** Walk the tour to its end, tolerating re-render churn while the
 * workspace appears under the dialog (buttons detach mid-click). */
async function finishTour(page: Page): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const next = page.getByTestId("tool-tour-next");
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("tool-tour")).not.toBeVisible({
    timeout: 10_000,
  });
}

test.describe("Phase 19 — tool tours", () => {
  test.use({ storageState: FRESH_STATE });

  test("the help dialog lists every walkthrough and starts one", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("?");
    const help = page.getByTestId("help-dialog");
    await expect(help).toBeVisible();

    for (const id of [
      "repair",
      "share",
      "recovery",
      "create",
      "merge",
      "plan",
      "batch",
    ]) {
      await expect(page.getByTestId(`help-tour-${id}`)).toBeVisible();
    }

    // Start closes the help dialog and opens the tour.
    await page.getByTestId("help-tour-repair").click();
    await expect(help).not.toBeVisible();
    const tour = page.getByTestId("tool-tour");
    await expect(tour).toBeVisible();
    await expect(tour).toHaveAttribute("data-tour-id", "repair");
    await expect(page.getByTestId("tool-tour-step-title-0")).toBeVisible();
  });

  test("steps navigate; finishing writes the seen-flag; replay still works", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("?");
    await page.getByTestId("help-tour-plan").click();

    const tour = page.getByTestId("tool-tour");
    await expect(tour).toHaveAttribute("data-tour-id", "plan");

    // Walk the steps: Next → Back → Next … to the end.
    await page.getByTestId("tool-tour-next").click();
    await expect(page.getByTestId("tool-tour-back")).toBeVisible();
    await page.getByTestId("tool-tour-back").click();
    await expect(page.getByTestId("tool-tour-step-title-0")).toBeVisible();
    await finishTour(page);

    // The flag was written.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.localStorage.getItem("gpx-repair-studio.tool-tours.v1"),
          ),
      )
      .toContain('"plan":"seen"');

    // Replay from the help dialog — seen flags never block a replay.
    await page.keyboard.press("?");
    await page.getByTestId("help-tour-plan").click();
    await expect(page.getByTestId("tool-tour")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("the sample action loads the teaching payload through the real pipeline", async ({
    page,
  }) => {
    await page.goto("/");
    await enterRepairTool(page);
    await page.keyboard.press("?");
    await page.getByTestId("help-tour-repair").click();

    // Step 1 carries the action; the session is idle, so it can run.
    const action = page.getByTestId("tool-tour-action");
    await expect(action).toBeVisible();
    await expect(action).toHaveText("Load the sample ride");
    await action.click();

    // The sample parses through the same pipeline as an upload; the
    // tour advanced to step 2 while the workspace appeared.
    await expect(page.getByTestId("map-canvas")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("tool-tour-step-title-1")).toBeVisible();
    // Finishing writes the flag (the sample already proved the flow).
    await finishTour(page);
  });

  test("the first-visit offer: dismiss remembers; a later visit stays quiet", async ({
    page,
  }) => {
    await page.goto("/");
    await enterRepairTool(page);

    const offer = page.getByTestId("tool-tour-offer");
    await expect(offer).toBeVisible();
    await expect(offer).toContainText("Repair a recording");

    await page.getByTestId("tool-tour-offer-dismiss").click();
    await expect(offer).not.toBeVisible();
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.localStorage.getItem("gpx-repair-studio.tool-tours.v1"),
          ),
      )
      .toContain('"repair":"seen"');

    // Leaving and re-entering the tool does not re-offer.
    await page.goto("/");
    await enterRepairTool(page);
    await expect(page.getByTestId("upload-zone")).toBeVisible();
    await expect(page.getByTestId("tool-tour-offer")).toHaveCount(0);
  });

  test("the offer's Start opens the tour directly", async ({ page }) => {
    await page.goto("/");
    await enterRepairTool(page);
    await page.getByTestId("tool-tour-offer-start").click();
    const tour = page.getByTestId("tool-tour");
    await expect(tour).toBeVisible();
    await expect(tour).toHaveAttribute("data-tour-id", "repair");
    await page.getByTestId("tool-tour-skip").click();
    await expect(tour).not.toBeVisible();
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.localStorage.getItem("gpx-repair-studio.tool-tours.v1"),
          ),
      )
      .toContain('"repair":"seen"');
  });
});
