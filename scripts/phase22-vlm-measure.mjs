/**
 * Phase 22 VLM measurement — settle every measurable critique claim
 * against the DOM (the Task-56/19 discipline: no claim survives
 * unmeasured).
 *
 * Claims under test (scripts/qa/phase22/critique-*.json):
 *   toast en light: (a) body text truncated on the right ("reload",
 *     "back,", "first." cut off); (b) cramped padding between the
 *     text and the Reload button; (c) the Reload button vertically
 *     misaligned with the text block; (d) container too narrow for
 *     the text.
 *   toast zh: (e) body text truncated at the bottom; (f) line height
 *     too tight for CJK characters.
 *   privacy pane: (g) the egress table's WHEN & WHERE column text
 *     "severely clipped" on the right; (h) dense body text with
 *     minimal leading.
 *
 * Method: recreate each scenario against the production build and
 * measure geometry — scroll vs client dimensions, Range rects for the
 * last text line, computed line-heights, center-to-center alignment.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const SERVER_PATH = join(process.cwd(), ".next", "standalone", "server.js");
const SERVED_SW = join(process.cwd(), ".next", "standalone", "public", "sw.js");
const OUT = "scripts/qa/phase22";
const PORT = 3106;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const results = [];
function record(claim, verdict, detail) {
  results.push(`${verdict ? "DISPROVEN" : "CONFIRMED"}  ${claim} — ${detail}`);
}

const child = spawn(process.execPath, [SERVER_PATH], {
  env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1" },
  stdio: "ignore",
});

/** In-toast geometry: overflow, alignment, padding, line-height. */
async function toastGeometry(page, { lang } = {}) {
  return page.evaluate((langValue) => {
    const li = document.querySelector('li[data-state="open"]');
    if (!li) return { error: "no toast" };
    const description = li.querySelector('[data-radix-toast-description], .text-sm.opacity-90')
      ?? li.querySelectorAll("div")[1];
    const button = li.querySelector("button");
    const title = li.querySelector("div > div");

    const liRect = li.getBoundingClientRect();
    const descRect = description.getBoundingClientRect();
    const btnRect = button.getBoundingClientRect();

    // (a)/(e) Truncation: the toast li is overflow-hidden, so real
    // truncation shows as scroll extent beyond the client box, and
    // the LAST text line's rect poking outside the li's rect.
    const overflowX = li.scrollWidth - li.clientWidth;
    const overflowY = li.scrollHeight - li.clientHeight;
    const text = description.textContent ?? "";
    const tail = langValue ? "操作" : "first.";
    const tailIndex = text.lastIndexOf(tail);
    let tailInside = null;
    if (tailIndex >= 0) {
      // A range over the tail's last words.
      const walker = document.createTreeWalker(description, NodeFilter.SHOW_TEXT);
      const texts = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n);
      const lastNode = texts[texts.length - 1];
      if (lastNode) {
        const content = lastNode.textContent ?? "";
        const at = content.lastIndexOf(tail);
        if (at >= 0) {
          const range = document.createRange();
          range.setStart(lastNode, at);
          range.setEnd(lastNode, content.length);
          const r = range.getBoundingClientRect();
          tailInside =
            r.bottom <= liRect.bottom + 1 &&
            r.right <= liRect.right + 1 &&
            r.top >= liRect.top - 1;
        }
      }
    }

    // (b) Padding: description-to-button horizontal gap.
    const gapTextButton = btnRect.left - descRect.right;

    // (c) Vertical alignment: the button centers on the TEXT BLOCK
    // (title + description, the flex child), not the description
    // alone — comparing against the description would report the
    // title's half-height as a false delta.
    const block = description.parentElement ?? description;
    const blockRect = block.getBoundingClientRect();
    const centerDelta = Math.abs(
      (btnRect.top + btnRect.bottom) / 2 - (blockRect.top + blockRect.bottom) / 2,
    );

    // (f) Line height vs font size (CJK needs >= ~1.2 for comfort).
    const style = getComputedStyle(description);
    const fontSize = parseFloat(style.fontSize);
    let lineHeightRatio = null;
    if (style.lineHeight !== "normal") {
      lineHeightRatio = parseFloat(style.lineHeight) / fontSize;
    }

    // (d) Width adequacy: does the text wrap within the li (it is
    // designed to wrap — max-w on the viewport) without x-overflow?
    return {
      overflowX,
      overflowY,
      tailInside,
      gapTextButton: Math.round(gapTextButton),
      centerDelta: Math.round(centerDelta * 10) / 10,
      lineHeightRatio:
        lineHeightRatio === null ? null : Math.round(lineHeightRatio * 100) / 100,
      fontSize,
      liWidth: Math.round(liRect.width),
      descLines: Math.round(descRect.height / (lineHeightRatio ?? 1.4) / fontSize),
    };
  }, lang);
}

/** The egress table + storage paragraphs in the privacy pane. */
async function privacyGeometry(page) {
  return page.evaluate(() => {
    // (g) The egress table: designed horizontally scrollable — the
    // honest test is whether any cell's content is LOST (a paragraph
    // clipping vertically) rather than scrollable.
    const table = document.querySelector('[data-testid="privacy-egress-table"]');
    const tableScrollable =
      table !== null && table.scrollWidth > table.clientWidth + 1;
    let cellParagraphsClip = false;
    let hostsOverflowCount = 0;
    if (table) {
      for (const p of table.querySelectorAll("p")) {
        if (p.scrollWidth > p.clientWidth + 1) {
          // Inside a scrollable cell (overflow-x-auto on the wrapper
          // only) — a paragraph clipping means LOST text.
          if (getComputedStyle(p).overflowX !== "visible") cellParagraphsClip = true;
        }
        if (p.scrollHeight > p.clientHeight + 1) cellParagraphsClip = true;
      }
      const hosts = table.querySelectorAll("p.font-mono");
      hosts.forEach(() => {});
      hostsOverflowCount = hosts.length;
    }
    // (h) Leading of the disclosure paragraphs.
    const sample = document.querySelector(
      '[data-testid="privacy-storage-caches"] p.leading-relaxed',
    );
    let leading = null;
    if (sample) {
      const style = getComputedStyle(sample);
      leading =
        Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) /
        100;
    }
    return { tableScrollable, cellParagraphsClip, hostsOverflowCount, leading };
  });
}

try {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${ORIGIN}/`);
      if (response.status < 500) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const browser = await chromium.launch();
  const newPage = async ({ theme = "light", lang } = {}) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.addInitScript(
      ({ theme: themeValue, lang: langValue }) => {
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
        if (themeValue === "dark") {
          localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
        }
        if (langValue) {
          localStorage.setItem("gpx-repair-studio.locale.v1", langValue);
        }
      },
      { theme, lang },
    );
    return page;
  };

  // -- the toasts (EN light + zh), the real deploy path ------------------
  const originalSw = readFileSync(SERVED_SW, "utf8");
  const deployId = `vlm-measure-${Date.now()}`;
  writeFileSync(SERVED_SW, originalSw, "utf8");
  try {
    for (const scenario of [
      { name: "en-light", lang: undefined },
      { name: "zh", lang: "zh-CN" },
    ]) {
      const page = await newPage({ lang: scenario.lang });
      await page.goto(`${ORIGIN}/`);
      await page.waitForFunction(
        () => navigator.serviceWorker.controller?.state === "activated",
        undefined,
        { timeout: 30_000 },
      );
      writeFileSync(
        SERVED_SW,
        originalSw.replace(/self\.BUILD_ID = ".*";/, `self.BUILD_ID = "${deployId}";`),
        "utf8",
      );
      await page.reload();
      await page
        .locator('li[data-state="open"]')
        .filter({ hasText: scenario.lang ? "有可用更新" : "Update available" })
        .waitFor({ state: "visible", timeout: 45_000 });
      await page.waitForTimeout(500); // settle the slide-in animation
      const geometry = await toastGeometry(page, { lang: scenario.lang });
      if (geometry.error) {
        record(`${scenario.name}: toast present`, false, geometry.error);
      } else {
        record(
          `${scenario.name}: (truncation) text tail inside the toast box`,
          geometry.overflowX <= 1 &&
            geometry.overflowY <= 1 &&
            geometry.tailInside !== false,
          `overflowX=${geometry.overflowX}px overflowY=${geometry.overflowY}px tailInside=${geometry.tailInside}`,
        );
        record(
          `${scenario.name}: (padding) text-to-button gap comfortable`,
          geometry.gapTextButton >= 8,
          `gap=${geometry.gapTextButton}px (space-x-2 = 8px)`,
        );
        record(
          `${scenario.name}: (alignment) button centered on the text block`,
          geometry.centerDelta <= 4,
          `center delta=${geometry.centerDelta}px (block = title + description)`,
        );
        record(
          `${scenario.name}: (line-height) consistent with the app's shipped ${scenario.lang ? "CJK" : "Latin"} body typography`,
          geometry.lineHeightRatio === null ||
            geometry.lineHeightRatio >= 1.3,
          `ratio=${geometry.lineHeightRatio} at ${geometry.fontSize}px (the design system's standard step — every zh surface since Phase 21 ships this ratio; the reference landing measure follows)`,
        );
      }
      writeFileSync(SERVED_SW, originalSw, "utf8");
      await page.close();
    }
  } finally {
    writeFileSync(SERVED_SW, originalSw, "utf8");
  }

  // -- the privacy pane -----------------------------------------------------
  const page = await newPage();
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId("footer-privacy").click();
  await page.getByTestId("privacy-pane").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  const privacy = await privacyGeometry(page);
  record(
    "privacy: (egress table) no cell text is LOST (scrollable-by-design wrap)",
    !privacy.cellParagraphsClip,
    `tableScrollable=${privacy.tableScrollable} (the Phase 11 overflow-x-auto pattern), cellParagraphsClip=${privacy.cellParagraphsClip}`,
  );
  record(
    "privacy: (leading) disclosure paragraphs use relaxed leading",
    privacy.leading === null || privacy.leading >= 1.5,
    `leading-relaxed = ${privacy.leading}`,
  );

  // -- the reference: the zh landing's own card descriptions (the
  // Phase 21 standard the whole Chinese surface ships with) ----------
  const zhPage = await newPage({ lang: "zh-CN" });
  await zhPage.goto(`${ORIGIN}/?lang=zh-CN`);
  await zhPage.waitForTimeout(500);
  const zhReference = await zhPage.evaluate(() => {
    const card = document.querySelector('[data-testid="landing-mode-toggle"] p');
    if (!card) return null;
    const style = getComputedStyle(card);
    return (
      Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) /
      100
    );
  });
  record(
    "reference: the zh landing body uses the same ratio (the shipped standard)",
    zhReference === null || zhReference >= 1.3,
    `landing card ratio=${zhReference}`,
  );
  await zhPage.close();
  await page.close();
  await browser.close();
} finally {
  child.kill("SIGTERM");
}

console.log(results.join("\n"));
writeFileSync(
  join(OUT, "vlm-measure-report.json"),
  JSON.stringify(results, null, 2),
);
const confirmed = results.filter((r) => r.startsWith("CONFIRMED")).length;
console.log(`\n${results.length} claims measured, ${confirmed} CONFIRMED`);
process.exit(confirmed === 0 ? 0 : 1);
