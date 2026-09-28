/**
 * Stroke — the Curve pen's pure processor (user pass 48: "curve is a
 * type of pen, not a type of path").
 *
 * The map controller captures the raw freehand trace (one point every
 * few pixels of pointer travel). This module turns that messy sample
 * list into the line's next nodes:
 *
 *   - Douglas-Peucker simplification in planar lat/lon space (the same
 *     map-scale arithmetic the Task-46 spline uses — sub-centimeter
 *     vs. geodesic at the scales a hand stroke covers);
 *   - a NODE BUDGET the caller derives from the vertex hard cap, so a
 *     stroke can never overflow a reconstruction;
 *   - a per-use CAP that depends on what the line does next: routing
 *     styles (Roads / Footpaths) want FEW waypoints (each node pair is
 *     one routing request), local styles want enough nodes for the
 *     spline to hug the drawn shape.
 *
 * The result always keeps the stroke's exact first and last points —
 * where the user started and stopped is user data, never simplified
 * away. Purity contract: no React, no DOM, no fetch (ESLint boundary).
 */

import type { LatLon } from "@/types/domain";

/**
 * Maximum stroke nodes for the local (straight → smoothed curve) case:
 * dense enough that the Catmull-Rom spline through them matches the
 * drawn shape, coarse enough that the vertex list stays readable.
 */
export const CURVE_STROKE_MAX_NODES = 40;

/**
 * Maximum stroke nodes when the line routes externally (Roads /
 * Footpaths): every node pair becomes one routing request, so a stroke
 * contributes about as many waypoints as a dozen careful clicks would.
 */
export const ROUTING_STROKE_MAX_NODES = 12;

/** Starting simplification tolerance (meters) per use case. */
const CURVE_START_TOLERANCE_M = 2;
const ROUTING_START_TOLERANCE_M = 15;

/** Tolerance growth per retry (×) until the node cap is satisfied. */
const TOLERANCE_GROWTH = 1.8;

/** Safety bound on the retry loop (tolerance ~2 m · 1.8^24 ≈ 38 km). */
const MAX_RETRIES = 24;

/** Consecutive samples closer than this (meters) are duplicates. */
const DEDUPE_M = 0.05;

/** Planar distance from point `p` to the segment `a`→`b` (meters). */
function segmentDistanceM(p: LatLon, a: LatLon, b: LatLon): number {
  const latRef = Math.abs(a.lat) < Math.abs(b.lat) ? a.lat : b.lat;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.max(0.2, Math.cos((latRef * Math.PI) / 180));
  const ax = a.lon * metersPerDegLon;
  const ay = a.lat * metersPerDegLat;
  const bx = b.lon * metersPerDegLon;
  const by = b.lat * metersPerDegLat;
  const px = p.lon * metersPerDegLon;
  const py = p.lat * metersPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  // Clamp the projection parameter to [0, 1] — distance to the SEGMENT.
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Douglas-Peucker: keep the samples that define the stroke's shape,
 * drop the ones within `toleranceM` of the kept polyline. Iterative
 * (explicit stack — a long stroke must never overflow the call stack).
 * The first and last samples are always kept.
 */
export function douglasPeucker(
  points: readonly LatLon[],
  toleranceM: number,
): LatLon[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;
    let maxDistance = -1;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = segmentDistanceM(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (maxDistance > toleranceM && index !== -1) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  const result: LatLon[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

/** Drop consecutive duplicates (sub-DEDUPE_M apart). */
function dedupe(points: readonly LatLon[]): LatLon[] {
  const result: LatLon[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (
      last &&
      Math.abs(last.lat - point.lat) < DEDUPE_M / 111320 &&
      Math.abs(last.lon - point.lon) < DEDUPE_M / 111320
    ) {
      continue;
    }
    result.push(point);
  }
  return result;
}

/** Uniform decimation to exactly `count` samples (extreme fallback). */
function decimate(points: readonly LatLon[], count: number): LatLon[] {
  if (points.length <= count) return [...points];
  const result: LatLon[] = [];
  const step = (points.length - 1) / (count - 1);
  for (let i = 0; i < count; i += 1) {
    result.push(points[Math.round(i * step)]);
  }
  // The exact endpoints are user data — pin them after rounding.
  result[0] = points[0];
  result[count - 1] = points[points.length - 1];
  return result;
}

export interface SimplifyStrokeOptions {
  /**
   * True when the line's path style routes externally (Roads /
   * Footpaths): the stroke becomes coarse waypoints for the router.
   * False for local styles: the nodes feed the smoothing spline.
   */
  routing: boolean;
  /**
   * How many vertices the reconstruction can still accept
   * (`MAX_VERTICES - current`). Zero or negative → no nodes.
   */
  budget: number;
}

/**
 * Turn one captured freehand stroke into the line's next nodes.
 * Returns an empty array for degenerate strokes (nothing to place).
 */
export function simplifyStroke(
  raw: readonly LatLon[],
  options: SimplifyStrokeOptions,
): LatLon[] {
  const samples = dedupe(
    raw.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon),
    ),
  );
  if (samples.length < 2) return [];
  if (options.budget < 2) return [];

  const cap = Math.max(
    2,
    Math.min(
      options.budget,
      options.routing ? ROUTING_STROKE_MAX_NODES : CURVE_STROKE_MAX_NODES,
    ),
  );

  let tolerance = options.routing
    ? ROUTING_START_TOLERANCE_M
    : CURVE_START_TOLERANCE_M;
  let simplified = douglasPeucker(samples, tolerance);
  let retries = 0;
  while (simplified.length > cap && retries < MAX_RETRIES) {
    tolerance *= TOLERANCE_GROWTH;
    simplified = douglasPeucker(samples, tolerance);
    retries += 1;
  }
  if (simplified.length > cap) {
    simplified = decimate(simplified, cap);
  }

  // The stroke's endpoints are user data — pin them exactly.
  const pinned = [...simplified];
  pinned[0] = samples[0];
  pinned[pinned.length - 1] = samples[samples.length - 1];
  return pinned;
}
