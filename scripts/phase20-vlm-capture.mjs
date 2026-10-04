/**
 * Phase 20 VLM capture — the palette + the generated cheat sheet, both
 * themes, plus the mid-session (editing) palette. Saved for the VLM
 * critique pass with measurement follow-ups.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "scripts/qa/phase20";

async function freshPage(browser, theme) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript((options) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem(
      "gpx-repair-studio.tool-tours.v1",
      JSON.stringify({
        repair: "seen", share: "seen", recovery: "seen", create: "seen",
        merge: "seen", plan: "seen", batch: "seen",
      }),
    );
    if (options.theme === "dark") {
      localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
    }
  }, { theme });
  return page;
}

const browser = await chromium.launch();

// 1. The palette, light theme, on the landing (grouped view).
{
  const page = await freshPage(browser, "light");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  await page.getByTestId("command-palette").waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/palette-light.png` });
  await page.close();
}

// 2. The palette, dark theme, searching (the flat results view).
{
  const page = await freshPage(browser, "dark");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  await page.getByTestId("command-palette").waitFor({ state: "visible" });
  await page.getByTestId("command-palette-input").fill("plan");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/palette-dark-search.png` });
  await page.close();
}

// 3. The generated cheat sheet in the help dialog (light).
{
  const page = await freshPage(browser, "light");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.keyboard.press("?");
  await page.getByTestId("help-dialog").waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/help-cheatsheet.png` });
  await page.close();
}

await browser.close();
console.log("captured 3 screenshots to", OUT);
