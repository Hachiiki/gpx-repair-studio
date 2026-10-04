/**
 * Phase 19 VLM probe — measure every critique claim before acting
 * (the phase 15–18 ritual: the VLM says, measurement decides).
 *
 * Claims under test (from a VLM critique of the compare + summary
 * surfaces):
 *   V1 the side-by-side panels do not share one scale (viewBox diff);
 *   V2 the compare mode control's active state is indistinguishable;
 *   V3 the delta table's Change column signs mix +/− glyphs with
 *      different widths (jittery column);
 *   V4 the repair-summary snapshot renders at zero height (the SVG
 *      scales to 0 inside the card);
 *   V5 the tool-tour offer banner overflows the mobile viewport.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const FIXTURES = "src/features/gpx/fixtures/files";

const browser = await chromium.launch();
const results = {};

// ---------------------------------------------------------------------------
// Desktop: compare + summary surfaces
// ---------------------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  await (await chooser).setFiles([`${FIXTURES}/deep-defects.gpx`]);
  await page.getByTestId("compare-card").waitFor({ timeout: 20_000 });

  // V1: side-by-side shared scale.
  await page.getByTestId("compare-mode-side-by-side").click();
  await page.getByTestId("compare-side-by-side").waitFor();
  results.V1 = await page.evaluate(() => {
    const read = (id) =>
      document
        .querySelector(`[data-testid="${id}"] svg`)
        ?.getAttribute("viewBox") ?? null;
    const a = read("compare-panel-svg-original");
    const b = read("compare-panel-svg-after");
    return { original: a, after: b, shared: a !== null && a === b };
  });
  await page.keyboard.press("Escape");

  // V2: the mode control's active state (bg tint + signal icon).
  await page.getByTestId("compare-mode-overlay").click();
  results.V2 = await page.evaluate(() => {
    const active = document.querySelector(
      '[data-testid="compare-mode-overlay"]',
    );
    const inactive = document.querySelector('[data-testid="compare-mode-off"]');
    const a = getComputedStyle(active);
    const i = getComputedStyle(inactive);
    return {
      activeBg: a.backgroundColor,
      inactiveBg: i.backgroundColor,
      distinguishable: a.backgroundColor !== i.backgroundColor,
      ariaChecked: active.getAttribute("aria-checked"),
    };
  });
  await page.getByTestId("compare-mode-off").click();

  // V3: the Change column's sign widths (tabular-nums keeps the column
  // steady — measured as the column's right-aligned text widths).
  results.V3 = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="compare-row-"]')];
    return rows.map((row) => {
      const cells = [...row.querySelectorAll("td")];
      const change = cells[3];
      return {
        id: row.getAttribute("data-testid"),
        text: change?.textContent?.trim(),
        fontFamily: change ? getComputedStyle(change).fontVariantNumeric : null,
      };
    });
  });

  // V4: the summary snapshot's rendered height.
  results.V4 = await page.evaluate(() => {
    const el = document.querySelector(
      "[data-testid='repair-summary-snapshot']",
    );
    const svg = el?.querySelector("svg");
    if (!el || !svg) return { exists: false };
    const rect = el.getBoundingClientRect();
    return {
      exists: true,
      heightPx: Math.round(rect.height),
      widthPx: Math.round(rect.width),
      aspect: (svg.getAttribute("viewBox") ?? "").split(" ").slice(2).join(":"),
    };
  });
  await page.close();
}

// ---------------------------------------------------------------------------
// Mobile: the offer banner's fit
// ---------------------------------------------------------------------------
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.removeItem("gpx-repair-studio.tool-tours.v1");
  });
  await page.goto(BASE);
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor();
  await page.getByTestId("tool-tour-offer").waitFor({ timeout: 5_000 }).catch(() => {});
  results.V5 = await page.evaluate(() => {
    const offer = document.querySelector("[data-testid='tool-tour-offer']");
    const root = document.documentElement;
    if (!offer) return { present: false };
    const rect = offer.getBoundingClientRect();
    return {
      present: true,
      fitsViewport: rect.left >= 0 && rect.right <= root.clientWidth + 0.5,
      pageOverflow: root.scrollWidth - root.clientWidth,
      offerWidth: Math.round(rect.width),
    };
  });
  await page.close();
}

await browser.close();

console.log(JSON.stringify(results, null, 2));

// Verdicts (measured, not eyeballed).
const verdicts = [
  ["V1 shared scale", results.V1?.shared === true],
  ["V2 active state distinguishable", results.V2?.distinguishable === true && results.V2?.ariaChecked === "true"],
  ["V3 tabular numerals on the change column", (results.V3 ?? []).every((r) => /tabular-nums/.test(r.fontFamily ?? ""))],
  ["V4 snapshot renders with height", (results.V4?.heightPx ?? 0) > 80],
  ["V5 offer fits the mobile viewport", results.V5?.present !== true || (results.V5.fitsViewport === true && results.V5.pageOverflow <= 1)],
];
let failed = 0;
for (const [name, ok] of verdicts) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed > 0 ? 1 : 0);
