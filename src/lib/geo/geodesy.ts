/**
 * Geodesy — WGS-84 distance computations (docs/MASTER_PLAN.md §E-2).
 *
 * The single sanctioned distance module for the whole app: ad-hoc lat/lon
 * distance code anywhere else fails review. Consumers compute route lengths,
 * implied speeds, gap diagnostics, and (later) resample spacing exclusively
 * through `geodesicDistanceMeters` / `polylineLengthMeters`.
 *
 * Implementation: Vincenty (1975) inverse solution on the WGS-84 ellipsoid
 * (~0.5 mm accuracy for non-degenerate, non-antipodal geodesics — far beyond
 * the needs of running-scale legs) with a spherical haversine fallback for
 * the degenerate near-antipodal cases where Vincenty's iteration fails to
 * converge. At running distances the fallback is never exercised.
 *
 * Golden tests (tests/geodesy.test.ts) verify:
 *   - Flinders Peak → Buninyong (Vincenty's canonical 1975 example): 54 972.271 m
 *   - Equatorial 90° arc = a·π/2 (analytic); 1° arc = a·π/180 (analytic)
 *   - Meridian quadrant (equator → pole): 10 001 965.7293 m (published WGS-84)
 *   - Antipodal fallback ≈ half circumference of the mean-Earth sphere
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript: no DOM, no framework, no I/O.
 * Coordinates are expected in decimal degrees; non-finite inputs propagate
 * as NaN (callers surface flagged points instead of silently skipping).
 */

import type { LatLon } from "@/types/domain";

/** WGS-84 ellipsoid parameters. */
export const WGS84 = {
  /** Semi-major axis (equatorial radius), meters. */
  a: 6378137.0,
  /** Flattening. */
  f: 1 / 298.257223563,
} as const;

/** Semi-minor axis (polar radius), meters. */
const b = WGS84.a * (1 - WGS84.f);

/** IUGG mean-Earth radius used by the haversine fallback, meters. */
export const MEAN_EARTH_RADIUS_M = 6371008.8;

/** Vincenty iteration cap; typical geodesics converge in < 10 iterations. */
const MAX_ITERATIONS = 200;

/** λ convergence threshold (radians) — ~6 µm of arc. */
const CONVERGENCE_EPS = 1e-12;

const deg2rad = Math.PI / 180;

/** True when both coordinates are finite numbers. */
export function hasFiniteCoords(p: LatLon): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

/**
 * Great-circle distance on a spherical mean-Earth, via the haversine
 * formula. Used as the Vincenty fallback and as an independent
 * cross-check; up to ~0.5 % off the ellipsoid (≈ 5 m per km) at worst.
 */
export function haversineDistanceMeters(p1: LatLon, p2: LatLon): number {
  if (!hasFiniteCoords(p1) || !hasFiniteCoords(p2)) return NaN;
  const phi1 = p1.lat * deg2rad;
  const phi2 = p2.lat * deg2rad;
  const dPhi = (p2.lat - p1.lat) * deg2rad;
  const dLambda = (p2.lon - p1.lon) * deg2rad;
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  // Clamp guards against sqrt/asin domain errors from floating-point drift.
  const sinTheta = Math.min(1, Math.sqrt(h));
  return 2 * MEAN_EARTH_RADIUS_M * Math.asin(sinTheta);
}

/**
 * Geodesic distance on the WGS-84 ellipsoid (Vincenty inverse), in meters.
 *
 * - Non-finite input coordinates → NaN (honest propagation).
 * - Coincident points → 0.
 * - Degenerate/near-antipodal geodesics where Vincenty does not converge →
 *   haversine fallback (documented approximation, irrelevant at running
 *   scale).
 */
export function geodesicDistanceMeters(p1: LatLon, p2: LatLon): number {
  if (!hasFiniteCoords(p1) || !hasFiniteCoords(p2)) return NaN;

  const phi1 = p1.lat * deg2rad;
  const phi2 = p2.lat * deg2rad;
  const L = (p2.lon - p1.lon) * deg2rad;

  const tanU1 = (1 - WGS84.f) * Math.tan(phi1);
  const tanU2 = (1 - WGS84.f) * Math.tan(phi2);
  const sinU1 = tanU1 / Math.sqrt(1 + tanU1 * tanU1);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU2 = tanU2 / Math.sqrt(1 + tanU2 * tanU2);
  const cosU2 = 1 / Math.sqrt(1 + tanU2 * tanU2);

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cos2Alpha = 1;
  let cos2SigmaM = 0;
  let converged = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);

    sinSigma = Math.hypot(
      cosU2 * sinLambda,
      cosU1 * sinU2 - sinU1 * cosU2 * cosLambda,
    );
    if (sinSigma === 0) {
      // Degenerate: coincident points, or antipodal points on the same
      // meridian where the formula collapses. Haversine answers both
      // correctly (0 for coincident, half circumference for antipodal).
      return haversineDistanceMeters(p1, p2);
    }

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    // Equatorial line (cos2Alpha === 0): cos2SigmaM is undefined; use 0.
    cos2SigmaM =
      cos2Alpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cos2Alpha;

    const C =
      (WGS84.f / 16) * cos2Alpha * (4 + WGS84.f * (4 - 3 * cos2Alpha));
    const lambdaPrev = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84.f *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

    if (Math.abs(lambda - lambdaPrev) < CONVERGENCE_EPS) {
      converged = true;
      break;
    }
    if (Math.abs(lambda) > Math.PI) {
      // λ diverging past π — (near-)antipodal; fall back.
      break;
    }
  }

  if (!converged) return haversineDistanceMeters(p1, p2);

  const u2 = (cos2Alpha * (WGS84.a * WGS84.a - b * b)) / (b * b);
  const A =
    1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return b * A * (sigma - deltaSigma);
}

/**
 * Cumulative geodesic length of a polyline, in meters.
 *
 * Empty or single-point polylines → 0. A point with non-finite coordinates
 * poisons the affected legs and the result becomes NaN — callers are
 * expected to surface flagged points (see `PointAnomaly`) rather than
 * receive silently truncated distances.
 */
export function polylineLengthMeters(points: readonly LatLon[]): number {
  let total = 0;
  let previous: LatLon | undefined;
  for (const point of points) {
    if (previous !== undefined) {
      total += geodesicDistanceMeters(previous, point);
    }
    previous = point;
  }
  return total;
}

/** Initial bearing (forward azimuth) from `p1` to `p2`, in radians [0, 2π). */
function initialBearingRad(p1: LatLon, p2: LatLon): number {
  const phi1 = p1.lat * deg2rad;
  const phi2 = p2.lat * deg2rad;
  const dLambda = (p2.lon - p1.lon) * deg2rad;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return Math.atan2(y, x);
}

/**
 * Interpolate a position at fraction `t ∈ [0, 1]` along the great circle
 * between `p1` and `p2` (spherical nlerp on unit vectors + renormalize).
 *
 * `t` is clamped; coincident endpoints return `p1`; antipodal endpoints
 * (undefined great circle) degrade to linear interpolation. Used for
 * resample fill points (features/reconstruction/resample.ts) and draw
 * midpoint handles (lib/map) — one implementation, both consumers.
 */
export function interpolateLatLon(p1: LatLon, p2: LatLon, t: number): LatLon {
  const clamped = Math.min(1, Math.max(0, t));
  const phi1 = p1.lat * deg2rad;
  const lambda1 = p1.lon * deg2rad;
  const phi2 = p2.lat * deg2rad;
  const lambda2 = p2.lon * deg2rad;

  const x1 = Math.cos(phi1) * Math.cos(lambda1);
  const y1 = Math.cos(phi1) * Math.sin(lambda1);
  const z1 = Math.sin(phi1);
  const x2 = Math.cos(phi2) * Math.cos(lambda2);
  const y2 = Math.cos(phi2) * Math.sin(lambda2);
  const z2 = Math.sin(phi2);

  const x = x1 + (x2 - x1) * clamped;
  const y = y1 + (y2 - y1) * clamped;
  const z = z1 + (z2 - z1) * clamped;
  const norm = Math.sqrt(x * x + y * y + z * z);
  if (norm === 0) return { lat: p1.lat, lon: p1.lon };

  const phi = Math.asin(Math.min(1, Math.max(-1, z / norm)));
  const lambda = Math.atan2(y, x);
  return {
    lat: phi / deg2rad,
    lon: ((((lambda / deg2rad) + 540) % 360) - 180),
  };
}

/**
 * Signed cross-track distance of `p` from the great-circle path
 * `from → to`, in meters (spherical mean-Earth approximation).
 *
 * Positive when `p` lies right of the travel direction, negative when left,
 * zero when on the path. Coincident `from`/`to` (no defined track) degrades
 * to the plain distance `from → p` (unsigned). Non-finite inputs → NaN.
 *
 * Used by the draw editor's straight-line heuristic (Phase 4) — a warning
 * aid, not a reported statistic, hence the spherical approximation is more
 * than sufficient (≪ 0.5 % error at running scale).
 */
export function crossTrackDistanceMeters(
  p: LatLon,
  from: LatLon,
  to: LatLon,
): number {
  if (
    !hasFiniteCoords(p) ||
    !hasFiniteCoords(from) ||
    !hasFiniteCoords(to)
  ) {
    return NaN;
  }
  const theta12 = initialBearingRad(from, to);
  const theta13 = initialBearingRad(from, p);
  const delta13 = haversineDistanceMeters(from, p) / MEAN_EARTH_RADIUS_M;
  if (delta13 === 0) return 0;
  // Degenerate track (coincident anchors): no direction defined — the
  // honest fallback is the plain distance to the anchor.
  if (haversineDistanceMeters(from, to) < 1e-9) {
    return haversineDistanceMeters(from, p);
  }
  const sinDxt = Math.sin(delta13) * Math.sin(theta13 - theta12);
  const clamped = Math.min(1, Math.max(-1, sinDxt));
  return Math.asin(clamped) * MEAN_EARTH_RADIUS_M;
}
