/**
 * Zoom-dependent render decimation (docs/MASTER_PLAN.md Phase 9, §C-2).
 *
 * Recorded routes can carry 100k+ points; MapLibre renders whatever it is
 * handed, and the main-thread cost of shipping a 100k-coordinate
 * LineString to the map worker is the single largest render-time block.
 * This module derives, from the CURRENT zoom, the largest sampling stride
 * that still keeps consecutive kept points ≈ `MIN_SCREEN_PX` apart on
 * screen — visually lossless by construction (GPS tracks at 2 px spacing
 * are indistinguishable from their full-resolution line), and cheap
 * enough to recompute on every zoom band change.
 *
 * Contracts:
 *   - **Render-only.** Distance badges, statistics, export, gap detection,
 *     and every other consumer keep reading the full-resolution model;
 *     only the GeoJSON handed to `SOURCE.route` is sampled.
 *   - **Identity below the noise floor.** Fewer than `DECIMATE_MIN_COORDS`
 *     total coordinates — or a stride of 1 — return the INPUT references:
 *     normal files never pay a copy, and every existing pixel-level
 *     expectation keeps holding.
 *   - **Endpoints pinned.** A line's first and last coordinates are always
 *     kept exactly (anchors, gap boundaries, and closed loops stay true).
 *   - **Powers of two.** Strides quantize down to 2^k so a zoom gesture
 *     only re-decimates on a band crossing, not on every frame.
 *   - **Never below the floor.** A stride may never leave fewer than
 *     `DECIMATE_MIN_RENDERED` points on a line — a whole-route overview
 *     stays a recognizable track, never a collapsed squiggle.
 *
 * Phase 9 — Performance & Large Files. Pure TypeScript (no maplibre
 * import): the controller feeds it RouteLineParts + a zoom, the tests feed
 * it geometry + arithmetic.
 */

import type { RouteLinePart } from "@/lib/map/geojson";

/**
 * Below this many total coordinates, decimation is a no-op (identity) —
 * the copy would cost more than the render it saves, and normal files
 * must render bit-identically to the pre-Phase-9 map.
 */
export const DECIMATE_MIN_COORDS = 30_000;

/** Target on-screen spacing between consecutive kept points (CSS px). */
export const MIN_SCREEN_PX = 2;

/** MapLibre's world tile size (px) at zoom 0 — the projection constant. */
const MAP_TILE_SIZE_PX = 512;

/** A route line never renders with fewer than this many kept points. */
export const DECIMATE_MIN_RENDERED = 512;

/**
 * The largest sampling stride (in coordinate indices) that keeps
 * consecutive kept points ≥ `MIN_SCREEN_PX` apart at `zoom`, for the
 * geometry of `lines`. Returns 1 when no decimation is warranted.
 *
 * The math: at zoom z one degree of longitude spans
 * `512 · 2^z / 360 · cos(lat)` screen pixels; the route's extent in
 * degrees therefore spans `extent · pxPerDegree` pixels, which at the
 * minimum spacing fits `routePx / MIN_SCREEN_PX` points. The stride is
 * the total divided by that cap, quantized DOWN to a power of two
 * (denser than required is always safe — sparser never is).
 */
export function decimationStride(
  lines: readonly RouteLinePart[],
  zoom: number,
): number {
  let total = 0;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const line of lines) {
    total += line.coordinates.length;
    for (const [lon, lat] of line.coordinates) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (total < DECIMATE_MIN_COORDS) return 1;
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return 1;

  // Mid-latitude scale (Mercator is locally conformal; one scale factor
  // for both axes is the standard approximation for stride math).
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const pxPerDegree =
    (MAP_TILE_SIZE_PX * 2 ** zoom) / 360 * Math.cos(midLat);
  const extentDeg = Math.max(maxLon - minLon, maxLat - minLat);
  const routePx = extentDeg * pxPerDegree;
  if (routePx <= 0) return 1;

  const cap = routePx / MIN_SCREEN_PX;
  if (cap >= total) return 1;

  const rawStride = Math.ceil(total / cap);
  // Quantize DOWN to a power of two (band crossings only on doubling).
  const pow2 = 2 ** Math.floor(Math.log2(Math.max(1, rawStride)));
  // Floor: never leave the route below the recognizable-track minimum.
  const maxStride = Math.max(1, Math.floor(total / DECIMATE_MIN_RENDERED));
  return Math.min(pow2, maxStride);
}

/**
 * Sample each line's coordinates at `stride` (first/last pinned). When
 * `stride <= 1` the input array and its line objects are returned
 * UNCHANGED (reference identity) — the no-decimation fast path.
 */
export function decimateLines(
  lines: readonly RouteLinePart[],
  stride: number,
): readonly RouteLinePart[] {
  if (stride <= 1) return lines;
  return lines.map((line) => {
    const coords = line.coordinates;
    if (coords.length <= 2) return line; // nothing to sample
    const kept: [number, number][] = [];
    for (let i = 0; i < coords.length; i += stride) {
      kept.push(coords[i]);
    }
    // Pin the exact endpoint (stride sampling may have stepped past it).
    const last = coords[coords.length - 1];
    const keptLast = kept[kept.length - 1];
    if (keptLast !== last) kept.push(last);
    return { ...line, coordinates: kept };
  });
}

/**
 * One-call convenience: derive the stride for `zoom` and sample. The
 * controller calls this on setRoute and on zoom band changes.
 */
export function decimateForZoom(
  lines: readonly RouteLinePart[],
  zoom: number,
): { lines: readonly RouteLinePart[]; stride: number } {
  const stride = decimationStride(lines, zoom);
  return { lines: decimateLines(lines, stride), stride };
}
