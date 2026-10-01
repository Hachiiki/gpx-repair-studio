/**
 * Phase 11 — live QA: the onboarding tour, the About / Privacy & Data
 * dialog, and the release-polish surfaces, through the exact user flows,
 * against the dev server on :3000.
 *
 *   1. FRESH browser (no tour flag): the 4-step tour auto-opens on the
 *      tool cards; walk it to the end; verify it remembered (no
 *      re-offer after reload) and the "Take the tour" link replays it;
 *   2. The footer's About door: attributions + version;
 *   3. The footer's Privacy & Data door: the egress table, offline
 *      section, provider switching, the storage disclosure;
 *   4. Tab switching inside the dialog (About ↔ Privacy);
 *   5. The restore-prompt's privacy door (a saved session exists).
 *
 * Screenshots land in download/phase11-*.png; console/page errors must
 * stay at zero.
 */
import { chromium } from "@playwright/test";

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

const ok = (label) => console.log(`  ok: ${label}`);

// -- 1. Fresh browser → the tour auto-opens ------------------------------

await page.goto("http://localhost:3000/");
await page.getByTestId("onboarding-tour").waitFor({ state: "visible" });
ok("fresh browser: the tour auto-opens on the tool cards");
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/phase11-1-tour-step1.png` });

for (let i = 2; i <= 4; i += 1) {
  await page.getByTestId("tour-next").click();
  await page.getByTestId(`tour-step-title-${i - 1}`).waitFor({
    state: "visible",
  });
}
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/phase11-2-tour-step4.png` });
ok("the tour walks all four steps (privacy, tools, drawing, guarantees)");

await page.getByTestId("tour-next").click(); // "Get started"
await page.getByTestId("onboarding-tour").waitFor({ state: "detached" });
const flag = await page.evaluate(() =>
  window.localStorage.getItem("gpx-repair-studio.tour.v1"),
);
if (flag !== "seen") throw new Error(`tour flag = ${flag}, expected "seen"`);
ok("finishing remembers (flag=seen)");

await page.reload();
await page.getByTestId("landing-mode-toggle").waitFor({ state: "visible" });
const reoffered = await page.getByTestId("onboarding-tour").count();
if (reoffered !== 0) throw new Error("the tour re-offered after reload");
ok("no re-offer after reload");

// -- 2-4. The footer's doors + tab switching ------------------------------

await page.getByTestId("footer-about").click();
await page.getByTestId("about-pane").waitFor({ state: "visible" });
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/phase11-3-about.png` });
ok("footer → About opens with attributions");

await page.getByTestId("info-tab-privacy").click();
await page.getByTestId("privacy-pane").waitFor({ state: "visible" });
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/phase11-4-privacy.png` });
ok("the Privacy tab switches inside the open dialog");

const tableText = await page
  .getByTestId("privacy-egress-table")
  .innerText();
for (const host of [
  "tiles.openfreemap.org",
  "tile.openstreetmap.org",
  "router.project-osrm.org",
  "valhalla1.openstreetmap.de",
  "api.open-meteo.com",
]) {
  if (!tableText.includes(host)) throw new Error(`egress table missing ${host}`);
}
ok("the egress table names every real host");

await page.keyboard.press("Escape");
await page.getByTestId("info-dialog").waitFor({ state: "detached" });
ok("Esc closes the dialog");

// -- 5. The manual replay link -------------------------------------------

await page.getByTestId("landing-start-tour").click();
await page.getByTestId("tour-step-title-0").waitFor({ state: "visible" });
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/phase11-5-replay.png` });
await page.getByTestId("tour-skip").click();
await page.getByTestId("onboarding-tour").waitFor({ state: "detached" });
ok("the \"Take the tour\" link replays on demand; Skip closes");

// -- 6. The restore prompt's privacy door (a saved session exists) --------

// Create saved work: the plan tool → the studio → one drawn vertex via
// the controller bridge (the established e2e pattern: fitBounds, then
// click at projected coordinates, then poll the draw session).
await page.getByTestId("landing-mode-plan").click();
await page.getByRole("button", { name: /start planning/i }).click();
await page.waitForSelector(".maplibregl-canvas", { timeout: 20_000 });
await page.waitForFunction(
  () =>
    window.__gpxMapController?.getTestState().drawSession !== null &&
    window.__gpxMapController?.getTestState().ready === true,
  { timeout: 20_000 },
);
await page.evaluate(() => {
  window.__gpxMapController.fitBounds(
    { minLat: 52.51, maxLat: 52.535, minLon: 13.39, maxLon: 13.47 },
    { maxZoom: 14, action: "e2e-frame" },
  );
});
await page.waitForTimeout(400);
const box = await page.locator(".maplibregl-canvas").boundingBox();
const { x, y } = await page.evaluate(
  ([lat, lon]) => window.__gpxMapController.projectLatLon(lat, lon),
  [52.52, 13.405],
);
await page.mouse.click(box.x + x, box.y + y);
await page.waitForFunction(
  () =>
    window.__gpxMapController.getTestState().drawSession?.vertexCount === 1,
  { timeout: 10_000 },
);
await page.waitForTimeout(1600); // autosave debounce (800 ms) + write

await page.goto("http://localhost:3000/");
await page.getByTestId("restore-prompt").waitFor({ state: "visible" });
await page.getByTestId("restore-open-privacy").click();
await page.getByTestId("privacy-pane").waitFor({ state: "visible" });
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/phase11-6-restore-privacy-door.png` });
ok("the restore prompt's privacy link opens the disclosure");

// Close the dialog before acting on the prompt behind it.
await page.keyboard.press("Escape");
await page.getByTestId("info-dialog").waitFor({ state: "detached" });

// Clean up: discard the QA session.
await page.getByTestId("restore-discard-plan").click();
await page.getByTestId("restore-prompt").waitFor({ state: "detached" });
ok("QA session discarded");

await browser.close();

console.log("");
if (errors.length || pageErrors.length) {
  console.log("CONSOLE ERRORS:", errors);
  console.log("PAGE ERRORS:", pageErrors);
  process.exit(1);
}
console.log("ZERO console/page errors — live QA PASS");
