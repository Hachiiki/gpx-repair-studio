import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  prodBuildAvailable,
  seedToursForProdOrigin,
  startProdServer,
  type ProdServer,
} from "./prod-server";

/**
 * Phase 22 E2E — the offline proof (§EE 22.4), the phase's centerpiece:
 * block the network, load the app from the service worker's cache, and
 * complete a repair + export with ZERO requests that leave the browser.
 *
 * The shape of the proof:
 *
 *   1. ONLINE warm-up: load the production build, wait for the service
 *      worker to control the page (install + precache + activate), then
 *      warm the repair journey once — upload the time-gap fixture, let
 *      the map fit and its vector tiles load. Everything the app needs
 *      is now in the worker's caches.
 *   2. OFFLINE: cut the network (context.setOffline), reload — the app
 *      must come back from cache — then upload the SAME file (the map
 *      fits the same view, so the same tiles), repair the gap by TYPING
 *      coordinates (the Phase 16 keyboard-only path — the map test
 *      bridge is production-gated by design, and numeric entry needs
 *      no pointer and no routing service), and download the export.
 *   3. THE COUNT: from the moment the network is cut, not one
 *      page-attributed request may fail at the network layer and no
 *      console error may appear. Requests the worker itself makes (its
 *      internal network-first probes) are excluded by attribution —
 *      they ARE the offline machinery.
 *
 * Requires `npm run build` (the spec skips with instructions if the
 * standalone output is missing). Runs on its own port; the dev server
 * on :3000 is never touched, and the worker never controls it.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const PORT = 3100;

/** Wait until the service worker is registered AND controlling. */
async function waitForController(page: Page) {
  await page.waitForFunction(
    () =>
      navigator.serviceWorker.controller !== null &&
      navigator.serviceWorker.controller.state === "activated",
    undefined,
    { timeout: 30_000 },
  );
}

/** Wait for the tile cache to settle (stable, non-zero size). */
async function waitForTilesToSettle(page: Page) {
  await page.waitForFunction(
    async () => {
      const read = async () => {
        const cache = await caches.open("gpx-repair-studio.tiles.v1");
        return (await cache.keys()).length;
      };
      const first = await read();
      // A generous quiet window: MapLibre queues tile bursts, and a
      // premature cut leaves cells uncached that the offline phase
      // would then need.
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const second = await read();
      return second > 0 && first === second;
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** Upload a file into the repair tool (the tool page must be open). */
async function upload(page: Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles(path);
}

/** Enter the repair tool from the landing cards. */
async function enterRepairTool(page: Page) {
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) {
    await card.click();
  }
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}

test.describe("offline PWA (Phase 22)", () => {
  test.setTimeout(180_000);

  test("blocks the network, loads from cache, repairs + exports with zero requests", async ({
    context,
    page,
  }) => {
    test.skip(!prodBuildAvailable(), "requires `npm run build` first");

    await context.addInitScript(seedToursForProdOrigin());
    const server: ProdServer = await startProdServer(PORT);

    /** Page-attributed network failures (the worker's own probes excluded). */
    const networkFailures: string[] = [];
    const consoleErrors: string[] = [];

    try {
      // -- 1. ONLINE: the app + its worker -------------------------------
      await page.goto(`${server.origin}/`);
      await waitForController(page);
      await expect(
        page.getByRole("heading", { level: 1, name: "GPX Repair Studio" }),
      ).toBeVisible();

      // Warm the whole repair journey once (tiles included).
      await enterRepairTool(page);
      await upload(page, join(FIXTURES, "time-gap.gpx"));
      await expect(page.getByTestId("gap-list")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("gap-list")).toContainText("Time gap");
      await waitForTilesToSettle(page);

      // -- 2. OFFLINE: cut the network, count from here ------------------
      context.on("requestfailed", (request) => {
        // The worker's own fetches ARE the offline machinery (its
        // network-first probe for the document, its tile attempts for
        // unwarmed cells); only page-attributed failures count.
        if (request.serviceWorker() === null) {
          networkFailures.push(`${request.method()} ${request.url()}`);
        }
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await context.setOffline(true);
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);

      // The app itself reloads from the worker's precache.
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "GPX Repair Studio" }),
      ).toBeVisible({ timeout: 30_000 });

      // -- 3. The full repair journey, offline ----------------------------
      await enterRepairTool(page);
      await upload(page, join(FIXTURES, "time-gap.gpx"));
      await expect(page.getByTestId("gap-list")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("gap-list")).toContainText("Time gap");

      // Repair the gap by TYPING the two vertices (no pointer, no
      // router): the Phase 16 keyboard-only milestone is exactly the
      // offline story. Road-follow goes off first — a routing service
      // must never be asked for a straight-line repair.
      await page.getByTestId("open-editor-button").first().click();
      await expect(page.getByTestId("draw-editor-panel")).toBeVisible();
      const snap = page.getByTestId("snap-toggle");
      if (await snap.isChecked()) {
        await snap.click();
      }

      const addLat = page.getByTestId("vertex-add-form-lat");
      const addLon = page.getByTestId("vertex-add-form-lon");
      await addLat.fill("52.5199");
      await addLon.fill("13.4044");
      await addLon.press("Enter");
      await expect(page.getByTestId("vertex-row")).toHaveCount(1);
      await addLat.fill("52.5202");
      await addLon.fill("13.4049");
      await addLon.press("Enter");
      await expect(page.getByTestId("vertex-row")).toHaveCount(2);

      await page.getByTestId("done-editing-button").click();
      await expect(page.getByTestId("draw-editor-panel")).toBeHidden();

      // The export card reflects the committed repair.
      const card = page.getByTestId("export-card");
      await expect(card).toContainText("Repairs to include");

      // Review & download — the bytes are the contract (Phase 7's rule).
      await page.getByTestId("open-export-button").click();
      const dialog = page.getByTestId("export-dialog");
      await expect(dialog).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("export-download-button").click(),
      ]);
      expect(download.suggestedFilename()).toBe("time-gap.repaired.gpx");
      const path = await download.path();
      if (path === null) throw new Error("download produced no file");
      const xml = readFileSync(path, "utf8");
      expect(xml).toContain('creator="GPX Repair Studio"');
      expect(xml).toMatch(/<gpxr:reconstructed/g);
      // The typed geometry, labeled as reconstructed.
      expect(xml).toContain("52.5199");
      expect(xml).toContain("13.4049");

      // -- 4. THE COUNT ----------------------------------------------------
      expect(networkFailures, "no page request may fail at the network layer").toEqual([]);
      // Offline is a supported mode, not a degraded one. One signature
      // is EXCLUDED by design: a basemap tile the user never viewed,
      // answered by the worker with an honest 503 so MapLibre marks it
      // errored and RETRIES it when the network returns (a 200-empty
      // tile would cache as permanently blank terrain — a lie). The
      // blank patch is the documented fallback; everything else must
      // be silent.
      const realConsoleErrors = consoleErrors.filter(
        (text) => !text.includes("503 (Offline)"),
      );
      expect(realConsoleErrors, "no console errors while offline").toEqual([]);
    } finally {
      await context.setOffline(false);
      await server.stop();
    }
  });
});
