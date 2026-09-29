#!/usr/bin/env node
// Phase-by-phase timeline: which main-thread block is what?
import { chromium } from "playwright";
import { join } from "node:path";

const FILE = join(process.cwd(), "e2e", "fixtures", "synthetic-100k.generated.gpx");
const browser = await chromium.launch();
const page = await browser.newPage();

await page.addInitScript(() => {
  window.__longtasks = [];
  window.__marks = {};
  window.__progress = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__longtasks.push({ start: entry.startTime, duration: Math.round(entry.duration) });
    }
  }).observe({ entryTypes: ["longtask"] });
  window.__mark = (name) => { window.__marks[name] = performance.now(); };
});

await page.goto("http://localhost:3000/");
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) {
  await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}

// Watch the progress bar while parsing (poll in-page, no Playwright roundtrips)
await page.evaluate(() => {
  window.__progressWatch = new Promise((resolve) => {
    const seen = [];
    const t0 = performance.now();
    const iv = setInterval(() => {
      const el = document.querySelector('[data-testid="parse-progress-label"]');
      if (el) seen.push({ t: Math.round(performance.now() - t0), text: el.textContent });
      const loading = document.querySelector('[data-testid="loading-state"]');
      if (!loading && performance.now() - t0 > 1000) {
        clearInterval(iv);
        resolve(seen);
      }
    }, 100);
    setTimeout(() => { clearInterval(iv); resolve(seen); }, 30000);
  });
});

await page.evaluate(() => window.__mark("upload"));
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(FILE);

const progressSeen = await page.evaluate(() => window.__progressWatch);
await page.getByTestId("gpx-summary").waitFor({ state: "visible", timeout: 60_000 });
await page.evaluate(() => window.__mark("summary"));
await page.waitForTimeout(2500);
await page.evaluate(() => window.__mark("settled"));

const out = await page.evaluate(() => ({
  marks: window.__marks,
  longtasks: window.__longtasks,
}));
const t0 = out.marks.upload;
console.log("upload → summary:", Math.round(out.marks.summary - t0), "ms");
console.log("progress bar samples:", JSON.stringify(progressSeen));
console.log("long tasks (start rel to upload, duration):");
for (const t of out.longtasks) {
  const rel = Math.round(t.start - t0);
  if (rel > -100 && rel < out.marks.settled - t0) console.log(`  +${rel}ms  ${t.duration}ms`);
}
await browser.close();
