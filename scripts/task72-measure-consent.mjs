/**
 * Task 72 QA probe — measure the VLM's "Enable road snapping… button is
 * truncated" claim against the DOM (scrollWidth vs clientWidth), plus the
 * new copy/paste group's own buttons.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() => {
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
  });
  await page.goto(BASE);
  await page.getByTestId("landing-mode-create").click();
  const fields = {
    "Distance recorded by your watch": "5.23",
    "Pace minutes per unit": "6",
    "Pace seconds per unit": "14",
    "Total time hours": "0",
    "Total time minutes": "32",
    "Total time seconds": "35",
  };
  for (const [label, value] of Object.entries(fields)) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByLabel(/Start/).fill("2026-09-20T05:30");
  await page.getByTestId("begin-drawing-button").click();
  await page.waitForSelector('[data-testid="route-draw-panel"]');

  const measure = (testId) => ({
    testId,
    found: true,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    truncated: el.scrollWidth > el.clientWidth,
    text: el.textContent.trim().slice(0, 60),
  });

  const results = await page.evaluate(() => {
    const ids = [
      "road-consent-enable",
      "create-copy-selection",
      "create-paste-clipboard",
      "create-select-all",
      "create-clear-selection",
    ];
    const out = [];
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) {
        out.push({ testId: id, found: false });
        continue;
      }
      out.push({
        testId: id,
        found: true,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        truncated: el.scrollWidth > el.clientWidth,
        text: el.textContent.trim().slice(0, 60),
      });
    }
    return out;
  });
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
