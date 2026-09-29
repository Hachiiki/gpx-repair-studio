#!/usr/bin/env node
/**
 * Phase 9 baseline profiler — measures the CURRENT (pre-worker) cost of
 * parsing + rendering + exporting a 100k-point synthetic GPX in the real
 * browser, with main-thread long-task attribution.
 *
 * Throwaway diagnostic (not part of the shipped test suite).
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "e2e", "fixtures", "synthetic-100k.generated.gpx");

const browser = await chromium.launch();
const page = await browser.newPage();

// Long-task + paint observer, installed before anything happens.
await page.addInitScript(() => {
  window.__longtasks = [];
  window.__marks = {};
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longtasks.push({
          start: entry.startTime,
          duration: Math.round(entry.duration),
          name: entry.name,
        });
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    /* longtask unsupported */
  }
  window.__mark = (name) => {
    window.__marks[name] = performance.now();
  };
});

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto("http://localhost:3000/");

// Enter repair tool + upload
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) {
  await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}
await page.evaluate(() => window.__mark("pre-upload"));
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(FILE);

// Wait for the workspace to be visible (parse complete + first render)
await page.getByTestId("gpx-summary").waitFor({ state: "visible", timeout: 60_000 });
await page.evaluate(() => window.__mark("summary-visible"));
// Give the map a moment to settle its first render
await page.waitForTimeout(2500);
await page.evaluate(() => window.__mark("settled"));

const baseline = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    longtasks: window.__longtasks,
    marks: window.__marks,
    heapMB: performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1048576)
      : null,
    domNodes: document.getElementsByTagName("*").length,
  };
});

console.log("=== PARSE+RENDER (100k points) ===");
console.log("upload -> summary visible:", Math.round(baseline.marks["summary-visible"] - baseline.marks["pre-upload"]), "ms");
console.log("summary -> settled(+2.5s):", Math.round(baseline.marks.settled - baseline.marks["summary-visible"]), "ms");
console.log("long tasks during window:");
for (const t of baseline.longtasks) {
  const rel = Math.round(t.start - baseline.marks["pre-upload"]);
  if (rel > -500 && rel < baseline.marks.settled - baseline.marks["pre-upload"] + 500) {
    console.log(`  t=+${rel}ms  ${t.duration}ms`);
  }
}
const totalBlock = baseline.longtasks
  .filter((t) => t.start > baseline.marks["pre-upload"] && t.start < baseline.marks.settled)
  .reduce((a, t) => a + t.duration, 0);
console.log("total long-task blocking:", Math.round(totalBlock), "ms across", baseline.longtasks.filter((t) => t.start > baseline.marks["pre-upload"] && t.start < baseline.marks.settled).length, "tasks");
console.log("JS heap after render:", baseline.heapMB, "MB");
console.log("DOM nodes:", baseline.domNodes);

// Pan/zoom interactivity probe: fire a few zooms, measure frame stats
const zoomPerf = await page.evaluate(async () => {
  const mapCanvas = document.querySelector('[data-testid="map-canvas"] canvas, .maplibregl-canvas');
  if (!mapCanvas) return { error: "no canvas" };
  const t0 = performance.now();
  for (let i = 0; i < 6; i++) {
    mapCanvas.dispatchEvent(new WheelEvent("wheel", { deltaY: i % 2 === 0 ? -120 : 120, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, 400));
  return { sixZoomsMs: Math.round(performance.now() - t0) };
});
console.log("=== ZOOM PROBE ===", zoomPerf);

// Export timing (Phase 7 export dialog → download)
try {
  await page.getByTestId("gpx-summary").getByRole("button", { name: /export/i }).first().waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
    // fall back: any element that opens the export dialog
    await page.getByRole("button", { name: /export/i }).first().waitFor({ state: "visible", timeout: 5000 });
  });
  await page.getByRole("button", { name: /export/i }).first().click();
  await page.getByTestId("export-dialog").waitFor({ state: "visible", timeout: 10_000 });
  await page.evaluate(() => window.__mark("pre-export"));
  await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByTestId("export-download-button").click(),
  ]);
  await page.evaluate(() => window.__mark("post-download"));
  const exportMs = await page.evaluate(
    () => window.__marks["post-download"] - window.__marks["pre-export"],
  );
  const exportTasks = await page.evaluate(() =>
    window.__longtasks.filter((t) => t.start > window.__marks["pre-export"] && t.start < window.__marks["post-download"]),
  );
  console.log("=== EXPORT (100k) ===", exportMs, "ms; long tasks:", exportTasks.map((t) => t.duration));
} catch (e) {
  console.log("=== EXPORT === skipped:", String(e).slice(0, 300));
}

if (errors.length) console.log("PAGE ERRORS:", errors.slice(0, 5));
await browser.close();
