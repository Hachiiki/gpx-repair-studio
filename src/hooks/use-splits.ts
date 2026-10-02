/**
 * useSplits / useStoppedTime — the Phase 15 stats-dashboard bindings
 * (docs/MASTER_PLAN.md §EE 15.1/15.3).
 *
 * Thin React glue over the pure engines: one memo per derived view
 * model, keyed on the single merge the export pipeline already built
 * (the one-merge rule — splits, elevation rows, and the exported file
 * can never disagree about populations). The split LENGTH follows the
 * persisted pace unit (km/mi — the same toggle the stats panel's pace
 * rows use); leg-time semantics follow the persisted gap threshold.
 *
 * Re-imported repair markers (§H-7) ride along so marked stretches
 * flag their splits estimated, exactly like live reconstructed runs.
 *
 * Pure derivations: nothing here touches stores beyond reading them.
 */

"use client";

import { useMemo } from "react";
import type { MergeResult } from "@/features/reconstruction/merge";
import {
  buildSplits,
  type SplitsResult,
} from "@/features/statistics/splits";
import {
  stoppedTimeSummary,
  type MotionSummary,
} from "@/features/statistics/motion";
import { PACE_METERS_PER_UNIT, type PaceUnit } from "@/lib/utils/format";
import { useUiStore } from "@/state/ui-store";
import type { RepairMarker } from "@/types/domain";

// App-layer facade: components may not import feature internals (ESLint
// boundary, §F), so the splits vocabulary flows through this module.
export type {
  SplitsResult,
  SplitRow,
  SplitProvenance,
} from "@/features/statistics/splits";
export { splitPaceMsPerMeter } from "@/features/statistics/splits";
export type {
  MotionSummary,
  StopEvent,
} from "@/features/statistics/motion";

/**
 * The splits of the merged route in the current pace unit. `null`
 * without a file (or a route with no usable geometry).
 */
export function useSplits(
  merge: MergeResult | null,
  repairMarkers: readonly RepairMarker[] | undefined,
): SplitsResult | null {
  const paceUnit = useUiStore((s) => s.paceUnit);
  const timeGapMs = useUiStore((s) => s.gapThresholds.timeGapMs);

  const markedPointIds = useMemo(() => {
    if (repairMarkers === undefined || repairMarkers.length === 0) {
      return undefined;
    }
    return new Set(repairMarkers.map((marker) => marker.pointId));
  }, [repairMarkers]);

  return useMemo(
    () =>
      buildSplits(merge, {
        splitLengthM: PACE_METERS_PER_UNIT[paceUnit],
        timeGapMs,
        ...(markedPointIds !== undefined ? { markedPointIds } : {}),
      }),
    [merge, paceUnit, timeGapMs, markedPointIds],
  );
}

/** The stopped-time summary of the merged route. */
export function useStoppedTime(merge: MergeResult | null): MotionSummary {
  const timeGapMs = useUiStore((s) => s.gapThresholds.timeGapMs);
  return useMemo(
    () => stoppedTimeSummary(merge, { timeGapMs }),
    [merge, timeGapMs],
  );
}

/** The split length the current unit implies (km/mi), meters. */
export function splitLengthForUnit(unit: PaceUnit): number {
  return PACE_METERS_PER_UNIT[unit];
}
