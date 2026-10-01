import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";
import { abortRoadRouting, mockOsrmBulge, type OsrmCallLog } from "./helpers/road-follow";

/**
 * E2E — Phase 10, session recovery (IndexedDB autosave + restore).
 *
 * The phase's acceptance criteria, each pinned by a spec:
 *
 *   1. RELOAD RECOVERS EVERYTHING: draw a repair, wait for the debounced
 *      autosave, reload the page — the landing offers the session
 *      (file name + drawn work + saved-ago), and Restore re-opens the
 *      file and the drawn line exactly (re-parse through the ordinary
 *      pipeline, deterministic gap ids re-adopting the repair).
 *   2. ROAD-FOLLOWED LINES RESTORE WYSIWYG WITH ZERO NEW REQUESTS: the
 *      record carries the resolved road legs, and the restore seeds the
 *      router cache — reopening the editor re-hits the cache, so the
 *      OSRM request counter does not move across the whole restore.
 *   3. DISCARD WORKS: the record is deleted, the landing stays, storage
 *      is empty.
 *   4. CLEAR STORED DATA WORKS: the global control empties everything.
 *   5. THE CREATE SECTION RECOVERS TOO (the no-file twin: stats + route).
 *   6. THE APP FUNCTIONS IDENTICALLY WITH STORAGE DEAD: indexedDB
 *      undefined → the app loads, uploads, parses, draws — no prompt,
 *      no errors, nothing saved.
 *
 * Assertions read the session-recovery dev bridge
 * (`window.__gpxrSessionRecovery`, the __gpxMapController pattern) —
 * deterministic waits for the debounced saves, never fixed sleeps.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

/** The time-gap fixture's gap boundaries (points 3 → 4, a 5-min pause). */
const BEFORE = { lat: 52.520141, lon: 13.405164 };
const AFTER = { lat: 52.520186, lon: 13.405234 };

/** Hand-picked draw positions, well clear of handles/midpoints/anchors. */
const DRAW_POINTS = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
  { lat: 52.5199, lon: 13.4062 },
  { lat: 52.5204, lon: 13.4066 },
];

interface RecoveryBridgeState {
  available: boolean;
  offers: number;
  saved: Record<string, number>;
  pending: boolean;
}

async function recoveryBridge(page: Page): Promise<RecoveryBridgeState | null> {
  try {
    return await page.evaluate(() =>
      window.__gpxrSessionRecovery
        ? (window.__gpxrSessionRecovery.getTestState() as never)
        : null,
    );
  } catch {
    return null;
  }
}

interface DrawSessionState {
  vertexCount: number;
  chainCoordinates: [number, number][];
}

interface MapBridgeState {
  ready: boolean;
  moving: boolean;
  routeFeatureCount: number;
  reconstructionLineCount: number;
  drawSession: DrawSessionState | null;
}

async function mapBridge(page: Page): Promise<MapBridgeState | null> {
  try {
    return await page.evaluate(() =>
      window.__gpxMapController
        ? (window.__gpxMapController.getTestState() as never)
        : null,
    );
  } catch {
    return null;
  }
}

async function poll<T>(
  page: Page,
  read: () => Promise<T | null>,
  predicate: (state: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const state = await read();
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `predicate not met within ${timeoutMs} ms; last: ${JSON.stringify(state)}`,
      );
    }
    await page.waitForTimeout(150);
  }
}

/**
 * Wait for the section's autosave to land AND quiesce: a save exists,
 * nothing is pending, and one quiet second passes without a new debounce
 * (async road legs can fire a follow-up save after the vertex save).
 */
async function waitForSaved(page: Page, section: string): Promise<void> {
  await poll(
    page,
    () => recoveryBridge(page),
    (s) => (s.saved[section] ?? 0) > 0 && !s.pending,
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(1000);
    const state = await recoveryBridge(page);
    if (state && !state.pending && (state.saved[section] ?? 0) > 0) return;
  }
  throw new Error(`autosave for "${section}" never quiesced`);
}

async function upload(page: Page, path = join(FIXTURES, "time-gap.gpx")) {
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

async function project(page: Page, lat: number, lon: number) {
  return page.evaluate(
    ([lat_, lon_]) =>
      window.__gpxMapController!.projectLatLon(lat_ as number, lon_ as number),
    [lat, lon] as const,
  );
}

async function canvasBox(page: Page) {
  await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/**
 * Open the (single) detected gap's editor. Fresh: the session starts
 * empty; after a restore it starts with the restored vertices — so this
 * only waits for the session to exist (callers assert the count they
 * expect).
 */
async function openEditor(page: Page): Promise<MapBridgeState> {
  await page.getByTestId("open-editor-button").first().click();
  return poll(
    page,
    () => mapBridge(page),
    (s) => s.drawSession !== null,
  );
}

/** Draw the given points on the open editor and settle the chain. */
async function drawPoints(
  page: Page,
  points: { lat: number; lon: number }[],
): Promise<void> {
  const box = await canvasBox(page);
  for (const point of points) {
    const { x, y } = await project(page, point.lat, point.lon);
    await page.mouse.click(box.x + x, box.y + y);
  }
  await poll(
    page,
    () => mapBridge(page),
    (s) => s.drawSession?.vertexCount === points.length,
  );
}

/** The chain stops moving (road legs, snap round-trips, store propagation). */
async function settledChain(page: Page): Promise<[number, number][]> {
  const started = Date.now();
  let last = "";
  for (;;) {
    const state = await poll(
      page,
      () => mapBridge(page),
      (s) => s.drawSession !== null,
    );
    const json = JSON.stringify(state.drawSession!.chainCoordinates);
    if (json === last) return state.drawSession!.chainCoordinates;
    last = json;
    if (Date.now() - started > 10_000) {
      throw new Error(`chain never settled; last: ${json}`);
    }
    await page.waitForTimeout(300);
  }
}

test.beforeEach(async ({ page }) => {
  // A clean IndexedDB per test — the phase's storage IS the subject.
  // (Contexts are already storage-isolated; this also covers a reused
  // context.) Road routing is pinned PER TEST — most specs abort it; the
  // road-follow spec installs the OSRM mock instead.
  await page.goto("/");
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name === "gpx-repair-studio.sessions") {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });
});

test.describe("reload recovers everything (repair)", () => {
  test("draw → autosave → reload → prompt → restore → line intact", async ({ page }) => {
    await abortRoadRouting(page);
    await upload(page);
    await poll(
      page,
      () => mapBridge(page),
      (s) => s.ready && s.routeFeatureCount > 0 && !s.moving,
    );
    await openEditor(page);
    await drawPoints(page, DRAW_POINTS);
    await waitForSaved(page, "repair");

    await page.reload();

    // The landing offers the session with honest detail.
    const prompt = page.getByTestId("restore-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("time-gap.gpx");
    await expect(page.getByTestId("restore-offer-repair")).toContainText(
      "4 points drawn",
    );
    await expect(page.getByTestId("restore-offer-repair")).toContainText(
      /saved (just now|1 minute ago)/,
    );

    await page.getByTestId("restore-accept-repair").click();

    // The workspace returns through the ordinary pipeline.
    await poll(
      page,
      () => mapBridge(page),
      (s) => s.ready && s.routeFeatureCount > 0 && !s.moving,
    );
    // The committed line renders from the restored record.
    await poll(
      page,
      () => mapBridge(page),
      (s) => s.reconstructionLineCount >= 1,
    );
    // The prompt is gone (the landing was replaced).
    await expect(prompt).toBeHidden();

    // Reopening the editor shows the SAME four points — and they draw.
    await openEditor(page);
    const restored = await poll(
      page,
      () => mapBridge(page),
      (s) => s.drawSession?.vertexCount === 4,
    );
    expect(restored.drawSession!.chainCoordinates.length).toBeGreaterThan(4);

    // Editing continues with fresh ids (the allocator re-armed): one more
    // point lands without disturbing the restored four.
    const box = await canvasBox(page);
    const { x, y } = await project(page, 52.5201, 13.4071);
    await page.mouse.click(box.x + x, box.y + y);
    await poll(
      page,
      () => mapBridge(page),
      (s) => s.drawSession?.vertexCount === 5,
    );
  });
});

test.describe("road-followed lines restore WYSIWYG (zero new requests)", () => {
  test("restore seeds the router cache — the OSRM counter does not move", async ({ page }) => {
    const log: OsrmCallLog = { count: 0, legs: [] };
    await mockOsrmBulge(page, { log });

    await upload(page);
    await poll(page, () => mapBridge(page), (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await drawPoints(page, DRAW_POINTS.slice(0, 3));
    // The road legs resolve through the mock (that is what gets stored).
    const beforeChain = await settledChain(page);
    expect(log.count).toBeGreaterThan(0);
    await waitForSaved(page, "repair");
    const requestsBeforeReload = log.count;

    await page.reload();
    await expect(page.getByTestId("restore-prompt")).toBeVisible();
    await page.getByTestId("restore-accept-repair").click();
    await poll(page, () => mapBridge(page), (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

    // The committed routed line renders (road legs restored, not straight).
    await poll(page, () => mapBridge(page), (s) => s.reconstructionLineCount >= 1);

    // Reopen the editor: the resolution effect probes the SEEDED cache —
    // the same legs come back and NO new OSRM request is issued.
    await openEditor(page);
    const afterChain = await settledChain(page);
    expect(log.count).toBe(requestsBeforeReload);
    expect(afterChain.length).toBe(beforeChain.length);
  });
});

test.describe("explicit discard and clear", () => {
  test("Discard deletes the record and keeps the landing", async ({ page }) => {
    await abortRoadRouting(page);
    await upload(page);
    await poll(page, () => mapBridge(page), (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await drawPoints(page, DRAW_POINTS.slice(0, 2));
    await waitForSaved(page, "repair");

    await page.reload();
    await expect(page.getByTestId("restore-offer-repair")).toBeVisible();
    await page.getByTestId("restore-discard-repair").click();

    await expect(page.getByTestId("restore-prompt")).toBeHidden();
    await expect(page.getByTestId("landing-mode-toggle")).toBeVisible();
    const state = await poll(
      page,
      () => recoveryBridge(page),
      (s) => s !== null && s.offers === 0 && !s.pending,
    );
    expect(state.saved.repair ?? 0).toBe(0);
  });

  test("Clear all saved sessions empties storage entirely", async ({ page }) => {
    await abortRoadRouting(page);
    await upload(page);
    await poll(page, () => mapBridge(page), (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await drawPoints(page, DRAW_POINTS.slice(0, 2));
    await waitForSaved(page, "repair");

    await page.reload();
    await expect(page.getByTestId("restore-prompt")).toBeVisible();
    await page.getByTestId("restore-clear-all").click();

    await expect(page.getByTestId("restore-prompt")).toBeHidden();
    await expect(page.getByTestId("landing-mode-toggle")).toBeVisible();
    const state = await poll(
      page,
      () => recoveryBridge(page),
      (s) => s !== null && s.offers === 0 && !s.pending,
    );
    expect(Object.keys(state.saved)).toHaveLength(0);
  });
});

test.describe("the create section recovers too", () => {
  test("stats → draw → reload → restore → studio with the route", async ({ page }) => {
    await abortRoadRouting(page);
    await page.goto("/");
    await page.getByTestId("landing-mode-create").click();
    const fields: Record<string, string> = {
      "Distance recorded by your watch": "5.23",
      "Pace minutes per unit": "6",
      "Pace seconds per unit": "14",
      "Total time hours": "0",
      "Total time minutes": "32",
      "Total time seconds": "35",
    };
    for (const [label, value] of Object.entries(fields)) {
      await page.getByLabel(label).fill(value);
    }
    await page.getByLabel(/Start/).fill("2026-09-20T05:30");
    await page.getByTestId("begin-drawing-button").click();
    await expect(page.getByTestId("create-section")).toBeVisible();
    // The create map's controller attaches with the studio — wait for the
    // draw session before framing (the world view has no useful scale).
    await poll(
      page,
      () => mapBridge(page),
      (s) => s.drawSession !== null,
    );

    // Frame Berlin and draw a small L (straight legs — routing aborted).
    await page.evaluate(() => {
      window.__gpxMapController!.fitBounds(
        {
          minLat: 52.51,
          maxLat: 52.535,
          minLon: 13.39,
          maxLon: 13.47,
        },
        { maxZoom: 14, action: "e2e-frame" },
      );
    });
    const box = await canvasBox(page);
    for (const point of [
      { lat: 52.52, lon: 13.405 },
      { lat: 52.53, lon: 13.405 },
      { lat: 52.53, lon: 13.455 },
    ]) {
      const { x, y } = await project(page, point.lat, point.lon);
      await page.mouse.click(box.x + x, box.y + y);
    }
    await poll(
      page,
      () => mapBridge(page),
      (s) => s.drawSession?.vertexCount === 3,
    );
    await waitForSaved(page, "create");

    await page.reload();
    await expect(page.getByTestId("restore-offer-create")).toBeVisible();
    await expect(page.getByTestId("restore-offer-create")).toContainText(
      "Activity from stats",
    );
    await page.getByTestId("restore-accept-create").click();

    await expect(page.getByTestId("create-section")).toBeVisible();
    await poll(
      page,
      () => mapBridge(page),
      (s) => s.drawSession?.vertexCount === 3,
    );
    // The pace calculator's stats survived (the record carried them).
    await expect(page.getByTestId("create-section")).toContainText("5.23");
  });
});

test.describe("storage blocked — the app functions identically", () => {
  test("no indexedDB: no prompt, no errors, the whole flow still works", async ({ page }) => {
    await abortRoadRouting(page);
    await page.addInitScript(() => {
      // A browser (or embed) with no IndexedDB at all.
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: undefined,
      });
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto("/");
    await expect(page.getByTestId("landing-mode-toggle")).toBeVisible();
    await expect(page.getByTestId("restore-prompt")).toBeHidden();

    // The full core flow still works.
    await upload(page);
    await poll(page, () => mapBridge(page), (s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
    await openEditor(page);
    await drawPoints(page, DRAW_POINTS.slice(0, 2));

    // Nothing was saved and nothing complained.
    await page.waitForTimeout(1500);
    const state = await recoveryBridge(page);
    expect(state?.available).toBe(false);
    expect(state?.saved.repair ?? 0).toBe(0);
    expect(pageErrors).toEqual([]);
  });
});
