/**
 * useZones — the Phase 23 fitness-zones bindings (docs/plans/v3/
 * phase-23-fitness-zones-metrics.md §23.1/23.2/23.6).
 *
 * Thin React glue over the pure engines, one memo per derived view
 * model, keyed on the single merge the export pipeline already built
 * (the one-merge rule — the zones, the metrics charts, and the splits
 * can never disagree about populations). The settings flow from the
 * persisted ui store (the fitness group), so an edited boundary or FTP
 * re-derives every surface in place.
 *
 * Pure derivations: nothing here touches stores beyond reading them.
 */

"use client";

import { useMemo } from "react";
import type { MergeResult } from "@/features/reconstruction/merge";
import { caloriesEstimate } from "@/features/statistics/calories";
import type { CaloriesEstimate } from "@/features/statistics/calories";
import { buildMetricsProfile } from "@/features/statistics/metrics-series";
import type { MetricsProfile } from "@/features/statistics/metrics-series";
import type { SplitsResult } from "@/features/statistics/splits";
import {
  analyzeCadenceRanges,
  analyzeHrZones,
  analyzePaceZones,
  analyzePowerZones,
  buildFitnessLegs,
  type CadenceRangesResult,
  type FitnessLegWalk,
  type FitnessSettings,
  type HrZoneAnalysis,
  type PaceZoneAnalysis,
  type PowerZoneAnalysis,
  type SplitZoneRow,
} from "@/features/statistics/zones";
import type { GapSummary } from "@/features/statistics/gap";
import { useUiStore } from "@/state/ui-store";

// App-layer facade: components may not import feature internals (ESLint
// boundary, §F), so the Phase 23 vocabulary flows through this module.
export type {
  FitnessSettings,
  FitnessLegWalk,
  HrZoneAnalysis,
  PaceZoneAnalysis,
  PowerZoneAnalysis,
  CadenceRangesResult,
  SplitZoneRow,
  ZoneTimeResult,
  ZoneTimeRow,
  CadenceRangeRow,
  HrZoneSet,
  PowerZoneSet,
  PaceZoneSet,
  PaceRaceResult,
  ZoneGuardrailIssue,
} from "@/features/statistics/zones";
export {
  CADENCE_RANGE_WIDTH,
  DEFAULT_FITNESS_SETTINGS,
  FTP_CAP_W,
  FTP_MIN_W,
  HR_ZONE_COUNT,
  MAX_HR_CAP,
  MAX_HR_MIN,
  PACE_RACE_PRESETS,
  PACE_ZONE_COUNT,
  POWER_ZONE_COUNT,
  STOP_SPEED_MAX,
  STOP_SPEED_MIN,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  defaultHrBoundaries,
  oneHourPaceMsPerMeter,
  paceZoneBoundariesMsPerMeter,
  powerBoundaries,
  validateFtp,
  validateHrBoundaries,
  validateMaxHr,
  validateRaceResult,
  validateStopSpeedMps,
  validateWeightKg,
} from "@/features/statistics/zones";
export type { CaloriesEstimate } from "@/features/statistics/calories";
export type { GapSummary } from "@/features/statistics/gap";
export type { MetricsProfile } from "@/features/statistics/metrics-series";
export { minettiCost, minettiGapFactor } from "@/features/statistics/gap";

/** The persisted fitness settings + their setters (the popover's props). */
export function useFitnessSettings(): {
  fitness: FitnessSettings;
  setFitness: (patch: Partial<FitnessSettings>) => void;
  resetFitness: () => void;
} {
  const fitness = useUiStore((s) => s.fitness);
  const setFitness = useUiStore((s) => s.setFitness);
  const resetFitness = useUiStore((s) => s.resetFitness);
  return { fitness, setFitness, resetFitness };
}

/** Everything the ZonesCard and the metrics chart render, one join. */
export interface ZonesView {
  hr: HrZoneAnalysis | null;
  power: PowerZoneAnalysis | null;
  pace: PaceZoneAnalysis | null;
  cadence: CadenceRangesResult | null;
  gap: GapSummary | null;
  calories: CaloriesEstimate | null;
  metricsProfile: MetricsProfile | null;
}

export interface UseZonesInput {
  merge: MergeResult | null;
  /** The splits (split windows feed the per-zone breakdown). */
  splits: SplitsResult | null;
}

/**
 * The whole Phase 23 analysis over the merged route: time-in-zone for
 * hr/power/pace, cadence ranges, the whole-run GAP, the opt-in calorie
 * estimate, and the metrics display series — each a memo over the
 * merge, the settings, and (for the per-split breakdown) the splits.
 */
export function useZones({ merge, splits }: UseZonesInput): ZonesView {
  const fitness = useUiStore((s) => s.fitness);
  const timeGapMs = useUiStore((s) => s.gapThresholds.timeGapMs);

  const splitWindows = useMemo(
    () =>
      splits?.rows.map((row) => ({
        index: row.index,
        fromM: row.fromM,
        toM: row.toM,
      })) ?? undefined,
    [splits],
  );

  // The shared fitness walk — ONE O(n) pass over the merge feeding
  // every analysis (the upload-path budget stays a single walk, not
  // one per metric; the analyses below are cheap aggregations).
  const walk = useMemo(
    () => buildFitnessLegs(merge, { timeGapMs }),
    [merge, timeGapMs],
  );

  const hr = useMemo(
    () =>
      analyzeHrZones(walk, fitness.hr, {
        ...(splitWindows !== undefined ? { splits: splitWindows } : {}),
      }),
    [walk, fitness.hr, splitWindows],
  );

  const power = useMemo(
    () =>
      analyzePowerZones(walk, fitness.power, {
        ...(splitWindows !== undefined ? { splits: splitWindows } : {}),
      }),
    [walk, fitness.power, splitWindows],
  );

  const pace = useMemo(
    () =>
      analyzePaceZones(walk, fitness.pace, {
        ...(splitWindows !== undefined ? { splits: splitWindows } : {}),
      }),
    [walk, fitness.pace, splitWindows],
  );

  const cadence = useMemo(() => analyzeCadenceRanges(walk), [walk]);

  const gap = walk === null ? null : walk.gap;

  const calories = useMemo(
    () => caloriesEstimate(walk, fitness.calories),
    [walk, fitness.calories],
  );

  // The metrics profile is chart-bound ONLY — a metrics-free file (most
  // GPX files, every synthetic perf fixture) never pays its walk; the
  // walk's presence flags decide before the O(n) pass runs.
  const metricsProfile = useMemo(
    () =>
      walk === null ||
      (!walk.hasHrData && !walk.hasCadData && !walk.hasPowerData)
        ? null
        : buildMetricsProfile(merge),
    [walk, merge],
  );

  return { hr, power, pace, cadence, gap, calories, metricsProfile };
}
