/**
 * Task 56 (home redesign — compact tiles with illustrations) — live QA:
 * screenshots + geometry measurements + a console-error sweep of the
 * new landing:
 *
 *   1. desktop 1440×900 — the 3-across tile grid, full page + fold;
 *   2. tablet-band 900×800 — the 2-across band;
 *   3. mobile 390×844 — the 1-across stack, overflow + target sizes.
 *
 * Verifies the density claim (page height vs the old ~1400 px), the
 * illustration plates loading, and the e2e-pinned overflow contract.
 * Run against the dev server on :3000 (same-call server pattern).
 * Screenshots land in download/ for the worklog + VLM critique.
 */
import { chromium } from "@playwright/test";

const OUT = "download";
const errors = [];
const pageErrors = [];

const browser = await chromium.launch();

async function shoot(label, viewport) {
  const context = await browser.newContext({ viewport });
  // Seed the tour flag: a fresh browser would auto-open the
  // onboarding overlay and cover the landing (the Phase 11 config
  // seed pattern — we are QA-ing the tiles, not the tour).
  await context.addInitScript(() => {
    try {
      localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    } catch {
      /* storage blocked — the app tolerates it */
    }
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}] ${m.text()}`);
  });
  page.on("pageerror", (e) => pageErrors.push(`[${label}] ${String(e)}`));

  await page.goto("http://localhost:3000/");
  const grid = page.getByTestId("landing-mode-toggle");
  await grid.waitFor({ state: "visible" });

  // All six plates decoded (naturalWidth > 0) before any measurement.
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("[data-testid=landing-mode-toggle] img"))
        .length === 6 &&
      Array.from(
        document.querySelectorAll("[data-testid=landing-mode-toggle] img"),
      ).every((img) => img.naturalWidth > 0),
    undefined,
    { timeout: 15_000 },
  );
  // Let the hero entrance finish (the Task 55 lesson: mid-animation
  // screenshots read as defects)…
  await page.waitForTimeout(700);
  // …and scroll the whole page before a fullPage capture: below-fold
  // `decoding="async"` images are loaded but may not be PAINTED yet,
  // and full-page stitching captures unpainted plates as empty (the
  // Task 56 mobile critique lesson).
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(() =>
    Promise.all(
      Array.from(
        document.querySelectorAll("[data-testid=landing-mode-toggle] img"),
      ).map((img) => (img.complete ? img.decode().catch(() => {}) : null)),
    ),
  );
  await page.waitForTimeout(300);

  const metrics = await page.evaluate(() => {
    const grid = document.querySelector("[data-testid=landing-mode-toggle]");
    const tiles = grid.querySelectorAll("button");
    const first = tiles[0].getBoundingClientRect();
    const plate = tiles[0].querySelector("img").getBoundingClientRect();
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    // Touch-target audit: every tile's minimum dimension.
    const targetMins = Array.from(tiles).map((t) => {
      const r = t.getBoundingClientRect();
      return Math.round(Math.min(r.width, r.height));
    });
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      tileWidth: Math.round(first.width),
      tileHeight: Math.round(first.height),
      plateHeight: Math.round(plate.height),
      pageHeight: Math.round(doc.scrollHeight),
      overflowX,
      targetMins,
    };
  });

  await page.screenshot({
    path: `${OUT}/task56-${label}.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `${OUT}/task56-${label}-fold.png`,
  });

  console.log(
    `[${label}] ${JSON.stringify(metrics)}`,
  );
  await context.close();
  return metrics;
}

const desktop = await shoot("desktop-1440", { width: 1440, height: 900 });
const band = await shoot("band-900", { width: 900, height: 800 });
const mobile = await shoot("mobile-390", { width: 390, height: 844 });

await browser.close();

console.log("\n--- contract checks ---");
const checks = [
  ["desktop 3 columns", desktop.columns === 3],
  ["band 3 columns (md:grid-cols-3)", band.columns === 3],
  ["mobile 1 column", mobile.columns === 1],
  ["no horizontal overflow (all)", [desktop, band, mobile].every((m) => m.overflowX <= 0)],
  ["plates load at 2:1-ish (desktop 150-190px)", desktop.plateHeight >= 150 && desktop.plateHeight <= 190],
  ["page density: desktop under 1100px", desktop.pageHeight < 1100],
  ["page density: band under 1150px (old 2-col band was ~1515)", band.pageHeight < 1150],
  ["touch targets >= 44px (mobile)", mobile.targetMins.every((t) => t >= 44)],
];
let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
  if (!ok) failed = true;
}
console.log(`\nconsole errors: ${errors.length ? JSON.stringify(errors) : "none"}`);
console.log(`page errors: ${pageErrors.length ? JSON.stringify(pageErrors) : "none"}`);
if (failed || errors.length || pageErrors.length) process.exit(1);
console.log("TASK 56 LIVE QA: ALL CHECKS PASS");
