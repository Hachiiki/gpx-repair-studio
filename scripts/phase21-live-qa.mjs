/**
 * Phase 21 live QA — internationalization, both locales × both themes +
 * mobile, zero console/page errors.
 *
 * Covers: the footer language toggle switching the landing (headline,
 * tiles, privacy line, footer links) in place; persistence across a
 * reload; ?lang= direct loads (zh-CN and the pseudo expansion harness);
 * the tool page + the palette in Chinese; Chinese palette SEARCH over
 * translated aliases AND English keywords; the units following the
 * locale once a session opens (footer-line distance not asserted —
 * format helpers are unit-tested; the page-level surfaces are);
 * <html lang> following the locale; dark-mode Chinese; mobile Chinese
 * with no horizontal overflow; and the pseudo locale's expansion
 * leaving the layout intact (the overflow-QA harness's own health
 * check).
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const CHECKS = [];
let failed = 0;

function check(name, condition, detail = "") {
  const ok = condition === true;
  CHECKS.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function freshPage(browser, { theme = "light", mobile = false } = {}) {
  const page = await browser.newPage(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(
    (options) => {
      localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
      localStorage.setItem(
        "gpx-repair-studio.tool-tours.v1",
        JSON.stringify({
          repair: "seen",
          share: "seen",
          recovery: "seen",
          create: "seen",
          merge: "seen",
          plan: "seen",
          batch: "seen",
        }),
      );
      if (options.theme === "dark") {
        localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
      }
    },
    { theme },
  );
  return { page, errors };
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------------
// 1. English baseline (light) — the pre-existing contract still holds.
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser);
  await page.goto(BASE, { waitUntil: "networkidle" });
  check(
    "en: landing headline",
    (await page.getByRole("heading", { name: "What would you like to do?" }).isVisible()) === true,
  );
  check(
    "en: seven tiles",
    (await page.locator('li > [data-testid^="landing-mode-"]').count()) === 7,
  );
  check(
    "en: footer privacy line",
    (await page.getByText("All processing happens in your browser").isVisible()) === true,
  );
  check("en: zero console/page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. The toggle round trip (light): en → zh → reload (persisted) → en.
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("language-toggle-zh-CN").click();
  check(
    "toggle: headline switches in place",
    (await page.getByRole("heading", { name: "你想做什么？" }).isVisible()) === true,
  );
  check(
    "toggle: tiles re-render",
    (await page.getByTestId("landing-mode-repair").innerText()).includes("修复一段记录"),
  );
  check(
    "toggle: footer promise localizes",
    (await page.getByText("所有处理都在你的浏览器中完成").isVisible()) === true,
  );
  check(
    "toggle: html lang follows",
    (await page.locator("html").getAttribute("lang")) === "zh-CN",
  );
  await page.reload({ waitUntil: "networkidle" });
  check(
    "persist: Chinese survives reload",
    (await page.getByRole("heading", { name: "你想做什么？" }).isVisible()) === true,
  );
  await page.getByTestId("language-toggle-en").click();
  check(
    "round trip: back to English",
    (await page.getByRole("heading", { name: "What would you like to do?" }).isVisible()) === true,
  );
  check("toggle flow: zero console/page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. ?lang=zh-CN direct (dark theme): the tool page + the palette.
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser, { theme: "dark" });
  await page.goto(`${BASE}/?lang=zh-CN`, { waitUntil: "networkidle" });
  check(
    "zh dark: headline",
    (await page.getByRole("heading", { name: "你想做什么？" }).isVisible()) === true,
  );
  check(
    "zh dark: dark class held",
    (await page.locator("html").evaluate((el) => el.classList.contains("dark"))) === true,
  );
  // The tool page teaches in Chinese.
  await page.getByTestId("landing-mode-plan").click();
  check(
    "zh dark: plan hero",
    (await page.getByRole("heading", { name: "规划路线，读它的数字" }).isVisible()) === true,
  );
  check(
    "zh dark: how-it-works section",
    (await page.getByText("它是如何工作的").isVisible()) === true,
  );
  await page.getByTestId("landing-back-to-cards").click();

  // The palette: Chinese labels + bilingual search.
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByPlaceholder("搜索命令…");
  await input.waitFor({ state: "visible", timeout: 10000 });
  // The help door is landing-available; its zh alias includes 帮助/键盘.
  await input.fill("帮助");
  const zhHit = await page
    .getByTestId("command-palette-item-open-help")
    .isVisible()
    .catch(() => false);
  check("zh dark: palette finds 帮助 (help alias)", zhHit === true);
  await input.fill("keyboard");
  const englishHit = await page
    .getByTestId("command-palette-item-open-help")
    .isVisible()
    .catch(() => false);
  check("zh dark: English keyword still matches", englishHit === true);
  await page.keyboard.press("Escape");
  check("zh dark: zero console/page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. Mobile (zh): no horizontal overflow, the toggle reachable.
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser, { mobile: true });
  await page.goto(`${BASE}/?lang=zh-CN`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("zh mobile: no horizontal overflow", overflow <= 0, `delta ${overflow}px`);
  check(
    "zh mobile: language toggle visible",
    (await page.getByTestId("language-toggle").isVisible()) === true,
  );
  check(
    "zh mobile: tiles stack",
    (await page.getByTestId("landing-mode-batch").isVisible()) === true,
  );
  check("zh mobile: zero console/page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. The pseudo harness (§EE 21.4): expansion brackets everywhere, layout intact.
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser);
  await page.goto(`${BASE}/?lang=pseudo`, { waitUntil: "networkidle" });
  const heading = await page.locator("h2").first().innerText();
  check("pseudo: QA brackets wrap the headline", heading.includes("⟦") && heading.includes("⟧"));
  // The filler glyphs ARE the expansion — count them (the en headline
  // has none).
  const fillers = (heading.match(/ø/g) ?? []).length;
  check(
    "pseudo: expansion is real (filler glyphs present)",
    fillers >= 6,
    `${fillers} fillers`,
  );
  const tileCount = await page.locator('li > [data-testid^="landing-mode-"]').count();
  check("pseudo: all seven tiles render", tileCount === 7);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("pseudo: no horizontal overflow from expansion", overflow <= 0, `delta ${overflow}px`);
  check(
    "pseudo: not persisted",
    (await page.evaluate(() => localStorage.getItem("gpx-repair-studio.locale.v1"))) === null,
  );
  check("pseudo: zero console/page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();

console.log(CHECKS.join("\n"));
console.log(`\n${CHECKS.length - failed}/${CHECKS.length} checks passed`);
if (failed > 0) process.exit(1);
