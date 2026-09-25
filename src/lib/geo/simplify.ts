/**
 * Polyline simplification for the share card (Task 22).
 *
 * Douglas-Peucker with a metre tolerance: the card's route keeps its
 * GPS jitter (the recording's character — never smoothed into fake
 * curves), while dense files (a 100k-point watch dump) decimate to
 * something a canvas paints instantly. The tolerance is a CAP from
 * the spec: 5 metres of perpendicular deviation — any point that
 * strays further than that from the simplified chord survives, so
 * real jitter above the tolerance stays on the card.
 *
 * This is a *rendering* decision only — like the projection, it is a
 * view transformation: the returned points are the original objects
 * (filtered, never re-created), and the GPX export is untouched.
 *
 * Pure TypeScript, iterative DP (no recursion — a 100k-point line
 * must not blow the call stack). Unit tests: tests/share-simplify.test.ts.
 */

import type { LatLon } from "@/types/domain";

/** Earth's mean radius in metres (WGS84 mean, IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

/** Degrees → radians. */
const DEG_TO_RAD = Math.PI / 180;

/** A point in a local equirectangular frame, in metres. */
interface PlanarPoint {
  x: number;
  y: number;
}

/**
 * Unwrap longitudes so consecutive points never jump more than 180°
 * (an antimeridian-crossing leg keeps its true short direction).
 * Mirrors lib/geo/mercator.ts's unwrap — kept local so this module
 * stays self-contained.
 */
function unwrapLons(points: readonly LatLon[]): number[] {
  const lons = points.map((p) => p.lon);
  for (let i = 1; i < lons.length; i += 1) {
    const delta = lons[i] - lons[i - 1];
    if (delta > 180) lons[i] -= 360;
    else if (delta < -180) lons[i] += 360;
  }
  return lons;
}

/**
 * Project a polyline into a local equirectangular frame around its
 * own latitude, in metres. Accurate at city scale (the error of the
 * flat-earth approximation over a few kilometres is centimetres —
 * far below the 5m tolerance).
 */
function toPlanar(points: readonly LatLon[]): PlanarPoint[] {
  const lons = unwrapLons(points);
  const lat0 =
    points.reduce((sum, p) => sum + p.lat, 0) / Math.max(points.length, 1);
  const cosLat = Math.cos(lat0 * DEG_TO_RAD);
  const k = DEG_TO_RAD * EARTH_RADIUS_M;
  return points.map((p, i) => ({
    x: lons[i] * cosLat * k,
    y: p.lat * k,
  }));
}

/** Perpendicular distance (metres) from `p` to the segment `a`–`b`. */
function distanceToSegmentM(
  p: PlanarPoint,
  a: PlanarPoint,
  b: PlanarPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Simplify one polyline: keeps both endpoints and every point whose
 * perpendicular deviation from the running chord exceeds the
 * tolerance. Returns the ORIGINAL point objects (filtered by index —
 * coordinates are never touched). `toleranceM` ≤ 0 returns the
 * polyline unchanged (jitter fully preserved).
 */
export function simplifyPolyline(
  points: readonly LatLon[],
  toleranceM: number,
): LatLon[] {
  if (points.length <= 2 || toleranceM <= 0) {
    return [...points];
  }

  const planar = toPlanar(points);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Iterative Douglas-Peucker: a work stack of [start, end) index
  // pairs replaces the classic recursion.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = -1;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = distanceToSegmentM(
        planar[i],
        planar[start],
        planar[end],
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (maxDistance > toleranceM && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  const simplified: LatLon[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i]) simplified.push(points[i]);
  }
  return simplified;
}

/**
 * Simplify every polyline of a route (each piece independently —
 * gap-split pieces never share a chord). See simplifyPolyline.
 */
export function simplifyPolylines(
  polylines: readonly (readonly LatLon[])[],
  toleranceM: number,
): LatLon[][] {
  return polylines.map((line) => simplifyPolyline(line, toleranceM));
}
