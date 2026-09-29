/**
 * Plan-a-route — the "route planner" section's pure estimation
 * vocabulary (Task 50).
 *
 * The planner is a scratchpad: the user sketches a route on the map with
 * the SAME drawing machinery every editor has (pens, per-line path
 * styles, Move mode, undo), and the app reads the route's numbers back —
 * distance, terrain elevation, the crow-flies comparison, and a pace
 * computed from a time the user enters. Nothing is exported, nothing is
 * shared: the section has no file output at all, so this module produces
 * DISPLAY numbers only (no track building, no resampling, no timestamps).
 *
 * Everything heavy is REUSED from the existing feature modules:
 *   - the rendered join (road legs / curve spline / straight) comes from
 *     `features/reconstruction/roadFollow` — the same join the map draws,
 *     so the estimates are WYSIWYG by construction;
 *   - the elevation fetch/label/stale machinery is the Phase 6 set
 *     (provider, per-key store records, the 400-point cap, hysteresis
 *     summaries) — only the freshness SIGNATURE is plan-specific;
 *   - pace arithmetic mirrors `features/statistics/pace`'s §L-1 math.
 *
 * "Plan a route" section. Pure TypeScript: no React, no DOM, no stores
 * (the store-reading join lives in the hook layer).
 */

import { joinCurveChain, joinDrawChain } from "@/features/reconstruction/roadFollow";
import { roadLegsSignature } from "@/features/elevation/samples";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { PaceUnit } from "@/lib/utils/format";
import type { DrawVertex, GapId, LatLon, PathStyle, RoadLeg } from "@/types/domain";

/**
 * The planner's single pseudo-reconstruction id — the drawModel commands
 * key a `Reconstruction` by gap id, and the planner has exactly one
 * chain. The `plan/` prefix can never collide with parsed gap ids or
 * the other sections' namespaces.
 */
export const PLAN_ROUTE_ID = "plan/route" as GapId;

/**
 * The elevation-store key of the planner's fetch record. `plan::`
 * follows the `create::` / `recovery::` namespacing pattern — the
 * planner's single record can never collide with (or prune) another
 * section's.
 */
export const PLAN_ELEVATION_STORE_KEY = "plan::route" as GapId;

/** One point of the planner's rendered join, with its chain distance. */
export interface PlanJoinPoint extends LatLon {
  /** Meters from the route's first point, along the rendered join. */
  cumDistanceM: number;
}

/**
 * The planner's rendered route: the join the map draws (WYSIWYG), with
 * cumulative distances for the elevation fetch and the pace math.
 */
export interface PlanJoin {
  points: readonly PlanJoinPoint[];
  /** The route's full rendered length in meters (0 below two nodes). */
  distanceM: number;
}

/**
 * Build the planner's rendered join. Exactly the join the draft chain
 * renders — straight/routed legs through `joinDrawChain`, smooth local
 * spline through `joinCurveChain` — so the numbers the panel shows are
 * the numbers the line draws.
 */
export function planJoin(
  vertices: readonly DrawVertex[],
  roadLegs: readonly RoadLeg[],
  pathStyle: PathStyle,
): PlanJoin {
  if (vertices.length === 0) {
    return { points: [], distanceM: 0 };
  }
  const nodes: LatLon[] = vertices.map((vertex) => ({
    lat: vertex.lat,
    lon: vertex.lon,
  }));
  const geometry =
    pathStyle === "curve"
      ? joinCurveChain(nodes)
      : joinDrawChain(nodes, roadLegs);
  const points: PlanJoinPoint[] = [];
  let cumulative = 0;
  let previous: LatLon | null = null;
  for (const point of geometry.points) {
    if (previous !== null) {
      const step = geodesicDistanceMeters(previous, point);
      if (Number.isFinite(step) && step > 0) cumulative += step;
    }
    points.push({ lat: point.lat, lon: point.lon, cumDistanceM: cumulative });
    previous = point;
  }
  return { points, distanceM: cumulative };
}

/**
 * The straight-line start-to-finish distance ("as the crow flies") —
 * the classic planning comparison against the path's length. Returns
 * `null` when the route has no span yet (fewer than two points).
 */
export function crowFliesDistanceM(join: PlanJoin): number | null {
  const points = join.points;
  if (points.length < 2) return null;
  const direct = geodesicDistanceMeters(points[0], points[points.length - 1]);
  return Number.isFinite(direct) ? direct : null;
}

/**
 * How much longer the path is than the straight line — `null` when
 * either leg of the ratio is unusable (no span, or a zero-length crow
 * flight such as a loop, where "×" would read as infinite).
 */
export function detourFactor(join: PlanJoin): number | null {
  const direct = crowFliesDistanceM(join);
  if (direct === null || direct <= 0 || join.distanceM <= 0) return null;
  return join.distanceM / direct;
}

/**
 * The freshness signature of a plan elevation fetch: the resolved road
 * legs (a re-routed leg moves the geometry), the path style (a style
 * switch redraws the join), and the session token (a full reset bumps
 * it — two different routes can land on the same revision/legs/style
 * tuple, but never on the same token). Vertex edits are covered by the
 * revision check the hook applies alongside this signature.
 */
export function planElevationSignature(
  roadLegs: readonly RoadLeg[],
  pathStyle: PathStyle,
  sessionSeq: number,
): string {
  return `${roadLegsSignature(roadLegs)}|${pathStyle}|s${sessionSeq}`;
}

/**
 * Pace in ms per unit for a planned time over a planned distance — the
 * same §L-1 arithmetic `features/statistics/pace` uses, so the
 * planner's pace formats identically to every other pace in the app.
 * `undefined` when not computable (the honesty "—" — the caller
 * supplies the reason).
 */
export function plannedPaceMsPerUnit(
  durationMs: number | null,
  distanceM: number,
  unit: PaceUnit,
): number | undefined {
  if (durationMs === null || !(durationMs > 0) || !(distanceM > 0)) {
    return undefined;
  }
  const metersPerUnit = unit === "km" ? 1000 : 1609.344;
  return (durationMs / distanceM) * metersPerUnit;
}

/**
 * Average speed in km/h for a planned time over a planned distance —
 * the ride-friendly twin of the pace. `undefined` when not computable.
 */
export function plannedSpeedKmh(
  durationMs: number | null,
  distanceM: number,
): number | undefined {
  if (durationMs === null || !(durationMs > 0) || !(distanceM > 0)) {
    return undefined;
  }
  return (distanceM / 1000) / (durationMs / 3_600_000);
}

/**
 * Splits of a planned time — the even-pace checkpoint markers every
 * unit (1 km or 1 mi) along the route. One row per whole unit the route
 * covers, each carrying the unit index (1-based), the split's cumulative
 * distance, and the elapsed time at that split (even pace — this is a
 * PLAN, not a prediction; the provenance is the user's entered time).
 */
export interface PlannedSplit {
  /** 1-based unit index (split 1 = the first kilometer/mile). */
  unit: number;
  /** Cumulative distance of this split's end, in meters. */
  distanceM: number;
  /** Elapsed time at the split, in ms (even pace from the entered time). */
  elapsedMs: number;
}

/**
 * The even-pace split table for a planned time: one row per whole unit,
 * the elapsed time growing linearly with distance. An empty table when
 * the time or distance is unusable (nothing to split), or when the
 * route covers less than one whole unit.
 */
export function plannedSplits(
  durationMs: number | null,
  distanceM: number,
  unit: PaceUnit,
): readonly PlannedSplit[] {
  if (durationMs === null || !(durationMs > 0) || !(distanceM > 0)) {
    return [];
  }
  const metersPerUnit = unit === "km" ? 1000 : 1609.344;
  const wholeUnits = Math.floor(distanceM / metersPerUnit);
  if (wholeUnits < 1) return [];
  const paceMsPerMeter = durationMs / distanceM;
  const splits: PlannedSplit[] = [];
  for (let k = 1; k <= wholeUnits; k += 1) {
    const splitDistanceM = k * metersPerUnit;
    splits.push({
      unit: k,
      distanceM: splitDistanceM,
      elapsedMs: Math.round(splitDistanceM * paceMsPerMeter),
    });
  }
  return splits;
}

/**
 * The final partial unit's remainder — what is left after the last
 * whole split (a 5.23 km route has a 230 m tail after split 5), with
 * the elapsed time at the route's end. `null` when the route covers
 * exactly whole units or the inputs are unusable.
 */
export function plannedTail(
  durationMs: number | null,
  distanceM: number,
  unit: PaceUnit,
): { distanceM: number; elapsedMsAtEnd: number } | null {
  if (durationMs === null || !(durationMs > 0) || !(distanceM > 0)) {
    return null;
  }
  const metersPerUnit = unit === "km" ? 1000 : 1609.344;
  const remainderM =
    distanceM - Math.floor(distanceM / metersPerUnit) * metersPerUnit;
  if (remainderM <= 0) return null;
  const paceMsPerMeter = durationMs / distanceM;
  return {
    distanceM: remainderM,
    elapsedMsAtEnd: Math.round(distanceM * paceMsPerMeter),
  };
}
