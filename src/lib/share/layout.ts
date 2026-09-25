/**
 * Share card layout math (docs/MASTER_PLAN.md §O — Task 20, spec
 * revision Task 22).
 *
 * One authoritative derivation of every rect/line/baseline on the
 * 1080×1920 (9:16) Strava-style share card, in card units:
 *
 *   ┌───────────────────────────────┐
 *   │ 64px top pad                 │
 *   │ ┌───────────────────────────┐ │
 *   │ │ 15% fit padding (147.6px) │ │
 *   │ │  ┌─────────────────────┐  │ │ ← map box
 *   │ │  │  the route, contained │  │ │   (64 → 1472.8)
 *   │ │  │  (≤ 58% of the card)  │  │ │
 *   │ │  └─────────────────────┘  │ │
 *   │ └───────────────────────────┘ │
 *   ├──── 32px ─────────────────────┤ ← map box bottom (1472.8)
 *   │        STRAVA logo (270px)    │
 *   ├──── 20px ─────────────────────┤
 *   │  Distance   Pace    Time      │ ← stats row (85% wide)
 *   ├──── 28px ─────────────────────┤
 *   │           [shoe 48×48]        │
 *   └───────────────────────────────┘ ← content ends ≈ 90% (1723.75)
 *
 * The spec, verbatim: the map (the contained route drawing) is
 * limited to 58% of the card height and rendered object-fit-style
 * (aspect preserved) with 15% fit-bounds padding around it — the
 * padding is CSS-percentage style, 15% of the map box's width
 * (984px → 147.6px) on all four sides, so the box around the route
 * spans 64 → 1472.8. Below it the stack flows with the spec's exact
 * gaps — 32px to the 270px logo, 20px to the stats row (85% of the
 * card wide, three evenly distributed centered columns, 4px between
 * label and value), 28px to the 48×48 shoe — and the content ends
 * at ≈90% of the canvas with nothing below it (no spacer, no
 * bottom anchor). The closure is exact: 1472.8 + 32 + 73.8 + 20 +
 * 49.15 + 28 + 48 = 1723.75 = 89.8% of 1920.
 *
 * Pure numbers so tests can pin every position; lib/share/render.ts
 * only executes them.
 */

/** The card's aspect box (9:16). */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

/** Spacing and ratio tokens from the spec (4px-base gaps). */
export const SHARE_CARD_SPACING = {
  /** The map box's side padding (48px each side of the card). */
  sidePadding: 48,
  /** The map box's top padding. */
  topPadding: 64,
  /**
   * Fit-bounds padding around the contained route, as a fraction of
   * the map box's width (CSS `padding: 15%` semantics — the same
   * absolute inset on all four sides).
   */
  fitPaddingRatio: 0.15,
  /**
   * The height the contained route (the map drawing) may not
   * exceed, as a fraction of the card height.
   */
  mapHeightRatio: 0.58,
  /** Gap: map box bottom → STRAVA logo. */
  mapToLogo: 32,
  /** Gap: logo → stats row. */
  logoToStats: 20,
  /** Gap: stats row → shoe icon. */
  statsToIcon: 28,
  /** The stats row's width as a fraction of the card width. */
  statsRowWidthRatio: 0.85,
  /** The explicit gap between the label line and the value line. */
  labelToValue: 4,
} as const;

/**
 * Route simplification: GPS jitter is part of the recording and
 * stays on the card; decimation (for huge files) is capped at 5
 * metres of perpendicular deviation — anything larger must survive.
 */
export const SHARE_CARD_SIMPLIFY_TOLERANCE_M = 5;

/** Typography from the spec (Montserrat via lib/share/fonts.ts). */
export const SHARE_CARD_TYPE = {
  fontFamily: "Montserrat",
  label: { size: 15, weight: 600, letterSpacingEm: 0.04, lineHeight: 1.25 },
  value: { size: 22, weight: 800, letterSpacingEm: 0, lineHeight: 1.2 },
} as const;

/** Brand colors from the spec. */
export const SHARE_CARD_COLORS = {
  /** The route's top pass. */
  route: "#FC4C02",
  /** The route's casing (under-stroke) pass. */
  casing: "#000000",
  /** The wordmark, stats, and shoe icon. */
  foreground: "#FFFFFF",
} as const;

/** The route's two-pass stroke (casing under, route over). */
export const SHARE_CARD_ROUTE_STROKE = {
  /** The orange line's width at 1080px card width. */
  width: 10,
  /** The black casing's width — 3px of outline on each side. */
  casingWidth: 16,
  lineJoin: "round" as const,
  lineCap: "round" as const,
};

/** The STRAVA wordmark's rendered width (SVG scales to this). */
export const SHARE_CARD_LOGO_WIDTH = 270;

/** The shoe icon's square slot (SVG scales proportionally into it). */
export const SHARE_CARD_ICON_SIZE = 48;

/** The stats trio's labels, in column order. */
export const SHARE_CARD_STAT_LABELS = ["Distance", "Pace", "Time"] as const;

/** One stats column's geometry. */
export interface StatsColumnLayout {
  /** Horizontal center of the column (text is center-aligned). */
  centerX: number;
  /** The label line's vertical center. */
  labelCenterY: number;
  /** The value line's vertical center. */
  valueCenterY: number;
}

/** Every computed position the painter needs. */
export interface ShareCardLayout {
  width: number;
  height: number;
  /** The map box (the route's padded container; nothing is drawn of it). */
  routeBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * The box the route is fitted into (object-fit: contain) — the
   * map box inset by the 15% fit padding on all four sides.
   */
  routeFitBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** The logo's rect (270px wide, proportional height). */
  logoRect: { x: number; y: number; width: number; height: number };
  /** The three stats columns, in label order. */
  statsColumns: readonly StatsColumnLayout[];
  /** The stats row's top edge (the label line-box top). */
  statsTop: number;
  /** The shoe icon's rect (proportional inside the square slot). */
  iconRect: { x: number; y: number; width: number; height: number };
  /** The stack's bottom edge (the shoe slot's bottom, ≈90% down). */
  contentBottom: number;
}

/**
 * Derive the full layout. `logoAspectRatio` and `iconAspectRatio` are
 * height/width of the source SVGs (the logo is 164/600, the shoe
 * 211/213) — passed in so this module stays artwork-agnostic and the
 * values stay testable against the spec numbers alone.
 */
export function computeShareCardLayout(options: {
  logoAspectRatio: number;
  iconAspectRatio: number;
}): ShareCardLayout {
  const { logoAspectRatio, iconAspectRatio } = options;
  const w = SHARE_CARD_WIDTH;
  const h = SHARE_CARD_HEIGHT;
  const side = SHARE_CARD_SPACING.sidePadding;

  // Map box: the route's allowance (≤ 58% of the card) wrapped in the
  // 15% fit padding on all four sides (CSS semantics — one inset,
  // derived from the box's width).
  const boxWidth = w - 2 * side;
  const fitPad = SHARE_CARD_SPACING.fitPaddingRatio * boxWidth;
  const routeHeight =
    2 * fitPad + SHARE_CARD_SPACING.mapHeightRatio * h;
  const routeBox = {
    x: side,
    y: SHARE_CARD_SPACING.topPadding,
    width: boxWidth,
    height: routeHeight,
  };
  const routeFitBox = {
    x: side + fitPad,
    y: SHARE_CARD_SPACING.topPadding + fitPad,
    width: boxWidth - 2 * fitPad,
    height: routeHeight - 2 * fitPad,
  };

  // Logo: 32px below the map box, horizontally centered.
  const logoWidth = SHARE_CARD_LOGO_WIDTH;
  const logoHeight = logoWidth * logoAspectRatio;
  const mapBottom = routeBox.y + routeBox.height;
  const logoRect = {
    x: (w - logoWidth) / 2,
    y: mapBottom + SHARE_CARD_SPACING.mapToLogo,
    width: logoWidth,
    height: logoHeight,
  };

  // Stats row: 20px below the logo — label line, 4px, value line.
  const labelLineHeight =
    SHARE_CARD_TYPE.label.size * SHARE_CARD_TYPE.label.lineHeight;
  const valueLineHeight =
    SHARE_CARD_TYPE.value.size * SHARE_CARD_TYPE.value.lineHeight;
  const statsTop =
    logoRect.y + logoHeight + SHARE_CARD_SPACING.logoToStats;

  // Three evenly distributed, text-centered columns across the row.
  const rowWidth = SHARE_CARD_SPACING.statsRowWidthRatio * w;
  const rowX = (w - rowWidth) / 2;
  const columnWidth = rowWidth / 3;
  const statsColumns: StatsColumnLayout[] = Array.from(
    { length: 3 },
    (_, index) => ({
      centerX: rowX + columnWidth * (index + 0.5),
      labelCenterY: statsTop + labelLineHeight / 2,
      valueCenterY:
        statsTop +
        labelLineHeight +
        SHARE_CARD_SPACING.labelToValue +
        valueLineHeight / 2,
    }),
  );

  // Shoe icon: 28px below the stats row, centered; the stack ends at
  // the slot's bottom edge — nothing is drawn below it.
  const statsBottom =
    statsTop +
    labelLineHeight +
    SHARE_CARD_SPACING.labelToValue +
    valueLineHeight;
  const iconHeight = Math.min(
    SHARE_CARD_ICON_SIZE,
    SHARE_CARD_ICON_SIZE * iconAspectRatio,
  );
  const iconSlotTop = statsBottom + SHARE_CARD_SPACING.statsToIcon;
  const iconRect = {
    x: (w - SHARE_CARD_ICON_SIZE) / 2,
    y: iconSlotTop + (SHARE_CARD_ICON_SIZE - iconHeight) / 2,
    width: SHARE_CARD_ICON_SIZE,
    height: iconHeight,
  };

  return {
    width: w,
    height: h,
    routeBox,
    routeFitBox,
    logoRect,
    statsColumns,
    statsTop,
    iconRect,
    contentBottom: iconSlotTop + SHARE_CARD_ICON_SIZE,
  };
}
