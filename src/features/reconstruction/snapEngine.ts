/**
 * SnapEngine (§EE 17.3) — match a drawn polyline to its routed path.
 *
 * The one-shot "Snap to road" command's pure geometry half:
 *
 *   - the drawn chain's nodes (near anchor → vertices → far anchor)
 *     are reduced to a waypoint budget and routed through the provider
 *     in ONE request (`RoadFollowRouter.routePolyline`);
 *   - the returned geometry is matched back to the nodes MONOTONELY
 *     (each waypoint resolves to the nearest geometry vertex at or
 *     after the previous match — providers snap waypoints onto roads,
 *     so exact equality cannot be assumed);
 *   - the geometry between two consecutive matches becomes that pair's
 *     `RoadLeg` — the SAME side-table vocabulary per-leg road-follow
 *     uses, so preview, distance badge, and apply all render through
 *     the existing WYSIWYG join (`joinDrawChain`);
 *   - apply is ONE `set-line` command: the routed geometry reduced to
 *     at most `MAX_VERTICES` waypoints (Douglas-Peucker, endpoints
 *     kept) PLUS the line's path style moving to the routable profile
 *     — one undo step inverts both, and the seeded legs keep the
 *     rendered shape exact with zero re-requests.
 *
 * Honesty rules (§D-3): the snap only ever touches USER-DRAWN lines;
 * applied vertices carry no `snappedTo` (road geometry is not a
 * recorded point); the preview's "your line" length is the RENDERED
 * chain (current legs included) so the delta never fabricates a
 * difference the user cannot see.
 *
 * Phase 17 — Road snapping, opt-in. Pure TypeScript: no React, no
 * stores, no fetch (the router and the hooks own the network).
 */

import {
  douglasPeucker,
} from "./stroke";
import { SNAP_MAX_WAYPOINTS, type RoutableRoadMode } from "./roadFollow";
import { MAX_VERTICES } from "./drawModel";
import { polylineLengthMeters } from "@/lib/geo/geodesy";
import type { LatLon, RoadLeg } from "@/types/domain";

/**
 * The preview the panel shows before applying: three honest numbers
 * (meters), each measured the way the user can verify it.
 */
export interface RoadSnapPreviewNumbers {
  /** The chain as currently rendered (legs included), meters. */
  drawnDistanceM: number;
  /** The routed chain (the preview on the map), meters. */
  routedDistanceM: number;
  /** routed − drawn (positive: the road is longer than your line). */
  deltaM: number;
}

/**
 * Reduce the chain nodes to the request waypoint budget: exact
 * endpoints kept, interior reduced by Douglas-Peucker with escalating
 * tolerance. Consecutive duplicates (sub-meter apart after rounding)
 * collapse — a provider error on those is noise, not information.
 */
export function requestWaypoints(
  nodes: readonly LatLon[],
  maxWaypoints: number = SNAP_MAX_WAYPOINTS,
): LatLon[] {
  const usable = nodes.filter(
    (n) => Number.isFinite(n.lat) && Number.isFinite(n.lon),
  );
  if (usable.length <= maxWaypoints) return [...usable];
  let tolerance = 5;
  let simplified = douglasPeucker(usable, tolerance);
  while (simplified.length > maxWaypoints && tolerance < 5000) {
    tolerance *= 2;
    simplified = douglasPeucker(usable, tolerance);
  }
  if (simplified.length > maxWaypoints) {
    // Extreme fallback: uniform decimation, exact endpoints pinned.
    const step = (usable.length - 1) / (maxWaypoints - 1);
    simplified = Array.from(
      { length: maxWaypoints },
      (_, i) => usable[Math.round(i * step)],
    );
  }
  return simplified;
}

/** Planar degree distance scaled to meters (matching, not reporting). */
function degreesDistanceM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const metersPerDegLat = 111320;
  const cosLat = Math.max(0.1, Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180));
  const metersPerDegLon = 111320 * cosLat;
  return Math.hypot(
    (a.lat - b.lat) * metersPerDegLat,
    (a.lon - b.lon) * metersPerDegLon,
  );
}

/**
 * Match each waypoint to a geometry index, MONOTONELY: waypoint i's
 * search starts at waypoint i-1's match. Returns `null` when the
 * geometry cannot serve every waypoint in order (too short, or a
 * waypoint matches before the previous match with nothing between) —
 * the caller treats that as a failed snap, never a guess.
 */
export function matchWaypointIndices(
  geometry: readonly [number, number][],
  waypoints: readonly LatLon[],
): number[] | null {
  if (waypoints.length < 2 || geometry.length < 2) return null;
  const indices: number[] = [];
  let searchFrom = 0;
  for (const waypoint of waypoints) {
    let best = -1;
    let bestDistance = Infinity;
    for (let i = searchFrom; i < geometry.length; i += 1) {
      const [lon, lat] = geometry[i];
      const distance = degreesDistanceM(waypoint, { lat, lon });
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best === -1) return null;
    indices.push(best);
    // The next waypoint's match must leave room for at least one
    // geometry point between the two (a zero-length leg slice is
    // meaningless), except at the very end.
    searchFrom = Math.min(best + 1, geometry.length - 1);
  }
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] < indices[i - 1]) return null;
  }
  return indices;
}

/**
 * Slice the routed geometry into per-pair legs for the node chain —
 * the side-table vocabulary the renderer already joins. `null` when
 * the geometry does not serve every pair (see matcher above).
 */
export function sliceRoutedPolyline(
  nodes: readonly LatLon[],
  geometry: readonly [number, number][],
): RoadLeg[] | null {
  const indices = matchWaypointIndices(geometry, nodes);
  if (!indices) return null;
  const legs: RoadLeg[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const from = indices[i];
    const to = Math.max(indices[i + 1], from + 1);
    if (to >= geometry.length && from >= geometry.length - 1) {
      // Degenerate tail: a and b matched the final geometry point —
      // the leg is the straight stitch (same as an unresolved leg).
      legs.push({ a, b, coordinates: [[a.lon, a.lat], [b.lon, b.lat]], routeDistanceM: 0 });
      continue;
    }
    const clampedTo = Math.min(to, geometry.length - 1);
    legs.push({
      a,
      b,
      coordinates: geometry.slice(from, clampedTo + 1).map((c) => [c[0], c[1]]),
      routeDistanceM: 0,
    });
  }
  return legs;
}

/**
 * The applied line's waypoints: the routed geometry reduced to at
 * most `maxVertices` points (Douglas-Peucker, endpoints kept). These
 * become the reconstruction's vertices; the seeded legs carry the
 * exact road shape between them.
 */
export function appliedWaypoints(
  routedGeometry: readonly LatLon[],
  maxVertices: number = MAX_VERTICES,
): LatLon[] {
  const usable = routedGeometry.filter(
    (n) => Number.isFinite(n.lat) && Number.isFinite(n.lon),
  );
  if (usable.length <= maxVertices) return [...usable];
  let tolerance = 2;
  let simplified = douglasPeucker(usable, tolerance);
  while (simplified.length > maxVertices && tolerance < 5000) {
    tolerance *= 2;
    simplified = douglasPeucker(usable, tolerance);
  }
  if (simplified.length > maxVertices) {
    const step = (usable.length - 1) / (maxVertices - 1);
    simplified = Array.from(
      { length: maxVertices },
      (_, i) => usable[Math.round(i * step)],
    );
  }
  return simplified;
}

/** The stitched chain a set of legs renders (WYSIWYG length source). */
function stitchedChain(nodes: readonly LatLon[], legs: readonly RoadLeg[]): LatLon[] {
  const points: LatLon[] = [nodes[0]];
  for (let i = 1; i < nodes.length; i += 1) {
    const leg = legs[i - 1];
    if (leg && leg.coordinates.length >= 2) {
      for (let j = 1; j < leg.coordinates.length - 1; j += 1) {
        const [lon, lat] = leg.coordinates[j];
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          points.push({ lat, lon });
        }
      }
    }
    points.push(nodes[i]);
  }
  return points;
}

/**
 * The preview's honest numbers: the drawn chain's rendered length vs
 * the routed chain's rendered length (the SAME join the map draws and
 * the distance badge reads — the number the user sees is the number
 * the box states).
 */
export function snapPreviewNumbers(
  nodes: readonly LatLon[],
  drawnLegs: readonly RoadLeg[],
  routedLegs: readonly RoadLeg[],
): RoadSnapPreviewNumbers {
  const drawnDistanceM = polylineLengthMeters(
    stitchedChain(nodes, drawnLegs),
  );
  const routedDistanceM = polylineLengthMeters(
    stitchedChain(nodes, routedLegs),
  );
  const deltaM = routedDistanceM - drawnDistanceM;
  return { drawnDistanceM, routedDistanceM, deltaM };
}

/**
 * The apply plan: the new waypoints (the routed geometry reduced to
 * the vertex cap) and the legs that keep the rendered shape exact
 * between them. The profile is the snap's routable mode; the command
 * itself (`set-line`) is built by the caller — the store owns the
 * vertex-id allocator.
 */
export interface SnapApplyPlan {
  waypoints: LatLon[];
  /** Legs for the NEW consecutive waypoint pairs (cache-seedable). */
  legs: RoadLeg[];
}

/**
 * Build the apply plan from the routed geometry: reduce to waypoints,
 * re-slice the geometry for the waypoint pairs (the waypoints are a
 * subset of the geometry, so the matcher resolves them exactly).
 */
export function planSnapApply(
  routedGeometry: readonly [number, number][],
  maxVertices: number = MAX_VERTICES,
): SnapApplyPlan | null {
  const asLatLon: LatLon[] = routedGeometry.map(([lon, lat]) => ({ lat, lon }));
  const waypoints = appliedWaypoints(asLatLon, maxVertices);
  if (waypoints.length < 2) return null;
  const legs = sliceRoutedPolyline(waypoints, routedGeometry);
  if (!legs) return null;
  return { waypoints, legs };
}

/** The snap profile label (panel copy + logs). */
export function snapProfileLabel(mode: RoutableRoadMode): string {
  return mode === "car" ? "roads" : "footpaths";
}
