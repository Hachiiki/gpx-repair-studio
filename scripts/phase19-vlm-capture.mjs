/**
 * Phase 19 VLM capture — screenshots of every new surface for the
 * critique pass (download/phase19/).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "download/phase19";
mkdirSync(OUT, { recursive: true });

const SEEN_ALL = JSON.stringify({
  repair: "seen",
  share: "seen",
  recovery: "seen",
  create: "seen",
  merge: "seen",
  plan: "seen",
  batch: "seen",
});

const browser = await chromium.launch();

async function shot(name, { theme = "light", mobile = false, run }) {
  const page = await browser.newPage(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  await page.addInitScript(
    (options) => {
      localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
      localStorage.setItem("gpx-repair-studio.tool-tours.v1", options.seen);
      if (options.theme === "dark") {
        localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
      }
    },
    { theme, seen: SEEN_ALL },
  );
  await run(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`captured ${name}.png`);
  await page.close();
}

async function upload(page) {
  await page.goto(BASE);
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles([
    "src/features/gpx/fixtures/files/deep-defects.gpx",
  ]);
  await page.getByTestId("compare-card").waitFor({ timeout: 20_000 });
}

await shot("01-compare-card", {
  run: async (page) => {
    await upload(page);
    await page.getByTestId("compare-card").scrollIntoViewIfNeeded();
  },
});

await shot("02-overlay-ghost", {
  run: async (page) => {
    await upload(page);
    await page.getByTestId("compare-mode-overlay").click();
    await page.waitForTimeout(600);
  },
});

await shot("03-side-by-side", {
  run: async (page) => {
    await upload(page);
    await page.getByTestId("compare-mode-side-by-side").click();
    await page.getByTestId("compare-side-by-side").waitFor();
  },
});

await shot("04-repair-summary", {
  run: async (page) => {
    await upload(page);
    const spikeRow = page.getByTestId("deep-issue-row").filter({
      has: page.getByTestId("deep-issue-fix-remove-spikes"),
    });
    await spikeRow.getByTestId("deep-issue-fix-remove-spikes").click();
    await page.getByTestId("fix-preview-confirm").click();
    await page.getByTestId("deep-change-row").waitFor({ timeout: 10_000 });
    await page
      .getByTestId("repair-summary-card")
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});

await shot("05-overlay-dark", {
  theme: "dark",
  run: async (page) => {
    await upload(page);
    await page.getByTestId("compare-mode-overlay").click();
    await page.waitForTimeout(900);
  },
});

await shot("06-tool-tour-dialog", {
  run: async (page) => {
    await upload(page);
    await page.keyboard.press("?");
    await page.getByTestId("help-dialog").waitFor();
    await page.getByTestId("help-tour-repair").click();
    await page.getByTestId("tool-tour").waitFor();
  },
});

await shot("07-tour-offer-mobile", {
  mobile: true,
  run: async (page) => {
    await page.goto(BASE);
    await page.evaluate(() =>
      localStorage.removeItem("gpx-repair-studio.tool-tours.v1"),
    );
    await page.getByTestId("landing-mode-repair").click();
    await page.getByTestId("upload-zone").waitFor();
    await page.getByTestId("tool-tour-offer").waitFor({ timeout: 5_000 });
  },
});

await shot("08-batch-summary", {
  run: async (page) => {
    await page.goto(BASE);
    await page.getByTestId("landing-mode-batch").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("batch-intake-zone").click();
    await (await chooser).setFiles([
      "src/features/gpx/fixtures/files/deep-defects.gpx",
      "src/features/gpx/fixtures/files/valid-1.1.gpx",
    ]);
    await page.getByTestId("batch-enter-studio").waitFor({ timeout: 20_000 });
    await page.getByTestId("batch-enter-studio").click();
    await page.getByTestId("batch-summary-card").waitFor({ timeout: 10_000 });
    await page
      .getByTestId("batch-summary-card")
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});

await browser.close();
console.log("all captures done →", OUT);
