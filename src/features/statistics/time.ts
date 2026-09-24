/**
 * Original-data time-bucket statistics (docs/MASTER_PLAN.md §L-1).
 *
 * Time buckets over the recorded timestamps:
 *   - `recordedMovingTime` = Σ legs' Δt where Δt ≤ the gap threshold
 *     (excludes gaps and pauses).
 *   - `wallTime` = t_last − t_first (the real elapsed activity time, gaps
 *     included).
 *
 * Leg semantics — deliberately different from distance.ts: a time leg is
 * any consecutive point pair in document order **within the same track**
 * (spanning segment breaks), exactly matching the gap detector's boundary
 * definition. This alignment is what makes the §L-1 breakdown honest:
 * recorded spans + gap spans ≈ wall time for a well-formed file, and the
 * same boundary is never both "moving" and "a gap".
 *
 * Honesty rules (§L-2): reversed legs (Δt < 0) contribute nothing to moving
 * time and are counted, never clamped-and-summed; legs with a missing
 * endpoint time are untimed and counted; when no point carries a usable
 * `<time>`, `hasTimingData` is false and the UI renders "—" with a reason
 * instead of fabricated values.
 *
 * Phase 2 — original-only statistics. Pure TypeScript: no React, no DOM.
 */

import type { OriginalTrackData, OriginalTrackPoint } from "@/types/domain";

/** File-level time-bucket result. */
export interface TimeStats {
  /** True when at least one point carries a usable `<time>`. */
  hasTimingData: boolean;
  pointsWithTime: number;
  pointsTotal: number;
  /** First/last timed point in document order (epoch ms). */
  firstTimeMs?: number;
  lastTimeMs?: number;
  /**
   * `t_last − t_first` in document order. Undefined when timing data is
   * missing or the difference is negative (non-monotonic recording).
   */
  wallTimeMs?: number;
  /** Σ Δt over legs with 0 ≤ Δt ≤ `timeGapMs` (ms). */
  recordedMovingTimeMs: number;
  /** Legs with Δt strictly greater than `timeGapMs`. */
  gapLegs: number;
  /** Total time inside gap legs (ms) — the "gap spans" of the §L-1 breakdown. */
  gapTimeMs: number;
  /** Legs where either endpoint lacks a usable time. */
  untimedLegs: number;
  /** Legs with Δt < 0 (time-reversed recording). */
  reversedLegs: number;
}

/**
 * Compute time buckets.
 *
 * @param timeGapMs the same value as `GapThresholds.timeGapMs`
 * (`features/gpx/detectGaps`) — legs longer than this are gap spans.
 */
export function originalTimeStats(
  data: OriginalTrackData,
  timeGapMs: number,
): TimeStats {
  let pointsWithTime = 0;
  let pointsTotal = 0;
  let firstTimeMs: number | undefined;
  let lastTimeMs: number | undefined;
  let recordedMovingTimeMs = 0;
  let gapLegs = 0;
  let gapTimeMs = 0;
  let untimedLegs = 0;
  let reversedLegs = 0;

  // Walk segments in document order; legs span segment breaks but never
  // track boundaries (different <trk> elements are separate activities,
  // matching detectGaps).
  let previous: { point: OriginalTrackPoint; trackIndex: number } | undefined;

  const consider = (point: OriginalTrackPoint, trackIndex: number) => {
    pointsTotal += 1;
    if (point.time !== undefined) {
      pointsWithTime += 1;
      if (firstTimeMs === undefined) firstTimeMs = point.time;
      lastTimeMs = point.time;
    }

    if (previous && previous.trackIndex === trackIndex) {
      const before = previous.point;
      if (before.time === undefined || point.time === undefined) {
        untimedLegs += 1;
      } else {
        const dt = point.time - before.time;
        if (dt < 0) {
          reversedLegs += 1;
        } else if (dt > timeGapMs) {
          gapLegs += 1;
          gapTimeMs += dt;
        } else {
          recordedMovingTimeMs += dt;
        }
      }
    }
    previous = { point, trackIndex };
  };

  for (const segment of data.segments) {
    for (const point of segment.points) {
      consider(point, segment.trackIndex);
    }
  }

  const wallTimeMs =
    firstTimeMs !== undefined && lastTimeMs !== undefined
      ? lastTimeMs - firstTimeMs
      : undefined;

  return {
    hasTimingData: pointsWithTime > 0,
    pointsWithTime,
    pointsTotal,
    ...(firstTimeMs !== undefined ? { firstTimeMs } : {}),
    ...(lastTimeMs !== undefined ? { lastTimeMs } : {}),
    // Negative wall time means non-monotonic recording — not presentable.
    ...(wallTimeMs !== undefined && wallTimeMs >= 0 ? { wallTimeMs } : {}),
    recordedMovingTimeMs,
    gapLegs,
    gapTimeMs,
    untimedLegs,
    reversedLegs,
  };
}
