#!/usr/bin/env node
// Diagnose the perf-spec failures: does the progress label appear, what are
// the timings, does decimation engage, and what does the route state hold?
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateSyntheticGpx } from "../src/features/gpx/fixtures/generators.ts";

const DIR = join(process.cwd(), "e2e", "fixtures");
mkdirSync(DIR, { recursive: true });
const POINTS = Number(process.env.POINTS ?? 100_000);
const FILE = join(DIR, `diag-${POINTS}.generated.gpx`);
writeFileSync(FILE, generateSyntheticGpx({
  pointCount: POINTS,
  seed: 42,
  // Match the perf spec's fixtures EXCEPT we inject the gap the
  // decimation test expects (the spec forgot it — see worklog).
  timeGapAfter: Math.floor(POINTS / 2),
}));
console.log("fixture:", FILE, "points:", POINTS);

const browser = await chromium.launch();
const page = await browser.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e)}`));

await page.addInitScript(() => {
  window.__longtasks = [];
  window.__marks = {};
  window.__progressLog = [];
  window.__workerMessages = [];
  // Intercept every Worker: log each incoming message type + payload size.
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      const nativeAddEventListener = this.addEventListener.bind(this);
      // Spy on onmessage assignments by wrapping the property.
      let handler = null;
      Object.defineProperty(this, "onmessage", {
        get: () => handler,
        set: (fn) => {
          handler = fn;
          nativeAddEventListener("message", (event) => {
            const d = event.data;
            window.__workerMessages.push({
              t: performance.now(),
              type: d?.type,
              phase: d?.phase,
              fraction: d?.fraction,
              points: Array.isArray(d?.points) ? d.points.length : undefined,
            });
            if (typeof fn === "function") fn(event);
          });
        },
        configurable: true,
      });
    }
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__longtasks.push({
        start: entry.startTime,
        duration: entry.duration,
      });
    }
  }).observe({ entryTypes: ["longtask"] });
  window.__mark = (name) => {
    window.__marks[name] = performance.now();
  };
  const logProgress = () => {
    const el = document.querySelector('[data-testid="parse-progress-label"]');
    if (el) {
      const text = el.textContent ?? "";
      const log = window.__progressLog;
      if (log.length === 0 || log[log.length - 1].text !== text) {
        log.push({ t: performance.now(), text });
      }
    }
  };
  // Census: every parse-/loading-related testid + the Parsing text sighting.
  window.__testidSightings = [];
  const census = () => {
    const ids = new Set();
    for (const el of document.querySelectorAll("[data-testid]")) {
      const id = el.getAttribute("data-testid");
      if (id && /parse|loading|summary|upload/i.test(id)) ids.add(id);
    }
    const parsing = document.body.innerText.match(/Parsing\s+\S+/);
    if (parsing) ids.add(`TEXT:${parsing[0].slice(0, 40)}`);
    if (ids.size > 0) {
      const log = window.__testidSightings;
      const key = [...ids].sort().join("|");
      if (log.length === 0 || log[log.length - 1].key !== key) {
        log.push({ t: performance.now(), key });
      }
    }
  };
  // addInitScript runs before the HTML parser creates <html>, so
  // documentElement is null here — observe the Document itself
  // (its subtree is the whole tree once parsed).
  new MutationObserver(() => {
    logProgress();
    census();
  }).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
});

await page.goto("http://localhost:3000/");
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) {
  await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}

await page.evaluate(() => window.__mark("upload"));
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(FILE);
await page.getByTestId("gpx-summary").waitFor({ state: "visible", timeout: 60_000 });

const perf = await page.evaluate(() => ({
  marks: window.__marks,
  longtasks: window.__longtasks,
  progressLog: window.__progressLog,
  workerMessages: window.__workerMessages ?? "SPY-NOT-INSTALLED",
  testidSightings: window.__testidSightings ?? [],
}));
const summaryMs = await page.evaluate(() => performance.now());

console.log("upload -> summary (ms):", Math.round(summaryMs - perf.marks.upload));
console.log("--- testid census (relative to upload mark) ---");
const t0 = perf.marks.upload;
for (const s of perf.testidSightings.slice(0, 25)) {
  console.log(`  +${Math.round(s.t - t0)}ms  ${s.key.slice(0, 160)}`);
}
console.log("progressLog entries:", perf.progressLog.length);
const wm = Array.isArray(perf.workerMessages) ? perf.workerMessages : [];
console.log("worker messages:", wm.length);
const byType = {};
for (const m of wm) byType[m.type] = (byType[m.type] ?? 0) + 1;
console.log("by type:", JSON.stringify(byType));
for (const m of wm.filter((m) => m.type === "progress").slice(0, 8)) {
  console.log(`  progress t=${Math.round(m.t)}ms ${m.phase} ${(m.fraction ?? 0).toFixed(2)}`);
}
console.log("first/last worker msg t:",
  wm.length ? `${Math.round(wm[0].t)}ms / ${Math.round(wm[wm.length - 1].t)}ms` : "none");
for (const p of perf.progressLog.slice(0, 4)) {
  console.log(`  t=${Math.round(p.t)}ms  ${p.text}`);
}
console.log(`  ... ${perf.progressLog.length - 8} more ...`);
for (const p of perf.progressLog.slice(-4)) {
  console.log(`  t=${Math.round(p.t)}ms  ${p.text}`);
}
const parseBlocks = perf.longtasks.filter(
  (t) => t.start >= perf.marks.upload,
);
console.log("longtasks after upload:", parseBlocks.length);
for (const t of parseBlocks.slice(0, 10)) {
  console.log(`  start=${Math.round(t.start)} dur=${Math.round(t.duration)}ms`);
}

// Wait for map settle, then inspect controller state.
await page.waitForTimeout(3_000);
const s = await page.evaluate(() => window.__gpxMapController?.getTestState());
console.log("map state:", JSON.stringify(s, null, 2));

console.log("--- console (filtered) ---");
for (const l of logs) {
  if (/worker|gpx-repair-studio|error|fail|warn/i.test(l)) console.log(l.slice(0, 240));
}
await browser.close();
