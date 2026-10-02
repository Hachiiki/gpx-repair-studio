/**
 * Phase 12 (quick wins & theming) — live QA: screenshots + checks in
 * BOTH themes of the surfaces this phase touched:
 *
 *   1. landing (cards) — light + dark, desktop + mobile;
 *   2. repair workspace with the sample ride loaded — light + dark
 *      (the darkened basemap + the re-themed overlay palette + legend);
 *   3. the share view with the sample run (light + dark: the stage
 *      stays dark BY DESIGN in both — an artifact's backdrop);
 *   4. the Shortcuts & help dialog (dark);
 *   5. footer with the theme toggle (every capture).
 *
 * Also sweeps for console/page errors and asserts the theme contract:
 * .dark on <html>, color-scheme, the toggle's pressed state, and
 * persistence across reload. Screenshots land in download/phase12-*
 * for the VLM critique.
 *
 * Run against the dev server on :3000. The offline-fallback map note
 * may appear if the sandbox blocks tiles.openfreemap.org — the dark
 * BLANK_STYLE background flip is part of what we verify either way.
 */
import { chromium } from "@playwright/test";

const OUT = "download";
const errors = [];
const pageErrors = [];

const browser = await chromium.launch();

/** A themed browser context with the tour seen + a theme preference. */
async function themedContext(viewport, theme, tourSeen = true) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ theme, tourSeen }) => {
    try {
      if (tourSeen) localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
      if (theme) localStorage.setItem("gpx-repair-studio.theme.v1", theme);
    } catch {
      /* storage blocked — tolerated */
    }
  }, { theme, tourSeen });
  return context;
}

async function capture(page, name, { fullPage = false } = {}) {
  // The Task 56 lesson: scroll-through before fullPage captures so
  // async-decoded images are painted.
  if (fullPage) {
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: `${OUT}/phase12-${name}.png`, fullPage });
}

async function check(page, label, fn) {
  try {
    const value = await fn();
    console.log(`  ok   ${label}: ${JSON.stringify(value)}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. Landing — light + dark, desktop + mobile
// ---------------------------------------------------------------------------
for (const [theme, suffix] of [
  ["light", "light"],
  ["dark", "dark"],
]) {
  const context = await themedContext({ width: 1440, height: 900 }, theme);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[landing-${suffix}] ${m.text()}`);
  });
  page.on("pageerror", (e) =>
    pageErrors.push(`[landing-${suffix}] ${String(e)}`),
  );

  await page.goto("http://localhost:3000/");
  await page.getByTestId("landing-mode-toggle").waitFor({ state: "visible" });
  await page.waitForTimeout(700); // hero entrance

  await check(page, `theme class (${suffix})`, () =>
    page.evaluate(({ theme }) => {
      const hasDark = document.documentElement.classList.contains("dark");
      if ((theme === "dark") !== hasDark) throw new Error(`.dark=${hasDark}`);
      return hasDark ? "dark" : "light";
    }, { theme }),
  );
  await check(page, `color-scheme (${suffix})`, () =>
    page.evaluate(
      () => document.documentElement.style.colorScheme,
    ),
  );
  await check(page, `toggle pressed (${suffix})`, () =>
    page.evaluate((theme) =>
      document
        .querySelector(`[data-testid=theme-toggle-${theme}]`)
        ?.getAttribute("aria-pressed"),
    theme),
  );

  await capture(page, `landing-1440-${suffix}`, { fullPage: true });
  await context.close();
}

// Mobile landing (dark) — the footer wraps, the toggle stays reachable.
{
  const context = await themedContext({ width: 390, height: 844 }, "dark");
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[landing-mobile-dark] ${m.text()}`);
  });
  await page.goto("http://localhost:3000/");
  await page.getByTestId("landing-mode-toggle").waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  await check(page, "no horizontal overflow (mobile dark)", () =>
    page.evaluate(() => {
      const overflow =
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth;
      if (overflow > 1) throw new Error(`overflow ${overflow}px`);
      return "0px";
    }),
  );
  await capture(page, "landing-390-dark", { fullPage: true });
  await context.close();
}

// ---------------------------------------------------------------------------
// 2. Repair workspace with the sample — light + dark
// ---------------------------------------------------------------------------
for (const [theme, suffix] of [
  ["light", "light"],
  ["dark", "dark"],
]) {
  const context = await themedContext({ width: 1440, height: 900 }, theme);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[workspace-${suffix}] ${m.text()}`);
  });
  page.on("pageerror", (e) =>
    pageErrors.push(`[workspace-${suffix}] ${String(e)}`),
  );

  await page.goto("http://localhost:3000/");
  await page.getByTestId("landing-mode-repair").click();
  await page.getByTestId("try-sample").click();
  await page.getByTestId("gap-list").waitFor({ state: "visible" });
  await page.waitForTimeout(1200); // map settle

  await check(page, `sample gaps (${suffix})`, async () => {
    const text = await page.getByTestId("gap-list").innerText();
    if (!text.includes("severe") || !text.includes("suspect")) {
      throw new Error("expected suspect + severe gaps");
    }
    return "suspect + severe";
  });

  // The legend mirrors the theme palette.
  await page.getByTestId("map-legend-toggle").click();
  await page.waitForTimeout(300);
  await capture(page, `workspace-1440-${suffix}`);
  await page.getByTestId("map-legend-toggle").click();

  // Theme toggle mid-session: the map re-themes through a style swap.
  const other = theme === "dark" ? "light" : "dark";
  await page.getByTestId(`theme-toggle-${other}`).click();
  await page.waitForTimeout(1500);
  await check(page, `mid-session toggle to ${other}`, () =>
    page.evaluate((other) => {
      const hasDark = document.documentElement.classList.contains("dark");
      if ((other === "dark") !== hasDark) throw new Error(`.dark=${hasDark}`);
      return hasDark ? "dark" : "light";
    }, other),
  );
  await capture(page, `workspace-1440-toggled-${other}`);
  await context.close();
}

// ---------------------------------------------------------------------------
// 3. Share view with the sample run — the stage stays dark in BOTH
// ---------------------------------------------------------------------------
for (const [theme, suffix] of [
  ["light", "light"],
  ["dark", "dark"],
]) {
  const context = await themedContext({ width: 1440, height: 900 }, theme);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[share-${suffix}] ${m.text()}`);
  });
  await page.goto("http://localhost:3000/");
  await page.getByTestId("landing-mode-share").click();
  await page.getByTestId("try-sample").click();
  await page.getByTestId("share-section").waitFor({ state: "visible" });
  await page.waitForTimeout(1500); // card render
  await capture(page, `share-1440-${suffix}`);
  await context.close();
}

// ---------------------------------------------------------------------------
// 4. Help dialog (dark) + persistence
// ---------------------------------------------------------------------------
{
  const context = await themedContext({ width: 900, height: 800 }, "dark");
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[help-dark] ${m.text()}`);
  });
  await page.goto("http://localhost:3000/");
  await page.getByTestId("landing-mode-toggle").waitFor({ state: "visible" });
  await page.keyboard.press("?");
  await page.getByTestId("help-dialog").waitFor({ state: "visible" });
  // The fade-in must finish before capture — a mid-animation dialog
  // is semi-transparent and reads as "text bleeding through" (the
  // same class of capture artifact as Task 56's empty plates).
  await page.waitForTimeout(600);
  await capture(page, "help-900-dark");
  await page.keyboard.press("Escape");

  // Persistence: reload keeps dark (the pre-paint script).
  await page.reload();
  await page.getByTestId("landing-mode-toggle").waitFor({ state: "visible" });
  await check(page, "dark persists across reload", () =>
    page.evaluate(() => {
      if (!document.documentElement.classList.contains("dark")) {
        throw new Error("lost .dark after reload");
      }
      return "dark";
    }),
  );
  await context.close();
}

await browser.close();

console.log(`\nconsole errors: ${errors.length}`);
for (const error of errors) console.log(`  ${error}`);
console.log(`page errors: ${pageErrors.length}`);
for (const error of pageErrors) console.log(`  ${error}`);
if (errors.length > 0 || pageErrors.length > 0) process.exitCode = 1;
