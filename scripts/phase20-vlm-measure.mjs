/**
 * Phase 20 VLM measurement — settle the critique's measurable claims
 * against the DOM (the Task-56/19 discipline: no claim survives
 * unmeasured).
 *
 * Claims under test (cheat sheet):
 *   a. "Ctrl Shift Z" and "Ctrl Y" chips misaligned (different heights /
 *      vertical centers);
 *   b. "Double-click" wraps to two lines inside its chip;
 *   c. "Scroll" and "Pinch" chips merge (no gap between them);
 *   d. rows have inconsistent vertical spacing.
 * Plus the palette (dark): footer keycaps and item contrast.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  localStorage.setItem(
    "gpx-repair-studio.tool-tours.v1",
    JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
  );
});
await page.goto(BASE, { waitUntil: "networkidle" });
await page.keyboard.press("?");
await page.getByTestId("help-dialog").waitFor({ state: "visible" });
await page.waitForTimeout(400);

const measures = await page.evaluate(() => {
  const dialog = document.querySelector('[data-testid="help-dialog"]');
  const rows = [...dialog.querySelectorAll("li")];
  const chipBox = (chip) => {
    const r = chip.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
  };
  const out = { claims: {} };

  // (a) The Redo row: "Ctrl Shift Z" + "Ctrl Y" chips.
  const redoRow = rows.find((li) => li.textContent.includes("Redo"));
  if (redoRow) {
    const chips = [...redoRow.querySelectorAll("kbd")].map(chipBox);
    out.claims.redoChips = {
      count: chips.length,
      heights: chips.map((c) => Math.round(c.height * 10) / 10),
      centerDelta:
        chips.length === 2
          ? Math.round(
              Math.abs(chips[0].top + chips[0].height / 2 - (chips[1].top + chips[1].height / 2)) * 10,
            ) / 10
          : null,
    };
  }

  // (b) "Double-click" wrap: the chip's height vs a single-line chip.
  const dbl = [...dialog.querySelectorAll("kbd")].find(
    (k) => k.textContent === "Double-click",
  );
  const single = [...dialog.querySelectorAll("kbd")].find(
    (k) => k.textContent === "Drag",
  );
  if (dbl && single) {
    out.claims.doubleClick = {
      doubleHeight: Math.round(dbl.getBoundingClientRect().height * 10) / 10,
      singleHeight: Math.round(single.getBoundingClientRect().height * 10) / 10,
    };
  }

  // (c) Scroll + Pinch gap.
  const scroll = [...dialog.querySelectorAll("kbd")].find(
    (k) => k.textContent === "Scroll",
  );
  const pinch = [...dialog.querySelectorAll("kbd")].find(
    (k) => k.textContent === "Pinch",
  );
  if (scroll && pinch) {
    out.claims.scrollPinchGap =
      Math.round((pinch.getBoundingClientRect().left - scroll.getBoundingClientRect().right) * 10) / 10;
  }

  // (d) Row spacing consistency within the Everywhere group.
  const everywheres = rows.filter((li) =>
    li.closest("section")?.querySelector("h3")?.textContent.includes("Everywhere"),
  );
  const tops = everywheres.map((li) => li.getBoundingClientRect().top);
  const gaps = tops.slice(1).map((top, i) => Math.round((top - tops[i]) * 10) / 10);
  out.claims.everywhereRowGaps = gaps;

  return out;
});

// Palette (dark): item text contrast + footer chips present.
const dark = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await dark.addInitScript(() => {
  localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
  localStorage.setItem(
    "gpx-repair-studio.tool-tours.v1",
    JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
  );
});
await dark.goto(BASE, { waitUntil: "networkidle" });
await dark.keyboard.press("Control+k");
await dark.getByTestId("command-palette").waitFor({ state: "visible" });
const paletteMeasures = await dark.evaluate(() => {
  const item = document.querySelector('[data-testid="command-palette-item-open-help"]');
  const chip = document.querySelector('[data-testid="command-palette"] kbd');
  const style = getComputedStyle(item);
  return {
    itemColor: style.color,
    itemBackground: style.backgroundColor,
    footerChips: document.querySelectorAll('[data-testid="command-palette-footer"] kbd').length,
    chipText: chip?.textContent ?? null,
  };
});

console.log(JSON.stringify({ ...measures.claims, palette: paletteMeasures }, null, 2));
await browser.close();
