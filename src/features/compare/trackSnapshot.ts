/**
 * The static track snapshot (Phase 19 — §EE 19.2): a printable SVG of
 * a track, built from the same coordinate vocabulary the map renders.
 *
 * No map, no WebGL, no dependency — a pure string builder that serves
 * three surfaces: the repair-summary sheet's track picture, the
 * before/after side-by-side panels, and the batch summary's per-file
 * thumbnails. Print needs ink on paper and static export needs no
 * runtime; an SVG of polylines is the whole job.
 *
 * Projection: equirectangular with a cos(mid-lat) longitude scale —
 * cheap, and exactly right about relative shape at any latitude band.
 * Both side-by-side panels accept ONE shared bounds so their scales
 * are identical and the shapes are truly comparable.
 *
 * Honesty rules: lines break at damage (Null Island) and at gap
 * boundaries exactly like the map's route join — the unknown stretch
 * is never drawn as recorded line, even in a thumbnail.
 *
 * Phase 19 — Compare, summaries & guided flows. Pure TypeScript.
 */

import { simplifyPolyline } from "@/lib/geo/simplify";
import type { BBox } from "@/lib/geo/bbox";
import type { LatLon, OriginalTrackData } from "@/types/domain";
import { isUsableStatsPoint } from "@/features/statistics/distance";

/** A drawable polyline piece (`[lon, lat]` pairs — the map's order). */
export interface SnapshotLine {
  coordinates: readonly (readonly [number, number])[];
}

export interface TrackSnapshotColors {
  /** The untouched line (ink on screen/paper, or the ghost gray). */
  base: string;
  /** The changed-span overlay (signal). */
  changed: string;
  /** The ghost layer under the base (optional — the compare picture). */
  under?: string;
}

export interface TrackSnapshotInput {
  lines: readonly SnapshotLine[];
  /** Changed stretches painted over the base in `colors.changed`. */
  changed?: readonly SnapshotLine[];
  /** The ghost layer under everything (the original, when the picture
   * is a before/after composite). */
  under?: readonly SnapshotLine[];
  colors: TrackSnapshotColors;
  /** Shared bounds (side-by-side); defaults to the lines' own bounds. */
  bounds?: BBox | null;
  width?: number;
  height?: number;
  /** Inner padding, viewBox units. */
  padding?: number;
  /** Simplification tolerance, meters (0 = keep everything). */
  simplifyToleranceM?: number;
  /** Accessible name for the <svg> (a <title> is emitted with it). */
  label?: string;
  /** Emit the changed group even when empty (stable structure). */
  emitChangedGroup?: boolean;
}

/** Default canvas — a wide thumbnail that fits a summary sheet. */
export const SNAPSHOT_DEFAULT_WIDTH = 720;
export const SNAPSHOT_DEFAULT_HEIGHT = 320;
const DEFAULT_PADDING = 12;

/** Smallest legal bounds span (a single point still centers the box). */
const MIN_SPAN = 1e-6;

/** Escape a label for XML text content (names come from file names). */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Combined geographic bounds of every line (null when empty). */
export function snapshotBounds(
  ...lineGroups: readonly (readonly SnapshotLine[] | undefined)[]
): BBox | null {
  let bbox: BBox | null = null;
  for (const group of lineGroups) {
    if (!group) continue;
    for (const line of group) {
      for (const [lon, lat] of line.coordinates) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        if (bbox === null) {
          bbox = { minLat: lat, minLon: lon, maxLat: lat, maxLon: lon };
        } else {
          if (lat < bbox.minLat) bbox.minLat = lat;
          if (lat > bbox.maxLat) bbox.maxLat = lat;
          if (lon < bbox.minLon) bbox.minLon = lon;
          if (lon > bbox.maxLon) bbox.maxLon = lon;
        }
      }
    }
  }
  return bbox;
}

/**
 * Build the snapshot SVG markup. Deterministic: same input, same bytes
 * (coordinates rounded to 0.1 viewBox unit, stable attribute order) —
 * the unit tests pin the structure, the e2e pins presence.
 */
export function buildTrackSnapshotSvg(input: TrackSnapshotInput): string {
  const width = input.width ?? SNAPSHOT_DEFAULT_WIDTH;
  const height = input.height ?? SNAPSHOT_DEFAULT_HEIGHT;
  const padding = input.padding ?? DEFAULT_PADDING;
  const tolerance = input.simplifyToleranceM ?? 0;

  const bounds =
    input.bounds ??
    snapshotBounds(input.lines, input.changed ?? [], input.under ?? []);
  const openTag =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"` +
    (input.label ? ` aria-label="${escapeXml(input.label)}"` : "") +
    ">" +
    (input.label ? `<title>${escapeXml(input.label)}</title>` : "");
  if (bounds === null) {
    // Nothing drawable: an empty labeled plate — honest, never a
    // fabricated shape.
    return `${openTag}</svg>`;
  }

  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const lonScale = Math.max(Math.cos((midLat * Math.PI) / 180), 0.01);
  const spanX = Math.max((bounds.maxLon - bounds.minLon) * lonScale, MIN_SPAN);
  const spanY = Math.max(bounds.maxLat - bounds.minLat, MIN_SPAN);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = padding + (innerWidth - drawW) / 2;
  const offsetY = padding + (innerHeight - drawH) / 2;

  // x: west → east; y: north (maxLat) at the top of the box.
  const project = (lon: number, lat: number): [number, number] => [
    offsetX + (lon - bounds.minLon) * lonScale * scale,
    height - offsetY - (lat - bounds.minLat) * scale,
  ];

  const simplify = (line: SnapshotLine): LatLon[] => {
    const points = line.coordinates.map(
      ([lon, lat]) => ({ lat, lon }) as LatLon,
    );
    return tolerance > 0 ? simplifyPolyline(points, tolerance) : points;
  };

  const toPolyline = (line: SnapshotLine, stroke: string, strokeWidth: number): string | null => {
    const simplified = simplify(line);
    if (simplified.length < 2) return null;
    const points = simplified
      .map((p) => {
        const [x, y] = project(p.lon, p.lat);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };

  const basePolylines = input.lines
    .map((line) => toPolyline(line, input.colors.base, 3))
    .filter((part): part is string => part !== null);
  const changedPolylines = (input.changed ?? [])
    .map((line) => toPolyline(line, input.colors.changed, 4.5))
    .filter((part): part is string => part !== null);
  const underColor = input.colors.under ?? input.colors.base;
  const underPolylines = (input.under ?? [])
    .map((line) => toPolyline(line, underColor, 2))
    .filter((part): part is string => part !== null);

  return (
    openTag +
    (underPolylines.length > 0 ? `<g>${underPolylines.join("")}</g>` : "") +
    `<g>${basePolylines.join("")}</g>` +
    (changedPolylines.length > 0 || input.emitChangedGroup
      ? `<g>${changedPolylines.join("")}</g>`
      : "") +
    `</svg>`
  );
}

/**
 * Slice a segment's original coordinates for a changed span (inclusive
 * index range → `[lon, lat]` pairs). Returns null when the slice has
 * fewer than two usable points (nothing drawable).
 */
export function spanCoordinates(
  data: OriginalTrackData,
  segmentId: string,
  fromIndex: number,
  toIndex: number,
): SnapshotLine | null {
  const segment = data.segments.find((s) => s.id === segmentId);
  if (!segment) return null;
  const slice = segment.points
    .slice(fromIndex, toIndex + 1)
    .filter((p) => isUsableStatsPoint(p));
  if (slice.length < 2) return null;
  return {
    coordinates: slice.map((p) => [p.lon, p.lat] as [number, number]),
  };
}

/** The gap-boundary break sets the line join uses (the map's rule). */
export interface SnapshotBreaks {
  beforePointIds: ReadonlySet<string>;
  afterPointIds: ReadonlySet<string>;
}

/**
 * The snapshot line pieces of a whole model: one polyline per
 * continuous run of usable points, broken at damage (Null Island) and
 * at gap boundaries — the before-boundary point ends its line, the
 * after-boundary point starts the next one (exactly the map's join).
 */
export function snapshotLinesOf(
  data: OriginalTrackData,
  breaks?: SnapshotBreaks,
): SnapshotLine[] {
  const lines: SnapshotLine[] = [];
  for (const segment of data.segments) {
    let current: [number, number][] = [];
    const flush = () => {
      if (current.length >= 2) {
        lines.push({ coordinates: current });
      }
      current = [];
    };
    for (const point of segment.points) {
      if (!isUsableStatsPoint(point)) {
        flush();
        continue;
      }
      const coords: [number, number] = [point.lon, point.lat];
      if (breaks && breaks.beforePointIds.has(point.id)) {
        // Last usable point before a gap: draw it, then stop the line.
        current.push(coords);
        flush();
        continue;
      }
      if (breaks && breaks.afterPointIds.has(point.id)) {
        // First usable point after a gap: start a fresh line here.
        flush();
        current = [coords];
        continue;
      }
      current.push(coords);
    }
    flush();
  }
  return lines;
}
