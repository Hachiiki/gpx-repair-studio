/**
 * One-click fix planning (docs/MASTER_PLAN.md §EE 13.4/13.5).
 *
 * Every fix is PLANNED before it exists: `planFix`/`planPreset` are pure
 * functions over `(model, report, options)` returning a `FixPlan` —
 * the entries applying the fix would write, the points it touches, and
 * the what-would-change lines the preview dialog renders. Nothing is
 * applied until the user confirms (§EE non-goal: no auto-applying
 * without preview); applying writes ONE `WorkingEdit` per fix step, so
 * undo removes exactly what was approved.
 *
 * Presets are chains: each step's plan is computed against the working
 * view the previous step WOULD produce (detector→fix chain, §EE 13.5)
 * — the preview therefore describes the compound outcome honestly.
 *
 * Phase 13 — Deep validation & repair presets. Pure TypeScript.
 */

import { geodesicDistanceMeters, hasFiniteCoords } from "@/lib/geo/geodesy";
import type {
  DeepIssueKind,
  DeepReport,
  FixKind,
  FixPlan,
  FixReason,
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  PointRef,
  PresetId,
  WorkingEdit,
  WorkingEditEntry,
} from "@/types/domain";
import { deepValidate, type DeepValidateOptions } from "./deepValidate";
import { applyWorkingEdits } from "./workingCopy";

/** Extra parameters individual fixes accept (beyond detector options). */
export interface FixExtras {
  /** The `thin` fix's minimum kept spacing, meters (default 10). */
  thinSpacingM?: number;
}

const DEFAULT_THIN_SPACING_M = 10;

// ---------------------------------------------------------------------------
// Fix planning
// ---------------------------------------------------------------------------

/** Plan one fix from the current report. Null when there is nothing to do. */
export function planFix(
  data: OriginalTrackData,
  report: DeepReport,
  kind: FixKind,
  options: DeepValidateOptions = {},
  extras: FixExtras = {},
): FixPlan | null {
  const issueOf = (issueKind: DeepIssueKind) =>
    report.issues.find((issue) => issue.kind === issueKind) ?? null;

  switch (kind) {
    case "remove-spikes": {
      const issue = issueOf("speed-spike");
      if (!issue) return null;
      return {
        kind,
        label: `Remove ${issue.count} speed spike${issue.count === 1 ? "" : "s"}`,
        entries: issue.points.map((ref) => ({
          kind: "point-deletion" as const,
          pointId: ref.pointId,
        })),
        points: issue.points,
        summary: [
          `${issue.count === 1 ? "1 recorded point leaves" : `${issue.count} recorded points leave`} the working copy — the later point of each teleport leg.`,
          "The surrounding recorded points stay byte-original; nothing is rewritten.",
        ],
      };
    }
    case "remove-drift": {
      const issue = issueOf("gps-drift");
      if (!issue) return null;
      return {
        kind,
        label: `Collapse ${issue.count} drift point${issue.count === 1 ? "" : "s"}`,
        entries: issue.points.map((ref) => ({
          kind: "point-deletion" as const,
          pointId: ref.pointId,
        })),
        points: issue.points,
        summary: [
          `${issue.count === 1 ? "1 stop-and-wander point leaves" : `${issue.count} stop-and-wander points leave`} the working copy; each run's first point stays as the honest "we were here" marker.`,
          "Distances and durations recompute from the working copy afterwards.",
        ],
      };
    }
    case "dedupe": {
      const issue = issueOf("duplicate-cluster");
      if (!issue) return null;
      const flagged = new Set(issue.points.map((ref) => ref.pointId));
      const entries: WorkingEditEntry[] = [];
      const touched: PointRef[] = [];
      for (const segment of data.segments) {
        let lastKept: OriginalTrackPoint | null = null;
        for (const point of segment.points) {
          const isFlagged = flagged.has(point.id);
          if (
            isFlagged &&
            lastKept !== null &&
            hasFiniteCoords(point) &&
            hasFiniteCoords(lastKept) &&
            geodesicDistanceMeters(lastKept, point) < 1
          ) {
            entries.push({ kind: "point-deletion", pointId: point.id });
            touched.push({ segmentId: segment.id, pointId: point.id });
          } else {
            lastKept = point;
          }
        }
      }
      if (entries.length === 0) return null;
      return {
        kind,
        label: `Dedupe ${entries.length} point${entries.length === 1 ? "" : "s"}`,
        entries,
        points: touched,
        summary: [
          `${entries.length === 1 ? "1 near-duplicate point leaves" : `${entries.length} near-duplicate points leave`} the working copy — each cluster keeps its first point.`,
          "Only points the duplicate check flagged are removed; healthy density is untouched.",
        ],
      };
    }
    case "sort-by-time": {
      const issue = issueOf("non-monotonic-time");
      if (!issue || !issue.segments || issue.segments.length === 0) return null;
      const segmentIds = issue.segments;
      const untimed = countUntimed(data, segmentIds);
      return {
        kind,
        label: `Sort ${segmentIds.length} segment${segmentIds.length === 1 ? "" : "s"} by time`,
        entries: segmentIds.map((segmentId) => ({
          kind: "segment-sort" as const,
          segmentId,
        })),
        points: issue.points,
        summary: [
          `${segmentIds.length} segment${segmentIds.length === 1 ? " is" : "s are"} stably reordered by timestamp — equal times keep their current order.`,
          ...(untimed > 0
            ? [
                `${untimed} point${untimed === 1 ? " without a usable timestamp moves" : "s without a usable timestamp move"} to the segment end.`,
              ]
            : []),
          "The file's point order becomes estimated — the export notes it.",
        ],
      };
    }
    case "smooth-elevations": {
      const issue = issueOf("elevation-outlier");
      if (!issue) return null;
      const flagged = new Set(issue.points.map((ref) => ref.pointId));
      const entries: WorkingEditEntry[] = [];
      for (const segment of data.segments) {
        for (let index = 0; index < segment.points.length; index += 1) {
          const point = segment.points[index];
          if (!flagged.has(point.id)) continue;
          const replacement = interpolateEle(segment, index, flagged);
          if (replacement === null) continue;
          entries.push({
            kind: "elevation-override",
            pointId: point.id,
            ele: replacement,
            method: "interpolated",
            ...(point.ele !== undefined ? { originalEle: point.ele } : {}),
          });
        }
      }
      if (entries.length === 0) return null;
      return {
        kind,
        label: `Smooth ${entries.length} elevation${entries.length === 1 ? "" : "s"}`,
        entries,
        points: issue.points,
        summary: [
          `${entries.length} outlying elevation${entries.length === 1 ? " is" : "s are"} replaced by linear interpolation between the nearest healthy neighbors.`,
          "Each replacement is labeled in the export (gpxr marker) — the recorded values stay in the original.",
        ],
      };
    }
    case "thin": {
      const spacing = extras.thinSpacingM ?? DEFAULT_THIN_SPACING_M;
      if (!(spacing > 0)) return null;
      const entries: WorkingEditEntry[] = [];
      const touched: PointRef[] = [];
      for (const segment of data.segments) {
        let lastKept: OriginalTrackPoint | null = null;
        segment.points.forEach((point, index) => {
          const isLast = index === segment.points.length - 1;
          if (
            lastKept !== null &&
            !isLast &&
            hasFiniteCoords(point) &&
            hasFiniteCoords(lastKept) &&
            geodesicDistanceMeters(lastKept, point) < spacing
          ) {
            entries.push({ kind: "point-deletion", pointId: point.id });
            touched.push({ segmentId: segment.id, pointId: point.id });
          } else {
            lastKept = point;
          }
        });
      }
      if (entries.length === 0) return null;
      return {
        kind,
        label: `Thin the recording to ${spacing} m+`,
        entries,
        points: touched,
        summary: [
          `${entries.length} point${entries.length === 1 ? "" : "s"} closer than ${spacing} m to their kept predecessor leave the working copy.`,
          "Every kept point stays byte-original — nothing is interpolated or invented (decimation, not resampling). Each segment keeps its first and last point.",
        ],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Presets — detector→fix chains (§EE 13.5)
// ---------------------------------------------------------------------------

/** One shipped preset bundle: id, display copy, and the fixes it chains. */
export interface PresetDescriptor {
  id: PresetId;
  name: string;
  description: string;
  fixes: readonly FixKind[];
}

/** The shipped preset bundles. */
export const PRESETS: readonly PresetDescriptor[] = [
  {
    id: "drift-cleanup",
    name: "Drift cleanup",
    description:
      "Collapse stop-and-wander drift, then dedupe the leftovers it created.",
    fixes: ["remove-drift", "dedupe"],
  },
  {
    id: "dedupe-sort",
    name: "Dedupe & sort",
    description:
      "Remove near-duplicates, then reorder segments by their timestamps.",
    fixes: ["dedupe", "sort-by-time"],
  },
  {
    id: "resample-thin",
    name: "Resample (thin)",
    description:
      "Thin an over-dense recording to a minimum spacing between kept points.",
    fixes: ["thin"],
  },
  {
    id: "spike-sweep",
    name: "Spike & outlier sweep",
    description:
      "Remove GPS teleports, then smooth the elevation outliers beside them.",
    fixes: ["remove-spikes", "smooth-elevations"],
  },
];

/**
 * Plan a preset as a chain of steps, each computed against the working
 * view the previous step would produce (§EE "detector→fix chains").
 * Steps whose fix finds nothing are skipped. Null when the whole chain
 * is a no-op on the current state.
 */
export function planPreset(
  data: OriginalTrackData,
  report: DeepReport,
  presetId: PresetId,
  options: DeepValidateOptions = {},
  extras: FixExtras = {},
): FixPlan[] | null {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;

  // The chain state: the ORIGINAL model + the growing log (the same
  // shape the store applies). Step 0 is the caller's current state
  // (usually original + its report); every later step sees the working
  // view the previous steps would produce — computed from the original
  // with the cumulative log, so the meta bookkeeping stays complete.
  let view: OriginalTrackData = data;
  let currentReport = report;
  const plans: FixPlan[] = [];
  const chainEdits: WorkingEdit[] = [];

  for (const fix of preset.fixes) {
    const plan = planFix(view, currentReport, fix, options, extras);
    if (plan === null) continue; // nothing for this fix — skip the step
    plans.push(plan);
    const chainEdit = editFromPlan(plan, `chain/${fix}`, 0);
    chainEdits.push(chainEdit);
    view = applyWorkingEdits(data, chainEdits);
    currentReport = deepValidate(view, options);
  }

  return plans.length > 0 ? plans : null;
}

// ---------------------------------------------------------------------------
// Edit synthesis (plan → the store's WorkingEdit)
// ---------------------------------------------------------------------------

/** The fix reasons mapped from fix kinds. */
export function reasonOfFix(kind: FixKind): FixReason {
  switch (kind) {
    case "remove-spikes":
      return "spike";
    case "dedupe":
      return "duplicate";
    case "remove-drift":
      return "drift";
    case "sort-by-time":
      return "sort";
    case "smooth-elevations":
      return "elevation";
    case "thin":
      return "thin";
  }
}

/**
 * Build the store's `WorkingEdit` from a confirmed plan. Id and time
 * are stamped by the caller (the store) so undo ordering and the log
 * stay authoritative there.
 */
export function editFromPlan(
  plan: FixPlan,
  id: string,
  appliedAt: number,
): WorkingEdit {
  return {
    id,
    label: plan.label,
    reason: reasonOfFix(plan.kind as FixKind),
    appliedAt,
    entries: plan.entries,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Untimed points in the given segments (sort disclosure). */
function countUntimed(
  data: OriginalTrackData,
  segmentIds: readonly string[],
): number {
  let count = 0;
  for (const segment of data.segments) {
    if (!segmentIds.includes(segment.id)) continue;
    for (const point of segment.points) {
      if (point.time === undefined) count += 1;
    }
  }
  return count;
}

/**
 * Linear interpolation of `segment.points[index].ele` between the
 * nearest non-flagged, elevation-bearing points around it (by index).
 * One-sided fallback when the outlier sits at a segment edge.
 */
function interpolateEle(
  segment: OriginalSegment,
  index: number,
  flagged: ReadonlySet<string>,
): number | null {
  const has = (i: number): number | null => {
    const point: OriginalTrackPoint = segment.points[i];
    return point.ele !== undefined && !flagged.has(point.id)
      ? point.ele
      : null;
  };
  let before: number | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    before = has(i);
    if (before !== null) break;
  }
  let after: number | null = null;
  for (let i = index + 1; i < segment.points.length; i += 1) {
    after = has(i);
    if (after !== null) break;
  }
  if (before !== null && after !== null) {
    return Math.round(((before + after) / 2) * 10) / 10;
  }
  return before ?? after;
}
