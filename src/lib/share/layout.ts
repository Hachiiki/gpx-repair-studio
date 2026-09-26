/**
 * Share card layout math (docs/MASTER_PLAN.md §O — Task 20, spec
 * revisions Tasks 21–23; this revision implements Task 23's reference
 * measurements, which supersede the Task 22 derivation).
 *
 * One authoritative derivation of every rect/line/baseline on the
 * 1080×1920 (9:16) Strava-style share card, in card units:
 *
 *   ┌───────────────────────────────────────────┐
 *   │ #000000 background (opaque)               │
 *   │ ┌───────────────────────────────────────┐ │
 *   │ │ route, contained (incl. 16px casing)  │ │ ← visible box
 *   │ │ x 64–1012, y 219–1190                 │ │   948×971
 *   │ └───────────────────────────────────────┘ │
 *   ├────────────── 90px ───────────────────────┤ ← 1190
 *   │           STRAVA ink 330×55               │ ← top 1280
 *   ├────────────── 87px ───────────────────────┤ ← 1335
 *   │   Distance      Pace        Time          │ ← 1422–1515.25
 *   ├───────────── ≈90px (89.75) ───────────────┤
 *   │           [shoe, 104 slot]                │ ← 1605–1709
 *   │                                           │
 *   │            ~211px empty below             │
 *   └───────────────────────────────────────────┘
 *
 * Every anchor is a MEASURED constant from the reference card, pinned
 * exactly (the lesson of Tasks 21–22: follow the reference's numbers,
 * do not re-derive them):
 *
 *   - route: the visible drawing — geometry plus its 16px casing —
 *     stays inside x 64–1012, y 219–1190 (948×971, "contain",
 *     aspect preserved, centered); the geometry is projected into the
 *     box inset by half the casing (8px) so the painted ink cannot
 *     cross it;
 *   - STRAVA wordmark: ink 330 wide × 55 tall, top 1280, centered
 *     (x 375–705). The traced artwork's ink is ~4.45:1 while the
 *     reference's wordmark is ~6:1, so the ink is mapped
 *     NON-UNIFORMLY onto the box — a deliberate squash that also
 *     moves the trace toward the real mark's flatness;
 *   - stats: label 29px SemiBold over value 40px ExtraBold, 9px
 *     between the lines, row top 1422, column centers pinned at
 *     x 220 / 540 / 857 (text centered per column);
 *   - shoe: 104×104 slot, top 1605, ink contained (aspect preserved)
 *     and centered in the slot;
 *   - background: solid #000000 — the PNG is fully opaque.
 *
 * The vertical rhythm those anchors imply (asserted by tests, not
 * re-derived): route bottom 1190 —90→ logo 1280 —87→ stats 1422
 * (93.25 tall) —89.75→ shoe slot 1605 → 1709, leaving 211px empty.
 *
 * Pure numbers so tests can pin every position; lib/share/render.ts
 * only executes them.
 */

/** The card's aspect box (9:16). */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

/**
 * The route's visible box — the reference card's measured bounds for
 * the route drawing INCLUDING its casing stroke ("target route width
 * ~948, height ~971"). The projected geometry is contained in the box
 * inset by half the casing so the painted ink stays inside it.
 */
export const SHARE_CARD_ROUTE_BOX = {
  x: 64,
  y: 219,
  width: 948,
  height: 971,
} as const;

/**
 * The STRAVA wordmark's ink box: 330 wide, 55 tall, top edge at 1280,
 * horizontally centered (x 375–705, centerX 540) — exactly as
 * measured on the reference card.
 */
export const SHARE_CARD_LOGO_INK_BOX = {
  x: 375,
  y: 1280,
  width: 330,
  height: 55,
} as const;

/**
 * The stats trio's anchors: the label line-box's top edge, the three
 * measured column centers, and the explicit label→value gap.
 */
export const SHARE_CARD_STATS_ANCHORS = {
  /** The label line-box's top edge (the row's top). */
  top: 1422,
  /** Horizontal centers of the Distance / Pace / Time columns. */
  columnCenters: [220, 540, 857] as const,
  /** Gap between the label line-box's bottom and the value's top. */
  labelToValue: 9,
} as const;

/** The shoe icon's square slot: 104×104, top edge at 1605, centered. */
export const SHARE_CARD_ICON_SLOT = {
  x: 488,
  y: 1605,
  size: 104,
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
  label: { size: 29, weight: 600, letterSpacingEm: 0.04, lineHeight: 1.25 },
  value: { size: 40, weight: 800, letterSpacingEm: 0, lineHeight: 1.2 },
} as const;

/** Brand colors from the spec. */
export const SHARE_CARD_COLORS = {
  /** The card's solid background — the PNG is fully opaque. */
  background: "#000000",
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

/** The stats trio's labels, in column order. */
export const SHARE_CARD_STAT_LABELS = ["Distance", "Pace", "Time"] as const;

/**
 * An artwork's measurable geometry as the layout consumes it (see
 * lib/share/artwork.ts — the viewBox plus the paths' ink bounds,
 * both in viewBox units).
 */
export type ArtworkMetrics = {
  viewBoxWidth: number;
  viewBoxHeight: number;
  ink: { x: number; y: number; width: number; height: number };
};

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
  /** The route's visible allowance (the spec box; nothing drawn of it). */
  routeBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * The box the route geometry is fitted into (contain) — the spec
   * box inset by half the casing width, so the stroked ink (geometry
   * + casing) never crosses the visible box.
   */
  routeFitBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * The wordmark's painter rect — the artwork's viewBox mapped so its
   * INK lands exactly on the spec's 330×55 box (x and y scales are
   * independent by design: the reference wordmark is flatter than
   * the trace). The rect itself is invisible scaffolding; only the
   * ink it places is drawn.
   */
  logoRect: { x: number; y: number; width: number; height: number };
  /** The spec's logo ink box (where the wordmark's ink lands). */
  logoInkRect: { x: number; y: number; width: number; height: number };
  /** The three stats columns, in label order. */
  statsColumns: readonly StatsColumnLayout[];
  /** The stats row's top edge (the label line-box top). */
  statsTop: number;
  /** The stats row's bottom edge (the value line-box bottom). */
  statsBottom: number;
  /**
   * The shoe's painter rect — the artwork's viewBox mapped so its
   * ink is CONTAINED (aspect preserved) and centered in the slot.
   * Like the logo rect, invisible scaffolding.
   */
  iconRect: { x: number; y: number; width: number; height: number };
  /** The spec's 104×104 slot. */
  iconSlotRect: { x: number; y: number; width: number; height: number };
  /** Where the shoe's ink actually lands (contained in the slot). */
  iconInkRect: { x: number; y: number; width: number; height: number };
  /** The stack's bottom edge (the shoe slot's bottom, 1709). */
  contentBottom: number;
}

/**
 * Derive the full layout from the reference anchors plus the two
 * artworks' measurable geometry (viewBox + ink bounds — passed in so
 * this module stays artwork-agnostic and testable against spec
 * numbers alone).
 */
export function computeShareCardLayout(options: {
  logo: ArtworkMetrics;
  icon: ArtworkMetrics;
}): ShareCardLayout {
  const { logo, icon } = options;
  const w = SHARE_CARD_WIDTH;

  // --- Route: the geometry is contained in the visible box inset by
  // half the casing, so geometry + stroke stays within the measured
  // bounds (x 64–1012, y 219–1190) no matter which dimension binds.
  const inset = SHARE_CARD_ROUTE_STROKE.casingWidth / 2;
  const routeBox = { ...SHARE_CARD_ROUTE_BOX };
  const routeFitBox = {
    x: routeBox.x + inset,
    y: routeBox.y + inset,
    width: routeBox.width - 2 * inset,
    height: routeBox.height - 2 * inset,
  };

  // --- Logo: the ink is STRETCHED onto the spec's box (independent
  // x/y scales). The viewBox rect that achieves this is the box
  // expanded by the ink's offset from the viewBox origin, scaled per
  // axis — pure affine bookkeeping; the rect is never seen, only the
  // ink it places.
  const logoInkRect = { ...SHARE_CARD_LOGO_INK_BOX };
  const logoScaleX = logoInkRect.width / logo.ink.width;
  const logoScaleY = logoInkRect.height / logo.ink.height;
  const logoRect = {
    x: logoInkRect.x - logo.ink.x * logoScaleX,
    y: logoInkRect.y - logo.ink.y * logoScaleY,
    width: logo.viewBoxWidth * logoScaleX,
    height: logo.viewBoxHeight * logoScaleY,
  };

  // --- Stats: the anchor's top, the pinned column centers, label
  // line, 9px, value line.
  const { label, value } = SHARE_CARD_TYPE;
  const labelLineHeight = label.size * label.lineHeight;
  const valueLineHeight = value.size * value.lineHeight;
  const statsTop = SHARE_CARD_STATS_ANCHORS.top;
  const statsColumns: StatsColumnLayout[] =
    SHARE_CARD_STATS_ANCHORS.columnCenters.map((centerX) => ({
      centerX,
      labelCenterY: statsTop + labelLineHeight / 2,
      valueCenterY:
        statsTop +
        labelLineHeight +
        SHARE_CARD_STATS_ANCHORS.labelToValue +
        valueLineHeight / 2,
    }));
  const statsBottom =
    statsTop +
    labelLineHeight +
    SHARE_CARD_STATS_ANCHORS.labelToValue +
    valueLineHeight;

  // --- Shoe: the ink is CONTAINED in the square slot (uniform scale,
  // the binding dimension wins) and centered in it.
  const slot = SHARE_CARD_ICON_SLOT;
  const iconSlotRect = {
    x: slot.x,
    y: slot.y,
    width: slot.size,
    height: slot.size,
  };
  const iconScale = Math.min(
    slot.size / icon.ink.width,
    slot.size / icon.ink.height,
  );
  const iconInkWidth = icon.ink.width * iconScale;
  const iconInkHeight = icon.ink.height * iconScale;
  const iconInkRect = {
    x: slot.x + (slot.size - iconInkWidth) / 2,
    y: slot.y + (slot.size - iconInkHeight) / 2,
    width: iconInkWidth,
    height: iconInkHeight,
  };
  const iconRect = {
    x: iconInkRect.x - icon.ink.x * iconScale,
    y: iconInkRect.y - icon.ink.y * iconScale,
    width: icon.viewBoxWidth * iconScale,
    height: icon.viewBoxHeight * iconScale,
  };

  return {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    routeBox,
    routeFitBox,
    logoRect,
    logoInkRect,
    statsColumns,
    statsTop,
    statsBottom,
    iconRect,
    iconSlotRect,
    iconInkRect,
    contentBottom: slot.y + slot.size,
  };
}
