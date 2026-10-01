/**
 * Task 56 — disprove (or confirm) the VLM's band-900 claim: "an 'N'
 * button in the bottom-left overlaps the 'Create from stats' tile".
 *
 * At 900px, enumerate every element whose box intersects the create
 * tile's box but is not a descendant/ancestor of it, and list every
 * fixed/absolute-positioned element on the page. If the only "N" on
 * the page lives inside an <img> plate, the claim is an artwork
 * misread, not a layout defect.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
await context.addInitScript(() => {
  try { localStorage.setItem("gpx-repair-studio.tour.v1", "seen"); } catch {}
});
const page = await context.newPage();
await page.goto("http://localhost:3000/");
await page.getByTestId("landing-mode-toggle").waitFor({ state: "visible" });
await page.waitForTimeout(700);

const report = await page.evaluate(() => {
  const tile = document.querySelector("[data-testid=landing-mode-create]");
  const tr = tile.getBoundingClientRect();
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    if (tile.contains(el) || el.contains(tile)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const overlaps =
      r.left < tr.right && r.right > tr.left && r.top < tr.bottom && r.bottom > tr.top;
    if (overlaps) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute("data-testid"),
        cls: (el.getAttribute("class") || "").slice(0, 80),
        text: (el.textContent || "").trim().slice(0, 40),
      });
    }
  }
  const floats = Array.from(document.querySelectorAll("body *"))
    .filter((el) => {
      const p = getComputedStyle(el).position;
      return (p === "fixed" || p === "absolute") && el.getBoundingClientRect().width > 0;
    })
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      pos: getComputedStyle(el).position,
      testid: el.getAttribute("data-testid"),
      inTile: tile.contains(el),
      text: (el.textContent || "").trim().slice(0, 30),
    }));
  const tileText = tile.textContent || "";
  return {
    tileBox: { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) },
    overlappingForeignElements: offenders,
    positionedElements: floats,
    tileOwnTextIncludesN: /\bN\b/.test(tileText),
    imgCountInTile: tile.querySelectorAll("img").length,
  };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
