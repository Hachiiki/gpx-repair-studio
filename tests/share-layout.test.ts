/**
 * Share card layout + artwork tests (Task 23 spec revision) —
 * lib/share/layout.ts, lib/share/artwork.ts, lib/share/path-bounds.ts.
 *
 * Pins the reference card's measured anchors EXACTLY (the lesson of
 * Tasks 21–22: the reference's numbers are the spec — pin, don't
 * re-derive): the 1080×1920 canvas on solid black, the route's
 * visible box (x 64–1012, y 219–1190, contain + casing inset), the
 * wordmark's 330×55 ink box at top 1280, the stats trio (29px/40px,
 * 9px label→value, centers 220/540/857, top 1422), the 104px shoe
 * slot at top 1605 — and the vertical rhythm those anchors imply
 * (gaps 90 / 87 / ≈90, content ending at 1709 with ~211px empty).
 *
 * The artwork's ink constants are verified against the path data by
 * the same parser used to measure them (artwork.ts carries data; the
 * parser lives in lib/share/path-bounds.ts and never ships to the
 * browser).
 */

import { describe, expect, it } from "vitest";
import {
  SHOE_ICON_ARTWORK,
  SHOE_ICON_INK,
  SHOE_ICON_METRICS,
  STRAVA_LOGO_ARTWORK,
  STRAVA_LOGO_INK,
  STRAVA_LOGO_METRICS,
} from "@/lib/share/artwork";
import { artworkInkBounds, pathDataBounds } from "@/lib/share/path-bounds";
import {
  SHARE_CARD_COLORS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_ICON_SLOT,
  SHARE_CARD_LOGO_INK_BOX,
  SHARE_CARD_ROUTE_BOX,
  SHARE_CARD_ROUTE_STROKE,
  SHARE_CARD_SIMPLIFY_TOLERANCE_M,
  SHARE_CARD_STATS_ANCHORS,
  SHARE_CARD_STAT_LABELS,
  SHARE_CARD_TYPE,
  SHARE_CARD_WIDTH,
  computeShareCardLayout,
} from "@/lib/share/layout";

const LAYOUT = computeShareCardLayout({
  logo: STRAVA_LOGO_METRICS,
  icon: SHOE_ICON_METRICS,
});

describe("share card spec tokens (Task 23)", () => {
  it("is 1080×1920 (9:16)", () => {
    expect(SHARE_CARD_WIDTH).toBe(1080);
    expect(SHARE_CARD_HEIGHT).toBe(1920);
  });

  it("anchors the route's visible box at the measured bounds", () => {
    expect(SHARE_CARD_ROUTE_BOX).toEqual({
      x: 64,
      y: 219,
      width: 948, // x 64–1012
      height: 971, // y 219–1190
    });
  });

  it("anchors the wordmark's ink box at 330×55, top 1280, centered", () => {
    expect(SHARE_CARD_LOGO_INK_BOX).toEqual({
      x: 375,
      y: 1280,
      width: 330,
      height: 55,
    });
    // Centered on the card's midline.
    expect(
      SHARE_CARD_LOGO_INK_BOX.x + SHARE_CARD_LOGO_INK_BOX.width / 2,
    ).toBe(SHARE_CARD_WIDTH / 2);
  });

  it("anchors the stats trio: top 1422, centers 220/540/857, 9px gap", () => {
    expect(SHARE_CARD_STATS_ANCHORS).toEqual({
      top: 1422,
      columnCenters: [220, 540, 857],
      labelToValue: 9,
    });
  });

  it("anchors the shoe slot at 104×104, top 1605, centered", () => {
    expect(SHARE_CARD_ICON_SLOT).toEqual({ x: 488, y: 1605, size: 104 });
    expect(SHARE_CARD_ICON_SLOT.x + SHARE_CARD_ICON_SLOT.size / 2).toBe(540);
  });

  it("caps simplification at the spec's 5m jitter-preserving tolerance", () => {
    expect(SHARE_CARD_SIMPLIFY_TOLERANCE_M).toBe(5);
  });

  it("uses Montserrat 600 labels / 800 values with the spec's tracking", () => {
    expect(SHARE_CARD_TYPE.fontFamily).toBe("Montserrat");
    expect(SHARE_CARD_TYPE.label).toEqual({
      size: 29,
      weight: 600,
      letterSpacingEm: 0.04,
      lineHeight: 1.25,
    });
    expect(SHARE_CARD_TYPE.value).toEqual({
      size: 40,
      weight: 800,
      letterSpacingEm: 0,
      lineHeight: 1.2,
    });
  });

  it("labels the trio Distance / Pace / Time in column order", () => {
    expect(SHARE_CARD_STAT_LABELS).toEqual(["Distance", "Pace", "Time"]);
  });

  it("colors: black background, orange route over black casing, white foreground", () => {
    expect(SHARE_CARD_COLORS).toEqual({
      background: "#000000",
      route: "#FC4C02",
      casing: "#000000",
      foreground: "#FFFFFF",
    });
  });

  it("strokes the route 16px black under 10px orange, round cap/join", () => {
    expect(SHARE_CARD_ROUTE_STROKE).toEqual({
      width: 10,
      casingWidth: 16,
      lineJoin: "round",
      lineCap: "round",
    });
  });
});

describe("computeShareCardLayout", () => {
  it("contains the route geometry one casing half-width inside the box", () => {
    expect(LAYOUT.routeBox).toEqual({ ...SHARE_CARD_ROUTE_BOX });
    // Inset by 8 (half the 16px casing) so geometry + stroke never
    // crosses the measured visible bounds.
    expect(LAYOUT.routeFitBox).toEqual({
      x: 64 + 8,
      y: 219 + 8,
      width: 948 - 16,
      height: 971 - 16,
    });
  });

  it("maps the wordmark's ink exactly onto its 330×55 box (the stretch)", () => {
    expect(LAYOUT.logoInkRect).toEqual({ ...SHARE_CARD_LOGO_INK_BOX });
    // The painter rect is the affine scaffolding that places the ink:
    // ink-in-viewBox maps onto the box on both axes, independently.
    const metrics = STRAVA_LOGO_METRICS;
    const scaleX = LAYOUT.logoRect.width / metrics.viewBoxWidth;
    const scaleY = LAYOUT.logoRect.height / metrics.viewBoxHeight;
    expect(LAYOUT.logoRect.x + metrics.ink.x * scaleX).toBeCloseTo(375, 10);
    expect(LAYOUT.logoRect.y + metrics.ink.y * scaleY).toBeCloseTo(1280, 10);
    expect(LAYOUT.logoRect.x + (metrics.ink.x + metrics.ink.width) * scaleX)
      .toBeCloseTo(375 + 330, 10);
    expect(LAYOUT.logoRect.y + (metrics.ink.y + metrics.ink.height) * scaleY)
      .toBeCloseTo(1280 + 55, 10);
    // The stretch is real but honest: x and y scales differ (the
    // reference wordmark is flatter than the trace).
    expect(scaleX).toBeCloseTo(330 / 551.8, 6);
    expect(scaleY).toBeCloseTo(55 / 123.9, 6);
  });

  it("lays the stats row at the anchors with the 9px label→value gap", () => {
    const labelLine = 29 * 1.25; // 36.25
    const valueLine = 40 * 1.2; // 48
    expect(LAYOUT.statsTop).toBe(1422);
    expect(LAYOUT.statsBottom).toBeCloseTo(1422 + 36.25 + 9 + 48, 10);
    expect(LAYOUT.statsColumns).toHaveLength(3);
    const centers = LAYOUT.statsColumns.map((column) => column.centerX);
    expect(centers).toEqual([220, 540, 857]);
    for (const column of LAYOUT.statsColumns) {
      expect(column.labelCenterY).toBeCloseTo(1422 + labelLine / 2, 10);
      // valueCenterY − labelLineBottom = 9 + valueLine/2: the explicit gap.
      expect(
        column.valueCenterY -
          (LAYOUT.statsTop + labelLine) -
          valueLine / 2,
      ).toBeCloseTo(9, 10);
      expect(column.valueCenterY).toBeGreaterThan(column.labelCenterY);
    }
  });

  it("contains the shoe's ink in the 104px slot, centered", () => {
    expect(LAYOUT.iconSlotRect).toEqual({ x: 488, y: 1605, width: 104, height: 104 });
    const ink = LAYOUT.iconInkRect;
    // Contained: neither dimension exceeds the slot.
    expect(ink.width).toBeLessThanOrEqual(104 + 1e-9);
    expect(ink.height).toBeLessThanOrEqual(104 + 1e-9);
    // The binding dimension fills the slot (the icon is wider than tall).
    expect(ink.width).toBeCloseTo(104, 6);
    expect(ink.height).toBeCloseTo(104 * (202.6 / 207.5), 6);
    // Centered on the slot's center (540, 1657).
    expect(ink.x + ink.width / 2).toBeCloseTo(540, 10);
    expect(ink.y + ink.height / 2).toBeCloseTo(1605 + 52, 10);
    // The painter rect places the ink there (affine scaffolding).
    const metrics = SHOE_ICON_METRICS;
    const scale = LAYOUT.iconRect.width / metrics.viewBoxWidth;
    expect(LAYOUT.iconRect.x + metrics.ink.x * scale).toBeCloseTo(ink.x, 6);
    expect(LAYOUT.iconRect.y + metrics.ink.y * scale).toBeCloseTo(ink.y, 6);
    // Uniform scale — the icon is never stretched.
    expect(LAYOUT.iconRect.height / metrics.viewBoxHeight).toBeCloseTo(scale, 9);
  });

  it("implies the reference's vertical rhythm (asserted, not derived)", () => {
    const routeBottom = LAYOUT.routeBox.y + LAYOUT.routeBox.height; // 1190
    // Route → logo: 90px.
    expect(LAYOUT.logoInkRect.y - routeBottom).toBeCloseTo(90, 10);
    // Logo → stats: 87px.
    expect(LAYOUT.statsTop - (LAYOUT.logoInkRect.y + LAYOUT.logoInkRect.height))
      .toBeCloseTo(87, 10);
    // Stats → shoe: ~90 (89.75 with the measured line heights).
    expect(LAYOUT.iconSlotRect.y - LAYOUT.statsBottom).toBeCloseTo(89.75, 10);
    expect(Math.abs(LAYOUT.iconSlotRect.y - LAYOUT.statsBottom - 90))
      .toBeLessThan(1);
    // The stack ends at the slot's bottom — 1709 — and nothing
    // follows: the shoe's ink sits inside the slot, and ~211px of
    // pure background remains below.
    expect(LAYOUT.contentBottom).toBe(1709);
    expect(LAYOUT.iconInkRect.y + LAYOUT.iconInkRect.height)
      .toBeLessThanOrEqual(LAYOUT.contentBottom + 0.5);
    expect(SHARE_CARD_HEIGHT - LAYOUT.contentBottom).toBeCloseTo(211, 10);
  });

  it("derives the layout from passed metrics (artwork-agnostic)", () => {
    // Synthetic square ink filling its viewBox: the logo ink box IS
    // the rect; the icon ink fills the slot exactly.
    const square = {
      viewBoxWidth: 100,
      viewBoxHeight: 100,
      ink: { x: 0, y: 0, width: 100, height: 100 },
    };
    const layout = computeShareCardLayout({ logo: square, icon: square });
    expect(layout.logoRect.x).toBeCloseTo(SHARE_CARD_LOGO_INK_BOX.x, 10);
    expect(layout.logoRect.y).toBeCloseTo(SHARE_CARD_LOGO_INK_BOX.y, 10);
    expect(layout.logoRect.width).toBeCloseTo(SHARE_CARD_LOGO_INK_BOX.width, 10);
    expect(layout.logoRect.height).toBeCloseTo(
      SHARE_CARD_LOGO_INK_BOX.height,
      10,
    );
    expect(layout.iconInkRect.x).toBeCloseTo(488, 10);
    expect(layout.iconInkRect.y).toBeCloseTo(1605, 10);
    expect(layout.iconInkRect.width).toBeCloseTo(104, 10);
    expect(layout.iconInkRect.height).toBeCloseTo(104, 10);
  });
});

describe("artwork ink constants (measured, parser-verified)", () => {
  it("the wordmark's ink matches its path data", () => {
    const measured = artworkInkBounds(STRAVA_LOGO_ARTWORK);
    expect(measured.x).toBeCloseTo(STRAVA_LOGO_INK.x, 5);
    expect(measured.y).toBeCloseTo(STRAVA_LOGO_INK.y, 5);
    expect(measured.width).toBeCloseTo(STRAVA_LOGO_INK.width, 5);
    expect(measured.height).toBeCloseTo(STRAVA_LOGO_INK.height, 5);
  });

  it("the shoe icon's ink matches its path data", () => {
    const measured = artworkInkBounds(SHOE_ICON_ARTWORK);
    expect(measured.x).toBeCloseTo(SHOE_ICON_INK.x, 5);
    expect(measured.y).toBeCloseTo(SHOE_ICON_INK.y, 5);
    expect(measured.width).toBeCloseTo(SHOE_ICON_INK.width, 5);
    expect(measured.height).toBeCloseTo(SHOE_ICON_INK.height, 5);
  });

  it("the metrics carry their artworks' viewBoxes", () => {
    expect(STRAVA_LOGO_METRICS.viewBoxWidth).toBe(
      STRAVA_LOGO_ARTWORK.viewBoxWidth,
    );
    expect(STRAVA_LOGO_METRICS.viewBoxHeight).toBe(
      STRAVA_LOGO_ARTWORK.viewBoxHeight,
    );
    expect(SHOE_ICON_METRICS.viewBoxWidth).toBe(
      SHOE_ICON_ARTWORK.viewBoxWidth,
    );
    expect(SHOE_ICON_METRICS.viewBoxHeight).toBe(
      SHOE_ICON_ARTWORK.viewBoxHeight,
    );
  });
});

describe("pathDataBounds (the parser behind the measurements)", () => {
  it("bounds absolute moveto/lineto with implicit repeats", () => {
    expect(pathDataBounds("M10 20 L30 40 50 60")).toEqual({
      minX: 10,
      minY: 20,
      maxX: 50,
      maxY: 60,
    });
  });

  it("bounds relative commands from the current point", () => {
    expect(pathDataBounds("M10 10 l5 5 l-20 0")).toEqual({
      minX: -5,
      minY: 10,
      maxX: 15,
      maxY: 15,
    });
  });

  it("includes cubic control points and handles closepath", () => {
    // Control point (100, 0) lies outside the curve's own extremes.
    expect(pathDataBounds("M0 10 C100 0 100 20 50 10 z")).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 20,
    });
  });

  it("handles horizontal/vertical shorthand", () => {
    expect(pathDataBounds("M5 5 H15 V25")).toEqual({
      minX: 5,
      minY: 5,
      maxX: 15,
      maxY: 25,
    });
  });

  it("returns null for paths without coordinates", () => {
    expect(pathDataBounds("z")).toBeNull();
    expect(pathDataBounds("")).toBeNull();
  });
});

describe("artwork (the cleaned source SVGs)", () => {
  it("STRAVA wordmark: 600×164 viewBox, 5 paths, y-flip transform", () => {
    expect(STRAVA_LOGO_ARTWORK.viewBoxWidth).toBe(600);
    expect(STRAVA_LOGO_ARTWORK.viewBoxHeight).toBe(164);
    expect(STRAVA_LOGO_ARTWORK.paths).toHaveLength(5);
    expect(STRAVA_LOGO_ARTWORK.sourceTransform).toEqual({
      translateY: 164,
      scale: 0.1,
    });
  });

  it("shoe icon: 213×211 viewBox, 2 paths, y-flip transform", () => {
    expect(SHOE_ICON_ARTWORK.viewBoxWidth).toBe(213);
    expect(SHOE_ICON_ARTWORK.viewBoxHeight).toBe(211);
    expect(SHOE_ICON_ARTWORK.paths).toHaveLength(2);
    expect(SHOE_ICON_ARTWORK.sourceTransform).toEqual({
      translateY: 211,
      scale: 0.1,
    });
  });

  it("carries only valid path-command data (no paste artifacts)", () => {
    for (const artwork of [STRAVA_LOGO_ARTWORK, SHOE_ICON_ARTWORK]) {
      for (const d of artwork.paths) {
        // Absolute/relative moveto/lineto/curveto + numbers/spaces only.
        expect(d).toMatch(/^[MmLlCcZz0-9\-.,\s]+$/);
        expect(d).not.toContain("default:");
        expect(d).not.toContain("<");
        expect(d.startsWith("M")).toBe(true);
      }
    }
  });
});
