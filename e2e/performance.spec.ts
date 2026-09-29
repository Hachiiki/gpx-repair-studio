/**
 * Performance budgets (docs/MASTER_PLAN.md §C-2, Phase 9 tests).
 *
 * The plan's budgets, mapped to what a DEV-SERVER run can assert
 * honestly (production builds are ~3× faster; ceilings below are the
 * dev-server equivalents — the mapping is documented in MASTER_PLAN §Y):
 *
 *   - 50k fixture: upload → parsed workspace under 2 s (§C-2 verbatim),
 *     and no main-thread block over 200 ms while the parse pipeline
 *     runs (§C-2's "parse + validate without blocking > 200 ms").
 *   - 100k fixture: the same ≤200 ms parse-pipeline rule, with the full
 *     upload → workspace wall under a proportionate dev ceiling.
 *   - 100k export under 1 s (download event).
 *   - The decimation layer is live: rendered coords ≪ total at fit zoom,
 *     and resolution returns as you zoom in.
 *   - 250k stress: loads without crashing the tab, heap stays sane.
 *
 * The parse pipeline is observed race-free: an in-page MutationObserver
 * records every determinate-progress label sighting (the worker's phase
 * heartbeat) with timestamps, so even a fast 50k transfer can never be
 * missed by polling.
 *
 * Fixtures are regenerated deterministically per run (gitignored), the
 * same corpus the upload/map suites share.
 */

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSyntheticGpx } from "../src/features/gpx/fixtures/generators";

const GENERATED_DIR = join("e2e", "fixtures");
const FILE_100K = join(GENERATED_DIR, "perf-100k.generated.gpx");
const FILE_50K = join(GENERATED_DIR, "perf-50k.generated.gpx");
const FILE_250K = join(GENERATED_DIR, "stress-250k.generated.gpx");

/** In-page perf probe fields (installed by installPerfProbe before load). */
declare global {
  interface Window {
    __longtasks: { start: number; duration: number }[];
    __marks: Record<string, number>;
    __progressLog: { t: number; text: string }[];
    __mark: (name: string) => void;
  }
}

test.beforeAll(() => {
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(
    FILE_50K,
    generateSyntheticGpx({ pointCount: 50_000, seed: 42 }),
  );
  writeFileSync(
    FILE_100K,
    generateSyntheticGpx({ pointCount: 100_000, seed: 42 }),
  );
  // The 250k stress file (~25 MB) exists for its own test only.
  writeFileSync(
    FILE_250K,
    generateSyntheticGpx({ pointCount: 250_000, seed: 42 }),
  );
});

// ---------------------------------------------------------------------------
// Probes + helpers
// ---------------------------------------------------------------------------

/**
 * Long-task recorder, named marks, and a MutationObserver that logs
 * every parse-progress label sighting (the worker heartbeat) with a
 * timestamp — installed before navigation so nothing is missed.
 */
async function installPerfProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__longtasks = [];
    window.__marks = {};
    window.__progressLog = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longtasks.push({
          start: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ entryTypes: ["longtask"] });
    window.__mark = (name: string) => {
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
    new MutationObserver(logProgress).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

/** Enter the repair tool from the landing cards (idempotent). */
async function enterRepairTool(page: Page): Promise<void> {
  await page.goto("/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) {
    await card.click();
    await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  }
}

/** Upload through the zone's picker, marking the moment the file lands. */
async function uploadMarked(page: Page, path: string): Promise<void> {
  await page.evaluate(() => window.__mark("upload"));
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles(path);
}

interface PerfSnapshot {
  marks: Record<string, number>;
  longtasks: { start: number; duration: number }[];
  progressLog: { t: number; text: string }[];
}

async function readPerf(page: Page): Promise<PerfSnapshot> {
  return page.evaluate(() => ({
    marks: window.__marks,
    longtasks: window.__longtasks,
    progressLog: window.__progressLog,
  }));
}

/** The parse pipeline's end: the last worker heartbeat before the commit. */
function parseWindowEnd(perf: PerfSnapshot): number {
  expect(
    perf.progressLog.length,
    "worker progress was observed (the parse ran worker-side)",
  ).toBeGreaterThan(0);
  return perf.progressLog[perf.progressLog.length - 1]!.t;
}

/** Longest main-thread block inside [upload, parsePipelineEnd]. */
function worstParseBlock(perf: PerfSnapshot): number {
  const start = perf.marks["upload"]!;
  const end = parseWindowEnd(perf);
  return perf.longtasks
    .filter((t) => t.start >= start && t.start <= end)
    .reduce((max, t) => Math.max(max, t.duration), 0);
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

test.describe("performance budgets (§C-2)", () => {
  test("50k points: workspace under 2 s, parse pipeline never blocks > 200 ms", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installPerfProbe(page);
    await enterRepairTool(page);
    await uploadMarked(page, FILE_50K);
    await page
      .getByTestId("gpx-summary")
      .waitFor({ state: "visible", timeout: 30_000 });

    const perf = await readPerf(page);
    const summaryMs = await page.evaluate(() => performance.now());
    // §C-2 verbatim: a 50k-point file parsed and validated within 2 s.
    expect(summaryMs - perf.marks["upload"]!).toBeLessThan(2_000);
    // …without blocking the main thread > 200 ms during the pipeline.
    expect(
      Math.round(worstParseBlock(perf)),
      `longest parse-pipeline block: ${Math.round(worstParseBlock(perf))} ms`,
    ).toBeLessThanOrEqual(200);
  });

  test("100k points: parse pipeline off the main thread, workspace prompt", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installPerfProbe(page);
    await enterRepairTool(page);
    await uploadMarked(page, FILE_100K);
    await page
      .getByTestId("gpx-summary")
      .waitFor({ state: "visible", timeout: 60_000 });

    const perf = await readPerf(page);
    const summaryMs = await page.evaluate(() => performance.now());
    // The worker actually ran: phase heartbeats were recorded, ending in
    // the transfer phase ("Preparing view").
    expect(perf.progressLog[perf.progressLog.length - 1]!.text).toMatch(
      /Preparing view/,
    );
    expect(
      Math.round(worstParseBlock(perf)),
      `longest parse-pipeline block: ${Math.round(worstParseBlock(perf))} ms`,
    ).toBeLessThanOrEqual(200);
    // Dev-server ceiling for the full load (production ≈ 3× faster).
    expect(summaryMs - perf.marks["upload"]!).toBeLessThan(3_500);
  });

  test("100k points: the decimation layer is live", async ({ page }) => {
    test.setTimeout(60_000);
    await installPerfProbe(page);
    await enterRepairTool(page);
    await uploadMarked(page, FILE_100K);
    await page
      .getByTestId("gpx-summary")
      .waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(3_000); // style + tiles + first render

    const atFit = await page.evaluate(() => {
      const s = window.__gpxMapController!.getTestState();
      return {
        zoom: s.zoom,
        features: s.routeFeatureCount,
        rendered: s.routeRenderedCoords,
        stride: s.routeStride,
      };
    });
    // 100k recorded points render as a small decimated set at fit zoom.
    expect(atFit.features).toBe(2); // split at the synthetic gap
    expect(atFit.rendered).toBeLessThan(5_000);
    expect(atFit.stride).toBeGreaterThan(1);

    // Zooming in re-decimates toward full resolution (band rebuilds).
    for (let i = 0; i < 6; i += 1) {
      await page.evaluate(() => window.__gpxMapController!.zoomIn());
      await page.waitForTimeout(400);
    }
    const zoomedIn = await page.evaluate(() => {
      const s = window.__gpxMapController!.getTestState();
      return {
        zoom: s.zoom,
        rendered: s.routeRenderedCoords,
        stride: s.routeStride,
      };
    });
    expect(zoomedIn.stride).toBeLessThan(atFit.stride);
    expect(zoomedIn.rendered).toBeGreaterThan(atFit.rendered);
  });

  test("100k points: export under 1 s", async ({ page }) => {
    test.setTimeout(90_000);
    await installPerfProbe(page);
    await enterRepairTool(page);
    await uploadMarked(page, FILE_100K);
    await page
      .getByTestId("gpx-summary")
      .waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(1_500);

    await page.getByRole("button", { name: /export/i }).first().click();
    await page.getByTestId("export-dialog").waitFor({ state: "visible" });
    const t0 = await page.evaluate(() => performance.now());
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByTestId("export-download-button").click(),
    ]);
    const exportMs = (await page.evaluate(() => performance.now())) - t0;
    expect(exportMs).toBeLessThan(1_000);
    expect(download.suggestedFilename()).toMatch(/\.gpx$/);
  });
});

test.describe("250k stress smoke (§C-2 memory budget)", () => {
  test("loads without crashing, heap stays sane", async ({ page }) => {
    test.setTimeout(180_000);
    await installPerfProbe(page);
    await enterRepairTool(page);
    await uploadMarked(page, FILE_250K);
    await page
      .getByTestId("gpx-summary")
      .waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(4_000);

    // The parsed model actually holds the points.
    await expect(page.getByTestId("segment-list")).toContainText("250,000");

    const snapshot = await page.evaluate(() => ({
      heapMB: (performance as Performance & { memory?: { usedJSHeapSize: number } })
        .memory
        ? Math.round(
            (performance as Performance & { memory: { usedJSHeapSize: number } })
              .memory.usedJSHeapSize / 1048576,
          )
        : null,
      domNodes: document.getElementsByTagName("*").length,
      summaryPresent: !!document.querySelector('[data-testid="gpx-summary"]'),
    }));
    // §C-2: no tab crash; dev-mode ceiling is generous (production sits
    // well below — scripts/task51-mem-profile.mjs records the numbers).
    expect(snapshot.heapMB === null || snapshot.heapMB < 2_000).toBe(true);
    expect(snapshot.domNodes).toBeLessThan(5_000);
    expect(snapshot.summaryPresent).toBe(true);
  });
});
