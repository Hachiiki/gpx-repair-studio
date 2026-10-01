/**
 * Phase 11 — measure the privacy dialog's egress table for real text
 * clipping (the VLM critique's claim): any element whose content
 * overflows its box inside the table, plus the table's own horizontal
 * overflow at the dialog width.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  window.localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
});
await page.goto("http://localhost:3000/");
await page.getByTestId("footer-privacy").click();
await page.getByTestId("privacy-pane").waitFor({ state: "visible" });
await page.waitForTimeout(450);

const report = await page.evaluate(() => {
  const table = document.querySelector('[data-testid="privacy-egress-table"]');
  const rect = table.getBoundingClientRect();
  const overflowX = table.scrollWidth - table.clientWidth;

  // Any descendant whose scrollWidth/Height exceeds its client box.
  const clipped = [];
  for (const el of table.querySelectorAll("*")) {
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
      const style = getComputedStyle(el);
      if (style.overflow === "visible" || style.overflowX === "visible") continue;
      clipped.push({
        tag: el.tagName,
        text: (el.textContent || "").slice(0, 60),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
      });
    }
  }

  // Any text node that spills outside the table's own bounds.
  const range = document.createRange();
  let spill = 0;
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    range.selectNodeContents(walker.currentNode);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && (r.right > rect.right + 1 || r.left < rect.left - 1)) {
      spill += 1;
    }
  }

  return {
    tableWidth: Math.round(rect.width),
    overflowX,
    clippedInside: clipped,
    textSpillCount: spill,
  };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
