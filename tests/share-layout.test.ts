/**
 * Share card layout + artwork tests (Task 22 spec revision) —
 * lib/share/layout.ts, lib/share/artwork.ts.
 *
 * Pins every number of the revised spec: the 1080×1920 canvas, the
 * map box (route capped at 58% of the card height, wrapped in 15%
 * CSS-style fit padding of the box width), the exact gap chain
 * (map −32px→ logo −20px→ stats −28px→ shoe), the 85%-wide stats row
 * with 4px label→value spacing, the two-pass casing widths, and the
 * artwork metadata (viewBoxes, path counts, source transforms — the
 * paste-cleanup contract).
 *
 * The spec's own closure check: 1472.8 (map box bottom) + 32 +
 * 73.8 (270px logo) + 20 + 49.15 (stats) + 28 + 48 (shoe slot) =
 * 1723.75 = 89.8% of 1920 — the "content ends at 90% height, no
 * spacer at bottom" outcome, derived rather than anchored.
 */

import { describe, expect, it } from "vitest";
import {
  SHOE_ICON_ARTWORK,
  STRAVA_LOGO_ARTWORK,
  artworkAspectRatio,
} from "@/lib/share/artwork";
import {
  SHARE_CARD_COLORS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_ICON_SIZE,
  SHARE_CARD_LOGO_WIDTH,
  SHARE_CARD_ROUTE_STROKE,
  SHARE_CARD_SIMPLIFY_TOLERANCE_M,
  SHARE_CARD_SPACING,
  SHARE_CARD_STAT_LABELS,
  SHARE_CARD_TYPE,
  SHARE_CARD_WIDTH,
  computeShareCardLayout,
} from "@/lib/share/layout";

const LAYOUT = computeShareCardLayout({
  logoAspectRatio: artworkAspectRatio(STRAVA_LOGO_ARTWORK),
  iconAspectRatio: artworkAspectRatio(SHOE_ICON_ARTWORK),
});

describe("share card canvas + spacing tokens (the spec)", () => {
  it("is 1080×1920 (9:16)", () => {
    expect(SHARE_CARD_WIDTH).toBe(1080);
    expect(SHARE_CARD_HEIGHT).toBe(1920);
  });

  it("uses the spec's tokens", () => {
    expect(SHARE_CARD_SPACING).toEqual({
      sidePadding: 48,
      topPadding: 64,
      fitPaddingRatio: 0.15,
      mapHeightRatio: 0.58,
      mapToLogo: 32,
      logoToStats: 20,
      statsToIcon: 28,
      statsRowWidthRatio: 0.85,
      labelToValue: 4,
    });
  });

  it("caps simplification at the spec's 5m jitter-preserving tolerance", () => {
    expect(SHARE_CARD_SIMPLIFY_TOLERANCE_M).toBe(5);
  });

  it("uses Montserrat 600 labels / 800 values with the spec's tracking", () => {
    expect(SHARE_CARD_TYPE.fontFamily).toBe("Montserrat");
    expect(SHARE_CARD_TYPE.label).toEqual({
      size: 15,
      weight: 600,
      letterSpacingEm: 0.04,
      lineHeight: 1.25,
    });
    expect(SHARE_CARD_TYPE.value).toEqual({
      size: 22,
      weight: 800,
      letterSpacingEm: 0,
      lineHeight: 1.2,
    });
  });

  it("labels the trio Distance / Pace / Time in column order", () => {
    expect(SHARE_CARD_STAT_LABELS).toEqual(["Distance", "Pace", "Time"]);
  });

  it("colors: orange route over black casing, white foreground", () => {
    expect(SHARE_CARD_COLORS).toEqual({
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
  it("wraps the 58% route cap in 15% CSS-style fit padding", () => {
    const pad = 0.15 * (1080 - 2 * 48); // 147.6
    expect(LAYOUT.routeBox).toEqual({
      x: 48,
      y: 64,
      width: 1080 - 96,
      height: 2 * pad + 1920 * 0.58, // 1408.8 → box bottom 1472.8
    });
    expect(LAYOUT.routeFitBox).toEqual({
      x: 48 + pad,
      y: 64 + pad,
      width: 1080 - 96 - 2 * pad,
      height: 1920 * 0.58, // the contained route never exceeds 58%
    });
  });

  it("places the 270px logo 32px below the map box, centered", () => {
    expect(LAYOUT.logoRect.width).toBe(SHARE_CARD_LOGO_WIDTH);
    expect(LAYOUT.logoRect.width).toBe(270);
    // Proportional height: 270 × 164/600.
    expect(LAYOUT.logoRect.height).toBeCloseTo((270 * 164) / 600, 10);
    expect(LAYOUT.logoRect.x).toBeCloseTo((1080 - 270) / 2, 10);
    const mapBottom = LAYOUT.routeBox.y + LAYOUT.routeBox.height;
    expect(LAYOUT.logoRect.y).toBeCloseTo(mapBottom + 32, 10);
  });

  it("hangs the stats row 20px below the logo with a 4px label→value gap", () => {
    const labelLine = 15 * 1.25;
    const valueLine = 22 * 1.2;
    expect(LAYOUT.statsTop).toBeCloseTo(
      LAYOUT.logoRect.y + LAYOUT.logoRect.height + 20,
      10,
    );
    for (const column of LAYOUT.statsColumns) {
      expect(column.labelCenterY).toBeCloseTo(
        LAYOUT.statsTop + labelLine / 2,
        10,
      );
      // valueCenterY − labelLineBottom = 4 + valueLine/2: the explicit gap.
      expect(
        column.valueCenterY -
          (LAYOUT.statsTop + labelLine) -
          valueLine / 2,
      ).toBeCloseTo(4, 10);
      expect(column.valueCenterY).toBeGreaterThan(column.labelCenterY);
    }
  });

  it("spreads three centered columns across the 85% row", () => {
    expect(LAYOUT.statsColumns).toHaveLength(3);
    const rowWidth = 1080 * 0.85; // 918
    const rowX = (1080 - rowWidth) / 2; // 81
    const centers = LAYOUT.statsColumns.map((c) => c.centerX);
    // Evenly distributed thirds: 81 + 153 / +459 / +765.
    expect(centers[0]).toBeCloseTo(rowX + rowWidth / 6, 10);
    expect(centers[1]).toBeCloseTo(540, 10);
    expect(centers[2]).toBeCloseTo(1080 - rowX - rowWidth / 6, 10);
    // The middle column is the card's horizontal center.
    expect(centers[1]).toBe(SHARE_CARD_WIDTH / 2);
  });

  it("places the 48×48 shoe 28px below the stats row, centered", () => {
    const labelLine = 15 * 1.25;
    const valueLine = 22 * 1.2;
    const statsBottom =
      LAYOUT.statsTop + labelLine + 4 + valueLine;
    expect(LAYOUT.iconRect.x).toBeCloseTo((1080 - 48) / 2, 10);
    expect(LAYOUT.iconRect.width).toBe(SHARE_CARD_ICON_SIZE);
    // Proportional (letterboxed) height: 48 × 211/213, centered in slot.
    expect(LAYOUT.iconRect.height).toBeCloseTo((48 * 211) / 213, 10);
    const slotTop = statsBottom + 28;
    expect(LAYOUT.iconRect.y).toBeCloseTo(
      slotTop + (48 - (48 * 211) / 213) / 2,
      10,
    );
  });

  it("ends the content at ≈90% of the canvas with nothing below", () => {
    // The spec's closure: 1472.8 + 32 + 73.8 + 20 + 49.15 + 28 + 48.
    expect(LAYOUT.contentBottom).toBeCloseTo(
      (64 + 2 * 147.6 + 1920 * 0.58) + 32 + (270 * 164) / 600 + 20 +
        (15 * 1.25 + 4 + 22 * 1.2) + 28 + 48,
      10,
    );
    expect(LAYOUT.contentBottom).toBeCloseTo(1723.75, 6);
    // "Content ends at 90% height" — within half a percent of it.
    expect(LAYOUT.contentBottom / SHARE_CARD_HEIGHT).toBeGreaterThan(0.895);
    expect(LAYOUT.contentBottom / SHARE_CARD_HEIGHT).toBeLessThan(0.905);
    // The shoe (the last element) sits above the content bottom, and
    // no spacer follows: the slot's bottom IS the content's end.
    expect(
      LAYOUT.iconRect.y + LAYOUT.iconRect.height,
    ).toBeLessThanOrEqual(LAYOUT.contentBottom + 0.5);
    expect(LAYOUT.contentBottom).toBeLessThan(SHARE_CARD_HEIGHT);
  });

  it("derives the layout from passed aspect ratios (artwork-agnostic)", () => {
    const square = computeShareCardLayout({
      logoAspectRatio: 1,
      iconAspectRatio: 1,
    });
    expect(square.logoRect.height).toBe(270);
    expect(square.iconRect.height).toBe(48);
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
