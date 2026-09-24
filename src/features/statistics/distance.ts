/**
 * Original-data distance statistics (docs/MASTER_PLAN.md §L-1).
 *
 * `originalDistance` = Σ geodesic leg lengths over recorded points, as
 * recorded (GPS noise included — noise filtering is a non-goal). Legs are
 * consecutive point pairs **within one segment**: a segment break means the
 * device stopped writing geometry, so there is no recorded line between the
 * last point of one segment and the first point of the next (that span is
 * the segment-break *gap*, not recorded distance).
 *
 * Honesty rules (§L-2): legs whose endpoints are flagged as damaged
 * (unparseable / out-of-range / zero coordinates) are excluded and COUNTED,
 * never silently guessed — the UI shows how many legs were excluded and why.
 * All other anomalies (duplicate points, reversed times, …) keep their legs:
 * a `dup` leg simply contributes its true length of ~0.
 *
 * Contract: expects a model enriched by `validateGpx` (out-of-range flags
 * are added there). The session pipeline always validates before computing
 * statistics.
 *
 * Phase 2 — original-only statistics. Pure TypeScript: no React, no DOM.
 */

import type {
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  SegmentId,
} from "@/types/domain";
import { geodesicDistanceMeters, hasFiniteCoords } from "@/lib/geo/geodesy";

/** Reasons a leg can be excluded from recorded distance. */
export type ExcludedLegReason =
  | "invalid-coord" // NaN coordinates (parse-time flag)
  | "out-of-range-coord" // |lat| > 90 or |lon| > 180 (validate-time flag)
  | "zero-coord"; // GPS-loss artifact at (0, 0) (parse-time flag)

/**
 * A point usable as a distance/extent endpoint. Mirrors the gap detector's
 * `usableCoords` plus the zero-coordinate damage flag: a spurious jump to
 * Null Island must not inflate the recorded distance (§L-2 honesty).
 * Exported because the session hook reuses it for the recorded extent
 * (bbox) shown by the map placeholder — one shared definition.
 */
export function isUsableStatsPoint(p: OriginalTrackPoint): boolean {
  return (
    hasFiniteCoords(p) &&
    !p.flags.includes("invalid-coord") &&
    !p.flags.includes("out-of-range-coord") &&
    !p.flags.includes("zero-coord")
  );
}

function usableForDistance(p: OriginalTrackPoint): boolean {
  return isUsableStatsPoint(p);
}

/** The first blocking reason for a leg with an unusable endpoint. */
function exclusionReason(p: OriginalTrackPoint): ExcludedLegReason {
  if (p.flags.includes("invalid-coord") || !hasFiniteCoords(p)) {
    return "invalid-coord";
  }
  if (p.flags.includes("out-of-range-coord")) return "out-of-range-coord";
  return "zero-coord";
}

/** Per-segment distance result. */
export interface SegmentDistanceStats {
  segmentId: SegmentId;
  /** Sum of geodesic lengths over usable consecutive legs (meters). */
  distanceM: number;
  /** Number of legs skipped because an endpoint was flagged/unusable. */
  excludedLegs: number;
}

/** File-level original-distance result. */
export interface DistanceStats {
  /** Σ `SegmentDistanceStats.distanceM` across all segments (meters). */
  totalDistanceM: number;
  /** Legs included in the total. */
  usableLegs: number;
  /** Legs excluded (flagged endpoints); breakdown by first blocking reason. */
  excludedLegs: number;
  excludedByReason: Readonly<Record<ExcludedLegReason, number>>;
  perSegment: readonly SegmentDistanceStats[];
}

const ZERO_REASONS: Record<ExcludedLegReason, number> = {
  "invalid-coord": 0,
  "out-of-range-coord": 0,
  "zero-coord": 0,
};

/**
 * Walk one segment's consecutive pairs. Every pair is exactly one leg:
 * measured when both endpoints are usable, otherwise excluded with the
 * first blocking reason of the unusable endpoint(s).
 */
function walkSegment(
  segment: OriginalSegment,
  onMeasured: (meters: number) => void,
  onExcluded: (reason: ExcludedLegReason) => void,
): { usableLegs: number; excludedLegs: number } {
  let usableLegs = 0;
  let excludedLegs = 0;
  const points = segment.points;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (usableForDistance(prev) && usableForDistance(curr)) {
      onMeasured(geodesicDistanceMeters(prev, curr));
      usableLegs += 1;
    } else {
      onExcluded(!usableForDistance(prev) ? exclusionReason(prev) : exclusionReason(curr));
      excludedLegs += 1;
    }
  }

  return { usableLegs, excludedLegs };
}

/** Geodesic length of one segment's usable legs (see module doc). */
export function segmentDistanceStats(
  segment: OriginalSegment,
): SegmentDistanceStats {
  let distanceM = 0;
  const { excludedLegs } = walkSegment(
    segment,
    (meters) => {
      distanceM += meters;
    },
    () => {},
  );
  return { segmentId: segment.id, distanceM, excludedLegs };
}

/** Original-distance statistics for the whole file. */
export function originalDistanceStats(data: OriginalTrackData): DistanceStats {
  const perSegment: SegmentDistanceStats[] = [];
  const excludedByReason: Record<ExcludedLegReason, number> = { ...ZERO_REASONS };
  let usableLegs = 0;
  let excludedLegs = 0;

  for (const segment of data.segments) {
    let segmentDistanceM = 0;
    const counts = walkSegment(
      segment,
      (meters) => {
        segmentDistanceM += meters;
      },
      (reason) => {
        excludedByReason[reason] += 1;
      },
    );
    usableLegs += counts.usableLegs;
    excludedLegs += counts.excludedLegs;
    perSegment.push({
      segmentId: segment.id,
      distanceM: segmentDistanceM,
      excludedLegs: counts.excludedLegs,
    });
  }

  return {
    totalDistanceM: perSegment.reduce((sum, s) => sum + s.distanceM, 0),
    usableLegs,
    excludedLegs,
    excludedByReason,
    perSegment,
  };
}
