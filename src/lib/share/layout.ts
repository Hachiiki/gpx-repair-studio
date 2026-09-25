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
 *   ├───────────────────────────────┤ ← 65% line
 *   │        STRAVA logo (280px)    │
 *   │  Distance   Pace    Time      │ ← stats row (mt 24)
 *   │                               │
 *   │           [shoe icon]         │ ← 80% line
 *   │      (canvas stays empty)     │
 *   └───────────────────────────────┘
 *
 * The reference card's rhythm, verbatim: the lower UI cluster is NOT
 * bottom-anchored. The wordmark centers on the 65% line, the stats
 * row hangs 24px below it (compact — the reference never stretches
 * it), and the shoe icon centers on the 80% line. The gap between
 * the stat values and the icon is the reference's noticeable one
 * (~157px), and the canvas below the icon stays empty. The route
 * area is untouched: the top 60% with its paddings.
 *
 * Pure numbers so tests can pin every position; lib/share/render.ts
 * only executes them. Spec: the reference share card + the layout
 * correction brief (Task 20 follow-up).
 */

/** The card's aspect box (9:16). */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

/** 4px-base spacing tokens from the spec. */
export const SHARE_CARD_SPACING = {
  sidePadding: 48,
  topPadding: 64,
  statsColumnGap: 24,
  logoToStats: 24,
} as const;

/**
 * Where each group centers vertically — fractions of the card
 * height, read off the reference layout (the correction brief).
 */
export const SHARE_CARD_ANCHORS = {
  /** The STRAVA logo's center line: 65% down the 9:16 canvas. */
  logoCenterRatio: 0.65,
  /** The shoe icon's center line: the reference's lower-80% area. */
  iconCenterRatio: 0.8,
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
  /** The stats row's top edge (hangs `logoToStats` below the logo). */
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

  const contentWidth = w - 2 * side;

  // Logo: horizontally centered, vertically centered on the 65% line.
  const logoWidth = SHARE_CARD_LOGO_WIDTH;
  const logoHeight = logoWidth * logoAspectRatio;
  const logoRect = {
    x: (w - logoWidth) / 2,
    y: h * SHARE_CARD_ANCHORS.logoCenterRatio - logoHeight / 2,
    width: logoWidth,
    height: logoHeight,
  };

  // Stats row: label line + value line, compact 24px below the logo.
  const labelLineHeight =
    SHARE_CARD_TYPE.label.size * SHARE_CARD_TYPE.label.lineHeight;
  const valueLineHeight =
    SHARE_CARD_TYPE.value.size * SHARE_CARD_TYPE.value.lineHeight;
  const statsTop = logoRect.y + logoHeight + SHARE_CARD_SPACING.logoToStats;

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

  // Shoe icon: proportional inside its square slot, centered on the
  // 80% line — deliberately clear of the stats row (the reference's
  // noticeable gap), with empty canvas below it.
  const iconHeight = Math.min(
    SHARE_CARD_ICON_SIZE,
    SHARE_CARD_ICON_SIZE * iconAspectRatio,
  );
  const iconRect = {
    x: (w - SHARE_CARD_ICON_SIZE) / 2,
    y: h * SHARE_CARD_ANCHORS.iconCenterRatio - iconHeight / 2,
    width: SHARE_CARD_ICON_SIZE,
    height: iconHeight,
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
