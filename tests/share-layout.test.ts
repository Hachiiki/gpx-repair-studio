/**
 * Share card layout + artwork tests (Task 20) — lib/share/layout.ts,
 * lib/share/artwork.ts.
 *
 * Pins every number of the user's spec: the 1080×1920 canvas, the
 * 48/64px paddings, the bottom-anchored cluster (logo → stats → shoe
 * with 24/28px gaps and 64px bottom padding), the three equal stat
 * columns, and the artwork metadata (viewBoxes, path counts, source
 * transforms — the paste-cleanup contract).
 */

import { describe, expect, it } from "vitest";
import {
  SHOE_ICON_ARTWORK,
  STRAVA_LOGO_ARTWORK,
  artworkAspectRatio,
} from "@/lib/share/artwork";
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_ICON_SIZE,
  SHARE_CARD_LOGO_WIDTH,
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

  it("uses the spec's 4px-base tokens", () => {
    expect(SHARE_CARD_SPACING).toEqual({
      sidePadding: 48,
      topPadding: 64,
      bottomPadding: 64,
      statsColumnGap: 24,
      logoToStats: 24,
      statsToIcon: 28,
    });
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
});

describe("computeShareCardLayout", () => {
  it("routes into the top 60% area with 48px sides and 64px top", () => {
    expect(LAYOUT.routeBox).toEqual({
      x: 48,
      y: 64,
      width: 1080 - 96,
      height: 1920 * 0.6 - 64,
    });
  });

  it("bottom-anchors the shoe at 64px, in its 48px slot", () => {
    expect(LAYOUT.iconRect.y).toBeCloseTo(1920 - 64 - 48, 10);
    expect(LAYOUT.iconRect.width).toBe(SHARE_CARD_ICON_SIZE);
    // Proportional (letterboxed) height: 48 × 211/213.
    expect(LAYOUT.iconRect.height).toBeCloseTo((48 * 211) / 213, 10);
    expect(LAYOUT.iconRect.x).toBeCloseTo((1080 - 48) / 2, 10);
  });

  it("stacks the stats row 28px above the shoe", () => {
    const labelLine = 15 * 1.25;
    const valueLine = 22 * 1.2;
    expect(LAYOUT.statsTop).toBeCloseTo(
      LAYOUT.iconRect.y - 28 - (labelLine + valueLine),
      10,
    );
  });

  it("lays out three equal columns with a 24px gap, centered on 540", () => {
    expect(LAYOUT.statsColumns).toHaveLength(3);
    const centers = LAYOUT.statsColumns.map((c) => c.centerX);
    // (984 − 48) / 3 = 312 per column; centers 204 / 540 / 876.
    expect(centers[0]).toBeCloseTo(204, 10);
    expect(centers[1]).toBeCloseTo(540, 10);
    expect(centers[2]).toBeCloseTo(876, 10);
    // The middle column is the card's horizontal center.
    expect(centers[1]).toBe(SHARE_CARD_WIDTH / 2);
    // Label sits above value inside the row.
    for (const column of LAYOUT.statsColumns) {
      expect(column.valueCenterY).toBeGreaterThan(column.labelCenterY);
      expect(column.labelCenterY).toBeGreaterThan(LAYOUT.statsTop);
    }
  });

  it("places the 280px logo 24px above the stats row, horizontally centered", () => {
    expect(LAYOUT.logoRect.width).toBe(SHARE_CARD_LOGO_WIDTH);
    expect(LAYOUT.logoRect.width).toBe(280);
    // Proportional height: 280 × 164/600.
    expect(LAYOUT.logoRect.height).toBeCloseTo((280 * 164) / 600, 10);
    expect(LAYOUT.logoRect.x).toBeCloseTo((1080 - 280) / 2, 10);
    expect(LAYOUT.logoRect.y + LAYOUT.logoRect.height).toBeCloseTo(
      LAYOUT.statsTop - 24,
      10,
    );
  });

  it("keeps the breathing room between the map area and the logo", () => {
    const mapBottom = LAYOUT.routeBox.y + LAYOUT.routeBox.height;
    expect(LAYOUT.logoRect.y - mapBottom).toBeGreaterThan(400);
  });

  it("derives the layout from passed aspect ratios (artwork-agnostic)", () => {
    const square = computeShareCardLayout({
      logoAspectRatio: 1,
      iconAspectRatio: 1,
    });
    expect(square.logoRect.height).toBe(280);
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
