/**
 * Task 53 (Phase 10 — session recovery) — live QA: screenshots + a
 * console-error sweep of the recovery flow:
 *
 *   1. the workspace with drawn work (what a reload would lose);
 *   2. the landing's RESTORE PROMPT after the reload — the phase's
 *      user-facing surface (rows, saved-ago, the privacy disclosure,
 *      the clear-all control);
 *   3. the workspace after RESTORE — same file, same line, editor
 *      reopened with the same vertices.
 *
 * Run against the dev server on :3000. Screenshots land in download/
 * for the worklog + VLM critique.
 */
import { chromium } from "@playwright/test";
import { join } from "node:path";

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const OUT = "download";

const errors = [];
const pageErrors = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));

async function settle(predicate, timeoutMs = 15_000) {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(() =>
      window.__gpxMapController
        ? window.__gpxMapController.getTestState()
        : null,
    );
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`predicate not met; last: ${JSON.stringify(state)}`);
    }
    await page.waitForTimeout(150);
  }
}

async function recoverySettle(predicate, timeoutMs = 15_000) {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(() =>
      window.__gpxrSessionRecovery
        ? window.__gpxrSessionRecovery.getTestState()
        : null,
    );
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`recovery predicate not met; last: ${JSON.stringify(state)}`);
    }
    await page.waitForTimeout(150);
  }
}

// Deterministic geometry without aborting requests (aborted requests
// surface as console errors — the sweep below must stay clean): the
// editor switches to Straight legs + snap off, the Task-52 QA pattern.

// --- 1. draw work worth recovering ------------------------------------
await page.goto("http://localhost:3000/");
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) {
  await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(join(FIXTURES, "time-gap.gpx"));
await settle((s) => s.ready && s.routeFeatureCount > 0 && !s.moving);

await page.getByTestId("open-editor-button").first().click();
await settle((s) => s.drawSession !== null);
// Straight legs + snap off — deterministic geometry, zero network.
await page.getByTestId("road-follow-off").click();
await page.getByTestId("snap-toggle").click();
await settle((s) => s.drawSession !== null);

const box = await page
  .getByTestId("map-canvas")
  .scrollIntoViewIfNeeded()
  .then(() => page.locator(".maplibregl-canvas").boundingBox());
const points = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
  { lat: 52.5199, lon: 13.4062 },
];
for (const p of points) {
  const { x, y } = await page.evaluate(
    (args) => window.__gpxMapController.projectLatLon(args[0], args[1]),
    [p.lat, p.lon],
  );
  await page.mouse.click(box.x + x, box.y + y);
}
await settle((s) => s.drawSession?.vertexCount === points.length);

// Wait for the debounced autosave to land and quiesce.
await recoverySettle((s) => (s.saved.repair ?? 0) > 0 && !s.pending);
await page.waitForTimeout(1400);
await recoverySettle((s) => (s.saved.repair ?? 0) > 0 && !s.pending);
console.log("autosave landed");

await page.screenshot({ path: join(OUT, "task53-1-workspace-drawn.png") });

// --- 2. the reload → the restore prompt --------------------------------
await page.reload();
const prompt = page.getByTestId("restore-prompt");
await prompt.waitFor({ state: "visible" });
await page.waitForTimeout(400);
const promptText = await prompt.innerText();
console.log("PROMPT TEXT:", JSON.stringify(promptText));
await page.screenshot({ path: join(OUT, "task53-2-restore-prompt.png") });

// --- 3. restore → the same workspace ------------------------------------
await page.getByTestId("restore-accept-repair").click();
await settle((s) => s.ready && s.routeFeatureCount > 0 && !s.moving);
await settle((s) => s.reconstructionLineCount >= 1);
await page.getByTestId("open-editor-button").first().click();
const restored = await settle((s) => s.drawSession?.vertexCount === points.length);
console.log("restored vertices:", restored.drawSession.vertexCount);
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "task53-3-restored.png") });

console.log("console errors:", errors.length, errors);
console.log("page errors:", pageErrors.length, pageErrors);
await browser.close();
if (errors.length || pageErrors.length) process.exit(1);
console.log("TASK53 LIVE QA DONE");
