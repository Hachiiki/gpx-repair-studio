/**
 * Repro harness — screenshot the workspace after uploading one of the
 * real Strava docs/ files (or a demo sample), at desktop + mobile widths.
 *
 * Usage:
 *   bun scripts/repro-layout.ts <abs-file-path> <tag>
 * Run inside the same bash invocation as the dev server (sandbox reaps
 * background processes between calls):
 *   (bun run dev > /tmp/dev.log 2>&1 &) ; sleep X ; bun scripts/repro-layout.ts ...
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const file = process.argv[2];
const tag = process.argv[3] ?? "repro";
if (!file) {
  console.error("usage: bun scripts/repro-layout.ts <abs-file-path> <tag>");
  process.exit(1);
}

const OUT_DIR = "/home/z/my-project/download/repro";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();

for (const vp of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
  });
  await page.goto("http://localhost:3000");
  await page.setInputFiles('input[type="file"]', file);
  // Wait for the parsed workspace
  await page.waitForSelector('[data-testid="gap-list"]', { timeout: 20_000 });
  await page.waitForTimeout(2500); // let map tiles settle
  await page.screenshot({
    path: `${OUT_DIR}/${tag}-${vp.name}.png`,
    fullPage: true,
  });

  // Also capture the body scroll width vs viewport width — the classic
  // "layout broken" signature (horizontal overflow).
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  console.log(`[${tag}/${vp.name}]`, JSON.stringify(overflow));
  await page.close();
}

await browser.close();
console.log("done");
