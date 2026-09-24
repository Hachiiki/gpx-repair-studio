/**
 * Snap — magnet snapping for drawn vertices (docs/MASTER_PLAN.md Phase 4:
 * "anchor snapping, optional snap-to-original-points").
 *
 * When the user places or drags a vertex near a recorded track point, the
 * vertex can adopt that point's exact coordinates (and record
 * `snappedTo`, so the provenance survives into export). The gap's own
 * boundary anchors are always offered as candidates with priority — a
 * vertex dropped near an anchor connects to it *exactly*.
 *
 * Purity: candidate building is a pure join over the immutable original
 * model; nearest-resolution is a pure scan. The map controller receives
 * the resolution function by injection (it computes the pixel→meter
 * threshold from the live zoom) — no maplibre code ever lives here.
 *
 * Phase 4 — Reconstruction Editor: Drawing. Pure TypeScript.
 */

import { isUsableStatsPoint } from "@/features/statistics/distance";
import { haversineDistanceMeters } from "@/lib/geo/geodesy";
import type {
  LatLon,
  OriginalTrackData,
  PointId,
} from "@/types/domain";

/** One place a vertex may snap to. */
export interface SnapCandidate {
  lat: number;
  lon: number;
  /** The recorded point this candidate mirrors (absent for synthetic spots). */
  pointId?: PointId;
  /** Gap boundary anchors — preferred over ordinary points on ties. */
  isAnchor?: boolean;
}

export interface BuildSnapCandidatesOptions {
  /** How far beyond the anchor-to-anchor box to search (km). Default 2. */
  inflateKm?: number;
  /** Upper bound on candidates (nearest kept). Default 2000. */
  maxCandidates?: number;
}

const KM_PER_DEGREE_LAT = 111.32;

/** Inflate a lat/lon box by roughly `km` in every direction. */
function inflateBox(
  a: LatLon,
  b: LatLon,
  km: number,
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const midLat = (a.lat + b.lat) / 2;
  const cosLat = Math.max(0.1, Math.cos((midLat * Math.PI) / 180));
  const dLat = km / KM_PER_DEGREE_LAT;
  const dLon = km / (KM_PER_DEGREE_LAT * cosLat);
  return {
    minLat: Math.min(a.lat, b.lat) - dLat,
    maxLat: Math.max(a.lat, b.lat) + dLat,
    minLon: Math.min(a.lon, b.lon) - dLon,
    maxLon: Math.max(a.lon, b.lon) + dLon,
  };
}

/**
 * Build the snap candidates for one gap: the two boundary anchors (with
 * priority) plus every usable recorded point inside the anchors' box
 * inflated by `inflateKm`. Damaged coordinates (invalid / out-of-range /
 * Null Island) are excluded by the shared `isUsableStatsPoint` predicate —
 * one definition of "usable point" across statistics, extent, rendering,
 * and snapping.
 */
export function buildSnapCandidates(
  data: OriginalTrackData,
  gap: { before: LatLon; after: LatLon },
  options: BuildSnapCandidatesOptions = {},
): SnapCandidate[] {
  const { inflateKm = 2, maxCandidates = 2000 } = options;
  const box = inflateBox(gap.before, gap.after, inflateKm);
  const centerX = (box.minLon + box.maxLon) / 2;
  const centerY = (box.minLat + box.maxLat) / 2;

  const inBox: SnapCandidate[] = [];
  for (const segment of data.segments) {
    for (const point of segment.points) {
      if (!isUsableStatsPoint(point)) continue;
      if (
        point.lat < box.minLat ||
        point.lat > box.maxLat ||
        point.lon < box.minLon ||
        point.lon > box.maxLon
      ) {
        continue;
      }
      inBox.push({ lat: point.lat, lon: point.lon, pointId: point.id });
    }
  }

  // Bound the scan cost for huge files: keep the candidates nearest to the
  // gap's center (cheap planar pre-sort; final selection stays geodesic).
  if (inBox.length > maxCandidates) {
    inBox.sort(
      (p, q) =>
        (p.lat - centerY) ** 2 +
        ((p.lon - centerX) * Math.cos((centerY * Math.PI) / 180)) ** 2 -
        ((q.lat - centerY) ** 2 +
          ((q.lon - centerX) * Math.cos((centerY * Math.PI) / 180)) ** 2),
    );
    inBox.length = maxCandidates;
  }

  // Anchors first: they win ties in `nearestSnap`.
  return [
    { ...gap.before, isAnchor: true },
    { ...gap.after, isAnchor: true },
    ...inBox,
  ];
}

/**
 * The nearest candidate within `maxDistanceM` of `target`, or `null`.
 * Haversine (spherical) measurement — snapping is a convenience magnet,
 * not a reported statistic; anchors beat ordinary points when both are in
 * range. Deterministic: first minimum wins distance ties (anchors first).
 */
export function nearestSnap(
  candidates: readonly SnapCandidate[],
  target: LatLon,
  maxDistanceM: number,
): SnapCandidate | null {
  if (!Number.isFinite(target.lat) || !Number.isFinite(target.lon)) {
    return null;
  }
  let best: SnapCandidate | null = null;
  let bestDistance = Infinity;
  let bestAnchor: SnapCandidate | null = null;
  let bestAnchorDistance = Infinity;
  for (const candidate of candidates) {
    const distance = haversineDistanceMeters(target, candidate);
    if (!Number.isFinite(distance) || distance > maxDistanceM) continue;
    if (candidate.isAnchor) {
      if (distance < bestAnchorDistance) {
        bestAnchor = candidate;
        bestAnchorDistance = distance;
      }
    } else if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  // Prefer the nearest anchor, even if an ordinary point is marginally
  // closer — exact anchor connection is the stronger intent signal.
  return bestAnchor ?? best;
}
