#!/usr/bin/env node
// Diagnose: does the dev server serve the parse worker? What warns?
import { chromium } from "playwright";
import { join } from "node:path";

const FILE = join(process.cwd(), "e2e", "fixtures", "synthetic-100k.generated.gpx");
const browser = await chromium.launch();
const page = await browser.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e)}`));
page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.url().includes("worker") || r.url().includes("chunk")) {
    logs.push(`[resp ${r.status()}] ${r.url().slice(-90)}`);
  }
});

await page.goto("http://localhost:3000/");
const card = page.getByTestId("landing-mode-repair");
if (await card.isVisible()) {
  await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
}
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("upload-zone").click();
(await chooser).setFiles(FILE);
await page.getByTestId("gpx-summary").waitFor({ state: "visible", timeout: 60_000 });

// Was the worker used, or did the fallback fire?
const usedWorker = await page.evaluate(
  () => typeof window.Worker === "function",
);
console.log("Worker global present:", usedWorker);
console.log("--- relevant logs ---");
for (const l of logs) {
  if (/worker|gpx-repair-studio|parse|error|fail/i.test(l)) console.log(l.slice(0, 300));
}
await browser.close();
