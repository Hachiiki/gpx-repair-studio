/**
 * Timestamps — the Phase 5 case matrix (docs/MASTER_PLAN.md §J).
 *
 * Estimates timestamps for a reconstruction's interior points and the
 * duration that feeds statistics, per the §J-1 case matrix:
 *
 *   | Case | Boundary times          | Strategy               |
 *   |------|--------------------------|------------------------|
 *   | 1    | both present             | distance-proportional  |
 *   | 1b   | both present             | uniform                |
 *   | 2    | one present              | manual-duration        |
 *   | 3    | none (no-timing file)    | manual-duration (+file |
 *   |      |                          | start anchor)          |
 *   | 4    | both, user disputes      | manual-duration        |
 *
 * Honesty rules (§J-2), enforced structurally by the returned plan:
 *   - Manual duration is ONLY applied to the gap's interior — the
 *     original boundary timestamps are never rewritten (v1 non-goal).
 *   - Every distributed timestamp is an `Estimated<number>` carrying its
 *     method; the UI must surface "estimated — assumes even effort".
 *   - When the duration is unknown, the plan says so (`durationMs: null`
 *     + `missingReason`) — consumers render "—" with the reason, never a
 *     fabricated value.
 *   - Case 4: the manual end vs. the recorded end mismatch is surfaced
 *     as `discrepancyMs` for the UI to flag.
 *
 * Route order vs. path order: boundaries are given in ROUTE order
 * (earlier first). The resampled path of an open "extend before" span
 * runs anchor → vertices, i.e. REVERSED against route order; the
 * distributor takes a `pathFollowsRouteOrder` flag so both extension
 * shapes anchor honestly (extend-before spreads backwards in time from
 * the anchor; extend-after forwards).
 *
 * Phase 5 — Time & Pace Reconstruction. Pure TypeScript: no React, no
 * DOM, no fetch. The absolute anchoring of Case-3 interiors and the
 * whole-activity distance-proportional spread of a file-level total
 * duration are export-time concerns (Phase 7 merge) — this module
 * provides the primitives they will consume.
 */

import type { PathPoint } from "@/features/reconstruction/resample";
import type { Estimated, TimeStrategy } from "@/types/domain";

// ---------------------------------------------------------------------------
// Plan resolution (which case applies, what duration, what anchor)
// ---------------------------------------------------------------------------

/** Route-ordered boundary timestamps of one repair site. */
export interface GapTimeBoundaries {
  /** Timestamp of the earlier boundary point, when it carries one. */
  routeBeforeMs?: number;
  /** Timestamp of the later boundary point, when it carries one. */
  routeAfterMs?: number;
}

/** File-level fallbacks of the "no timing data" mode (§J-1 Case 3). */
export interface FileTimingContext {
  /** User-entered activity start (epoch ms), when provided. */
  startMs: number | null;
  /** User-entered total activity duration (ms), when provided. */
  totalDurationMs: number | null;
}

/** Which §J-1 case a repair site falls into. */
export type GapTimeCase = "both-boundaries" | "before-only" | "after-only" | "no-boundaries";

/** Distribution method for interior timestamps (null = none). */
export type DistributionMethod = Exclude<Estimated<number>["method"], "elevation-api" | "interpolated"> | null;

/** The resolved time plan of one repair site — what the UI renders. */
export interface GapTimePlan {
  boundaryCase: GapTimeCase;
  /** The strategy in force after resolution (as requested). */
  strategy: TimeStrategy;
  /** Distribution method for interior points; null = no distribution. */
  method: DistributionMethod;
  /**
   * The duration of the gap interior feeding statistics — derived from
   * boundary timestamps or entered manually. `null` = unknown ("—").
   */
  durationMs: number | null;
  /** How `durationMs` was obtained (null when unknown). */
  durationSource: "derived" | "manual" | null;
  /**
   * Route-order timestamp the interior starts from. `null` when nothing
   * anchors the interior (Case 3 without a file start time) — duration
   * may still be known for statistics while points carry no time.
   */
  anchorStartMs: number | null;
  /** True when `anchorStartMs` came from the file-level start (Case 3). */
  anchoredByFileStart: boolean;
  /** The recorded route-order end time, when present (Case 4 display). */
  recordedEndMs: number | null;
  /** The boundary-derived span (after − before), when both exist. */
  recordedSpanMs: number | null;
  /** Case 4: (anchorStart + manual) − recordedEnd, signed ms. */
  discrepancyMs: number | null;
  /** One-line reason while `durationMs` is null (the "—" explanation). */
  missingReason: string | null;
}

/** Reasons shared verbatim with the UI's honesty copy. */
export const MISSING_REASON = {
  oneBoundary:
    "Only one end of this gap has a timestamp — enter a duration to estimate the rest.",
  noBoundaries:
    "No timestamps around this gap — enter a duration to estimate the interior.",
  reversed:
    "The boundary timestamps run backwards — duration cannot be derived.",
  strategyNone: "Timestamp estimation is switched off for this repair.",
  noStrategy: "No time strategy set for this repair.",
} as const;

/**
 * Resolve the time plan for one repair site — the single implementation
 * of the §J-1 case matrix. Pure; total function over its inputs.
 */
export function resolveGapTimePlan(
  boundaries: GapTimeBoundaries,
  strategy: TimeStrategy,
  fileTiming?: FileTimingContext,
): GapTimePlan {
  const hasBefore =
    boundaries.routeBeforeMs !== undefined && Number.isFinite(boundaries.routeBeforeMs);
  const hasAfter =
    boundaries.routeAfterMs !== undefined && Number.isFinite(boundaries.routeAfterMs);

  const base: GapTimePlan = {
    boundaryCase: hasBefore && hasAfter
      ? "both-boundaries"
      : hasBefore
        ? "before-only"
        : hasAfter
          ? "after-only"
          : "no-boundaries",
    strategy,
    method: null,
    durationMs: null,
    durationSource: null,
    anchorStartMs: null,
    anchoredByFileStart: false,
    recordedEndMs: hasAfter ? boundaries.routeAfterMs! : null,
    recordedSpanMs: null,
    discrepancyMs: null,
    missingReason: null,
  };

  if (base.boundaryCase === "both-boundaries") {
    const before = boundaries.routeBeforeMs!;
    const after = boundaries.routeAfterMs!;
    const derived = after - before;
    if (strategy.kind === "manual-duration") {
      // Case 4: the user disputes the recorded span. Original boundary
      // timestamps stay untouched; the interior follows the manual value
      // and the mismatch is surfaced, never hidden.
      return {
        ...base,
        method: "manual",
        durationMs: strategy.durationMs,
        durationSource: "manual",
        anchorStartMs: before,
        recordedSpanMs: derived,
        // Flag only a real disagreement (0 ms = agrees exactly).
        discrepancyMs: strategy.durationMs !== derived ? strategy.durationMs - derived : null,
      };
    }
    if (strategy.kind === "none") {
      return { ...base, missingReason: MISSING_REASON.strategyNone };
    }
    if (derived < 0) {
      // Reversed boundary times: deriving would fabricate a negative
      // span — refuse honestly.
      return { ...base, missingReason: MISSING_REASON.reversed };
    }
    // Case 1 (default): distance-proportional. Case 1b: uniform — kept
    // for `spacing: off` (index-spread instead of distance-spread).
    return {
      ...base,
      method: strategy.kind,
      durationMs: derived,
      durationSource: "derived",
      anchorStartMs: before,
      recordedSpanMs: derived,
    };
  }

  if (base.boundaryCase === "before-only" || base.boundaryCase === "after-only") {
    // Case 2: exactly one usable boundary — a manual duration is the
    // only honest source for the rest of the span.
    if (strategy.kind === "manual-duration") {
      return {
        ...base,
        method: "manual",
        durationMs: strategy.durationMs,
        durationSource: "manual",
        anchorStartMs: hasBefore ? boundaries.routeBeforeMs! : null,
      };
    }
    return {
      ...base,
      missingReason: strategy.kind === "none"
        ? MISSING_REASON.strategyNone
        : MISSING_REASON.oneBoundary,
    };
  }

  // Case 3: no usable boundary timestamps at all. Manual duration
  // required; the interior anchors at the file-level start time when the
  // user provided one (documented assumption — the gap's true position
  // within the activity is unknown until the Phase 7 merge spreads the
  // file-level total across the whole activity).
  if (strategy.kind === "manual-duration") {
    const fileStart = fileTiming?.startMs ?? null;
    return {
      ...base,
      method: "manual",
      durationMs: strategy.durationMs,
      durationSource: "manual",
      anchorStartMs: fileStart,
      anchoredByFileStart: fileStart !== null,
    };
  }
  return {
    ...base,
    missingReason: strategy.kind === "none"
      ? MISSING_REASON.strategyNone
      : MISSING_REASON.noBoundaries,
  };
}

// ---------------------------------------------------------------------------
// Interior distribution (path points → Estimated timestamps)
// ---------------------------------------------------------------------------

/** A distributed interior timestamp: the value plus its method. */
export type DistributedTime = Estimated<number>;

/**
 * Distribute the plan's duration across a reconstruction path's interior
 * points, as `Estimated<number>` timestamps. Pure.
 *
 * `path` is the `resamplePath` output (anchors included, cumulative
 * geodesic distances). The result is index-aligned with `path`:
 *   - anchor roles are ALWAYS `undefined` (original points keep their
 *     recorded timestamps — they are never rewritten);
 *   - interior points (vertex / interpolated / road) carry the estimate
 *     when the plan resolves (duration AND anchor known), else
 *     `undefined` (the gap contributes duration to statistics only).
 *
 * Fractions:
 *   - distance-proportional (Case 1): `cumDistanceM_i / total` — assumes
 *     even effort across the drawn route;
 *   - uniform (Case 1b) and manual: point index over the path — with
 *     even resampling these are near-identical to distance-proportional;
 *     `spacing: off` keeps them meaningful;
 *   - a zero-length path (all points coincide) falls back to index
 *     fractions — distance-proportional has nothing to say.
 *
 * `pathFollowsRouteOrder`: false for open "extend before" spans, whose
 * geometric path runs anchor → vertices against route order — their
 * fractions are mirrored so the anchor keeps the latest time.
 */
export function distributeTimestamps(
  path: readonly PathPoint[],
  plan: GapTimePlan,
  pathFollowsRouteOrder = true,
): (DistributedTime | undefined)[] {
  const result: (DistributedTime | undefined)[] = path.map(() => undefined);

  // Anchoring: the after-only case anchors at the recorded END; every
  // other case anchors at `anchorStartMs` (boundary or file start).
  const anchored =
    plan.boundaryCase === "after-only"
      ? plan.recordedEndMs !== null
      : plan.anchorStartMs !== null;
  if (plan.durationMs === null || plan.method === null || !anchored) {
    return result;
  }

  // Interior indices (anchors excluded) and the path's total length.
  const interior: number[] = [];
  for (let i = 0; i < path.length; i += 1) {
    const role = path[i].role;
    if (role !== "before-anchor" && role !== "after-anchor") interior.push(i);
  }
  if (interior.length === 0) return result;

  const totalDistance = path.length > 0 ? path[path.length - 1].cumDistanceM : 0;
  const useDistance = plan.method === "distance-proportional" && totalDistance > 0;

  // Route-order fraction of interior j (0 = first interior point in
  // route order, 1 = last).
  const routeFraction = (j: number): number => {
    if (useDistance) {
      const cum = path[interior[j]].cumDistanceM;
      return totalDistance > 0 ? cum / totalDistance : 0;
    }
    return (j + 1) / (interior.length + 1);
  };

  for (let j = 0; j < interior.length; j += 1) {
    let fraction = routeFraction(j);
    if (!pathFollowsRouteOrder) fraction = 1 - fraction;

    // Explicit narrowing per branch (the `anchored` guard above makes
    // one of these always taken).
    let timeMs: number;
    if (plan.boundaryCase === "after-only" && plan.recordedEndMs !== null) {
      // Case 2 anchored at the far (later) end: interior times count
      // BACK from the recorded end — [end − manual, end].
      timeMs = plan.recordedEndMs - plan.durationMs * (1 - fraction);
    } else if (plan.anchorStartMs !== null) {
      timeMs = plan.anchorStartMs + plan.durationMs * fraction;
    } else {
      // Unanchored interior (Case 3 without a file start) — the guard
      // above already returned in this situation.
      continue;
    }
    result[interior[j]] = { value: timeMs, method: plan.method };
  }

  // Monotonicity is a property of the fractions, but guard the boundary
  // conditions honestly: a manual duration on a both-boundaries case can
  // overrun the recorded end (Case 4 — intended, flagged) but must never
  // run backwards before the anchor.
  return result;
}
