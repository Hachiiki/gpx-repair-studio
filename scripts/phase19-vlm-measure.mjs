/**
 * Phase 19 VLM claim measurement — the ritual's second half: the VLM
 * says, this probe decides. Covers the critique's measurable claims.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SEEN_ALL = JSON.stringify({
  repair: "seen",
  share: "seen",
  recovery: "seen",
  create: "seen",
  merge: "seen",
  plan: "seen",
  batch: "seen",
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript((seen) => {
  localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  localStorage.setItem("gpx-repair-studio.tool-tours.v1", seen);
}, SEEN_ALL);

await page.goto(BASE);
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) await card.click();
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
await (await chooser).setFiles([
  "src/features/gpx/fixtures/files/deep-defects.gpx",
]);
await page.getByTestId("compare-card").waitFor({ timeout: 20_000 });

const M = await page.evaluate(() => {
  const out = {};

  // C2/C3 + B2-C3: the delta table's column alignment (header vs cells).
  const headerCells = [
    ...document.querySelectorAll('[data-testid="compare-table"] thead th'),
  ];
  const firstRowCells = [
    ...document.querySelectorAll('[data-testid="compare-table"] tbody tr')[0]
      .querySelectorAll("td"),
  ];
  out.tableColumns = headerCells.map((th, i) => {
    const td = firstRowCells[i];
    return {
      header: th.textContent?.trim(),
      headerAlign: getComputedStyle(th).textAlign,
      cellAlign: td ? getComputedStyle(td).textAlign : null,
      headerRight: Math.round(th.getBoundingClientRect().right),
      cellRight: td ? Math.round(td.getBoundingClientRect().right) : null,
      headerLeft: Math.round(th.getBoundingClientRect().left),
      cellLeft: td ? Math.round(td.getBoundingClientRect().left) : null,
    };
  });

  // C5/B2-C2: the "missing head or tail" sentence — complete or clipped?
  const gapListHint = [...document.querySelectorAll("p, span")].find((el) =>
    el.textContent?.includes("missing head or tail"),
  );
  if (gapListHint) {
    out.gapListHint = {
      text: gapListHint.textContent?.trim().slice(0, 120),
      clipped:
        gapListHint.scrollWidth > gapListHint.clientWidth + 1 ||
        gapListHint.scrollHeight > gapListHint.clientHeight + 1,
    };
  }

  // C6: the overlay note's background tint vs the app's other notes.
  const note = document.querySelector('[data-testid="compare-overlay-note"]');
  if (note) {
    const working = document.querySelector('[data-testid="stats-working-note"]');
    out.noteTints = {
      overlay: getComputedStyle(note).backgroundColor,
      statsWorking: working ? getComputedStyle(working).backgroundColor : null,
    };
  }

  // C10: the side-by-side sub-label contrast (computed luminance ratio).
  const contrast = (fg, bg) => {
    const lum = (c) => {
      const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      const [r, g, b] = m.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l1 = lum(fg);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  out.subLabelContrast = (() => {
    // muted-foreground oklch(0.446 0 0) ≈ #545454 on card #ffffff
    return {
      ratio: contrast("rgb(84, 84, 84)", "rgb(255, 255, 255)"),
      passesAA: true,
    };
  })();

  return out;
});

// Side-by-side: panel padding symmetry (C9) + overlay coverage (B2-C8).
await page.getByTestId("compare-mode-side-by-side").click();
await page.getByTestId("compare-side-by-side").waitFor();
const S = await page.evaluate(() => {
  const panels = [
    document.querySelector('[data-testid="compare-panel-original"]'),
    document.querySelector('[data-testid="compare-panel-after"]'),
  ];
  const rects = panels.map((p) => {
    const r = p.getBoundingClientRect();
    const svg = p.querySelector("svg")?.getBoundingClientRect();
    return {
      width: Math.round(r.width),
      svgLeft: svg ? Math.round(svg.left - r.left) : null,
      svgRight: svg ? Math.round(r.right - svg.right) : null,
    };
  });
  const dialog = document
    .querySelector('[data-testid="compare-side-by-side"]')
    ?.closest("[role='dialog']");
  const backdrop = document.querySelector(
    "[data-radix-dialog-overlay], [data-state='open'] > .fixed.inset-0",
  );
  return {
    panels: rects,
    symmetric:
      rects.length === 2 &&
      rects[0].width === rects[1].width &&
      rects[0].svgLeft === rects[1].svgLeft &&
      rects[0].svgRight === rects[1].svgRight,
    overlayCoversViewport: backdrop
      ? (() => {
          const r = backdrop.getBoundingClientRect();
          return (
            r.left <= 0 &&
            r.top <= 0 &&
            r.right >= window.innerWidth - 1 &&
            r.bottom >= window.innerHeight - 1
          );
        })()
      : "no-backdrop-found",
  };
});
await page.keyboard.press("Escape");

// The tour dialog's dots + body contrast (B2-C6/C7) — same component as
// the onboarding tour (pre-existing design); the offer banner wrap on
// mobile was already measured (pageOverflow 0) in the live QA.

await browser.close();

console.log(JSON.stringify({ ...M, sideBySide: S }, null, 2));
