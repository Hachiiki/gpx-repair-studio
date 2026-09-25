import { chromium } from "playwright";
import { join } from "node:path";

/**
 * Visual verification of the AppShell reorganization pass — the
 * non-workspace session states:
 *
 *   1. desktop landing page (hero + upload + workflow trio),
 *   2. mobile landing page (stacking + no sideways overflow),
 *   3. the error-retry path (alert above the hero, zone still alive),
 *   4. the skip link appearing on keyboard focus.
 */

const OUT = join(process.cwd(), "download");
const BASE = "http://localhost:3000";

const browser = await chromium.launch();

// 1 — Desktop landing page.
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto(BASE);
await desktop.getByTestId("upload-zone").waitFor();
await desktop.waitForTimeout(900); // let the hero entrance settle
await desktop.screenshot({ path: join(OUT, "appshell-idle-desktop.png"), fullPage: true });

// The workflow trio teaches the pipeline.
const steps = desktop.getByTestId("workflow-steps");
if (!(await steps.isVisible())) throw new Error("workflow trio not visible");
for (const label of ["Inspect", "Repair", "Honest by default"]) {
  if (!(await steps.getByText(label, { exact: true }).isVisible())) {
    throw new Error(`workflow step missing: ${label}`);
  }
}

// 2 — Skip link: hidden until keyboard focus, then visible and on target.
await desktop.keyboard.press("Tab"); // first Tab = skip link
const skip = desktop.getByRole("link", { name: "Skip to content" });
if (!(await skip.isVisible())) throw new Error("skip link not visible on focus");
await desktop.screenshot({ path: join(OUT, "appshell-skip-link.png") });
await desktop.keyboard.press("Enter");
await desktop.waitForTimeout(200);
const focusIn = await desktop.evaluate(
  () => document.activeElement?.id === "main-content",
);
if (!focusIn) throw new Error("skip link did not move focus to main");

// 3 — Error-retry path: drop a non-GPX file, the alert sits above the hero.
const errFile = join(
  process.cwd(),
  "src",
  "features",
  "gpx",
  "fixtures",
  "files",
  "not-gpx.gpx",
);
// Feed the invalid file through the zone's file picker.
const chooser = desktop.waitForEvent("filechooser");
await desktop.getByTestId("upload-zone").click();
const fc = await chooser;
await fc.setFiles(errFile);
await desktop.getByTestId("session-error").waitFor();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: join(OUT, "appshell-error-state.png") });
if (!(await desktop.getByTestId("upload-zone").isVisible())) {
  throw new Error("upload zone disappeared after error");
}
await desktop.close();

// 4 — Mobile landing page: single column, no horizontal overflow.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE);
await mobile.getByTestId("upload-zone").waitFor();
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: join(OUT, "appshell-idle-mobile.png"), fullPage: true });
const overflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
}));
if (overflow.scrollWidth > overflow.innerWidth) {
  throw new Error(
    `mobile horizontal overflow: ${overflow.scrollWidth} > ${overflow.innerWidth}`,
  );
}
await mobile.close();

await browser.close();
console.log("OK — idle desktop, skip link, error state, idle mobile verified");
