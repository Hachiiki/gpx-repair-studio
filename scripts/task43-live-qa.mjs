/**
 * Task 43 — live QA: screenshots + console-error sweep of the new merge
 * surfaces (cards home with 5 doors, the merge tool page, the studio
 * after a real combine), desktop and mobile.
 *
 * Run against the dev server on :3000 (the same target the e2e suite
 * uses). Screenshots land in download/ for the worklog + VLM critique.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
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

async function dropFiles(paths) {
  await page.getByTestId("merge-intake-zone").evaluate(
    (zone, payload) => {
      const files = payload.map((p) => {
        const [name, base64] = p.split("::");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], name, { type: "application/gpx+xml" });
      });
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      zone.dispatchEvent(
        new DragEvent("drop", { dataTransfer: transfer, bubbles: true }),
      );
    },
    paths.map((p) => {
      const content = readFileSync(p, "utf8");
      return `${p.split("/").pop()}::${Buffer.from(content, "utf8").toString("base64")}`;
    }),
  );
}

// -- 1. The cards home, now five doors -------------------------------------
await page.goto("http://localhost:3000");
await page.getByTestId("landing-mode-toggle").waitFor();
await page.screenshot({ path: `${OUT}/task43-home-five-cards.png`, fullPage: true });
const cardCount = await page.getByTestId("landing-mode-toggle").locator("button").count();
console.log("home cards:", cardCount);

// -- 2. The merge tool page --------------------------------------------------
await page.getByTestId("landing-mode-merge").click();
await page.getByTestId("merge-intake").waitFor();
await page.screenshot({ path: `${OUT}/task43-merge-tool-page.png`, fullPage: true });

// -- 3. The studio after a real three-file combine ---------------------------
await dropFiles([
  join(FIXTURES, "valid-1.1.gpx"),
  join(FIXTURES, "multi-segment.gpx"),
  join(FIXTURES, "wpt-rte.gpx"),
]);
await page.waitForFunction(() => document.querySelector('[data-testid="merge-combine"]')?.disabled === false, null, { timeout: 20_000 });
await page.getByTestId("merge-combine").click();
await page.getByTestId("merge-files-card").waitFor();
// Name the activity so the header/details show the merged identity.
await page.getByTestId("merge-activity-name").fill("Live QA merge");
await page.getByTestId("merge-activity-name").blur();
await page.waitForTimeout(1800); // let the map settle + fit
await page.screenshot({ path: `${OUT}/task43-merge-studio.png` });

// Scroll to the details section (summary + validation + stats).
await page.getByTestId("scroll-cue").click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/task43-merge-details.png` });

// -- 4. Mobile pass: home + tool page + studio ------------------------------
const mobile = await browser.newContext({
  viewport: { width: 375, height: 667 },
});
const mpage = await mobile.newPage();
mpage.on("console", (m) => {
  if (m.type() === "error") errors.push(`[mobile] ${m.text()}`);
});
mpage.on("pageerror", (e) => pageErrors.push(`[mobile] ${String(e)}`));

await mpage.goto("http://localhost:3000");
await mpage.getByTestId("landing-mode-toggle").waitFor();
await mpage.screenshot({ path: `${OUT}/task43-mobile-home.png`, fullPage: true });
const overflow = await mpage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log("mobile horizontal overflow (px):", overflow);

await mpage.getByTestId("landing-mode-merge").click();
await mpage.getByTestId("merge-intake").waitFor();
await mpage.screenshot({ path: `${OUT}/task43-mobile-merge-tool.png`, fullPage: true });

// Mobile combine via the same drop.
await mpage.getByTestId("merge-intake-zone").evaluate(
  (zone, payload) => {
    const files = payload.map((p) => {
      const [name, base64] = p.split("::");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], name, { type: "application/gpx+xml" });
    });
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    zone.dispatchEvent(
      new DragEvent("drop", { dataTransfer: transfer, bubbles: true }),
    );
  },
  [
    join(FIXTURES, "valid-1.1.gpx"),
    join(FIXTURES, "multi-segment.gpx"),
  ].map((p) => {
    const content = readFileSync(p, "utf8");
    return `${p.split("/").pop()}::${Buffer.from(content, "utf8").toString("base64")}`;
  }),
);
await mpage.waitForFunction(() => document.querySelector('[data-testid="merge-combine"]')?.disabled === false, null, { timeout: 20_000 });
await mpage.getByTestId("merge-combine").click();
await mpage.getByTestId("merge-files-card").waitFor();
await mpage.waitForTimeout(1500);
await mpage.screenshot({ path: `${OUT}/task43-mobile-studio.png` });
const overflowStudio = await mpage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log("mobile studio overflow (px):", overflowStudio);

console.log("console errors:", errors.length ? errors : "none");
console.log("page errors:", pageErrors.length ? pageErrors : "none");

await browser.close();
