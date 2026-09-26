/**
 * Share card vector artwork (docs/MASTER_PLAN.md §O — Task 20).
 *
 * The STRAVA wordmark and the running-shoe icon, as path data. Source:
 * user-provided SVGs (Task 20 brief) — geometry kept verbatim, with the
 * paste artifacts cleaned up: a stray `default:` namespace prefix on
 * every element and a legacy SVG 1.0 DOCTYPE, neither of which survives
 * into Path2D drawing anyway.
 *
 * Both SVGs share the classic vector-font convention: a viewBox in
 * *small* units (the paths live in a 10× coordinate space) with a
 * group transform `translate(0, H) scale(0.1, -0.1)` that flips Y and
 * re-anchors it — the painter bakes exactly that transform in before
 * filling (see lib/share/render.ts).
 *
 * Pure data — no DOM, no Path2D construction here — so node-side tests
 * can validate the structure (path syntax, counts, aspect ratios)
 * without a browser.
 */

/** One source SVG's drawable content. */
export interface VectorArtwork {
  /** Viewport width in source units. */
  viewBoxWidth: number;
  /** Viewport height in source units. */
  viewBoxHeight: number;
  /** The group transform baked into the source SVG. */
  sourceTransform: { translateY: number; scale: number };
  /** Path `d` strings, in source (pre-transform) coordinates. */
  paths: readonly string[];
}

/**
 * The STRAVA wordmark. Source SVG: 600×164 viewbox, wordmark paths
 * (S-T-R-A-V-A with the chevron A/V ligature), rendered white with
 * its ink stretched onto the card's 330×55 logo box (Task 23).
 */
export const STRAVA_LOGO_ARTWORK: VectorArtwork = {
  viewBoxWidth: 600,
  viewBoxHeight: 164,
  sourceTransform: { translateY: 164, scale: 0.1 },
  paths: [
    "M3301 939 c-140 -280 -258 -509 -261 -509 -7 0 -170 233 -170 242 0 3 23 19 50 37 193 125 179 438 -25 543 -88 46 -126 51 -437 55 l-298 5 0 -486 0 -486 160 0 160 0 0 145 0 145 34 0 c32 0 37 -5 116 -130 45 -72 89 -137 97 -145 12 -13 64 -15 309 -15 l295 0 110 225 c61 124 113 223 117 221 4 -2 56 -104 117 -225 l110 -221 162 0 c90 0 163 2 163 4 0 2 -125 251 -278 554 l-277 549 -254 -508z m-618 88 c45 -19 62 -44 61 -89 -2 -76 -70 -110 -202 -100 l-62 4 0 99 0 99 85 0 c49 0 99 -6 118 -13z",
    "M4930 904 c-151 -300 -276 -549 -278 -554 -2 -6 60 -10 160 -10 l163 0 114 227 113 228 114 -228 114 -227 165 0 c91 0 165 1 165 3 0 1 -125 250 -278 554 l-277 552 -275 -545z",
    "M591 1299 c-176 -31 -291 -151 -293 -302 -1 -106 45 -175 155 -227 56 -27 91 -38 266 -80 91 -21 111 -33 111 -61 0 -27 -31 -39 -97 -39 -101 0 -248 47 -304 97 -15 13 -26 4 -102 -84 -81 -92 -85 -99 -69 -116 30 -33 194 -106 275 -122 91 -18 281 -21 351 -5 116 26 207 95 248 187 16 36 19 62 16 123 -3 68 -7 84 -33 122 -54 76 -156 123 -347 162 -134 27 -175 55 -136 94 32 32 211 2 304 -52 l42 -23 75 101 76 101 -22 19 c-97 81 -356 134 -516 105z",
    "M1157 1303 c-3 -5 -3 -65 0 -136 l6 -127 133 0 134 0 0 -350 0 -350 160 0 160 0 0 350 0 350 145 0 146 0 -3 133 -3 132 -437 3 c-240 1 -439 -1 -441 -5z",
    "M3884 1218 c24 -51 100 -208 168 -348 68 -140 167 -346 219 -457 51 -112 96 -203 99 -203 3 0 52 100 109 223 58 122 176 368 263 546 87 178 158 326 158 327 0 2 -71 4 -157 4 l-158 0 -105 -225 c-58 -124 -107 -225 -110 -225 -3 0 -52 102 -110 225 l-105 225 -157 0 -157 0 43 -92z",
  ],
};

/**
 * The running-shoe icon. Source SVG: 213×211 viewbox, a filled
 * silhouette, rendered white inside the card's 104px slot.
 */
export const SHOE_ICON_ARTWORK: VectorArtwork = {
  viewBoxWidth: 213,
  viewBoxHeight: 211,
  sourceTransform: { translateY: 211, scale: 0.1 },
  paths: [
    "M698 2002 c-19 -10 -102 -72 -184 -138 l-149 -120 -140 -43 c-77 -23 -146 -49 -153 -58 -17 -23 -15 -151 3 -238 32 -151 70 -204 302 -416 70 -64 114 -129 167 -252 175 -398 452 -594 901 -637 363 -35 597 89 622 332 10 98 -9 122 -222 292 -102 81 -192 157 -200 169 -17 28 -30 65 -160 482 -133 429 -130 420 -171 452 -75 56 -235 45 -319 -23 -37 -31 -57 -41 -60 -32 -2 7 -14 51 -25 98 -23 92 -35 119 -59 137 -24 19 -112 16 -153 -5z m121 -284 c24 -95 46 -176 50 -180 3 -4 57 38 119 92 l113 100 63 0 c39 0 67 -5 73 -12 10 -14 103 -298 103 -317 0 -7 -40 -10 -117 -8 l-118 2 0 -65 0 -65 140 4 141 3 17 -54 c26 -84 31 -80 -98 -76 l-115 3 0 -69 0 -69 135 5 c75 3 138 1 141 -3 3 -5 14 -41 25 -79 29 -106 49 -129 237 -277 95 -75 169 -139 165 -144 -33 -32 -406 -43 -513 -15 -182 49 -241 117 -432 502 -159 321 -272 495 -413 637 -45 46 -46 49 -29 62 20 14 108 83 193 153 29 23 58 42 65 42 7 0 29 -69 55 -172z m-373 -175 c163 -186 237 -302 386 -603 197 -401 278 -493 493 -563 130 -43 458 -38 578 8 56 22 -20 -83 -84 -116 -135 -69 -428 -62 -649 15 -219 76 -393 252 -514 518 -76 170 -119 225 -306 389 -87 76 -132 150 -149 243 -22 118 -22 118 67 148 111 38 111 38 178 -39z",
    "M2065 10 c-4 -6 8 -10 29 -10 20 0 36 5 36 10 0 6 -13 10 -29 10 -17 0 -33 -4 -36 -10z",
  ],
};

/** Height/width of an artwork's viewBox (for layout's aspect ratios). */
export function artworkAspectRatio(artwork: VectorArtwork): number {
  return artwork.viewBoxHeight / artwork.viewBoxWidth;
}

/**
 * The STRAVA wordmark's ink bounds in viewBox units — the paths span
 * x 24.2–576.0, y 19.1–143.0 of the 600×164 viewBox (the trace is
 * ~4.45:1; the reference card's wordmark is flatter, ~6:1 — the
 * layout stretches the ink onto its 330×55 box, see Task 23).
 * Measured with lib/share/path-bounds.ts; tests re-derive and pin
 * these so an artwork edit can't silently drift.
 */
export const STRAVA_LOGO_INK = {
  x: 24.2,
  y: 19.1,
  width: 551.8,
  height: 123.9,
} as const;

/**
 * The shoe icon's ink bounds in viewBox units (x 5.5–213.0,
 * y 8.4–211.0 of the 213×211 viewBox) — the icon is nearly square
 * (207.5×202.6), so the slot letterboxes it by a hair.
 */
export const SHOE_ICON_INK = {
  x: 5.5,
  y: 8.4,
  width: 207.5,
  height: 202.6,
} as const;

/**
 * An artwork's measurable geometry: its viewBox plus the ink bounds
 * inside it (both in viewBox units). The card layout consumes exactly
 * this — nothing else about the artwork matters for placement.
 */
export interface ArtworkInkGeometry {
  viewBoxWidth: number;
  viewBoxHeight: number;
  ink: { x: number; y: number; width: number; height: number };
}

/** The wordmark's layout geometry (viewBox + measured ink). */
export const STRAVA_LOGO_METRICS: ArtworkInkGeometry = {
  viewBoxWidth: STRAVA_LOGO_ARTWORK.viewBoxWidth,
  viewBoxHeight: STRAVA_LOGO_ARTWORK.viewBoxHeight,
  ink: STRAVA_LOGO_INK,
};

/** The shoe icon's layout geometry (viewBox + measured ink). */
export const SHOE_ICON_METRICS: ArtworkInkGeometry = {
  viewBoxWidth: SHOE_ICON_ARTWORK.viewBoxWidth,
  viewBoxHeight: SHOE_ICON_ARTWORK.viewBoxHeight,
  ink: SHOE_ICON_INK,
};
