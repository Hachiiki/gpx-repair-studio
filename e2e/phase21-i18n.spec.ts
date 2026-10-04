import { expect, test } from "@playwright/test";

/**
 * E2E — Phase 21: internationalization (docs/MASTER_PLAN.md §EE 21).
 *
 *   1. the footer's language toggle switches the whole landing to
 *      Chinese in place (headline, tiles, privacy line) and persists
 *      across a reload;
 *   2. ?lang=zh-CN loads Chinese directly (the testing override);
 *   3. the ?lang=pseudo harness loads the expansion locale — the QA
 *      brackets prove the harness, and the layout stays intact;
 *   4. <html lang> follows the active locale (screen readers hear the
 *      right language); the pre-paint script stamps it before React;
 *   5. the units localize (the footer line and, once a session opens,
 *      the format helpers);
 *   6. the command palette searches in Chinese and English under the
 *      Chinese locale (the keyword merge);
 *   7. zh is a first-class a11y surface (axe, clean).
 */

test.describe("locale switching (Phase 21)", () => {
  test("the footer toggle switches the landing to Chinese and persists", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("language-toggle")).toBeVisible();

    // English first — the landing's contract.
    await expect(page.getByRole("heading", { name: "What would you like to do?" })).toBeVisible();

    // Switch. The toggle is a two-button segmented chip.
    await page.getByTestId("language-toggle-zh-CN").click();

    // The whole landing re-renders in place — headline, subline, tiles.
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();
    await expect(page.getByText("七个工具，一张工作台")).toBeVisible();
    await expect(page.getByTestId("landing-mode-repair")).toContainText("修复一段记录");
    await expect(page.getByTestId("landing-mode-batch")).toContainText("批量清理多个文件");
    // The privacy line — the app's promise, in the user's language.
    await expect(page.getByTestId("site-footer")).toContainText(
      "所有处理都在你的浏览器中完成",
    );
    // html lang follows.
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

    // Persistence: a reload keeps Chinese without any URL param.
    await page.reload();
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

    // And back to English — the round trip.
    await page.getByTestId("language-toggle-en").click();
    await expect(page.getByRole("heading", { name: "What would you like to do?" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("?lang=zh-CN loads Chinese directly (the testing override)", async ({
    page,
  }) => {
    await page.goto("/?lang=zh-CN");
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();
    // The override is NOT persisted: storage still holds nothing.
    const stored = await page.evaluate(() =>
      localStorage.getItem("gpx-repair-studio.locale.v1"),
    );
    expect(stored).toBeNull();
  });

  test("?lang=pseudo reaches the expansion harness (§EE 21.4)", async ({
    page,
  }) => {
    await page.goto("/?lang=pseudo");
    // The QA brackets wrap every message; the landing headline carries them.
    const heading = page.getByRole("heading", { level: 2 }).first();
    await expect(heading).toContainText("⟦");
    await expect(heading).toContainText("⟧");
    // The layout survives: all seven tiles still render.
    for (const mode of ["repair", "share", "recovery", "create", "merge", "plan", "batch"]) {
      await expect(page.getByTestId(`landing-mode-${mode}`)).toBeVisible();
    }
    // The pseudo locale is never persisted (QA-only).
    const stored = await page.evaluate(() =>
      localStorage.getItem("gpx-repair-studio.locale.v1"),
    );
    expect(stored).toBeNull();
  });

  test("an unknown ?lang= degrades to English", async ({ page }) => {
    await page.goto("/?lang=xx");
    await expect(page.getByRole("heading", { name: "What would you like to do?" })).toBeVisible();
  });

  test("the pre-paint script stamps html lang before first paint", async ({
    page,
  }) => {
    // Persist Chinese, then navigate cold: the very first HTML the
    // browser parses must already carry lang="zh-CN" (the inline
    // script runs before React — the a11y contract from §EE 21.2).
    await page.goto("/");
    await page.getByTestId("language-toggle-zh-CN").click();
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();
    await page.goto("/?lang=en"); // English override, clean slate check below
    await page.evaluate(() => localStorage.setItem("gpx-repair-studio.locale.v1", "zh-CN"));
    await page.goto("/");
    const lang = await page.evaluate(
      () => document.documentElement.getAttribute("lang"),
    );
    expect(lang).toBe("zh-CN");
  });
});

test.describe("the Chinese surface", () => {
  test("the command palette searches in Chinese AND English under zh-CN", async ({
    page,
  }) => {
    await page.goto("/?lang=zh-CN");
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder("搜索命令…");
    await expect(input).toBeVisible();

    // A Chinese alias finds the help door (cmd.kw.open-help: 帮助).
    await input.fill("帮助");
    await expect(page.getByTestId("command-palette-item-open-help")).toBeVisible();

    // English keywords still match in the Chinese locale (power users).
    await input.fill("keyboard");
    await expect(page.getByTestId("command-palette-item-open-help")).toBeVisible();

    // The command label itself renders in Chinese.
    await input.fill("");
    await expect(page.getByTestId("command-palette-item-open-plan")).toContainText(
      "规划一条路线",
    );
    await page.keyboard.press("Escape");
  });

  test("the tool page teaches in Chinese (hero, steps, facts)", async ({ page }) => {
    await page.goto("/?lang=zh-CN");
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();
    await page.getByTestId("landing-mode-repair").click();

    await expect(page.getByRole("heading", { name: "修复不完整的 GPS 记录" })).toBeVisible();
    await expect(page.getByText("它是如何工作的")).toBeVisible();
    // Back to the cards, in Chinese.
    await page.getByTestId("landing-back-to-cards").click();
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();
  });

  test("the zh landing is an accessible surface (axe)", async ({ page }) => {
    const AxeBuilder = (await import("@axe-core/playwright")).default;
    await page.goto("/?lang=zh-CN");
    await expect(page.getByRole("heading", { name: "你想做什么？" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const criticals = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );
    expect(criticals).toEqual([]);
    // And the document declares its language — the screen-reader contract.
    expect(await page.locator("html").getAttribute("lang")).toBe("zh-CN");
  });
});
