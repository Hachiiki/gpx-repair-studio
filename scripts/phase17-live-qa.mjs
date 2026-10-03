/**
 * Phase 17 (road snapping, opt-in) — live QA: the consent gate, the
 * snap engine, and the provider settings, in BOTH themes + mobile,
 * against the dev server on :3000.
 *
 *   1. sample load → editor (default Roads) shows the enable notice,
 *      NOT the road-follow drag hint — light + dark screenshots;
 *   2. the consent dialog (grant mode): the plain notice + hosts;
 *      decline → the notice stays, nothing routed;
 *   3. grant → the footer chip states the on state with the hosts;
 *   4. the snap flow end-to-end on a straight line (typed points —
 *      the keyboard-only discipline): Snap to road → the preview box
 *      with the honest numbers + the road preview screenshot → Apply
 *      → the chip flips to Roads → ONE undo returns the drawing and
 *      the straight style;
 *   5. offline: the snap control disables with the explanation
 *      (straight/curve lines keep working);
 *   6. the privacy pane's routing settings: the URL control, the
 *      honest validation error, the saved state;
 *   7. mobile width (390) — the consent notice + preview box stack
 *      readably;
 *   8. zero console/page errors throughout.
 *
 * OSRM is mocked at the network layer (the e2e helper's contract) so
 * the QA is deterministic and depends on no live service; everything
 * else is the real app.
 *
 * Screenshots land in download/phase17-* for the VLM critique.
 */
import { chromium } from "@playwright/test";

const OUT = "download";
const errors = [];
const pageErrors = [];
const checks = [];

function ok(name, condition) {
  checks.push([name, Boolean(condition)]);
  console.log(`${condition ? "PASS" : "FAIL"} — ${name}`);
}

const browser = await chromium.launch();

async function themedContext(viewport, theme) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ({ theme }) => {
      try {
        localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
        localStorage.setItem("gpx-repair-studio.theme.v1", theme);
      } catch {
        /* storage blocked — tolerated */
      }
    },
    { theme },
  );
  return context;
}

async function capture(page, name, { fullPage = false } = {}) {
  await page.waitForTimeout(450); // the Phase 11 settle lesson
  await page.screenshot({ path: `${OUT}/phase17-${name}.png`, fullPage });
}

function watchConsole(page) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
}

/** The whole-polyline OSRM mock (the e2e helper's contract). */
async function mockOsrm(page, log) {
  await page.route(/router\.project-osrm\.org/, async (route) => {
    log.count += 1;
    const url = new URL(route.request().url());
    const pairs = (url.pathname.split("/").pop() ?? "")
      .split(";")
      .map((pair) => pair.split(",").map(Number))
      .map(([lon, lat]) => ({ lat, lon }));
    const coordinates = [[pairs[0].lon, pairs[0].lat]];
    for (let i = 1; i < pairs.length; i += 1) {
      coordinates.push([
        (pairs[i - 1].lon + pairs[i].lon) / 2,
        (pairs[i - 1].lat + pairs[i].lat) / 2 + 0.0004,
      ]);
      coordinates.push([pairs[i].lon, pairs[i].lat]);
    }
    await route.fulfill({
      json: {
        code: "Ok",
        routes: [{ distance: 1800, geometry: { coordinates } }],
      },
    });
  });
}

async function loadSample(page) {
  await page.goto("http://localhost:3000/");
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) {
    await card.click();
  }
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles("download/demo-qc-run-with-gaps.gpx");
  await page.getByTestId("open-editor-button").first().waitFor({
    state: "visible",
  });
}

/** Open the first gap's editor and add two typed points (no pointer). */
async function openEditorWithTwoTypedPoints(page) {
  await page.getByTestId("open-editor-button").first().click();
  const panel = page.getByTestId("draw-editor-panel");
  await panel.waitFor({ state: "visible" });
  // Straight lines: the snap target is a straight-drawn line.
  await page.getByTestId("road-follow-off").click();
  await page.getByTestId("vertex-add-form-lat").fill("14.6360");
  await page.getByTestId("vertex-add-form-lon").fill("121.0580");
  await page.getByTestId("vertex-add-form-button").click();
  await page.getByTestId("vertex-add-form-lat").fill("14.6372");
  await page.getByTestId("vertex-add-form-lon").fill("121.0595");
  await page.getByTestId("vertex-add-form-button").click();
  await page.getByTestId("vertex-count").waitFor();
  return panel;
}

for (const theme of ["light", "dark"]) {
  const context = await themedContext({ width: 1280, height: 900 }, theme);
  const page = await context.newPage();
  watchConsole(page);
  const log = { count: 0 };
  await mockOsrm(page, log);

  // 1 — the enable notice (default Roads, no consent).
  await loadSample(page);
  await page.getByTestId("open-editor-button").first().click();
  const panel = page.getByTestId("draw-editor-panel");
  await panel.waitFor({ state: "visible" });
  ok(
    `[${theme}] the enable notice shows before any consent`,
    await page.getByTestId("road-consent-notice").isVisible(),
  );
  ok(
    `[${theme}] nothing routed before consent`,
    log.count === 0,
  );
  await capture(page, `consent-notice-${theme}`);

  // 2 — the dialog: plain notice, then decline.
  await page.getByTestId("road-consent-enable").click();
  const dialog = page.getByTestId("router-consent-dialog");
  await dialog.waitFor({ state: "visible" });
  ok(
    `[${theme}] the dialog states the third-party router notice`,
    (await dialog.getByTestId("router-consent-notice").innerText()).includes(
      "third-party router",
    ),
  );
  await capture(page, `consent-dialog-${theme}`);
  await page.getByTestId("router-consent-decline").click();
  await dialog.waitFor({ state: "hidden" });
  ok(
    `[${theme}] decline keeps the notice honest`,
    await page.getByTestId("road-consent-notice").isVisible(),
  );
  ok(`[${theme}] decline routed nothing`, log.count === 0);

  // 3 — grant: the footer chip.
  await page.getByTestId("road-consent-enable").click();
  await dialog.waitFor({ state: "visible" });
  await page.getByTestId("router-consent-grant").click();
  await dialog.waitFor({ state: "hidden" });
  const chip = page.getByTestId("footer-router-consent");
  await chip.waitFor({ state: "visible" });
  ok(
    `[${theme}] the footer chip names the hosts`,
    (await chip.innerText()).includes("router.project-osrm.org"),
  );
  await capture(page, `footer-chip-${theme}`);

  // 4 — the snap flow on a fresh straight line.
  await page.getByTestId("close-editor-button").click();
  await openEditorWithTwoTypedPoints(page);
  ok(
    `[${theme}] two typed points on a straight line`,
    (await page.getByTestId("vertex-count").innerText()).startsWith("2"),
  );
  const requestsBeforeSnap = log.count;
  await page.getByTestId("snap-to-road-button").click();
  const preview = page.getByTestId("snap-preview-box");
  await preview.waitFor({ state: "visible", timeout: 10_000 });
  ok(
    `[${theme}] the snap issued exactly ONE whole-polyline request`,
    log.count === requestsBeforeSnap + 1,
  );
  ok(
    `[${theme}] the preview box carries the honest numbers`,
    (await preview.innerText()).includes("Your line") &&
      (await preview.innerText()).includes("On the road"),
  );
  await capture(page, `snap-preview-${theme}`);
  await page.getByTestId("snap-apply-button").click();
  await preview.waitFor({ state: "hidden" });
  ok(
    `[${theme}] apply flips the chip to Roads`,
    (await page
      .getByTestId("road-follow-car")
      .getAttribute("aria-pressed")) === "true",
  );
  const verticesAfter = await page.getByTestId("vertex-count").innerText();
  ok(
    `[${theme}] the vertices became road waypoints`,
    Number.parseInt(verticesAfter, 10) > 2,
  );
  await capture(page, `snap-applied-${theme}`);
  await page.getByTestId("undo-button").click();
  await page
    .getByTestId("vertex-count")
    .filter({ hasText: /^2 \/ 128/ })
    .waitFor({ timeout: 5_000 });
  ok(
    `[${theme}] ONE undo returns the straight drawing and style`,
    (await page
      .getByTestId("road-follow-off")
      .getAttribute("aria-pressed")) === "true",
  );
  ok(
    `[${theme}] no re-requests after the undo`,
    log.count === requestsBeforeSnap + 1,
  );

  // 5 — offline: the snap control disables with the explanation.
  await page.context().setOffline(true);
  await expectDisabled(page, "snap-to-road-button");
  ok(
    `[${theme}] offline: the explanation names the fallback`,
    (await page.getByTestId("snap-status").innerText()).includes(
      "straight and curve lines keep working",
    ),
  );
  await capture(page, `snap-offline-${theme}`);
  await page.context().setOffline(false);

  // 6 — the privacy pane's routing settings.
  await page.getByTestId("close-editor-button").click();
  await page.getByTestId("footer-privacy").click();
  const privacy = page.getByTestId("privacy-pane");
  await privacy.waitFor({ state: "visible" });
  await page.getByTestId("router-url-input").fill("not-a-url");
  await page.getByTestId("router-url-apply").click();
  ok(
    `[${theme}] the invalid URL gets the plain error`,
    (await page.getByTestId("router-url-error").innerText()).includes(
      "https://",
    ),
  );
  await capture(page, `router-settings-${theme}`);
  await page.getByTestId("router-url-input").fill("https://osrm.example.com");
  await page.getByTestId("router-url-apply").click();
  ok(
    `[${theme}] a valid URL saves and the chip follows`,
    (await chip.innerText()).includes("osrm.example.com"),
  );
  await page.getByTestId("router-url-reset").click();

  await context.close();
}

// 7 — mobile width.
{
  const context = await themedContext({ width: 390, height: 844 }, "light");
  const page = await context.newPage();
  watchConsole(page);
  const log = { count: 0 };
  await mockOsrm(page, log);

  await loadSample(page);
  await page.getByTestId("open-editor-button").first().click();
  await page.getByTestId("draw-editor-panel").waitFor({ state: "visible" });
  await page.getByTestId("road-consent-enable").click();
  await page.getByTestId("router-consent-grant").click();
  await page.getByTestId("road-follow-off").click();
  await page.getByTestId("vertex-add-form-lat").fill("14.6360");
  await page.getByTestId("vertex-add-form-lon").fill("121.0580");
  await page.getByTestId("vertex-add-form-button").click();
  await page.getByTestId("vertex-add-form-lat").fill("14.6372");
  await page.getByTestId("vertex-add-form-lon").fill("121.0595");
  await page.getByTestId("vertex-add-form-button").click();
  await page.getByTestId("snap-to-road-button").click();
  const preview = page.getByTestId("snap-preview-box");
  await preview.waitFor({ state: "visible", timeout: 10_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(`[mobile] no horizontal overflow with the preview box`, overflow <= 1);
  await capture(page, "snap-preview-mobile", { fullPage: true });
  await context.close();
}

// 8 — the tally.
console.log("\n— tally —");
for (const [name, passed] of checks) {
  if (!passed) console.log(`FAILED: ${name}`);
}
const failed = checks.filter(([, passed]) => !passed).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
console.log(`console errors: ${errors.length}, page errors: ${pageErrors.length}`);
if (errors.length > 0) console.log(errors.slice(0, 5));
if (pageErrors.length > 0) console.log(pageErrors.slice(0, 5));
await browser.close();
process.exit(failed === 0 && errors.length === 0 && pageErrors.length === 0 ? 0 : 1);

async function expectDisabled(page, testId) {
  const disabled = await page.getByTestId(testId).isDisabled();
  ok(`[${page.context().browser()?.browserType().name()}] ${testId} disabled offline`, disabled);
}
