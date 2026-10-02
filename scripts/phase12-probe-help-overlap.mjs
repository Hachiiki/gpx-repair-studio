/**
 * Phase 12 — disprove-or-confirm the VLM's "text overlaps the help
 * dialog" claim by DOM measurement: open the dialog at 900px (dark),
 * then intersect every visible text node OUTSIDE the dialog with the
 * dialog panel's box. Zero intersections = the dialog is opaque and
 * properly layered (the claim was a capture artifact / hallucination).
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 900, height: 800 },
});
await context.addInitScript(() => {
  try {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
  } catch {}
});
const page = await context.newPage();
await page.goto("http://localhost:3000/");
await page.getByTestId("landing-mode-toggle").waitFor({ state: "visible" });
await page.keyboard.press("?");
await page.getByTestId("help-dialog").waitFor({ state: "visible" });
await page.waitForTimeout(400); // animations settle

const result = await page.evaluate(() => {
  const dialog = document.querySelector("[data-testid=help-dialog]");
  const box = dialog.getBoundingClientRect();
  const off = [];
  // Every element with direct text, outside the dialog, visible.
  for (const el of document.body.querySelectorAll("*")) {
    if (dialog.contains(el)) continue;
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join("");
    if (!text) continue;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const intersects =
      r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
    if (intersects) off.push(`${el.tagName}.${el.className} "${text.slice(0, 40)}"`);
  }
  return {
    dialogBox: { x: box.x, y: box.y, w: box.width, h: box.height },
    overlapping: off,
    dialogBg: getComputedStyle(dialog).backgroundColor,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
