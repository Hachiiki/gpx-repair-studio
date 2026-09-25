/**
 * Resample — reconstruction path building and densification
 * (docs/MASTER_PLAN.md Phase 4, §G `Reconstruction.resampleSpacingM`).
 *
 * The *path* of a reconstruction is always
 *
 *     before-anchor → v0 → … → vN → after-anchor
 *
 * — the anchors are implicit and immutable; only the vertices are user
 * data. This module turns `(anchors, vertices, spacing)` into the ordered,
 * densified point list that the map renders and that Phase 5 (timestamps)
 * and Phase 7 (merge/export) will consume. It is a **pure function of the
 * reconstruction** — derived data is never stored as truth (§D-3).
 *
 * Road-follow legs (`roadLegs`, the draw editor's snap-to-road side table):
 * a leg whose node pair matches a resolved road leg contributes the
 * provider's road geometry as `role: "road"` points — the committed path
 * follows the road exactly as the draft previewed it (WYSIWYG). Spacing
 * never re-densifies a road leg (the provider geometry is already dense);
 * it keeps applying to straight legs only.
 *
 * Interpolation is spherical linear interpolation between unit vectors
 * (nlerp + renormalize): exact on the sphere, sub-millimeter against the
 * ellipsoid at running-scale leg lengths, and dependency-free. Spacing is
 * capped from *above*: each leg is divided into ⌈length / spacing⌉ equal
 * intervals, so every inserted point is at most `spacing` meters from its
 * neighbors along the geodesic.
 *
 * Every point carries its cumulative geodesic distance from the
 * before-anchor (`cumDistanceM`) — the basis for distance-proportional
 * timestamp estimation in Phase 5. Road points measure their legs the
 * same way, so the cumulative profile stays honest against the ellipsoid.
 *
 * Phase 4 — Reconstruction Editor: Drawing. Pure TypeScript.
 */

import { geodesicDistanceMeters, interpolateLatLon } from "@/lib/geo/geodesy";
import { findLeg } from "@/features/reconstruction/roadFollow";
import type { DrawVertex, LatLon, RoadLeg, VertexId } from "@/types/domain";

/**
 * One point of the rendered/derived reconstruction path.
 * `role` distinguishes the immutable anchors, the exact user vertices, the
 * interpolated fill points (spacing on), and the road-follow points
 * (provider geometry between two nodes).
 */
export interface PathPoint {
  lat: number;
  lon: number;
  /** The user vertex this point IS (never set on interpolated points). */
  vertexId?: VertexId;
  role: "before-anchor" | "after-anchor" | "vertex" | "interpolated" | "road";
  /** Geodesic distance from the before-anchor along the path, meters. */
  cumDistanceM: number;
}

/** Selectable resample spacings (meters), plus "off" = vertices only. */
export const RESAMPLE_SPACING_OPTIONS = [10, 25, 50] as const;
export type ResampleSpacing = (typeof RESAMPLE_SPACING_OPTIONS)[number] | "off";

/**
 * Build the full reconstruction path.
 *
 * With `spacingM = "off"` the path is exactly
 * `[before, v0…vN, after]`. With a numeric spacing, the anchors and user
 * vertices are kept **exactly as placed** and interpolated fill points are
 * inserted along every straight leg at (at most) the requested spacing —
 * user data is never moved or replaced by resampling (§H: repair only
 * inserts). A leg with a resolved road-follow entry contributes its road
 * interior as `role: "road"` points instead (already dense — no spacing).
 *
 * `after` may be null/absent (open-ended extension): the path then ends at
 * the last vertex and no after-anchor role appears.
 */
export function resamplePath(
  before: LatLon,
  vertices: readonly DrawVertex[],
  after: LatLon | null | undefined,
  spacingM: number | "off",
  roadLegs: readonly RoadLeg[] = [],
): PathPoint[] {
  const nodes: { point: LatLon; role: PathPoint["role"]; vertexId?: VertexId }[] =
    [
      { point: before, role: "before-anchor" },
      ...vertices.map((vertex) => ({
        point: vertex as LatLon,
        role: "vertex" as const,
        vertexId: vertex.id,
      })),
      ...(after ? [{ point: after, role: "after-anchor" as const }] : []),
    ];

  const path: PathPoint[] = [];
  let cumulative = 0;
  let previous: LatLon | null = null;

  // Each pushed point's cumulative distance is the TRUE geodesic distance
  // from the previously pushed point (not an evenly-divided approximation):
  // interpolated positions come from spherical interpolation, and the sum
  // must stay honest against the ellipsoid distances used everywhere else.
  const push = (
    point: LatLon,
    role: PathPoint["role"],
    vertexId: VertexId | undefined,
  ) => {
    if (previous !== null) {
      const legM = geodesicDistanceMeters(previous, point);
      // Non-finite legs are unreachable from the draw editor (command
      // constructors reject non-finite vertices); defensively contribute 0
      // rather than poisoning the whole profile with NaN.
      if (Number.isFinite(legM)) cumulative += legM;
    }
    path.push({
      lat: point.lat,
      lon: point.lon,
      ...(vertexId !== undefined ? { vertexId } : {}),
      role,
      cumDistanceM: cumulative,
    });
    previous = point;
  };

  for (const node of nodes) {
    if (previous !== null) {
      const roadLeg = findLeg(roadLegs, previous, node.point);
      if (roadLeg && roadLeg.coordinates.length >= 2) {
        // Road-followed leg: the provider geometry IS the path. The exact
        // nodes bracket the interior (the provider snaps waypoints onto
        // the road — see roadFollow.ts) and spacing never re-densifies it.
        for (let i = 1; i < roadLeg.coordinates.length - 1; i += 1) {
          const [lon, lat] = roadLeg.coordinates[i];
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            push({ lat, lon }, "road", undefined);
          }
        }
      } else if (spacingM !== "off") {
        // Insert fill points strictly between the previous node and this one.
        // The interpolation base stays fixed at the leg's start node — `push`
        // advances `previous` (for cumulative distances), but every fill
        // position must be computed from the leg's original endpoints.
        const legStart = previous;
        const legM = geodesicDistanceMeters(legStart, node.point);
        if (Number.isFinite(legM) && legM > spacingM) {
          const intervals = Math.ceil(legM / spacingM);
          for (let i = 1; i < intervals; i += 1) {
            push(
              interpolateLatLon(legStart, node.point, i / intervals),
              "interpolated",
              undefined,
            );
          }
        }
      }
    }
    push(node.point, node.role, node.vertexId);
  }

  return path;
}
