/**
 * Calorie estimate — the Phase 23 amendment (docs/plans/v3/
 * phase-23-fitness-zones-metrics.md): opt-in, disclosed, labeled an
 * estimate everywhere it appears.
 *
 * Two formulas, chosen by what the file carries (mirroring the shape
 * Strava documents, with the public-science models named in place):
 *
 *   - **Power (files with recorded watts):** E = Σ ½(w_a + w_b)·Δt /
 *     η — the trapezoid rule over each timed leg's endpoint watts,
 *     divided by a gross human efficiency η = 0.24. Strava documents
 *     "power output with a human efficiency coefficient"; the number
 *     is ours, disclosed.
 *
 *   - **Metabolic (everything else, when a weight is set):**
 *     E = weight · Σ C(grade)·d — the Minetti cost curve integrated
 *     over the route's legs (the same model GAP derives from; on flat
 *     ground it reduces to weight × 3.6 J·kg⁻¹·m⁻¹ × distance, i.e.
 *     ~0.86 kcal per kg per km — the classic running rule of thumb).
 *     This is a RUNNING model: for rides without power it will
 *     overestimate, and the disclosure says so. Legs missing elevation
 *     at an endpoint count at the flat cost and are tallied.
 *
 * Both are estimates over moving legs only for power (gap legs — the
 * device off — are excluded, never zero-filled); the metabolic
 * integral runs over every usable leg (stopped time covers no
 * distance). Weight is opt-in, stored locally only, never exported.
 *
 * The math rides the shared fitness walk (`buildFitnessLegs`) — one
 * O(n) pass feeds the zones, GAP, and this estimate together.
 *
 * Phase 23 — Fitness zones & metrics. Pure TypeScript: no React, no DOM.
 */

import type { MergeResult } from "@/features/reconstruction/merge";
import type { FitnessLegWalk } from "@/features/statistics/zones";
import { buildFitnessLegs } from "@/features/statistics/zones";

/** Gross human efficiency for the power formula (ours, disclosed). */
export const HUMAN_EFFICIENCY = 0.24;

/** J per kcal (the thermochemical calorie the labels use). */
export const JOULES_PER_KCAL = 4184;

/** Which formula produced the number (the disclosure names it). */
export type CaloriesKind = "power" | "metabolic";

export interface CaloriesEstimate {
  kind: CaloriesKind;
  /** kcal — always labeled an estimate in the UI. */
  kcal: number;
  /** Power formula: the time-integrated average watts (the disclosure). */
  averageWatts?: number;
  /** Power formula: the seconds the integration covered. */
  powerSeconds?: number;
  /** Metabolic formula: the distance the integral covered, meters. */
  distanceM?: number;
  /** Metabolic formula: legs counted at the flat cost (no elevation). */
  flatLegs?: number;
  /** Metabolic formula: legs that carried a real grade. */
  gradedLegs?: number;
  /** The weight the estimate used, kg (metabolic only). */
  weightKg?: number;
}

export interface CaloriesSettings {
  enabled: boolean;
  weightKg: number | null;
}

export interface CaloriesOptions {
  timeGapMs?: number;
}

/**
 * The opt-in calorie estimate over a merged route (or a precomputed
 * fitness walk). `null` when the setting is off — the estimate never
 * appears uninvited — or when nothing honest can be computed.
 */
export function caloriesEstimate(
  source: MergeResult | FitnessLegWalk | null,
  settings: CaloriesSettings,
  options: CaloriesOptions = {},
): CaloriesEstimate | null {
  const walk =
    source === null
      ? null
      : "legs" in source
        ? source
        : buildFitnessLegs(source, options);
  if (walk === null || !settings.enabled) return null;

  // --- power: the trapezoid integral over timed legs -----------------------
  if (walk.hasPowerData && walk.power.seconds > 0) {
    return {
      kind: "power",
      kcal: walk.power.energyJ / HUMAN_EFFICIENCY / JOULES_PER_KCAL,
      averageWatts: walk.power.energyJ / walk.power.seconds,
      powerSeconds: walk.power.seconds,
    };
  }

  // --- metabolic: weight × the Minetti integral ----------------------------
  if (settings.weightKg === null) return null;
  if (walk.metabolic.distanceM <= 0) return null;
  return {
    kind: "metabolic",
    kcal:
      (settings.weightKg * walk.metabolic.energyJ) / JOULES_PER_KCAL,
    distanceM: walk.metabolic.distanceM,
    flatLegs: walk.metabolic.flatLegs,
    gradedLegs: walk.metabolic.gradedLegs,
    weightKg: settings.weightKg,
  };
}
