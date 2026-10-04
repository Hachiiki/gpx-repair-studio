/**
 * Compare math (Phase 19 — docs/MASTER_PLAN.md §EE 19.1): the
 * before/after delta table's pure core.
 *
 * "Before" is the ORIGINAL recording (the immutable model); "after" is
 * the OUTCOME — the working copy plus committed repairs, exactly the
 * population the export and the statistics panel render. The hook
 * (hooks/use-compare.ts) supplies both sides from the SAME view models
 * the cards already show (the one-merge rule: never a second
 * computation), so a number in the delta table can never disagree with
 * the statistics panel beside it.
 *
 * Honesty rules (§G/§L): a row whose inputs are unavailable renders
 * "—" (null), never a fabricated zero; every row carries a provenance
 * word from the sanctioned vocabulary plus an optional note; deltas are
 * signed (after − original) so deletions read negative.
 *
 * Phase 19 — Compare, summaries & guided flows. Pure TypeScript.
 */

import type { WorkingMeta } from "@/types/domain";

/** One side of the comparison (original / outcome). */
export interface CompareSideStats {
  /** Recorded points in the model (all points, damage included). */
  pointCount: number;
  /** Total usable distance, meters (originalDistanceStats.totalDistanceM). */
  distanceM: number;
  /** Σ Δt over moving legs, ms — null when the file has no timing. */
  movingTimeMs: number | null;
  /** Hysteresis elevation gain, meters — null when coverage is
   * insufficient (the §L-1 "—" rule; never a guess). */
  gainM: number | null;
}

/** What the compare join knows about the repair population. */
export interface CompareRepairRef {
  gapCount: number;
  /** The repairs' added distance, meters (reconstructedDistanceM). */
  reconstructedDistanceM: number;
  /** Estimated duration of the repairs, ms — null while unestimated. */
  reconstructedTimeMs: number | null;
}

export interface CompareStatsInput {
  original: CompareSideStats;
  after: CompareSideStats;
  /** The working-copy meta (null while pristine/unknown). */
  working: WorkingMeta | null;
  repair: CompareRepairRef | null;
  /** True when the elevation rows are estimated (coverage or providers). */
  elevationEstimated: boolean;
}

/** The provenance vocabulary of the delta table — the badge words plus
 * the Phase 13 "modified" flag (the plan's estimated/modified flags). */
export type CompareProvenance = "recorded" | "modified" | "estimated" | "mixed";

/** The compare view's three states (§EE 19.1: overlay + side-by-side). */
export type CompareMode = "off" | "overlay" | "side-by-side";

export type CompareRowId = "points" | "distance" | "moving-time" | "gain";
export type CompareRowFormat = "count" | "distance" | "duration" | "elevation";

export interface CompareStatRow {
  id: CompareRowId;
  label: string;
  original: number | null;
  after: number | null;
  /** after − original; null when either side is null. */
  delta: number | null;
  format: CompareRowFormat;
  provenance: CompareProvenance;
  note: string | null;
}

export interface CompareStats {
  rows: readonly CompareStatRow[];
  /** True when anything differs (working edits or committed repairs). */
  hasChanges: boolean;
}

function deltaOf(
  original: number | null,
  after: number | null,
): number | null {
  if (original === null || after === null) return null;
  return after - original;
}

/**
 * Assemble the delta rows. Row order is the table's reading order:
 * points, distance, moving time, gain — the shape of the activity
 * first, then the effort behind it.
 */
export function buildCompareStats(input: CompareStatsInput): CompareStats {
  const { original, after, working, repair } = input;
  const hasEdits = working?.hasEdits ?? false;
  const hasRepairs = (repair?.gapCount ?? 0) > 0;
  const structuralCount =
    (working?.splitCount ?? 0) +
    (working?.duplicatedSegmentCount ?? 0) +
    (working?.reorderedSegmentCount ?? 0);

  const rows: CompareStatRow[] = [];

  // -- Points ---------------------------------------------------------------
  {
    const delta = deltaOf(original.pointCount, after.pointCount);
    const notes: string[] = [];
    const removed = working?.deletedPointCount ?? 0;
    if (removed > 0) {
      notes.push(`${removed} removed by fixes`);
    }
    if (hasRepairs) {
      notes.push("repair points inserted");
    }
    if (structuralCount > 0) {
      notes.push("splits and copies re-counted");
    }
    rows.push({
      id: "points",
      label: "Recorded points",
      original: original.pointCount,
      after: after.pointCount,
      delta,
      format: "count",
      provenance: hasEdits || hasRepairs ? "modified" : "recorded",
      note: notes.length > 0 ? notes.join(" · ") : null,
    });
  }

  // -- Distance ---------------------------------------------------------------
  {
    const delta = deltaOf(original.distanceM, after.distanceM);
    // The after-side distance recomputes from the working copy (Phase 13
    // rule) — "modified" whenever edits exist; repairs make it "mixed"
    // (partly measured, partly the app's authored geometry).
    const provenance: CompareProvenance =
      hasEdits && hasRepairs
        ? "mixed"
        : hasEdits
          ? "modified"
          : hasRepairs
            ? "mixed"
            : "recorded";
    rows.push({
      id: "distance",
      label: "Distance",
      original: original.distanceM,
      after: after.distanceM,
      delta,
      format: "distance",
      provenance,
      note: hasRepairs
        ? `includes ${Math.round(repair?.reconstructedDistanceM ?? 0).toLocaleString()} m of committed repairs`
        : null,
    });
  }

  // -- Moving time ------------------------------------------------------------
  {
    // A sorted segment's order is estimated (the export note says so) —
    // the moving-time row inherits the estimate flag; repair time is
    // estimated too while it lacks a duration.
    const sortedSegments = working?.sortedSegmentIds.length ?? 0;
    const repairTimeEstimated =
      hasRepairs && repair?.reconstructedTimeMs == null;
    const provenance: CompareProvenance =
      sortedSegments > 0 && hasRepairs
        ? "mixed"
        : sortedSegments > 0 || repairTimeEstimated
          ? "estimated"
          : hasEdits
            ? "modified"
            : "recorded";
    const notes: string[] = [];
    if (sortedSegments > 0) {
      notes.push(`${sortedSegments} segment order estimated`);
    }
    if (repairTimeEstimated) {
      notes.push("repair duration not yet estimated");
    }
    rows.push({
      id: "moving-time",
      label: "Moving time",
      original: original.movingTimeMs,
      after: after.movingTimeMs,
      delta: deltaOf(original.movingTimeMs, after.movingTimeMs),
      format: "duration",
      provenance,
      note:
        original.movingTimeMs === null || after.movingTimeMs === null
          ? "no usable timestamps in the file"
          : notes.length > 0
            ? notes.join(" · ")
            : null,
    });
  }

  // -- Elevation gain -----------------------------------------------------------
  {
    rows.push({
      id: "gain",
      label: "Elevation gain",
      original: original.gainM,
      after: after.gainM,
      delta: deltaOf(original.gainM, after.gainM),
      format: "elevation",
      provenance: input.elevationEstimated
        ? hasEdits
          ? "mixed"
          : "estimated"
        : hasEdits
          ? "modified"
          : "recorded",
      note:
        original.gainM === null || after.gainM === null
          ? "elevation coverage below 60% — not estimated"
          : (working?.overriddenEleCount ?? 0) > 0
            ? `${working?.overriddenEleCount} elevations smoothed`
            : null,
    });
  }

  const hasChanges =
    hasEdits ||
    hasRepairs ||
    rows.some((row) => row.delta !== null && Math.abs(row.delta) > 1e-9);

  return { rows, hasChanges };
}
