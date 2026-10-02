/**
 * Deep validation — the detector suite (docs/MASTER_PLAN.md §EE 13.1).
 *
 * Where the Phase 1 validator (`features/gpx/validate.ts`) reports
 * structural damage at a conservative pace threshold (25 km/h flags a
 * brisk-but-legal descent as "suspicious"), the deep checks hunt the
 * damage a FIX can address: teleports, near-duplicates, backwards
 * clocks, elevation spikes, stop-and-wander GPS drift, and
 * missing-elevation runs. Every threshold is configurable; every
 * finding is aggregated per kind (bounded output) and carries the point
 * references the report UI lists and jumps to.
 *
 * Contract:
 *   - **Nothing is auto-corrected** (§EE non-goal). Detection reports;
 *     `features/validation/fixes.ts` plans; the user confirms.
 *   - **Pure and total.** Same model → same report; never throws; the
 *     input model is only read. Runs on the ORIGINAL model or the
 *     WORKING copy alike — re-running on the working copy is what makes
 *     fixed issues disappear from the report.
 *   - **Honest boundaries.** Legs are within-segment (a segment break is
 *     the recorder's own cut, not damage); points without usable
 *     coordinates/time are skipped by the checks that need them; the
 *     parse-level damage (`invalid-coord`, `zero-coord`, …) keeps its
 *     Phase 1 flags and is not re-reported here.
 *
 * Phase 13 — Deep validation & repair presets. Pure TypeScript.
 */

import {
  geodesicDistanceMeters,
  hasFiniteCoords,
} from "@/lib/geo/geodesy";
import type {
  DeepIssue,
  DeepIssueKind,
  DeepReport,
  FixKind,
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  PointRef,
  SegmentId,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Thresholds of the deep checks. Every default is overridable. */
export interface DeepValidateOptions {
  /**
   * Implied leg speed above this (km/h) flags the later point of the
   * leg as a teleport victim. Default 130 — physically implausible for
   * any self-powered activity; the conservative 25 km/h "suspicious
   * pace" signal stays the Phase 1 validator's job.
   */
  speedSpikeKmh?: number;
  /**
   * Points closer than this (meters) to one of the previous
   * `duplicateWindow` points are near-duplicates. Default 1 m (§EE).
   */
  duplicateRadiusM?: number;
  /** How many previous points form the duplicate window. Default 3. */
  duplicateWindow?: number;
  /**
   * A leg slower than this (m/s) is "stopped". A run of stopped legs
   * lasting at least `driftMinDurationMs` while staying within
   * `driftRadiusM` of its start is likely GPS drift. Defaults 0.5 m/s
   * (§EE), 30 s, 10 m.
   */
  driftSpeedMps?: number;
  /** Minimum duration of a drift run, ms. Default 30 000. */
  driftMinDurationMs?: number;
  /** Maximum displacement of a drift run from its start, meters. Default 10. */
  driftRadiusM?: number;
  /**
   * Consecutive-point elevation change above this (meters) on BOTH
   * sides of a point (up-down) flags the point — the classic pressure
   * spike. Default 30 m.
   */
  elevationStepM?: number;
  /**
   * Robust z-score: |ele − median| / (1.4826 × MAD) above this flags a
   * sustained elevation outlier. Default 5 (generous — elevation is not
   * normally distributed; the MAD-based score only catches the truly
   * absurd). `0` disables the z-score check.
   */
  elevationZScore?: number;
  /** Runs of at least this many consecutive points without <ele> are reported. Default 5. */
  missingEleRunLength?: number;
}

/** The shipped defaults (§EE 13.1 + the refinements above). */
export const DEFAULT_DEEP_OPTIONS: Required<DeepValidateOptions> = {
  speedSpikeKmh: 130,
  duplicateRadiusM: 1,
  duplicateWindow: 3,
  driftSpeedMps: 0.5,
  driftMinDurationMs: 30_000,
  driftRadiusM: 10,
  elevationStepM: 30,
  elevationZScore: 5,
  missingEleRunLength: 5,
};

const KMH_TO_MS = 1 / 3.6;

// ---------------------------------------------------------------------------
// Per-kind detectors (each returns its aggregated issue or null)
// ---------------------------------------------------------------------------

interface SegmentScan {
  segment: OriginalSegment;
  /** Indexes of points the speed check flagged. */
  spikeIndexes: number[];
  /** Indexes of points the duplicate check flagged. */
  duplicateIndexes: number[];
  /** Indexes of points the drift check flagged (run members, first kept). */
  driftIndexes: number[];
  /** Indexes of points the elevation checks flagged. */
  eleOutlierIndexes: number[];
  /** Number of backwards time transitions. */
  reversedTransitions: number;
}

/** True when the point's coordinates are usable for leg math. */
function usable(p: OriginalTrackPoint): boolean {
  return (
    hasFiniteCoords(p) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180 &&
    !p.flags.includes("zero-coord")
  );
}

function scanSegment(
  segment: OriginalSegment,
  options: Required<DeepValidateOptions>,
): SegmentScan {
  const points = segment.points;
  const spikeMs = options.speedSpikeKmh * KMH_TO_MS;
  const scan: SegmentScan = {
    segment,
    spikeIndexes: [],
    duplicateIndexes: [],
    driftIndexes: [],
    eleOutlierIndexes: [],
    reversedTransitions: 0,
  };

  // ---- speed spikes + time monotonicity -----------------------------------
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];

    if (prev.time !== undefined && point.time !== undefined) {
      if (point.time < prev.time) {
        scan.reversedTransitions += 1;
      } else if (point.time > prev.time && usable(prev) && usable(point)) {
        const elapsedS = (point.time - prev.time) / 1000;
        if (geodesicDistanceMeters(prev, point) / elapsedS > spikeMs) {
          // The later point of a teleport leg is the victim (the fix
          // removes it); a genuine there-and-back flags both ends.
          scan.spikeIndexes.push(i);
        }
      }
    }
  }

  // ---- near-duplicates -----------------------------------------------------
  // Within the window, under the radius. The FIX keeps the first of
  // each cluster (greedy in fixes.ts) — detection here only lists the
  // members so the report can show them.
  const window = Math.max(1, options.duplicateWindow);
  const radius = options.duplicateRadiusM;
  for (let i = 1; i < points.length; i += 1) {
    if (!usable(points[i])) continue;
    for (let j = Math.max(0, i - window); j < i; j += 1) {
      if (!usable(points[j])) continue;
      if (geodesicDistanceMeters(points[j], points[i]) < radius) {
        scan.duplicateIndexes.push(i);
        break;
      }
    }
  }

  // ---- stop-and-wander drift ----------------------------------------------
  // Grow maximal runs of sub-threshold legs; a run counts as drift when
  // it lasts long enough AND never leaves the radius around its start
  // (a real slow climb leaves; a paused watch wanders in place).
  const driftSpeed = options.driftSpeedMps;
  let runStart = -1; // index of the stationary anchor of the current run
  let runEnd = -1; // index of the last point inside the run
  const considerRun = () => {
    if (runStart < 0 || runEnd <= runStart) return;
    const start = points[runStart];
    const end = points[runEnd];
    const durationMs =
      start.time !== undefined && end.time !== undefined
        ? end.time - start.time
        : (runEnd - runStart) * 1000; // untimed: assume the 1 s cadence
    if (durationMs < options.driftMinDurationMs) return;
    // Displacement of the run's members from the run's start.
    let maxDisplacementM = 0;
    for (let k = runStart + 1; k <= runEnd; k += 1) {
      if (!usable(points[k])) continue;
      maxDisplacementM = Math.max(
        maxDisplacementM,
        geodesicDistanceMeters(start, points[k]),
      );
    }
    if (maxDisplacementM > options.driftRadiusM) return;
    // Drift: flag every member except the first (the honest "we were
    // here" point) — the fix removes exactly these.
    for (let k = runStart + 1; k <= runEnd; k += 1) {
      scan.driftIndexes.push(k);
    }
  };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const prev = i > 0 ? points[i - 1] : undefined;
    let legSlow = false;
    if (
      prev !== undefined &&
      usable(prev) &&
      usable(point)
    ) {
      if (
        prev.time !== undefined &&
        point.time !== undefined &&
        point.time > prev.time
      ) {
        // Timed leg: speed over the recorded elapsed time.
        legSlow =
          geodesicDistanceMeters(prev, point) /
            ((point.time - prev.time) / 1000) <
          driftSpeed;
      } else if (prev.time === undefined && point.time === undefined) {
        // Untimed leg: assume the common 1 s cadence — a leg shorter
        // than driftSpeed meters is "stopped" (the run's duration is
        // then the leg count, in seconds, in considerRun below).
        legSlow = geodesicDistanceMeters(prev, point) < driftSpeed;
      }
    }
    if (legSlow) {
      if (runStart < 0) runStart = i - 1; // the run's stationary anchor
      runEnd = i;
    } else {
      considerRun();
      runStart = -1;
      runEnd = -1;
    }
  }
  considerRun();

  // ---- elevation outliers: step (up-down) + robust z-score ----------------
  const withEle = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.ele !== undefined);
  for (const { index } of withEle) {
    if (
      options.elevationStepM > 0 &&
      isEleStepSpike(points, index, options.elevationStepM)
    ) {
      scan.eleOutlierIndexes.push(index);
    }
  }
  if (options.elevationZScore > 0 && withEle.length >= 4) {
    const values = withEle.map(({ point }) => point.ele as number);
    const median = quantile(values, 0.5);
    const mad = quantile(
      values.map((v) => Math.abs(v - median)),
      0.5,
    );
    // A flat track (MAD ~ 0) has no dispersion to be an outlier against;
    // the step check covers its pressure spikes.
    const robustSigma = 1.4826 * mad;
    if (robustSigma > 0.001) {
      for (const { point, index } of withEle) {
        if (
          Math.abs((point.ele as number) - median) / robustSigma >
          options.elevationZScore
        ) {
          if (!scan.eleOutlierIndexes.includes(index)) {
            scan.eleOutlierIndexes.push(index);
          }
        }
      }
    }
  }

  return scan;
}

/**
 * Step-spike test for point i: BOTH adjacent legs jump more than
 * `stepM` — i.e. the elevation departs from BOTH neighbors by more than
 * stepM (a spike), not a ramp. Segment-edge points test their single
 * leg (rare, honest).
 */
function isEleStepSpike(
  points: readonly OriginalTrackPoint[],
  index: number,
  stepM: number,
): boolean {
  const ele = points[index].ele;
  if (ele === undefined) return false;
  const prev = index > 0 ? points[index - 1].ele : undefined;
  const next = index < points.length - 1 ? points[index + 1].ele : undefined;
  if (prev === undefined && next === undefined) return false;
  const away = (other: number) => Math.abs(ele - other) > stepM;
  if (prev !== undefined && next !== undefined) {
    return away(prev) && away(next);
  }
  return away((prev ?? next) as number);
}

/** Linear-interpolated quantile of a numeric sample (no sort mutation). */
function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return low === high
    ? sorted[low]
    : sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

// ---------------------------------------------------------------------------
// Issue assembly
// ---------------------------------------------------------------------------

function ref(segment: OriginalSegment, index: number): PointRef {
  return { segmentId: segment.id, pointId: segment.points[index].id };
}

function pushIssue(
  issues: DeepIssue[],
  kind: DeepIssueKind,
  severity: DeepIssue["severity"],
  count: number,
  message: string,
  points: PointRef[],
  segments?: readonly SegmentId[],
): void {
  if (count === 0) return;
  issues.push({
    kind,
    severity,
    count,
    message,
    points,
    ...(segments && segments.length > 0 ? { segments } : {}),
  });
}

/**
 * Run every deep check over a (working or original) model. Pure; the
 * issue order is stable (severity ordering is the report UI's business).
 */
export function deepValidate(
  data: OriginalTrackData,
  options: DeepValidateOptions = {},
): DeepReport {
  const opts = { ...DEFAULT_DEEP_OPTIONS, ...options };

  const spikeRefs: PointRef[] = [];
  let spikeCount = 0;
  const duplicateRefs: PointRef[] = [];
  let duplicateCount = 0;
  const driftRefs: PointRef[] = [];
  let driftCount = 0;
  const eleRefs: PointRef[] = [];
  let eleCount = 0;
  const reversedRefs: PointRef[] = [];
  let reversedCount = 0;
  const reversedSegments: SegmentId[] = [];
  const missingEleRefs: PointRef[] = [];
  let missingEleRunCount = 0;

  for (const segment of data.segments) {
    const scan = scanSegment(segment, opts);

    for (const index of scan.spikeIndexes) {
      spikeRefs.push(ref(segment, index));
    }
    spikeCount += scan.spikeIndexes.length;

    for (const index of scan.duplicateIndexes) {
      duplicateRefs.push(ref(segment, index));
    }
    duplicateCount += scan.duplicateIndexes.length;

    for (const index of scan.driftIndexes) {
      driftRefs.push(ref(segment, index));
    }
    driftCount += scan.driftIndexes.length;

    for (const index of scan.eleOutlierIndexes) {
      eleRefs.push(ref(segment, index));
    }
    eleCount += scan.eleOutlierIndexes.length;

    if (scan.reversedTransitions > 0) {
      reversedCount += scan.reversedTransitions;
      reversedSegments.push(segment.id);
      // The transitions' later points, in document order.
      let transitions = 0;
      for (
        let i = 1;
        i < segment.points.length && transitions < scan.reversedTransitions;
        i += 1
      ) {
        const prev = segment.points[i - 1];
        const point = segment.points[i];
        if (
          prev.time !== undefined &&
          point.time !== undefined &&
          point.time < prev.time
        ) {
          reversedRefs.push(ref(segment, i));
          transitions += 1;
        }
      }
    }
  }

  // Missing-elevation runs (≥ N consecutive points without ele) — a
  // whole-file pass; runs never span segments (a segment break is the
  // recorder's own cut). One deterministic walk collects both the run
  // count and the point refs of every qualifying run.
  const minRun = opts.missingEleRunLength;
  for (const segment of data.segments) {
    let runRefs: PointRef[] = [];
    const flush = () => {
      if (runRefs.length >= minRun) {
        missingEleRunCount += 1;
        missingEleRefs.push(...runRefs);
      }
      runRefs = [];
    };
    segment.points.forEach((point, index) => {
      if (point.ele === undefined) {
        runRefs.push(ref(segment, index));
      } else {
        flush();
      }
    });
    flush();
  }

  const issues: DeepIssue[] = [];
  pushIssue(
    issues,
    "speed-spike",
    "error",
    spikeCount,
    `${spikeCount} leg${spikeCount === 1 ? "" : "s"} imply a speed above ` +
      `${opts.speedSpikeKmh} km/h — likely GPS teleports.`,
    spikeRefs,
  );
  pushIssue(
    issues,
    "duplicate-cluster",
    "warning",
    duplicateCount,
    `${duplicateCount} point${duplicateCount === 1 ? "" : "s"} sit within ` +
      `${opts.duplicateRadiusM} m of a recent point — the recorder logged ` +
      `the same place more than once.`,
    duplicateRefs,
  );
  pushIssue(
    issues,
    "gps-drift",
    "warning",
    driftCount,
    `${driftCount} point${driftCount === 1 ? "" : "s"} form ` +
      `stop-and-wander pattern${driftCount === 1 ? "" : "s"} — slower than ` +
      `${opts.driftSpeedMps} m/s for ${Math.round(opts.driftMinDurationMs / 1000)} s+ ` +
      `while staying within ${opts.driftRadiusM} m. Likely GPS drift.`,
    driftRefs,
  );
  pushIssue(
    issues,
    "elevation-outlier",
    "warning",
    eleCount,
    `${eleCount} elevation${eleCount === 1 ? "" : "s"} disagree with their ` +
      `neighbors by more than ${opts.elevationStepM} m or sit far outside ` +
      `the file's elevation band.`,
    eleRefs,
  );
  pushIssue(
    issues,
    "non-monotonic-time",
    "warning",
    reversedCount,
    `${reversedCount} time transition${reversedCount === 1 ? "" : "s"} run ` +
      `backwards — the segment order does not match its timestamps.`,
    reversedRefs,
    reversedSegments,
  );
  pushIssue(
    issues,
    "missing-elevation",
    "info",
    missingEleRunCount,
    `${missingEleRunCount} run${missingEleRunCount === 1 ? "" : "s"} of ` +
      `${minRun}+ consecutive points carry no <ele>.`,
    missingEleRefs,
  );

  const totalCount = issues.reduce((n, issue) => n + issue.count, 0);
  return { issues, totalCount };
}

/** Which fixes a deep issue kind offers (the report UI's action row). */
export function fixKindsForIssue(kind: DeepIssueKind): readonly FixKind[] {
  switch (kind) {
    case "speed-spike":
      return ["remove-spikes"];
    case "duplicate-cluster":
      return ["dedupe"];
    case "gps-drift":
      return ["remove-drift"];
    case "elevation-outlier":
      return ["smooth-elevations"];
    case "non-monotonic-time":
      return ["sort-by-time"];
    case "missing-elevation":
      return []; // reported, not one-click-fixable (§EE: detector only)
  }
}
