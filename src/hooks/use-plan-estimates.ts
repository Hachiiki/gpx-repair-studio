/**
 * usePlanEstimates — the "plan a route" section's estimate join + the
 * app-layer facade over the planner's pure math (Task 50).
 *
 * Two jobs, both serving the §D layering rule (components must not
 * import feature internals — hooks are the sanctioned facade, the same
 * pattern `use-map-controller` uses for the map controller's types):
 *
 *   - `usePlanEstimates()` — the reactive join-derived facts (the
 *     rendered route's crow-flies span and detour factor), computed
 *     over the SAME join the distance badge and the elevation fetch
 *     use (one join, one truth);
 *   - the re-exported pure functions (`plannedPaceMsPerUnit`, …) the
 *     estimates card renders with.
 *
 * "Plan a route" section. Client-side hook.
 */

"use client";

import { useMemo } from "react";
import {
  crowFliesDistanceM,
  detourFactor,
  planJoin,
} from "@/features/plan/estimate";
import { usePlanStore } from "@/state/plan-store";

// The app-layer facade: components import the planner's pure math from
// here, never from the feature module directly.
export {
  plannedPaceMsPerUnit,
  plannedSpeedKmh,
  plannedSplits,
  plannedTail,
} from "@/features/plan/estimate";

/** The join-derived facts the estimates card displays. */
export interface PlanEstimates {
  /** Straight-line start→finish distance (null: fewer than two points). */
  crowFliesM: number | null;
  /** Path length ÷ crow-flies length (null: not computable, e.g. loops). */
  detour: number | null;
}

/**
 * The crow-flies comparison over the current store state — the same
 * rendered join (road legs, spline, or straight) the map draws, so the
 * comparison can never disagree with the line.
 */
export function usePlanEstimates(): PlanEstimates {
  const vertices = usePlanStore((s) => s.reconstruction.vertices);
  const roadLegs = usePlanStore((s) => s.roadLegs);
  const pathStyle = usePlanStore((s) => s.pathStyle);

  return useMemo(() => {
    const join = planJoin(vertices, roadLegs, pathStyle);
    return {
      crowFliesM: crowFliesDistanceM(join),
      detour: detourFactor(join),
    };
  }, [vertices, roadLegs, pathStyle]);
}
