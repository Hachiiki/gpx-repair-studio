/**
 * Share card layout math (docs/MASTER_PLAN.md §O — Task 20).
 *
 * One authoritative derivation of every rect/line/baseline on the
 * 1080×1920 (9:16) Strava-style share card, in card units:
 *
 *   ┌───────────────────────────────┐
 *   │ (64px top padding)            │
 *   │   route area — 60% height,    │
 *   │   48px side padding           │
 *   │                               │
 *   ├───────────────────────────────┤ ← breathing room
 *   │        STRAVA logo (280px)    │
 *   │  Distance   Pace    Time      │ ← stats row (mt 24)
 *   │           [shoe icon]         │ ← 48px (mt 28)
 *   └───────────────────────────────┘ ← 64px bottom padding
 *
 * The bottom cluster is bottom-anchored (the Strava story-card rhythm):
 * shoe sits 64px above the card's bottom edge, the stats row and logo
 * stack above it with the spec's 28px / 24px margins, and the leftover
 * vertical space stays between the map area and the logo — the one
 * deliberately large "between groups" gap.
 *
 * Pure numbers so tests can pin every position; lib/share/render.ts
 * only executes them. Spec: user-provided share-card brief (Task 20).
 */

/** The card's aspect box (9:16). */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

/** 4px-base spacing tokens from the spec. */
export const SHARE_CARD_SPACING = {
  sidePadding: 48,
  topPadding: 64,
  bottomPadding: 64,
  statsColumnGap: 24,
  logoToStats: 24,
  statsToIcon: 28,
} as const;

/** Typography from the spec (Montserrat via lib/share/fonts.ts). */
export const SHARE_CARD_TYPE = {
  fontFamily: "Montserrat",
  label: { size: 15, weight: 600, letterSpacingEm: 0.04, lineHeight: 1.25 },
  value: { size: 22, weight: 800, letterSpacingEm: 0, lineHeight: 1.2 },
} as const;

/** Brand colors from the spec. */
export const SHARE_CARD_COLORS = {
  route: "#FC4C02",
  foreground: "#FFFFFF",
} as const;

/** The route stroke at 1080px width. */
export const SHARE_CARD_ROUTE_STROKE = {
  width: 10,
  lineJoin: "round" as const,
  lineCap: "round" as const,
};

/** The STRAVA wordmark's rendered width (SVG scales to this). */
export const SHARE_CARD_LOGO_WIDTH = 280;

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
  /** The route's fit box (top 60% area, padded). */
  routeBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** The logo's rect (width 280, proportional height). */
  logoRect: { x: number; y: number; width: number; height: number };
  /** The three stats columns, in label order. */
  statsColumns: readonly StatsColumnLayout[];
  /** The stats row's top edge (logo sits `logoToStats` above it). */
  statsTop: number;
  /** The shoe icon's rect (proportional inside the square slot). */
  iconRect: { x: number; y: number; width: number; height: number };
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

  // Route area: the top 60% of the card with 64px top padding.
  const routeBox = {
    x: side,
    y: SHARE_CARD_SPACING.topPadding,
    width: w - 2 * side,
    height: h * 0.6 - SHARE_CARD_SPACING.topPadding,
  };

  // Bottom cluster, anchored to the bottom edge with 64px padding.
  const contentWidth = w - 2 * side;

  // Shoe: proportional inside its square slot, bottom-aligned.
  const iconSlotHeight = SHARE_CARD_ICON_SIZE;
  const iconHeight = Math.min(
    SHARE_CARD_ICON_SIZE,
    SHARE_CARD_ICON_SIZE * iconAspectRatio,
  );
  const iconRect = {
    x: (w - SHARE_CARD_ICON_SIZE) / 2,
    y: h - SHARE_CARD_SPACING.bottomPadding - iconSlotHeight,
    width: SHARE_CARD_ICON_SIZE,
    height: iconHeight,
  };

  // Stats row: label line + value line, `statsToIcon` above the shoe.
  const labelLineHeight =
    SHARE_CARD_TYPE.label.size * SHARE_CARD_TYPE.label.lineHeight;
  const valueLineHeight =
    SHARE_CARD_TYPE.value.size * SHARE_CARD_TYPE.value.lineHeight;
  const statsHeight = labelLineHeight + valueLineHeight;
  const statsTop = iconRect.y - SHARE_CARD_SPACING.statsToIcon - statsHeight;

  const columns = 3;
  const columnWidth =
    (contentWidth - SHARE_CARD_SPACING.statsColumnGap * (columns - 1)) /
    columns;
  const statsColumns: StatsColumnLayout[] = Array.from(
    { length: columns },
    (_, index) => ({
      centerX:
        side +
        columnWidth / 2 +
        index * (columnWidth + SHARE_CARD_SPACING.statsColumnGap),
      labelCenterY: statsTop + labelLineHeight / 2,
      valueCenterY: statsTop + labelLineHeight + valueLineHeight / 2,
    }),
  );

  // Logo: proportional height, `logoToStats` above the stats row.
  const logoWidth = SHARE_CARD_LOGO_WIDTH;
  const logoHeight = logoWidth * logoAspectRatio;
  const logoRect = {
    x: (w - logoWidth) / 2,
    y: statsTop - SHARE_CARD_SPACING.logoToStats - logoHeight,
    width: logoWidth,
    height: logoHeight,
  };

  return {
    width: w,
    height: h,
    routeBox,
    logoRect,
    statsColumns,
    statsTop,
    iconRect,
  };
}
