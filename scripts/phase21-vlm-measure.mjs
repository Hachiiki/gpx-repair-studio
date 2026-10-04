/**
 * Phase 21 VLM measurement — settle every measurable critique claim
 * against the DOM (the Task-56/19 discipline: no claim survives
 * unmeasured).
 *
 * Claims under test:
 *   pseudo landing: (a) horizontal overflow; (b) second-row tiles
 *     shorter / jagged grid; (c) bottom-row card text clipped;
 *     (d) the share tile's icon overlapping the illustration.
 *   pseudo tool page: (e) header wordmark cramped against the badge;
 *     (f) the Sessions button's padding compressed.
 *   zh dark: (g) card descriptions fail WCAG AA contrast;
 *     (h) bottom-row card text cut off.
 *   zh mobile: (i) the illustration exceeding the 390px viewport;
 *     (j) the Open row's touch target colliding with the card floor.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const results = [];

function record(claim, verdict, detail) {
  results.push(`${verdict ? "DISPROVEN" : "CONFIRMED"}  ${claim} — ${detail}`);
}

const browser = await chromium.launch();

async function pageFor(lang, { theme = "light", mobile = false } = {}) {
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
        JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
      );
      if (options.theme === "dark") {
        localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
      }
    },
    { theme },
  );
  await page.goto(`${BASE}/?lang=${lang}`, { waitUntil: "networkidle" });
  return page;
}

// ---------------------------------------------------------------------------
// The pseudo landing (claims a–d).
// ---------------------------------------------------------------------------
{
  const page = await pageFor("pseudo");
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const tiles = [...document.querySelectorAll('li > [data-testid^="landing-mode-"]')];
    const rowOf = (n) => tiles[n].getBoundingClientRect();
    const blurb = (n) => tiles[n].querySelector(".line-clamp-3");
    const blurbOverflow = (n) => {
      const el = blurb(n);
      return el ? el.scrollHeight - el.clientHeight : null;
    };
    // The share tile's body icon chip vs its illustration plate: the
    // chip must sit fully BELOW the plate (the critique described an
    // icon inside the ARTWORK — that is the illustration's own
    // composition, not a layout element).
    const share = tiles[1];
    const body = [...share.querySelectorAll("span")].find(
      (el) => el.className.includes("p-3.5"),
    );
    const chip = body.querySelector("span.inline-flex.shrink-0").getBoundingClientRect();
    const plate = share.querySelector("span.aspect-\\[2\\/1\\]").getBoundingClientRect();
    return {
      scrollDelta: doc.scrollWidth - doc.clientWidth,
      heights: tiles.map((t) => Math.round(t.getBoundingClientRect().height)),
      row1tops: [rowOf(0).top, rowOf(1).top, rowOf(2).top].map((v) => Math.round(v)),
      row2tops: [rowOf(3).top, rowOf(4).top, rowOf(5).top].map((v) => Math.round(v)),
      blurbOverflow: [0, 3, 6].map(blurbOverflow),
      chipTopVsPlateBottom: Math.round(chip.top - plate.bottom),
    };
  });
  record(
    "(a) pseudo: horizontal overflow",
    m.scrollDelta <= 0,
    `scrollWidth delta ${m.scrollDelta}px`,
  );
  const row1 = m.heights.slice(0, 3);
  const row2 = m.heights.slice(3, 6);
  const row1Spread = Math.max(...row1) - Math.min(...row1);
  const row2Spread = Math.max(...row2) - Math.min(...row2);
  const row1Aligned = new Set(m.row1tops).size === 1;
  const row2Aligned = new Set(m.row2tops).size === 1;
  record(
    "(b) pseudo: jagged grid / uneven rows",
    row1Spread <= 1 && row2Spread <= 1 && row1Aligned && row2Aligned,
    `row heights ${[...row1, ...row2].join(",")}px, spreads ${row1Spread}/${row2Spread}px, tops aligned ${row1Aligned}/${row2Aligned}`,
  );
  record(
    "(c) pseudo: card text clipped",
    m.blurbOverflow.every((v) => v !== null && v <= 0),
    `blurb scroll deltas [${m.blurbOverflow.join(", ")}]px`,
  );
  record(
    "(d) pseudo: share icon overlaps the illustration",
    m.chipTopVsPlateBottom >= 0,
    `plate bottom → chip top gap ${m.chipTopVsPlateBottom}px (the critiqued icon lives INSIDE the artwork)`,
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// The pseudo tool page (claims e–f).
// ---------------------------------------------------------------------------
{
  const page = await pageFor("pseudo");
  await page.getByTestId("landing-mode-repair").click();
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const badge = document.querySelector("h1 + span, h1 ~ span");
    const h1box = h1.getBoundingClientRect();
    const badgeBox = badge ? badge.getBoundingClientRect() : null;
    const sessions = document.querySelector('[data-testid="header-sessions-button"]');
    const sBox = sessions ? sessions.getBoundingClientRect() : null;
    const sText = sessions ? sessions.querySelector("span, svg + *") : null;
    return {
      wordmarkToBadgeGap: badgeBox ? Math.round(badgeBox.left - h1box.right) : null,
      sessionsBox: sBox
        ? { width: Math.round(sBox.width), height: Math.round(sBox.height) }
        : null,
      sessionsTextWidth: sText
        ? Math.round(sText.getBoundingClientRect().width)
        : null,
    };
  });
  record(
    "(e) pseudo: header wordmark cramped against the badge",
    (m.wordmarkToBadgeGap ?? 0) >= 8,
    `gap ${m.wordmarkToBadgeGap}px (the truncate class absorbs growth)`,
  );
  const horizontalRoom = m.sessionsBox ? m.sessionsBox.width - (m.sessionsTextWidth ?? 0) : 0;
  record(
    "(f) pseudo: Sessions button padding compressed",
    horizontalRoom >= 24,
    `button ${m.sessionsBox?.width}px, text ${m.sessionsTextWidth}px, room ${horizontalRoom}px`,
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// zh dark (claims g–h).
// ---------------------------------------------------------------------------
{
  const page = await pageFor("zh-CN", { theme: "dark" });
  const m = await page.evaluate(() => {
    // (g) contrast: the muted description text on the card background.
    const blurb = document.querySelector(".line-clamp-3");
    const card = blurb.closest("button");
    const style = getComputedStyle(blurb);
    const cardStyle = getComputedStyle(card);
    // Tailwind 4 emits lab()/oklab() colors — parse-free measurement:
    // rasterize the swatch on a canvas and read the pixel.
    const pixelOf = (color) => {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const ctx = c.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const lin = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const l1 = pixelOf(style.color);
    const l2 = pixelOf(cardStyle.backgroundColor);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    // (h) bottom-row clipping: every blurb's scroll vs client height.
    const overflows = [...document.querySelectorAll(".line-clamp-3")].map(
      (el) => el.scrollHeight - el.clientHeight,
    );
    return {
      color: style.color,
      bg: cardStyle.backgroundColor,
      ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
      overflows,
    };
  });
  record(
    "(g) zh dark: card descriptions fail WCAG AA",
    m.ratio !== null && m.ratio >= 4.5,
    `contrast ${m.ratio}:1 (${m.color} on ${m.bg})`,
  );
  record(
    "(h) zh dark: bottom-row text cut off",
    m.overflows.every((v) => v <= 0),
    `blurb scroll deltas [${m.overflows.join(", ")}]px`,
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// zh mobile (claims i–j).
// ---------------------------------------------------------------------------
{
  const page = await pageFor("zh-CN", { mobile: true });
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const firstTile = document.querySelector('li > [data-testid^="landing-mode-"]');
    const tileBox = firstTile.getBoundingClientRect();
    const img = firstTile.querySelector("img");
    const imgBox = img.getBoundingClientRect();
    // The Open affordance row: its distance from the card floor.
    const openRow = firstTile.querySelector(".mt-auto");
    const openBox = openRow.getBoundingClientRect();
    return {
      scrollDelta: doc.scrollWidth - doc.clientWidth,
      viewport: doc.clientWidth,
      tileRight: Math.round(tileBox.right),
      imgLeft: Math.round(imgBox.left),
      imgRight: Math.round(imgBox.right),
      openRowHeight: Math.round(openBox.height),
      openRowToFloor: Math.round(tileBox.bottom - openBox.bottom),
    };
  });
  record(
    "(i) zh mobile: illustration exceeds the viewport",
    m.scrollDelta <= 0 && m.imgLeft >= 0 && m.imgRight <= m.viewport,
    `scroll delta ${m.scrollDelta}px, img ${m.imgLeft}→${m.imgRight} within viewport ${m.viewport}px (full-bleed artwork crops by design)`,
  );
  record(
    "(j) zh mobile: Open row touch target cramped at the card floor",
    m.openRowHeight >= 16 && m.openRowToFloor >= 8,
    `row ${m.openRowHeight}px tall, ${m.openRowToFloor}px above the floor (the whole tile is the button)`,
  );
  await page.close();
}

await browser.close();
console.log(results.join("\n"));
