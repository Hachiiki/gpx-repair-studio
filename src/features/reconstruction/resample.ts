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
 * Interpolation is spherical linear interpolation between unit vectors
 * (nlerp + renormalize): exact on the sphere, sub-millimeter against the
 * ellipsoid at running-scale leg lengths, and dependency-free. Spacing is
 * capped from *above*: each leg is divided into ⌈length / spacing⌉ equal
 * intervals, so every inserted point is at most `spacing` meters from its
 * neighbors along the geodesic.
 *
 * Every point carries its cumulative geodesic distance from the
 * before-anchor (`cumDistanceM`) — the basis for distance-proportional
 * timestamp estimation in Phase 5.
 *
 * Phase 4 — Reconstruction Editor: Drawing. Pure TypeScript.
 */

import { geodesicDistanceMeters, interpolateLatLon } from "@/lib/geo/geodesy";
import type { DrawVertex, LatLon, VertexId } from "@/types/domain";

/**
 * One point of the rendered/derived reconstruction path.
 * `role` distinguishes the immutable anchors, the exact user vertices, and
 * the interpolated fill points (the latter only exist when spacing is on).
 */
export interface PathPoint {
  lat: number;
  lon: number;
  /** The user vertex this point IS (never set on interpolated points). */
  vertexId?: VertexId;
  role: "before-anchor" | "after-anchor" | "vertex" | "interpolated";
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
 * inserted along every leg at (at most) the requested spacing — user data
 * is never moved or replaced by resampling (§H: repair only inserts).
 *
 * `after` may be null/absent (open-ended extension): the path then ends at
 * the last vertex and no after-anchor role appears.
 */
export function resamplePath(
  before: LatLon,
  vertices: readonly DrawVertex[],
  after: LatLon | null | undefined,
  spacingM: number | "off",
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
    if (previous !== null && spacingM !== "off") {
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
    push(node.point, node.role, node.vertexId);
  }

  return path;
}
