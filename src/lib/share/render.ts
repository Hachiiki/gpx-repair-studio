/**
 * Share card painter (docs/MASTER_PLAN.md §O — Task 20, spec
 * revisions Tasks 21–23; this revision implements Task 23's reference
 * layout).
 *
 * Draws the complete 1080×1920 Strava-style share card into a 2D canvas
 * context: the solid #000000 background, the route polyline (contained
 * in the visible box with a two-pass casing — 16px #000000 under 10px
 * #FC4C02, both round cap/join), the STRAVA wordmark (ink stretched
 * onto its 330×55 box), the Distance/Pace/Time stats trio, and the
 * shoe icon (ink contained in its 104px slot) — every position from
 * lib/share/layout.ts, every path from lib/share/artwork.ts, the
 * projection from lib/geo/mercator.ts, the decimation from
 * lib/geo/simplify.ts. This module executes; it decides nothing.
 *
 * One painter serves both consumers (the same "what you see is what
 * you download" contract as the GPX export): the preview canvas at
 * scale 1 and the PNG export at the user's chosen scale — identical
 * geometry, only the backing resolution differs.
 *
 * Letter-spacing is drawn per-glyph (measure + advance) rather than
 * through `ctx.letterSpacing`: the property is not portable across the
 * browser matrix yet, and the labels must track it (0.04em) exactly.
 *
 * Browser-only (Path2D, canvas text). Layout/projection/simplification/
 * artwork are node-tested; this module's output is verified by E2E
 * pixel assertions and the live verification script. The caller must
 * have resolved the fonts first (lib/share/fonts.ts) — text renders in
 * the fallback face otherwise, never fails.
 */

import type { LatLon } from "@/types/domain";
import { projectPolylines } from "@/lib/geo/mercator";
import { simplifyPolylines } from "@/lib/geo/simplify";
import {
  SHOE_ICON_ARTWORK,
  SHOE_ICON_METRICS,
  STRAVA_LOGO_ARTWORK,
  STRAVA_LOGO_METRICS,
  type VectorArtwork,
} from "@/lib/share/artwork";
import {
  SHARE_CARD_COLORS,
  SHARE_CARD_ROUTE_STROKE,
  SHARE_CARD_SIMPLIFY_TOLERANCE_M,
  SHARE_CARD_STAT_LABELS,
  SHARE_CARD_TYPE,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  computeShareCardLayout,
} from "@/lib/share/layout";

/** The card's content — exactly the reusable component's props. */
export interface ShareCardSpec {
  /**
   * The route, as polylines of geographic points. Multiple polylines
   * are drawn as independent strokes (multi-track files, or recorded
   * and reconstructed pieces) — never connected with fabricated legs.
   */
  routePolyline: readonly (readonly LatLon[])[];
  /** Stats values as pre-formatted strings ("21.12 km", "5:00 /km", "1h 45m"). */
  distance: string;
  pace: string;
  time: string;
}

/** Render options. */
export interface RenderShareCardOptions {
  /** Backing-store scale: 1 = 1080×1920, 2 = 2160×3840 (sharper). */
  scale: number;
}

// ---------------------------------------------------------------------------
// Path2D cache (browser only, lazy — node-side imports of this module
// for type re-exports must not touch Path2D)
// ---------------------------------------------------------------------------

interface ArtworkPaths {
  artwork: VectorArtwork;
  paths: readonly Path2D[];
}

let logoPaths: ArtworkPaths | null = null;
let shoePaths: ArtworkPaths | null = null;

function artworkPaths(artwork: VectorArtwork): ArtworkPaths | null {
  if (typeof Path2D === "undefined") return null;
  return { artwork, paths: artwork.paths.map((d) => new Path2D(d)) };
}

function cachedArtworkPaths(): { logo: ArtworkPaths | null; shoe: ArtworkPaths | null } {
  if (logoPaths === null) logoPaths = artworkPaths(STRAVA_LOGO_ARTWORK);
  if (shoePaths === null) shoePaths = artworkPaths(SHOE_ICON_ARTWORK);
  return { logo: logoPaths, shoe: shoePaths };
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/**
 * Fill an artwork's paths into `rect`, baking the source SVG's group
 * transform (translate → uniform viewBox scale → y-flip transform).
 */
function fillArtwork(
  ctx: CanvasRenderingContext2D,
  cached: ArtworkPaths,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const { artwork, paths } = cached;
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(rect.width / artwork.viewBoxWidth, rect.height / artwork.viewBoxHeight);
  ctx.translate(0, artwork.sourceTransform.translateY);
  ctx.scale(artwork.sourceTransform.scale, -artwork.sourceTransform.scale);
  for (const path of paths) ctx.fill(path);
  ctx.restore();
}

/**
 * Center-aligned text with letter spacing, drawn per-glyph so the
 * spacing is identical in every browser (`ctx.letterSpacing` is not).
 * The caller's current font applies; baseline must be "middle".
 */
function fillLetterspacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  spacing: number,
): void {
  const chars = [...text];
  if (chars.length === 0) return;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total =
    widths.reduce((sum, w) => sum + w, 0) + spacing * (chars.length - 1);
  let x = centerX - total / 2;
  const previousAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], x, centerY);
    x += widths[i] + spacing;
  }
  ctx.textAlign = previousAlign;
}

/**
 * Stroke/fill a set of projected polylines as one pass of the route:
 * multi-point pieces become round-cap strokes, lone points become
 * dots of the pass's width (a zero-length stroke draws nothing in
 * several engines). The casing pass and the route pass call this
 * with the same points — the spec's "same points twice".
 */
function strokeRoutePass(
  ctx: CanvasRenderingContext2D,
  polylines: readonly (readonly { x: number; y: number }[])[],
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  for (const line of polylines) {
    if (line.length === 1) {
      const [point] = line;
      ctx.beginPath();
      ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(line[0].x, line[0].y);
    for (let i = 1; i < line.length; i += 1) {
      ctx.lineTo(line[i].x, line[i].y);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// The painter
// ---------------------------------------------------------------------------

/**
 * Paint the full card. The context is expected unscaled; the painter
 * applies `scale` itself (all internal math stays in 1080×1920 units).
 * The solid black background is painted first — the export is fully
 * opaque, and the casing pass (#000000 on #000000) is drawn anyway:
 * the spec mandates it, and it reappears intact if the background
 * token ever changes.
 */
export function renderShareCard(
  ctx: CanvasRenderingContext2D,
  spec: ShareCardSpec,
  options: RenderShareCardOptions = { scale: 1 },
): void {
  const scale = options.scale > 0 ? options.scale : 1;
  const layout = computeShareCardLayout({
    logo: STRAVA_LOGO_METRICS,
    icon: SHOE_ICON_METRICS,
  });

  ctx.save();
  ctx.clearRect(0, 0, layout.width * scale, layout.height * scale);
  ctx.scale(scale, scale);

  // --- Background: the spec's solid black, edge to edge. ---
  ctx.fillStyle = SHARE_CARD_COLORS.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // --- Route: contained in the visible box (inset by the casing's
  // half-width), jitter preserved (decimation capped at the spec's
  // 5m tolerance), two-pass casing: every black 16px casing first,
  // then every orange 10px line — so one piece's outline never cuts
  // through another piece's line.
  const simplified = simplifyPolylines(
    spec.routePolyline,
    SHARE_CARD_SIMPLIFY_TOLERANCE_M,
  );
  const projection = projectPolylines(simplified, layout.routeFitBox);
  if (!projection.isEmpty) {
    ctx.lineJoin = SHARE_CARD_ROUTE_STROKE.lineJoin;
    ctx.lineCap = SHARE_CARD_ROUTE_STROKE.lineCap;
    strokeRoutePass(
      ctx,
      projection.polylines,
      SHARE_CARD_COLORS.casing,
      SHARE_CARD_ROUTE_STROKE.casingWidth,
    );
    strokeRoutePass(
      ctx,
      projection.polylines,
      SHARE_CARD_COLORS.route,
      SHARE_CARD_ROUTE_STROKE.width,
    );
  }

  // --- STRAVA wordmark (ink on its 330×55 box, white). ---
  // The white fillStyle is set BEFORE any foreground artwork: the
  // wordmark, stats, and icon all draw in white; only the route (set
  // above, per-piece) differs. (A VLM review caught the logo rendering
  // in the canvas default black when this came after the fills.)
  ctx.fillStyle = SHARE_CARD_COLORS.foreground;
  const { logo, shoe } = cachedArtworkPaths();
  if (logo) fillArtwork(ctx, logo, layout.logoRect);

  // --- Stats trio: labels (SemiBold, tracked) over values (ExtraBold). ---
  const { label, value, fontFamily } = SHARE_CARD_TYPE;
  const values = [spec.distance, spec.pace, spec.time];
  ctx.textBaseline = "middle";
  for (let i = 0; i < layout.statsColumns.length; i += 1) {
    const column = layout.statsColumns[i];
    ctx.font = `${label.weight} ${label.size}px ${fontFamily}, sans-serif`;
    const labelSpacing = label.size * label.letterSpacingEm;
    fillLetterspacedText(
      ctx,
      SHARE_CARD_STAT_LABELS[i],
      column.centerX,
      column.labelCenterY,
      labelSpacing,
    );
    ctx.font = `${value.weight} ${value.size}px ${fontFamily}, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(values[i] ?? "—", column.centerX, column.valueCenterY);
  }

  // --- Shoe icon (white, ink contained in the 104px slot). ---
  if (shoe) fillArtwork(ctx, shoe, layout.iconRect);

  ctx.restore();
}

/**
 * Render onto a canvas element: sizes the backing store to the card's
 * aspect at `scale` and paints. Returns the canvas for chaining (the
 * preview passes its ref canvas; the export creates an offscreen one).
 */
export function paintShareCardCanvas(
  canvas: HTMLCanvasElement,
  spec: ShareCardSpec,
  options: RenderShareCardOptions = { scale: 1 },
): HTMLCanvasElement {
  canvas.width = Math.round(SHARE_CARD_WIDTH * options.scale);
  canvas.height = Math.round(SHARE_CARD_HEIGHT * options.scale);
  const ctx = canvas.getContext("2d");
  if (ctx) renderShareCard(ctx, spec, options);
  return canvas;
}
