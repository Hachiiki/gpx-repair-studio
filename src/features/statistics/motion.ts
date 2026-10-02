/**
 * Time-in-motion statistics (docs/MASTER_PLAN.md §EE 15.3) — stopped-time
 * detection over the merged route.
 *
 * A pure function of the `MergeResult` the export pipeline already builds
 * (the same single basis the elevation rows and the splits use). The walk
 * mirrors `time.ts` leg semantics: legs are consecutive merged points
 * within one track, so a stop can never "span" two activities.
 *
 * Detection rule (disclosed in the UI copy):
 *   - a STOP LEG is a leg with 0 < Δt ≤ `timeGapMs` whose implied speed
 *     (leg length / Δt) is below `STOP_SPEED_MPS` (0.5 m/s — the same
 *     sub-threshold the Phase 13 drift detector uses for "not really
 *     moving"). GPS wander at a standstill stays under it; a honest walk
 *     (≈1.4 m/s) stays above it.
 *   - consecutive stop legs merge into one STOP EVENT (start time when
 *     timestamps exist, the distance marker where it begins, duration).
 *   - gap legs (Δt > `timeGapMs`) are NOT stopped time — the device
 *     stopped WRITING, and gap spans already have their own honesty row;
 *     reversed/untimed legs contribute nothing and are counted, exactly
 *     like `time.ts`.
 *   - legs inside a reconstructed stretch carry estimated timestamps —
 *     their events are flagged `estimated` (§J-2: the system never
 *     presents estimated time as measured).
 *
 * In-motion time = moving time − stopped time (both over the merged
 * route; the stats panel's recorded rows stay on their own joins).
 *
 * Phase 15 — Stats dashboard. Pure TypeScript: no React, no DOM.
 */

import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  OriginalTrackPoint,
  ReconstructedPoint,
} from "@/types/domain";

/** The sub-threshold speed that separates "stopped" from "moving" (m/s). */
export const STOP_SPEED_MPS = 0.5;

/** One detected stop event. */
export interface StopEvent {
  /** 1-based ordinal in route order. */
  index: number;
  /** Start timestamp, epoch ms — when the surrounding legs are timed. */
  startMs?: number;
  /** Route distance where the stop begins, meters. */
  atDistanceM: number;
  /** Total duration, ms. */
  durationMs: number;
  /** Any contributing leg was reconstructed (estimated timestamps). */
  provenance: "recorded" | "estimated" | "mixed";
}

/** The stopped-time summary + the walk's honest bookkeeping. */
export interface MotionSummary {
  /** True when at least one leg carried a usable timestamp. */
  hasTimingData: boolean;
  /** Wall time (t_last − t_first, document order). `undefined` when not
   * presentable (missing/non-monotonic timing — the `time.ts` rule). */
  wallTimeMs?: number;
  /** Σ Δt of legs with 0 < Δt ≤ timeGapMs (stopped time included). */
  movingMs: number;
  /** Σ stop-event durations (a subset of movingMs). */
  stoppedMs: number;
  /** movingMs − stoppedMs. */
  inMotionMs: number;
  /** Detected stop events in route order. */
  stopEvents: readonly StopEvent[];
  /** The longest event's duration (0 when there are none). */
  longestStopMs: number;
  /** The disclosed detection threshold. */
  stopSpeedMps: number;
  /** Bookkeeping the UI discloses alongside the rows (the time.ts vocabulary). */
  gapLegs: number;
  gapTimeMs: number;
  untimedLegs: number;
  reversedLegs: number;
  /** True when any moving leg sits in a reconstructed stretch. */
  hasEstimatedLegs: boolean;
}

export interface MotionOptions {
  timeGapMs?: number;
  stopSpeedMps?: number;
}

const EMPTY: MotionSummary = {
  hasTimingData: false,
  movingMs: 0,
  stoppedMs: 0,
  inMotionMs: 0,
  stopEvents: [],
  longestStopMs: 0,
  stopSpeedMps: STOP_SPEED_MPS,
  gapLegs: 0,
  gapTimeMs: 0,
  untimedLegs: 0,
  reversedLegs: 0,
  hasEstimatedLegs: false,
};

/**
 * Detect stopped time over the merged route. `null` merge (no file)
 * yields the empty summary; a route with no usable geometry yields it
 * too (nothing to be stopped about — the flags stay zero).
 */
export function stoppedTimeSummary(
  merge: MergeResult | null,
  options: MotionOptions = {},
): MotionSummary {
  if (!merge) {
    return {
      ...EMPTY,
      stopSpeedMps: options.stopSpeedMps ?? STOP_SPEED_MPS,
      stopEvents: [],
    };
  }
  const timeGapMs = options.timeGapMs ?? Number.POSITIVE_INFINITY;
  const stopSpeedMps = options.stopSpeedMps ?? STOP_SPEED_MPS;

  let hasTimingData = false;
  let firstTimeMs: number | undefined;
  let lastTimeMs: number | undefined;
  let movingMs = 0;
  let gapLegs = 0;
  let gapTimeMs = 0;
  let untimedLegs = 0;
  let reversedLegs = 0;
  let hasEstimatedLegs = false;

  let cumulative = 0;
  let previous: {
    lat: number;
    lon: number;
    time?: number;
    trackIndex: number;
    reconstructed: boolean;
  } | null = null;

  const stopEvents: StopEvent[] = [];
  let openEvent: {
    startMs?: number;
    atDistanceM: number;
    durationMs: number;
    recordedMask: number;
  } | null = null;

  const closeEvent = () => {
    if (openEvent === null) return;
    if (openEvent.durationMs > 0) {
      stopEvents.push({
        index: stopEvents.length + 1,
        ...(openEvent.startMs !== undefined ? { startMs: openEvent.startMs } : {}),
        atDistanceM: openEvent.atDistanceM,
        durationMs: openEvent.durationMs,
        provenance:
          openEvent.recordedMask === 1
            ? "recorded"
            : openEvent.recordedMask === 2
              ? "estimated"
              : "mixed",
      });
    }
    openEvent = null;
  };

  for (const track of merge.tracks) {
    for (const view of track.points) {
      const point = view.point;
      const isReconstructed = point.source === "reconstructed";
      const usable =
        isReconstructed || isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;

      const time = isReconstructed
        ? (point as ReconstructedPoint).time?.value
        : (point as OriginalTrackPoint).time;

      if (time !== undefined) {
        hasTimingData = true;
        if (firstTimeMs === undefined) firstTimeMs = time;
        lastTimeMs = time;
      }

      if (previous !== null) {
        const legM = geodesicDistanceMeters(previous, point);
        const sameTrack = previous.trackIndex === track.trackIndex;
        const dt =
          sameTrack && previous.time !== undefined && time !== undefined
            ? time - previous.time
            : null;

        if (legM > 0 && Number.isFinite(legM)) cumulative += legM;

        if (dt === null) {
          untimedLegs += 1;
          closeEvent();
        } else if (dt < 0) {
          reversedLegs += 1;
          closeEvent();
        } else if (dt > timeGapMs) {
          gapLegs += 1;
          gapTimeMs += dt;
          closeEvent();
        } else {
          movingMs += dt;
          if (previous.reconstructed || isReconstructed) hasEstimatedLegs = true;
          // dt is milliseconds — speed needs seconds.
          const speedMps =
            legM > 0 && Number.isFinite(legM) ? legM / (dt / 1000) : 0;
          if (speedMps < stopSpeedMps && dt > 0) {
            // Stop leg: extend the open event (or open one here).
            if (openEvent === null) {
              openEvent = {
                ...(previous.time !== undefined
                  ? { startMs: previous.time }
                  : {}),
                atDistanceM: Math.max(0, cumulative - (Number.isFinite(legM) ? legM : 0)),
                durationMs: 0,
                recordedMask: 0,
              };
            }
            openEvent.durationMs += dt;
            openEvent.recordedMask |=
              previous.reconstructed || isReconstructed ? 2 : 1;
          } else {
            closeEvent();
          }
        }
      }

      previous = {
        lat: point.lat,
        lon: point.lon,
        ...(time !== undefined ? { time } : {}),
        trackIndex: track.trackIndex,
        reconstructed: isReconstructed,
      };
    }
    // A track boundary ends any open stop (legs never span activities).
    closeEvent();
  }

  closeEvent();

  const stoppedMs = stopEvents.reduce((sum, e) => sum + e.durationMs, 0);
  const longestStopMs = stopEvents.reduce(
    (max, e) => Math.max(max, e.durationMs),
    0,
  );
  const wallTimeMs =
    firstTimeMs !== undefined && lastTimeMs !== undefined
      ? lastTimeMs - firstTimeMs
      : undefined;

  return {
    hasTimingData,
    ...(wallTimeMs !== undefined && wallTimeMs >= 0 ? { wallTimeMs } : {}),
    movingMs,
    stoppedMs,
    inMotionMs: Math.max(0, movingMs - stoppedMs),
    stopEvents,
    longestStopMs,
    stopSpeedMps,
    gapLegs,
    gapTimeMs,
    untimedLegs,
    reversedLegs,
    hasEstimatedLegs,
  };
}
