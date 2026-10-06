/**
 * The session index — Phase 24.1/24.4 (docs/plans/v3/
 * phase-24-activity-library-records.md): the derived numbers one saved
 * session contributes to the training library, computed on-device and
 * stored BESIDE the session in IndexedDB.
 *
 * One index, two populations, one walk each:
 *
 *   - CARD numbers (what a library card shows): distance, moving
 *     time, pace inputs, hysteresis elevation gain, time-weighted
 *     average heart rate — over the WHOLE merged route, repairs
 *     included, the same population the stats dashboard shows.
 *   - RECORD numbers (what records are allowed to read): recorded-
 *     only distance, moving time, and gain — reconstructed stretches
 *     never count toward a record (a record set on a drawn-in gap is
 *     not a record), and gain is withheld below the §L-1 elevation
 *     coverage floor exactly as the dashboard withholds it.
 *   - BEST EFFORTS (24.2): the ladder walk in records.ts over the
 *     same merged route, elapsed-time semantics, reconstructed
 *     stretches excluded.
 *
 * The index is derived ONE way, from the stored record + the original
 * bytes (`indexFromFileRecord`): a session saved today and a session
 * backfilled from an older shelf re-derive through the same parse →
 * working copy → merge → walk, so the library's numbers can never
 * disagree with a restored session's dashboard by construction.
 *
 * The record's shape is versioned like every stored record
 * (LIBRARY_INDEX_SCHEMA_VERSION); reads keep a ceiling — discard,
 * never guess.
 *
 * Phase 24 — Activity library, records & trends. Pure TypeScript.
 */

import { detectGaps } from "@/features/gpx/detectGaps";
import {
  bestEfforts,
  type SessionEffort,
} from "@/features/library/records";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { applyWorkingEdits } from "@/features/validation/workingCopy";
import { ELEVATION_COVERAGE_MIN } from "@/features/statistics/elevation";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import {
  DEFAULT_HYSTERESIS_THRESHOLD_M,
  hysteresisGainLoss,
} from "@/features/elevation/smoothing";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { StoredFileSession } from "@/lib/storage/session-record";
import type {
  GapId,
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
  ReconstructedPoint,
  WorkingTrackData,
} from "@/types/domain";
import type {
  MergeRepairSite,
  MergeResult,
} from "@/features/reconstruction/merge";

/** Bump when the index shape changes; the read side keeps a ceiling. */
export const LIBRARY_INDEX_SCHEMA_VERSION = 1;

/** The read-side ceiling: newer indexes are discarded, never guessed. */
const MAX_READABLE_INDEX_VERSION = LIBRARY_INDEX_SCHEMA_VERSION;

/** One session's derived library numbers (exactly what IndexedDB holds). */
export interface SessionIndex {
  schemaVersion: typeof LIBRARY_INDEX_SCHEMA_VERSION;
  hasTimingData: boolean;
  hasHrData: boolean;
  hasCadData: boolean;
  hasPowerData: boolean;
  /** First timed RECORDED point, epoch ms (the activity's date). */
  activityStartMs: number | null;

  // -- Card numbers (whole merged route, repairs included) ----------
  distanceM: number;
  movingTimeMs: number;
  /** Hysteresis gain, m — null below the §L-1 coverage floor. */
  gainM: number | null;
  /** Time-weighted average HR over legs that carry it, bpm. */
  avgHrBpm: number | null;
  /** Share of usable points with usable elevation (0–1). */
  elevationCoverage: number;

  // -- Record numbers (recorded-only; reconstructed never counts) ---
  recordedDistanceM: number;
  recordedMovingTimeMs: number;
  /** Hysteresis gain over recorded points only, m (same gate). */
  recordedGainM: number | null;

  /** How much of the route is drawn-in repair, m (the disclosure). */
  reconstructedDistanceM: number;
  trackCount: number;

  /** Best efforts over the ladder (24.2). */
  efforts: readonly SessionEffort[];
}

/** One walk point — the merged view flattened for the index pass. */
interface WalkPoint {
  lat: number;
  lon: number;
  time?: number;
  ele?: number;
  hr?: number;
  recon: boolean;
}

/**
 * Derive the index from a merged route. `timeGapMs` is the moving-time
 * threshold (the session's own gap thresholds — part of its meaning).
 * One pass computes every card and record number; the efforts walk is
 * records.ts's own O(n) sweep over the same merge.
 */
export function indexSession(
  merge: MergeResult | null,
  options: { timeGapMs: number },
): SessionIndex | null {
  if (!merge) return null;
  const timeGapMs = options.timeGapMs;

  let hasTimingData = false;
  let hasHrData = false;
  let hasCadData = false;
  let hasPowerData = false;
  let activityStartMs: number | null = null;

  let distanceM = 0;
  let movingTimeMs = 0;
  let hrWeightedMs = 0;
  let hrTimeMs = 0;
  let recordedDistanceM = 0;
  let recordedMovingTimeMs = 0;

  let pointsWithEle = 0;
  let pointsTotal = 0;

  // Dense elevation series: the whole route (holes where ele is
  // missing) and the recorded-only twin (holes across drawn-in
  // stretches too). Hysteresis continues across a hole from the last
  // committed reference — the honest reading of a gap in the profile.
  const eleSeries: (number | undefined)[] = [];
  const recEleSeries: (number | undefined)[] = [];

  for (const track of merge.tracks) {
    let prev: WalkPoint | null = null;
    for (const view of track.points) {
      const point = view.point;
      const recon = point.source === "reconstructed";
      const usable =
        recon || isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;

      const time = recon
        ? (point as ReconstructedPoint).time?.value
        : (point as OriginalTrackPoint).time;
      const ele = recon
        ? (point as ReconstructedPoint).ele?.value
        : (point as OriginalTrackPoint).ele;
      const metrics = recon
        ? undefined
        : (point as OriginalTrackPoint).metrics;

      const current: WalkPoint = {
        lat: point.lat,
        lon: point.lon,
        ...(time !== undefined ? { time } : {}),
        ...(ele !== undefined && Number.isFinite(ele) ? { ele } : {}),
        ...(metrics?.hr !== undefined ? { hr: metrics.hr } : {}),
        recon,
      };

      pointsTotal += 1;
      if (current.ele !== undefined) pointsWithEle += 1;
      if (time !== undefined) {
        hasTimingData = true;
        if (!recon && activityStartMs === null) activityStartMs = time;
      }
      if (metrics?.hr !== undefined) hasHrData = true;
      if (metrics?.cad !== undefined) hasCadData = true;
      if (metrics?.watts !== undefined) hasPowerData = true;

      if (prev !== null) {
        const legM = geodesicDistanceMeters(prev, current);
        const usableLegM = Number.isFinite(legM) && legM > 0 ? legM : 0;
        distanceM += usableLegM;

        const dt =
          prev.time !== undefined && current.time !== undefined
            ? current.time - prev.time
            : null;
        const moving = dt !== null && dt > 0 && dt <= timeGapMs;
        if (moving) {
          movingTimeMs += dt;
          if (prev.hr !== undefined && current.hr !== undefined) {
            hrWeightedMs += ((prev.hr + current.hr) / 2) * dt;
            hrTimeMs += dt;
          }
        }

        // Recorded-only: both endpoints must be plain recorded points.
        if (!recon && !prev.recon) {
          recordedDistanceM += usableLegM;
          if (moving) recordedMovingTimeMs += dt;
          recEleSeries.push(current.ele);
        } else {
          recEleSeries.push(undefined);
        }
        eleSeries.push(current.ele);
      } else {
        // First usable point of the track: elevation seeds, no leg.
        eleSeries.push(current.ele);
        recEleSeries.push(recon ? undefined : current.ele);
      }

      prev = current;
    }
  }

  const elevationCoverage = pointsTotal > 0 ? pointsWithEle / pointsTotal : 0;
  const gain = hysteresisGainLoss(eleSeries, DEFAULT_HYSTERESIS_THRESHOLD_M);
  const recGain = hysteresisGainLoss(
    recEleSeries,
    DEFAULT_HYSTERESIS_THRESHOLD_M,
  );
  const coverageOk =
    pointsTotal > 0 && elevationCoverage >= ELEVATION_COVERAGE_MIN;

  return {
    schemaVersion: LIBRARY_INDEX_SCHEMA_VERSION,
    hasTimingData,
    hasHrData,
    hasCadData,
    hasPowerData,
    activityStartMs,
    distanceM,
    movingTimeMs,
    gainM: coverageOk ? gain.gainM : null,
    avgHrBpm: hrTimeMs > 0 ? hrWeightedMs / hrTimeMs : null,
    elevationCoverage,
    recordedDistanceM,
    recordedMovingTimeMs,
    recordedGainM: coverageOk ? recGain.gainM : null,
    reconstructedDistanceM: merge.reconstructedDistanceM,
    trackCount: merge.tracks.length,
    efforts: bestEfforts(merge),
  };
}

// ---------------------------------------------------------------------------
// From a stored record (the one derivation path)
// ---------------------------------------------------------------------------

/**
 * Whether the parsed data carries any usable timestamp (mergeRepairs
 * wants to know before the merge; the record does not store it).
 */
function anyTimedPoint(data: OriginalTrackData): boolean {
  for (const segment of data.segments) {
    for (const point of segment.points) {
      if (point.time !== undefined) return true;
    }
  }
  return false;
}

/**
 * Rebuild the merge a saved file-session's dashboard showed: the
 * working copy (confirmed fixes applied), the committed repairs
 * re-joined by gap id (the same join use-gpx-export performs, minus
 * the live elevation samples a record never carried). Mirrors the
 * export hook's population rule so the numbers cannot drift.
 */
export function mergeFromFileRecord(
  data: OriginalTrackData,
  record: StoredFileSession,
): MergeResult {
  const working: WorkingTrackData = applyWorkingEdits(
    data,
    record.workingEdits,
  );

  const gaps = detectGaps(data, record.gapThresholds);
  const spans = new Map(record.manualSpans.map((span) => [span.id, span]));
  const sites: MergeRepairSite[] = [];
  for (const [gapId, recon] of Object.entries(record.reconstructions)) {
    const gapKey = gapId as GapId;
    const gap = gaps.find((g) => g.id === gapKey);
    const span = spans.get(gapKey);
    let beforePointId: PointId | undefined;
    let afterPointId: PointId | undefined;
    let extendSide: "before" | "after" | undefined;
    if (gap !== undefined) {
      beforePointId = gap.before.pointId;
      afterPointId = gap.after.pointId;
    } else if (span !== undefined) {
      if (span.kind === "extend") {
        // Open extension: the anchor rides the boundary the span kept.
        extendSide = span.side === "after" ? "after" : "before";
        if (span.side === "before") {
          afterPointId = span.anchorPointId;
        } else {
          beforePointId = span.anchorPointId;
        }
      } else {
        beforePointId = span.beforePointId;
        afterPointId = span.afterPointId;
      }
    } else {
      // A reconstruction whose gap no longer detects — the record
      // drifted; the repair is skipped, never guessed into place.
      continue;
    }
    sites.push({
      gapId: gapKey,
      ...(beforePointId !== undefined ? { beforePointId } : {}),
      ...(afterPointId !== undefined ? { afterPointId } : {}),
      ...(extendSide !== undefined ? { extendSide } : {}),
      vertices: recon.vertices,
      resampleSpacingM: recon.resampleSpacingM,
      ...(recon.pathStyle !== undefined ? { pathStyle: recon.pathStyle } : {}),
      timeStrategy: recon.timeStrategy,
      roadLegs: record.roadLegs[gapId] ?? [],
    });
  }

  return mergeRepairs(working, sites, {
    fileTiming: record.fileTiming,
    fileHasTimingData: anyTimedPoint(data),
  });
}

/**
 * Derive one saved file-session's index from its stored record and
 * the parsed original data — the single path every index takes,
 * whether the session was just saved or backfilled from an old shelf.
 */
export function indexFromFileRecord(
  data: OriginalTrackData,
  record: StoredFileSession,
): SessionIndex | null {
  const merge = mergeFromFileRecord(data, record);
  return indexSession(merge, {
    timeGapMs: record.gapThresholds.timeGapMs,
  });
}

// ---------------------------------------------------------------------------
// Read-side validation (the "discard, never guess" ceiling)
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate a stored index (shape + version ceiling). Returns the index
 * or null — a drifted record is discarded, never partially read.
 */
export function readSessionIndex(value: unknown): SessionIndex | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== LIBRARY_INDEX_SCHEMA_VERSION) return null;
  if (
    (raw.schemaVersion as number) > MAX_READABLE_INDEX_VERSION
  ) {
    return null;
  }
  if (typeof raw.hasTimingData !== "boolean") return null;
  if (typeof raw.hasHrData !== "boolean") return null;
  if (typeof raw.hasCadData !== "boolean") return null;
  if (typeof raw.hasPowerData !== "boolean") return null;
  if (
    raw.activityStartMs !== null &&
    !isFiniteNumber(raw.activityStartMs)
  ) {
    return null;
  }
  const activityStartMs = raw.activityStartMs as number | null;
  // Guards read through locals — indexed-access narrowing does not
  // stick on `raw[key]` after a loop, and `as number` casts would
  // hide a future field rename.
  const distanceM = raw.distanceM;
  if (!isFiniteNumber(distanceM)) return null;
  const movingTimeMs = raw.movingTimeMs;
  if (!isFiniteNumber(movingTimeMs)) return null;
  const recordedDistanceM = raw.recordedDistanceM;
  if (!isFiniteNumber(recordedDistanceM)) return null;
  const recordedMovingTimeMs = raw.recordedMovingTimeMs;
  if (!isFiniteNumber(recordedMovingTimeMs)) return null;
  const reconstructedDistanceM = raw.reconstructedDistanceM;
  if (!isFiniteNumber(reconstructedDistanceM)) return null;
  const elevationCoverage = raw.elevationCoverage;
  if (!isFiniteNumber(elevationCoverage)) return null;
  const trackCount = raw.trackCount;
  if (!isFiniteNumber(trackCount)) return null;
  const gainM = raw.gainM;
  if (gainM !== null && !isFiniteNumber(gainM)) return null;
  const recordedGainM = raw.recordedGainM;
  if (recordedGainM !== null && !isFiniteNumber(recordedGainM)) return null;
  const avgHrBpm = raw.avgHrBpm;
  if (avgHrBpm !== null && !isFiniteNumber(avgHrBpm)) return null;
  if (!Array.isArray(raw.efforts)) return null;
  const efforts: SessionEffort[] = [];
  for (const entry of raw.efforts) {
    if (typeof entry !== "object" || entry === null) return null;
    const effort = entry as Record<string, unknown>;
    if (!isFiniteNumber(effort.distanceM)) return null;
    if (!isFiniteNumber(effort.timeMs)) return null;
    if (typeof effort.startInterpolated !== "boolean") return null;
    if (typeof effort.endInterpolated !== "boolean") return null;
    if (!(effort.distanceM > 0) || !(effort.timeMs > 0)) return null;
    efforts.push({
      distanceM: effort.distanceM,
      timeMs: effort.timeMs,
      startInterpolated: effort.startInterpolated,
      endInterpolated: effort.endInterpolated,
    });
  }
  return {
    schemaVersion: LIBRARY_INDEX_SCHEMA_VERSION,
    hasTimingData: raw.hasTimingData,
    hasHrData: raw.hasHrData,
    hasCadData: raw.hasCadData,
    hasPowerData: raw.hasPowerData,
    activityStartMs,
    distanceM,
    movingTimeMs,
    gainM,
    avgHrBpm,
    elevationCoverage,
    recordedDistanceM,
    recordedMovingTimeMs,
    recordedGainM,
    reconstructedDistanceM,
    trackCount,
    efforts,
  };
}
