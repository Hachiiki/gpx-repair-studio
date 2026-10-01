/**
 * Phase 11 — axe scan of the new interactive surfaces (the Phase 8
 * contract extended): the onboarding tour overlay, the About pane,
 * and the Privacy & Data pane. Zero critical violations allowed.
 */
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "critical");
}

test.describe("Phase 11 surfaces — axe", () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [{ name: "gpx-repair-studio.tour.v1", value: "seen" }],
        },
      ],
    },
  });

  test("the info dialog's panes carry zero critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("footer-privacy").click();
    await page.getByTestId("privacy-pane").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    const privacy = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(privacy), JSON.stringify(criticals(privacy))).toEqual([]);

    await page.getByTestId("info-tab-about").click();
    await page.getByTestId("about-pane").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    const about = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(about), JSON.stringify(criticals(about))).toEqual([]);

    await page.keyboard.press("Escape");
    await page.getByTestId("info-dialog").waitFor({ state: "detached" });
  });
});

test.describe("the onboarding tour — axe (fresh browser)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the tour overlay carries zero critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("onboarding-tour").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    const step1 = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(step1), JSON.stringify(criticals(step1))).toEqual([]);

    await page.getByTestId("tour-next").click();
    await page.getByTestId("tour-step-title-1").waitFor({ state: "visible" });
    const step2 = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(step2), JSON.stringify(criticals(step2))).toEqual([]);
  });
});
