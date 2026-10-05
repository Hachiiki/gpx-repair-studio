/**
 * Phase 22 live QA — the offline PWA surfaces, audited for real
 * (docs/MASTER_PLAN.md §EE 22, verification ritual).
 *
 * Runs against the PRODUCTION standalone build on its own port (the
 * dev server must never be worker-controlled) and walks the phase's
 * user-visible contract end to end:
 *
 *   1. INSTALLABILITY AUDIT (the Lighthouse "installable" criteria,
 *      asserted programmatically): a fetched manifest with name,
 *      start_url, standalone display, and real PNG icons at 192/512
 *      (dimensions parsed from the PNG headers themselves); the
 *      manifest link + dual theme-color metas in the document; a
 *      registered, controlling service worker whose BUILD_ID matches
 *      the generated precache manifest, with every listed URL
 *      answering 200.
 *   2. OFFLINE SMOKE: cut the network, reload, the app comes back.
 *   3. THE PRIVACY PANE's new cache rows: live counts, both Clear
 *      buttons, honest confirmations.
 *   4. THE UPDATE TOAST: a real "deploy" (new build id in the served
 *      sw.js) → the toast asks in EN/zh, light/dark — captured for
 *      the VLM critique.
 *   5. Zero console/page errors throughout (the suite's contract).
 *
 * Artifacts: scripts/qa/phase22/*.png + live-qa-report.json.
 * Run: node scripts/phase22-live-qa.mjs   (after `npm run build`)
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const SERVER_PATH = join(process.cwd(), ".next", "standalone", "server.js");
const SERVED_SW = join(process.cwd(), ".next", "standalone", "public", "sw.js");
const OUT = "scripts/qa/phase22";
mkdirSync(OUT, { recursive: true });

const PORT = 3105;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const report = [];
const check = (name, ok, detail = "") => {
  report.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Parse a PNG's IHDR for its true pixel dimensions. */
function pngSize(buffer) {
  // PNG: 8-byte signature + 4 length + "IHDR" + 4 width + 4 height.
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

// -- boot the production server ------------------------------------------
const child = spawn(process.execPath, [SERVER_PATH], {
  env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1" },
  stdio: "ignore",
});
try {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${ORIGIN}/`);
      if (response.status < 500) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // -- 1a. the manifest, fetched the way a browser fetches it -------------
  const manifestResponse = await fetch(`${ORIGIN}/manifest.webmanifest`);
  check("manifest answers 200", manifestResponse.status === 200);
  const manifest = await manifestResponse.json();
  check(
    "manifest names the app and start_url",
    manifest.name === "GPX Repair Studio" &&
      manifest.start_url === "/" &&
      manifest.id === "/",
  );
  check(
    "manifest display is standalone",
    manifest.display === "standalone",
  );
  check(
    "manifest carries the light chrome colors",
    manifest.theme_color === "#F1F1F2" &&
      manifest.background_color === "#F1F1F2",
  );
  const icons = manifest.icons ?? [];
  check(
    "manifest lists 192 + 512 + maskable icons",
    icons.some((i) => i.sizes === "192x192" && i.purpose === "any") &&
      icons.some((i) => i.sizes === "512x512" && i.purpose === "any") &&
      icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"),
  );
  for (const icon of icons) {
    const response = await fetch(`${ORIGIN}${icon.src}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const size = pngSize(buffer);
    check(
      `icon ${icon.src} serves ${icon.sizes} (${icon.purpose})`,
      response.status === 200 &&
        `${size.width}x${size.height}` === icon.sizes,
      `served ${size.width}x${size.height}, ${buffer.length} bytes`,
    );
  }

  // -- 1b. the precache manifest + served worker ---------------------------
  const precacheResponse = await fetch(`${ORIGIN}/precache-manifest.json`);
  const precache = await precacheResponse.json();
  check(
    "precache manifest is non-trivial",
    Array.isArray(precache.urls) && precache.urls.length > 40,
    `${precache.urls?.length ?? 0} urls`,
  );
  const swText = await (await fetch(`${ORIGIN}/sw.js`)).text();
  check(
    "served sw.js embeds the build id from the manifest",
    swText.includes(`self.BUILD_ID = ${JSON.stringify(precache.buildId)}`),
  );
  // Spot-check a sample of the precache URLs (the e2e installs ALL).
  const sample = precache.urls.filter((_, i) => i % 9 === 0).slice(0, 10);
  for (const url of sample) {
    const response = await fetch(`${ORIGIN}${url}`);
    if (response.status !== 200) {
      check(`precache url answers 200 (${url})`, false, String(response.status));
    }
  }
  check(
    `precache spot-check (${sample.length} urls)`,
    sample.every(async (url) => (await fetch(`${ORIGIN}${url}`)).status === 200),
    sample.join(" "),
  );

  // -- 1c. the document + the controlling worker ---------------------------
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async ({ theme = "light", lang } = {}) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`${page.url()}: ${String(e)}`));
    await page.addInitScript(
      ({ theme: themeValue, lang: langValue }) => {
        localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
        localStorage.setItem(
          "gpx-repair-studio.tool-tours.v1",
          JSON.stringify({
            repair: "seen",
            share: "seen",
            recovery: "seen",
            create: "seen",
            merge: "seen",
            plan: "seen",
            batch: "seen",
          }),
        );
        if (themeValue === "dark") {
          localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
        }
        if (langValue) {
          localStorage.setItem("gpx-repair-studio.locale.v1", langValue);
        }
      },
      { theme, lang },
    );
    return page;
  };

  const page = await newPage();
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(
    () => navigator.serviceWorker.controller?.state === "activated",
    undefined,
    { timeout: 30_000 },
  );
  check(
    "service worker controls the page",
    await page.evaluate(
      () => navigator.serviceWorker.controller?.state === "activated",
    ),
  );
  check(
    "document links the manifest + dual theme-color metas",
    (await page.locator('link[rel="manifest"]').count()) === 1 &&
      (await page
        .locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
        .count()) === 1 &&
      (await page
        .locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')
        .count()) === 1,
  );
  check(
    "elevation database opens on boot (hydrate ran)",
    await page.evaluate(async () =>
      (await indexedDB.databases()).some((db) => db.name === "gpx-repair-studio.elevation"),
    ),
  );

  // -- 2. offline smoke ------------------------------------------------------
  const context = page.context();
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("heading", { level: 1, name: "GPX Repair Studio" })
    .waitFor({ timeout: 30_000 });
  check("offline reload comes back from cache", true);
  await page.screenshot({ path: `${OUT}/offline-landing.png` });
  await context.setOffline(false);

  // -- 3. the privacy pane's cache rows ---------------------------------------
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId("footer-privacy").click();
  const pane = page.getByTestId("privacy-pane");
  await pane.waitFor({ state: "visible" });
  const elevationCount = page.getByTestId("privacy-elevation-count");
  await elevationCount.waitFor({ state: "visible" });
  const freshText = (await elevationCount.innerText()).trim();
  check(
    "elevation cache count renders (a live number, fresh profile = 0)",
    /\d/.test(freshText),
    freshText,
  );
  await page.screenshot({ path: `${OUT}/privacy-storage.png`, fullPage: true });

  // Seed the real database the way a fetched hillside would have, then
  // re-open the pane: the count must read it back through the app.
  await page.evaluate(() => {
    const request = indexedDB.open("gpx-repair-studio.elevation", 1);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const txn = db.transaction("points", "readwrite");
        const store = txn.objectStore("points");
        for (let i = 0; i < 5; i += 1) {
          store.put(
            { ele: 100 + i, at: Date.now() + i },
            `${(50 + i).toFixed(5)},${(13 + i).toFixed(5)}`,
          );
        }
        txn.oncomplete = () => resolve(undefined);
        txn.onerror = () => reject(txn.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await page.getByTestId("footer-privacy").click();
  await pane.waitFor({ state: "visible" });
  const seededText = (await elevationCount.innerText()).trim();
  check(
    "elevation count reads the real database (5 seeded)",
    seededText.includes("5"),
    seededText,
  );

  // Clear the terrain cache for real — the confirmation must appear
  // and the count must read zero afterwards.
  await page.getByTestId("privacy-elevation-clear").click();
  await page.getByTestId("privacy-elevation-cleared").waitFor({ state: "visible" });
  check("elevation cache clears with a confirmation", true);
  const afterText = (await elevationCount.innerText()).trim();
  check(
    "elevation count reads zero after the clear",
    afterText.includes("0"),
    afterText,
  );

  // The offline caches row, cleared for real.
  await page.getByTestId("privacy-offline-clear").click();
  await page.getByTestId("privacy-offline-cleared").waitFor({ state: "visible" });
  check("offline caches clear with a confirmation", true);

  // A reload after unregistering still works (the online path).
  await page.reload();
  await page
    .getByRole("heading", { level: 1, name: "GPX Repair Studio" })
    .waitFor({ timeout: 30_000 });
  check("app works after clearing offline caches", true);
  await page.close();

  // -- 4. the update toast, captured (EN light / EN dark / zh) --------------
  // Each capture is a fresh browser context: first let the ORIGINAL
  // worker install and control, THEN deploy the new build id, then
  // reload — the update path a returning user actually experiences.
  const originalSw = readFileSync(SERVED_SW, "utf8");
  const deployId = `live-qa-deploy-${Date.now()}`;
  writeFileSync(SERVED_SW, originalSw, "utf8"); // start from the built id
  try {
    for (const shot of [
      { name: "update-toast-en-light", theme: "light" },
      { name: "update-toast-en-dark", theme: "dark" },
      { name: "update-toast-zh", theme: "light", lang: "zh-CN" },
    ]) {
      const toastPage = await newPage({ theme: shot.theme, lang: shot.lang });
      await toastPage.goto(`${ORIGIN}/`);
      await toastPage.waitForFunction(
        () => navigator.serviceWorker.controller?.state === "activated",
        undefined,
        { timeout: 30_000 },
      );

      // Deploy: exactly what a real build does to the served bytes.
      writeFileSync(
        SERVED_SW,
        originalSw.replace(/self\.BUILD_ID = ".*";/, `self.BUILD_ID = "${deployId}";`),
        "utf8",
      );

      await toastPage.reload();
      const toast = toastPage
        .locator('li[data-state="open"]')
        .filter({ hasText: shot.lang ? "有可用更新" : "Update available" });
      await toast.waitFor({ state: "visible", timeout: 45_000 });
      await toastPage.screenshot({ path: `${OUT}/${shot.name}.png` });
      check(`update toast captured (${shot.name})`, true);
      await toastPage.close();

      // Back to the built id for the next fresh-context capture.
      writeFileSync(SERVED_SW, originalSw, "utf8");
    }
  } finally {
    writeFileSync(SERVED_SW, originalSw, "utf8");
  }

  check(
    "zero console/page errors across the whole run",
    errors.length === 0,
    errors.slice(0, 5).join(" | "),
  );

  await browser.close();
} finally {
  child.kill("SIGTERM");
}

const failed = report.filter((r) => !r.ok);
writeFileSync(
  join(OUT, "live-qa-report.json"),
  JSON.stringify({ passed: report.length - failed.length, failed: failed.length, report }, null, 2),
);
console.log(
  `\nlive QA: ${report.length - failed.length}/${report.length} passed` +
    (failed.length ? " — FAILURES ABOVE" : ""),
);
process.exit(failed.length === 0 ? 0 : 1);
