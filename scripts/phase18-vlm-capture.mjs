/**
 * Phase 18 VLM captures — the batch studio (queue + preset dialog) and
 * the sessions manager, light + dark + mobile.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const FIXTURES = "src/features/gpx/fixtures/files";
const OUT = "scripts/qa/phase18";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, { theme = "light", mobile = false, run }) {
  const page = await browser.newPage(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  await page.addInitScript((t) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    if (t === "dark") localStorage.setItem("gpx-repair-studio.theme", "dark");
  }, theme);
  await page.goto(BASE);
  await run(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`saved ${OUT}/${name}.png`);
  await page.close();
}

async function enterBatchStudio(page) {
  await page.getByTestId("landing-mode-batch").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("batch-intake-zone").click();
  (await chooser).setFiles([
    `${FIXTURES}/deep-defects.gpx`,
    `${FIXTURES}/valid-1.1.gpx`,
    `${FIXTURES}/not-gpx.gpx`,
  ]);
  await page.getByTestId("batch-enter-studio").waitFor({ timeout: 20_000 });
  await page.getByTestId("batch-enter-studio").click();
  await page.getByTestId("batch-section").waitFor();
}

await shot("batch-studio-light", {
  run: async (page) => {
    await enterBatchStudio(page);
    await page.waitForTimeout(300);
  },
});

await shot("batch-preset-dialog-light", {
  run: async (page) => {
    await enterBatchStudio(page);
    await page.getByTestId("batch-preset-spike-sweep").click();
    await page.getByTestId("batch-preset-dialog").waitFor();
  },
});

await shot("batch-studio-dark", {
  theme: "dark",
  run: async (page) => {
    await enterBatchStudio(page);
    await page.waitForTimeout(300);
  },
});

await shot("batch-studio-mobile", {
  mobile: true,
  run: async (page) => {
    await enterBatchStudio(page);
    await page.waitForTimeout(300);
  },
});

await shot("sessions-manager-light", {
  run: async (page) => {
    await page.getByTestId("landing-mode-repair").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    (await chooser).setFiles([`${FIXTURES}/deep-defects.gpx`]);
    await page.getByTestId("deep-validation-card").waitFor({ timeout: 20_000 });
    await page.getByTestId("deep-issue-fix-remove-spikes").first().click();
    await page.getByTestId("fix-preview-confirm").click();
    await page.getByTestId("deep-change-row").first().waitFor();
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("sessions-manager").waitFor();
    await page.getByTestId("sessions-save-name").fill("Sunday ride");
  },
});

await shot("landing-seven-tiles", {
  run: async (page) => {
    await page.waitForTimeout(300);
  },
});

await browser.close();
console.log("done");
