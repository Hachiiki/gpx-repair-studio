/**
 * Phase 21 VLM captures — the overflow-QA harness (?lang=pseudo) and the
 * Chinese surfaces, light + dark + mobile.
 *
 * The pseudo locale grows every string by ~⅓ (§EE 21.4): these
 * screenshots exist so the VLM critique can hunt for clipped text,
 * broken alignment, and overflow that the expansion might cause.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "scripts/qa/phase21";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, { theme = "light", mobile = false, lang, run }) {
  const page = await browser.newPage(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  await page.addInitScript(
    (options) => {
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
      if (options.theme === "dark") {
        localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
      }
    },
    { theme },
  );
  const url = lang ? `${BASE}/?lang=${lang}` : BASE;
  await page.goto(url, { waitUntil: "networkidle" });
  if (run) await run(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`saved ${OUT}/${name}.png`);
  await page.close();
}

// The expansion harness: the surfaces with the longest copy.
await shot("pseudo-landing", { lang: "pseudo" });
await shot("pseudo-tool-page", {
  lang: "pseudo",
  run: async (page) => {
    await page.getByTestId("landing-mode-repair").click();
    await page.waitForTimeout(400);
  },
});
await shot("pseudo-palette", {
  lang: "pseudo",
  run: async (page) => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(400);
  },
});
await shot("pseudo-help-dialog", {
  lang: "pseudo",
  run: async (page) => {
    await page.keyboard.press("?");
    await page.waitForTimeout(400);
  },
});

// The Chinese surfaces (the real locale).
await shot("zh-landing", { lang: "zh-CN" });
await shot("zh-landing-dark", {
  theme: "dark",
  lang: "zh-CN",
});
await shot("zh-tool-page", {
  lang: "zh-CN",
  run: async (page) => {
    await page.getByTestId("landing-mode-plan").click();
    await page.waitForTimeout(400);
  },
});
await shot("zh-palette", {
  lang: "zh-CN",
  run: async (page) => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByPlaceholder("搜索命令…").fill("帮助");
    await page.waitForTimeout(400);
  },
});
await shot("zh-mobile", {
  lang: "zh-CN",
  mobile: true,
});

await browser.close();
console.log("phase 21 captures complete");
