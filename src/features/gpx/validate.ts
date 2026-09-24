/**
 * GPX validator — structural + semantic checks over the parsed model
 * (docs/MASTER_PLAN.md §H-3).
 *
 * Contract:
 *
 *   - **Nothing is auto-corrected.** The validator *reports*; the user
 *     decides (§H-3). The input model is never mutated: relational
 *     anomalies (`out-of-range-coord`, `time-reversed`, `speed-spike`,
 *     `dup`) are folded as flags into a **copied** model, and every
 *     finding is also emitted as a `ValidationIssue` referencing the
 *     involved points/segments.
 *   - **Parse-time anomalies are bridged, not duplicated.** `parseGpx`
 *     already emits issues for point-local damage (`invalid-coord`,
 *     `invalid-ele`, `unreliable-time`); this module aggregates the
 *     remaining parse flag (`zero-coord` runs) and adds the relational
 *     and structural findings on top. The returned `data.issues` is the
 *     complete list (parse issues first, validator findings after).
 *   - **Bounded output.** Per-kind findings are aggregated into a single
 *     issue carrying all point references — a chronically corrupt file
 *     cannot balloon the report to one-issue-per-point.
 *   - Speed legs use the shared geodesy module (§E-2) — implied speed is
 *     geodesic distance over elapsed time, never planar lat/lon math.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript: no DOM, no framework, no I/O.
 */

import type {
  OriginalTrackData,
  OriginalTrackPoint,
  PointAnomaly,
  PointRef,
  SegmentId,
  ValidationIssue,
} from "@/types/domain";
import { geodesicDistanceMeters, hasFiniteCoords } from "@/lib/geo/geodesy";
import { deepFreeze } from "./deepFreeze";

/** Options for `validateGpx`. */
export interface ValidateOptions {
  /**
   * Legs with an implied speed above this value (km/h) flag the later
   * point with `speed-spike`. Default 25 (brisk cycling, implausible
   * running — running-world default per §H-4).
   */
  speedSpikeKmh?: number;
  /** Elevation sanity window in meters. Default [-430, 9000]. */
  eleRange?: { min: number; max: number };
}

/** Result of `validateGpx`. */
export interface ValidationResult {
  /** New model instance: flags enriched, issues merged, re-frozen in dev. */
  readonly data: OriginalTrackData;
  /** Convenience alias of `data.issues` — the complete issue list. */
  readonly issues: readonly ValidationIssue[];
}

const DEFAULT_SPEED_SPIKE_KMH = 25;
const DEFAULT_ELE_RANGE = { min: -430, max: 9000 } as const;

const KMH_TO_MS = 1 / 3.6;

/** True when the point's finite coordinates fall outside legal ranges. */
function isOutOfRangeCoord(p: OriginalTrackPoint): boolean {
  // NaN (invalid-coord) is handled by parse; ranges only apply to numbers.
  if (Number.isNaN(p.lat) || Number.isNaN(p.lon)) return false;
  return Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180;
}

/**
 * Enrich a parsed model with relational anomaly flags and the full issue
 * list. Pure: returns a new instance, input untouched (it is frozen anyway
 * in dev/test builds).
 */
export function validateGpx(
  data: OriginalTrackData,
  options: ValidateOptions = {},
): ValidationResult {
  const speedSpikeMs = (options.speedSpikeKmh ?? DEFAULT_SPEED_SPIKE_KMH) * KMH_TO_MS;
  const eleRange = options.eleRange ?? DEFAULT_ELE_RANGE;

  // ---- Per-point and per-pair findings, collected per kind ---------------
  const outOfRangeCoordRefs: PointRef[] = [];
  const outOfRangeEleRefs: PointRef[] = [];
  const zeroCoordRunRefs: PointRef[] = [];
  const reversedRefs: PointRef[] = [];
  const speedSpikeRefs: PointRef[] = [];
  const dupRefs: PointRef[] = [];
  let reversedPairs = 0;
  let speedPairs = 0;
  let dupPairs = 0;
  let timedPoints = 0;

  const emptySegments: SegmentId[] = [];
  const singlePointSegments: SegmentId[] = [];
  const tracksWithoutSegments: number[] = [];

  /** Extra flags per point id (relational anomalies computed here). */
  const flagAdditions = new Map<string, PointAnomaly[]>();
  const addFlag = (point: OriginalTrackPoint, segId: SegmentId, flag: PointAnomaly, refs: PointRef[]) => {
    const existing = flagAdditions.get(point.id);
    if (existing === undefined) flagAdditions.set(point.id, [flag]);
    else if (!existing.includes(flag)) existing.push(flag);
    refs.push({ segmentId: segId, pointId: point.id });
  };

  for (const segment of data.segments) {
    if (segment.points.length === 0) {
      emptySegments.push(segment.id);
      continue;
    }
    if (segment.points.length === 1) {
      singlePointSegments.push(segment.id);
    }

    // Track zero-coord points (flags already set by parse; aggregate refs).
    let previous: OriginalTrackPoint | undefined;

    for (const point of segment.points) {
      if (point.time !== undefined) timedPoints += 1;

      if (isOutOfRangeCoord(point)) {
        addFlag(point, segment.id, "out-of-range-coord", outOfRangeCoordRefs);
      }

      if (point.flags.includes("zero-coord")) {
        zeroCoordRunRefs.push({ segmentId: segment.id, pointId: point.id });
      }

      if (point.ele !== undefined && (point.ele < eleRange.min || point.ele > eleRange.max)) {
        outOfRangeEleRefs.push({ segmentId: segment.id, pointId: point.id });
      }

      if (previous !== undefined) {
        // Time monotonicity — equal allowed, backwards flagged (§H-3).
        if (
          previous.time !== undefined &&
          point.time !== undefined &&
          point.time < previous.time
        ) {
          reversedPairs += 1;
          addFlag(point, segment.id, "time-reversed", reversedRefs);
        }

        // Consecutive duplicate coordinates.
        if (previous.lat === point.lat && previous.lon === point.lon) {
          dupPairs += 1;
          addFlag(point, segment.id, "dup", dupRefs);
        }

        // Implied leg speed via geodesy — only with usable times and coords.
        if (
          previous.time !== undefined &&
          point.time !== undefined &&
          point.time > previous.time &&
          hasFiniteCoords(previous) &&
          hasFiniteCoords(point) &&
          !isOutOfRangeCoord(previous) &&
          !isOutOfRangeCoord(point)
        ) {
          const elapsedMs = point.time - previous.time;
          const meters = geodesicDistanceMeters(previous, point);
          if (meters / (elapsedMs / 1000) > speedSpikeMs) {
            speedPairs += 1;
            addFlag(point, segment.id, "speed-spike", speedSpikeRefs);
          }
        }
      }
      previous = point;
    }
  }

  for (const track of data.tracks) {
    const hasSegments = data.segments.some((s) => s.trackIndex === track.trackIndex);
    if (!hasSegments) tracksWithoutSegments.push(track.trackIndex);
  }

  // ---- Assemble issues (parse issues first, then validator findings) -----
  const issues: ValidationIssue[] = [...data.issues];

  if (outOfRangeCoordRefs.length > 0) {
    issues.push({
      kind: "out-of-range-coord",
      severity: "warning",
      message: `${outOfRangeCoordRefs.length} track point(s) have lat/lon outside [-90, 90] / [-180, 180].`,
      points: outOfRangeCoordRefs,
    });
  }
  if (zeroCoordRunRefs.length > 0) {
    issues.push({
      kind: "zero-coord",
      severity: "warning",
      message:
        `${zeroCoordRunRefs.length} track point(s) sit at (0, 0) — the classic ` +
        "GPS-signal-loss artifact (Gulf of Guinea).",
      points: zeroCoordRunRefs,
    });
  }
  if (outOfRangeEleRefs.length > 0) {
    issues.push({
      kind: "out-of-range-ele",
      severity: "warning",
      message:
        `${outOfRangeEleRefs.length} track point(s) have <ele> outside ` +
        `[${eleRange.min}, ${eleRange.max}] m.`,
      points: outOfRangeEleRefs,
    });
  }
  if (reversedPairs > 0) {
    issues.push({
      kind: "time-reversed",
      severity: "warning",
      message: `${reversedPairs} time transition(s) run backwards.`,
      points: reversedRefs,
    });
  }
  if (speedPairs > 0) {
    issues.push({
      kind: "speed-spike",
      severity: "warning",
      message:
        `${speedPairs} leg(s) imply a speed above ` +
        `${(speedSpikeMs / KMH_TO_MS).toFixed(0)} km/h.`,
      points: speedSpikeRefs,
    });
  }
  if (dupPairs > 0) {
    issues.push({
      kind: "duplicate-point",
      severity: "info",
      message: `${dupPairs} consecutive duplicate coordinate pair(s).`,
      points: dupRefs,
    });
  }
  if (emptySegments.length > 0) {
    issues.push({
      kind: "empty-segment",
      severity: "warning",
      message: `${emptySegments.length} <trkseg> element(s) contain no <trkpt>.`,
      segments: emptySegments,
    });
  }
  if (singlePointSegments.length > 0) {
    issues.push({
      kind: "single-point-segment",
      severity: "info",
      message: `${singlePointSegments.length} <trkseg> element(s) contain a single point.`,
      segments: singlePointSegments,
    });
  }
  if (tracksWithoutSegments.length > 0) {
    issues.push({
      kind: "track-without-segments",
      severity: "info",
      message:
        `Track(s) [${tracksWithoutSegments.join(", ")}] contain no <trkseg>.`,
    });
  }
  const totalPoints = data.segments.reduce((n, s) => n + s.points.length, 0);
  if (totalPoints > 0 && timedPoints === 0) {
    issues.push({
      kind: "no-timing-data",
      severity: "info",
      message:
        "No track point carries a usable <time> — the file has no timing " +
        "data. Durations and pace cannot be computed (Phase 2 'no timing " +
        "data' mode).",
    });
  }

  // ---- Copy-with-enriched-flags (input model stays untouched) ------------
  const segments = data.segments.map((segment) => ({
    ...segment,
    points: segment.points.map((point) => {
      const additions = flagAdditions.get(point.id);
      if (additions === undefined) return point; // keep identity for clean points
      return { ...point, flags: [...point.flags, ...additions] };
    }),
  }));

  const enriched: OriginalTrackData = { ...data, segments, issues };

  if (process.env.NODE_ENV !== "production") {
    deepFreeze(enriched);
  }

  return { data: enriched, issues };
}
