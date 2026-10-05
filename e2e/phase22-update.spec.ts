import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  prodBuildAvailable,
  seedToursForProdOrigin,
  startProdServer,
} from "./prod-server";

/**
 * Phase 22 E2E — the update contract (§EE 22.2): a new version NEVER
 * swaps in silently.
 *
 * The shape of the proof, against the production build:
 *
 *   1. Load the app; the service worker installs and takes control.
 *   2. Simulate in-progress work (a window flag an edit session would
 *      own) and deploy a "new version": the served sw.js gets a new
 *      build id (exactly what scripts/build-pwa.mjs does on every
 *      real build — the byte change is the browser's only update
 *      signal).
 *   3. Reload. The registrar re-checks sw.js (updateViaCache: none),
 *      the new worker precaches and WAITS, and the page asks with the
 *      update toast — while the in-progress flag proves no silent
 *      reload happened.
 *   4. Click Reload: SKIP_WAITING → activation → the app reloads
 *      itself exactly once, into the new version.
 *
 * The served sw.js is restored afterwards; the repo's public/sw.js is
 * never touched (the versioned copy is a generated artifact).
 */

const PORT = 3101;
const SERVED_SW = join(
  process.cwd(),
  ".next",
  "standalone",
  "public",
  "sw.js",
);

/** Swap the served build id — a deploy in miniature. */
function deployNewBuildId(id: string): string {
  const original = readFileSync(SERVED_SW, "utf8");
  const updated = original.replace(
    /self\.BUILD_ID = ".*";/,
    `self.BUILD_ID = "${id}";`,
  );
  if (updated === original) {
    throw new Error("served sw.js carries no BUILD_ID — run `npm run build`");
  }
  writeFileSync(SERVED_SW, updated, "utf8");
  return original;
}

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

test.describe("the update contract (Phase 22)", () => {
  test.setTimeout(120_000);

  test("a new version asks before swapping — never a silent reload mid-edit", async ({
    context,
    page,
  }) => {
    test.skip(!prodBuildAvailable(), "requires `npm run build` first");

    await context.addInitScript(seedToursForProdOrigin());
    const server = await startProdServer(PORT);
    let originalSw: string | null = null;

    try {
      // -- 1. The worker owns the page --------------------------------
      await page.goto(`${server.origin}/`);
      await waitForController(page);

      // -- 2. A deployed update -----------------------------------------
      originalSw = deployNewBuildId("e2e-deployed-update-0001");

      // -- 3. Reload: the update is FOUND, the toast ASKS -------------
      await page.reload();
      await waitForController(page); // the OLD worker still controls

      // The fresh document is the "editing session": arm the flag that
      // a silent reload would destroy.
      await page.evaluate(() => {
        (window as never as Record<string, string>).__editInProgress = "42 km ride, mid-repair";
      });

      // The toast itself (the live <li>; Radix's visually-hidden
      // announcer mirrors the text, so the toast is located by its
      // real element — it carries the button).
      const toast = page
        .locator('li[data-state="open"]')
        .filter({ hasText: "Update available" });
      await expect(toast).toBeVisible({ timeout: 45_000 });
      await expect(toast).toContainText(
        "nothing reloads behind your back",
      );

      // The user finishes their edit first — the flag must survive the
      // whole time the toast is patiently waiting for consent.
      await page.waitForTimeout(2_000);
      expect(
        await page.evaluate(
          () => (window as never as Record<string, string | undefined>).__editInProgress,
        ),
      ).toBe("42 km ride, mid-repair");

      // -- 4. The user consents: reload, once, into the new version ----
      const reloaded = page.waitForEvent("load", { timeout: 30_000 });
      await toast.getByRole("button", { name: "Reload" }).click();
      await reloaded;
      await expect(
        page.getByRole("heading", { level: 1, name: "GPX Repair Studio" }),
      ).toBeVisible({ timeout: 30_000 });

      // The reload was the armed one: the flag is gone (fresh document)…
      expect(
        await page.evaluate(
          () => (window as never as Record<string, string | undefined>).__editInProgress,
        ),
      ).toBeUndefined();
      // …and the NEW worker controls the page without asking again.
      await waitForController(page);
      await page.waitForTimeout(1_500);
      await expect(
        page.locator('li[data-state="open"]', {
          hasText: "Update available",
        }),
      ).toHaveCount(0);
    } finally {
      if (originalSw !== null) {
        writeFileSync(SERVED_SW, originalSw, "utf8");
      }
      await server.stop();
    }
  });
});
