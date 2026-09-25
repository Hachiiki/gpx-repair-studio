import { chromium } from "playwright";
import { join } from "node:path";

/**
 * DOM-level overflow probe for the Phase 7 export dialog: checks every
 * element inside the open dialog (and the page body) for real clipping
 * (scrollWidth > clientWidth + 1) — the programmatic ground truth behind
 * (or debunking) a screenshot-based visual review.
 */

const FIXTURES = join(process.cwd(), "src", "features", "gpx", "fixtures", "files");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000");
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
const [fc] = await Promise.all([chooser]);
await fc.setFiles(join(FIXTURES, "time-gap.gpx"));
await page.getByTestId("gpx-summary").waitFor();

await page.getByTestId("open-export-button").click();
await page.getByTestId("export-dialog").waitFor();
await page.waitForTimeout(400);

const findings = await page.evaluate(() => {
  const issues = [];
  const check = (root, label) => {
    for (const el of root.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      // `.sr-only` elements are deliberately clipped to 1px (the
      // screen-reader pattern) — scrollWidth > clientWidth is their
      // designed state, not a defect.
      if (el.classList.contains("sr-only")) continue;
      const sw = el.scrollWidth;
      const cw = el.clientWidth;
      if (cw > 0 && sw > cw + 1) {
        issues.push(
          `${label} <${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ")[0]}` : ""}> ` +
            `scrollWidth ${sw} > clientWidth ${cw} :: "${(el.textContent ?? "").slice(0, 60)}"`,
        );
      }
    }
  };
  const dialog = document.querySelector('[data-testid="export-dialog"]');
  if (dialog) check(dialog, "dialog");
  check(document.body, "body");
  return issues;
});

// Also probe at a narrow (tablet-ish) width for responsive robustness.
await page.setViewportSize({ width: 820, height: 900 });
await page.waitForTimeout(400);
const narrow = await page.evaluate(() => {
  const issues = [];
  const dialog = document.querySelector('[data-testid="export-dialog"]');
  if (!dialog) return ["dialog not open"];
  for (const el of dialog.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.classList.contains("sr-only")) continue;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
      issues.push(
        `narrow <${el.tagName.toLowerCase()}> ` +
          `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} :: "${(el.textContent ?? "").slice(0, 60)}"`,
      );
    }
  }
  return issues;
});

await page.screenshot({ path: join(process.cwd(), "download", "phase7-dialog-probe.png") });
await browser.close();

if (findings.length > 0 || narrow.length > 0) {
  console.log("CLIPPING FOUND:");
  for (const f of [...findings, ...narrow]) console.log(" -", f);
  process.exit(1);
}
console.log("no DOM-level clipping in the export dialog (desktop + 820px) ✓");
