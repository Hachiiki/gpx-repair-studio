#!/usr/bin/env node
// Task 51 — the 250k-point memory profile (MASTER_PLAN §C-2, Phase 9).
//
// The stress ceiling the e2e suite asserts (heap < 2,000 MB, DOM < 5,000
// nodes) is a gate, not a record. This script records the actual shape:
// heap + DOM nodes + long tasks + wall time at each stage of the 250k
// flow (upload → parsed workspace → export), on the dev server, printed
// as the table the worklog cites. Run:
//
//   (bun run dev &) ; node scripts/task51-mem-profile.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { generateSyntheticGpx } from "../src/features/gpx/fixtures/generators.ts";

const DIR = join(process.cwd(), "e2e", "fixtures");
mkdirSync(DIR, { recursive: true });
const FILE = join(DIR, "mem-250k.generated.gpx");
writeFileSync(
  FILE,
  generateSyntheticGpx({
    pointCount: 250_000,
    seed: 42,
    withTime: true,
    withEle: true,
    timeGapAfter: 125_000,
    timeGapSeconds: 600,
  }),
);

const browser = await chromium.launch();
const page = await browser.newPage();

await page.addInitScript(() => {
  window.__longtasks = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__longtasks.push({
        start: entry.startTime,
        duration: entry.duration,
      });
    }
  }).observe({ entryTypes: ["longtask"] });
});

const heap = () =>
  page.evaluate(() => {
    const mem = performance.memory;
    return {
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      domNodes: document.getElementsByTagName("*").length,
    };
  });

const rows = [];
const record = async (stage, sinceMs) => {
  const snap = await heap();
  const now = await page.evaluate(() => performance.now());
  rows.push({ stage, ...snap, wallMs: Math.round(now - sinceMs) });
};

await page.goto("http://localhost:3000/");
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) {
  await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}

const t0 = await page.evaluate(() => performance.now());
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(FILE);
await page.getByTestId("gpx-summary").waitFor({ state: "visible", timeout: 120_000 });
await record("parsed workspace", t0);

await page.waitForTimeout(4_000); // map style + tiles + first render
await record("+4s settle (map rendered)", t0);

// The export round-trip: serialization allocates, the download releases.
await page.getByRole("button", { name: /export/i }).first().click();
await page.getByTestId("export-dialog").waitFor({ state: "visible" });
const tExport = await page.evaluate(() => performance.now());
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 60_000 }),
  page.getByTestId("export-download-button").click(),
]);
const exportMs = Math.round(
  (await page.evaluate(() => performance.now())) - tExport,
);
await record("+export", t0);

const segments = await page
  .getByTestId("segment-list")
  .textContent()
  .catch(() => "");
const tasks = await page.evaluate(() => window.__longtasks);
const over200 = tasks.filter((t) => t.duration > 200);

console.log("250k memory profile (dev server, Chromium):");
console.table(rows);
console.log("points confirmed in segment list:", /250,000/.test(segments ?? ""));
console.log("export wall (ms):", exportMs);
console.log(
  `long tasks total: ${tasks.length}, over 200 ms: ${over200.length}` +
    (over200.length
      ? ` (max ${Math.round(Math.max(...over200.map((t) => t.duration)))} ms)`
      : ""),
);
const dlPath = await download.path();
console.log(
  "download:",
  download.suggestedFilename(),
  dlPath ? `${Math.round(statSync(dlPath).size / 1048576)} MB` : "(no path)",
);
await browser.close();
