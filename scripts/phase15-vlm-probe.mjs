/**
 * Phase 15 — disprove-or-confirm the VLM critique claims by measurement:
 *
 *   A. (light 7/10) "elevation profile table has over 100 rows" →
 *      measure: row count (design caps it at ≤24 intervals).
 *   B. (light 7/10) "chart shows ~7 bars but table lists 8 rows" →
 *      measure: split rows vs pace bars + no-time ticks (they must sum).
 *   C. (light 7/10) "truncated instructional text with an emoji pointer" →
 *      measure: the copy is complete and contains no emoji.
 *   D. (dark 7/10) "low contrast in data tables" →
 *      measure: computed contrast ratio of muted-foreground vs card bg.
 *   E. (mobile 4/10) "severe horizontal overflow, Avg column clipped" →
 *      measure: document-level overflow (none) + the table scrolls inside
 *      its card (the designed pattern for wide tables on mobile).
 *   F. (print 7/10) "large empty whitespace where the chart should be" →
 *      measure: the SVG has a non-zero box and drawn paths under print
 *      emulation. (The "interactive UI leakage" claim was CONFIRMED and
 *      fixed: the hover hint now carries data-print-hide-on-print.)
 *
 * Run against the dev server on :3000.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, detail = "") => {
  checks.push([label, Boolean(ok)]);
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
};

async function themedPage(viewport, theme, init) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ({ theme }) => {
      try {
        localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
        localStorage.setItem("gpx-repair-studio.theme.v1", theme);
      } catch {
        /* tolerated */
      }
    },
    { theme },
  );
  const page = await context.newPage();
  if (init) await init(page);
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  await page.getByTestId("try-sample").click();
  await page.getByTestId("splits-card").waitFor({ state: "visible" });
  return { context, page };
}

// --- A + B + C: the light-theme claims -------------------------------------
{
  const { context, page } = await themedPage(
    { width: 1280, height: 900 },
    "light",
  );

  // A: profile table row count (design: ≤24 intervals).
  await page.getByTestId("elevation-profile-table-toggle").click();
  await page.getByTestId("elevation-profile-table").waitFor({ state: "visible" });
  const profileRows = await page
    .getByTestId("elevation-profile-table")
    .locator("tbody tr")
    .count();
  check(
    "A: profile table ≤ 24 rows (claim: >100)",
    profileRows <= 24,
    `${profileRows} rows`,
  );

  // B: split rows vs chart marks.
  const splitRows = await page.getByTestId(/split-row-\d+/).count();
  const bars = await page.getByTestId("splits-pace-bar").count();
  // The no-time splits draw dashed baseline ticks ("2 2"); the Y-axis
  // mid gridline is "3 3" — the selector must not catch it.
  const ticks = await page
    .getByTestId("splits-pace-chart")
    .locator('line[stroke-dasharray="2 2"]')
    .count();
  check(
    "B: chart marks cover every split row (claim: mismatch)",
    bars + ticks === splitRows,
    `${bars} bars + ${ticks} ticks = ${bars + ticks} vs ${splitRows} rows`,
  );

  // C: the copy is complete, emoji-free.
  const cardText = await page.getByTestId("splits-card").innerText();
  check(
    "C: unit copy complete (claim: truncated)",
    cardText.includes("the unit follows the pace toggle above"),
  );
  check(
    "C: no emoji anywhere in the splits card (claim: 👆 pointer)",
    !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(cardText),
  );
  await context.close();
}

// --- D: dark-theme muted-foreground contrast --------------------------------
{
  const { context, page } = await themedPage(
    { width: 1280, height: 900 },
    "dark",
  );
  const ratio = await page.evaluate(() => {
    const mutedEl = document.querySelector(
      '[data-testid="splits-card"] .text-muted-foreground',
    );
    const cardEl = document.querySelector('[data-testid="splits-card"]');
    if (!mutedEl || !cardEl) return null;
    // Chrome serializes oklch tokens as lab() strings in computed style —
    // string parsing is a dead end. Draw the color and read the PIXEL:
    // the bitmap holds exact sRGB, whatever the input syntax was.
    const toRgb = (color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#000";
      try {
        ctx.fillStyle = color;
      } catch {
        return null;
      }
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    // Walk up until a non-transparent background resolves the card color.
    let bg = null;
    for (let el = cardEl; el && bg === null; el = el.parentElement) {
      const c = toRgb(getComputedStyle(el).backgroundColor);
      if (c && c[3] > 0) bg = c;
    }
    const fg = toRgb(getComputedStyle(mutedEl).color);
    if (!fg || !bg) return null;
    const lum = ([r, g, b]) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const l1 = lum(fg);
    const l2 = lum(bg);
    return {
      ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
      fg: `rgb(${fg[0]}, ${fg[1]}, ${fg[2]})`,
      bg: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
    };
  });
  check(
    "D: dark-theme muted table text contrast ≥ 4.5:1 (claim: low contrast)",
    ratio !== null && ratio.ratio >= 4.5,
    ratio === null ? "unmeasured" : `${ratio.ratio.toFixed(2)}:1 ${ratio.fg} on ${ratio.bg}`,
  );
  await context.close();
}

// --- E: mobile overflow claim ------------------------------------------------
{
  const { context, page } = await themedPage(
    { width: 390, height: 844 },
    "light",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(
    "E: no document-level horizontal overflow (claim: severe overflow)",
    overflow <= 1,
    `${overflow}px`,
  );
  // The table scrolls INSIDE its card — every column reachable.
  const reachable = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="splits-table"]');
    if (!table) return null;
    const scroller = table.closest("div");
    if (!scroller) return null;
    return {
      scrollable: scroller.scrollWidth > scroller.clientWidth,
      canScrollTo: scroller.scrollWidth - scroller.clientWidth,
    };
  });
  check(
    "E: wide table scrolls inside its card (designed), all columns reachable",
    reachable !== null && reachable.canScrollTo >= 0 && reachable.scrollable,
    JSON.stringify(reachable),
  );
  // The card itself fits the viewport.
  const cardBox = await page.getByTestId("splits-card").boundingBox();
  check(
    "E: splits card fits the 390px viewport",
    cardBox !== null && cardBox.width <= 390,
  );
  await context.close();
}

// --- F: print chart renders --------------------------------------------------
{
  const { context, page } = await themedPage(
    { width: 1280, height: 900 },
    "dark",
    async (p) => {
      await p.addInitScript(() => {
        window.print = () => {};
      });
    },
  );
  await page.emulateMedia({ media: "print" });
  await page.getByTestId("print-stats-button").click();
  await page.waitForFunction(() =>
    document.body.classList.contains("printing-stats"),
  );
  const svgInfo = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="elevation-profile-svg"]');
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      paths: svg.querySelectorAll("path").length,
      displayed: getComputedStyle(svg).display !== "none",
    };
  });
  check(
    "F: elevation SVG renders under print (claim: empty whitespace)",
    svgInfo !== null &&
      svgInfo.displayed &&
      svgInfo.width > 200 &&
      svgInfo.height > 60 &&
      svgInfo.paths > 0,
    JSON.stringify(svgInfo),
  );
  // The confirmed leak is fixed: the hover hint carries the print-hide.
  const hintHidden = await page.evaluate(() => {
    const hint = document.querySelector(
      '[data-testid="elevation-profile-readout"] [data-print-hide-on-print]',
    );
    if (!hint) return false;
    return getComputedStyle(hint).display === "none";
  });
  check(
    "F: the hover hint is hidden under print (the fixed confirmed claim)",
    hintHidden,
  );
  await context.close();
}

await browser.close();
const failed = checks.filter(([, ok]) => !ok);
console.log("\n--- PHASE 15 VLM PROBE ---");
console.log(`${checks.length - failed.length}/${checks.length} claims settled by measurement`);
if (failed.length > 0) {
  console.log("unresolved:", failed.map(([label]) => label));
}
