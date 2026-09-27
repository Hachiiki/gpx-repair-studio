/**
 * Create track — the "create from activity stats" workflow's Step 2/3
 * pipeline: turn a user-drawn route plus the watch's statistics into the
 * final GPX track population.
 *
 * The pipeline is pure and staged, mirroring the repair studio's
 * resample → timestamps flow on a whole-activity scale:
 *
 *   vertices (+road legs, spacing)
 *     → resamplePath(null, …, null, …)   the drawn chain, densified
 *     → scalePathAboutCentroid(…)        reconcile with the recorded
 *                                        distance (shape preserved)
 *     → distributeTimestamps(…)          the recorded duration spread
 *                                        by movement along the route
 *
 * Everything reuses the reconstruction machinery (§G derived data): the
 * drawn vertices are the only user data; the path, the scale, and the
 * timestamps are recomputed from them on every change.
 *
 * Pure TypeScript: no React, no DOM, no stores.
 */

import { resamplePath, type PathPoint } from "@/features/reconstruction/resample";
import {
  distributeTimestamps,
  wholeActivityTimePlan,
  type DistributedTime,
} from "@/features/reconstruction/timestamps";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { RouteViewData } from "@/lib/map/geojson";
import type { DrawVertex, GapId, RoadLeg } from "@/types/domain";

/**
 * The single pseudo-gap id of the create workflow's route. The `create/`
 * prefix can never collide with parsed-gap ids (`gap/{pointId}/{pointId}`,
 * where PointIds always contain `:`) or with extension span ids
 * (`gap/{anchor}/end`, `gap/start/{anchor}`).
 */
export const CREATE_ROUTE_ID = "create/route" as GapId;

/** The minimum vertices before a route can be finished/exported. */
export const MIN_CREATE_VERTICES = 2;

/**
 * Below this |relative difference| the drawn route counts as matching the
 * recorded distance — no scaling, no toggle (sub-1% is inside GPS and
 * drawing noise).
 */
export const RECONCILE_TOLERANCE_RATIO = 0.01;

// ---------------------------------------------------------------------------
// Distance reconciliation
// ---------------------------------------------------------------------------

/** The recorded-vs-drawn comparison the review card renders. */
export interface Reconciliation {
  /** The watch's distance (meters) — authoritative. */
  recordedM: number;
  /** The drawn chain's geodesic length (meters), road legs included. */
  drawnM: number;
  /** drawn − recorded (meters, signed). */
  differenceM: number;
  /** |difference| / recorded (0..1). */
  relativeDifference: number;
  /** Scaling would move the route more than the tolerance allows. */
  needsScaling: boolean;
  /** recorded / drawn — the uniform scale factor (when drawable). */
  scaleFactor: number | null;
  /**
   * The factor would distort the route heavily (a much shorter/longer
   * drawing than the recording) — surfaced as a warning, never a block.
   */
  extreme: boolean;
}

/** Compare the drawn distance with the recorded one. Pure, total. */
export function computeReconciliation(
  recordedM: number,
  drawnM: number,
): Reconciliation {
  const differenceM = drawnM - recordedM;
  const relativeDifference =
    recordedM > 0 ? Math.abs(differenceM) / recordedM : 0;
  const drawable = drawnM > 0 && recordedM > 0;
  const scaleFactor = drawable ? recordedM / drawnM : null;
  const extreme =
    drawable && (scaleFactor! > 1.5 || scaleFactor! < 1 / 1.5);
  return {
    recordedM,
    drawnM,
    differenceM,
    relativeDifference,
    needsScaling: drawable && relativeDifference > RECONCILE_TOLERANCE_RATIO,
    scaleFactor,
    extreme,
  };
}

// ---------------------------------------------------------------------------
// Scaling (shape-preserving similarity transform)
// ---------------------------------------------------------------------------

/**
 * Scale a path uniformly about its geographic centroid, preserving shape
 * exactly (roles, vertex ids, and order ride along untouched).
 *
 * Lat/lon degrees scale linearly: Δlat·f keeps N–S meters × f, and Δlon·f
 * keeps E–W meters × f as well (E–W meters ∝ Δlon·cos lat, and cos varies
 * negligibly across a city-scale route) — a similarity transform in the
 * local tangent plane, exact to well under a meter per kilometer.
 *
 * Cumulative distances are recomputed geodesically after the move, so the
 * scaled path's `cumDistanceM` stays honest for timestamp distribution.
 * Antimeridian-crossing routes are not supported (the longitudes would
 * average across the wrap) — an acceptable, documented limit; the
 * "keep drawn distance" fallback always exists.
 */
export function scalePathAboutCentroid(
  path: readonly PathPoint[],
  factor: number,
): PathPoint[] {
  if (path.length === 0 || !Number.isFinite(factor) || factor === 1) {
    return [...path];
  }
  let latSum = 0;
  let lonSum = 0;
  for (const point of path) {
    latSum += point.lat;
    lonSum += point.lon;
  }
  const latC = latSum / path.length;
  const lonC = lonSum / path.length;

  const scaled = path.map((point) => ({
    ...point,
    lat: latC + (point.lat - latC) * factor,
    lon: lonC + (point.lon - lonC) * factor,
  }));

  // Recompute the cumulative profile against the ellipsoid.
  let cumulative = 0;
  for (let i = 0; i < scaled.length; i += 1) {
    if (i > 0) {
      const legM = geodesicDistanceMeters(scaled[i - 1], scaled[i]);
      if (Number.isFinite(legM)) cumulative += legM;
    }
    scaled[i].cumDistanceM = cumulative;
  }
  return scaled;
}

// ---------------------------------------------------------------------------
// Track assembly
// ---------------------------------------------------------------------------

/** The finished track population — one basis for map, card, and export. */
export interface CreateTrack {
  /** The FINAL path (scaled when reconciliation says so). */
  path: PathPoint[];
  /**
   * Timestamps aligned with `path` (every point carries one when the plan
   * anchors — which the create form guarantees by requiring a start).
   */
  times: readonly (DistributedTime | undefined)[];
  /** The drawn chain's length before scaling (meters). */
  drawnDistanceM: number;
  /** The final track's length (meters) — what the GPX will represent. */
  finalDistanceM: number;
  /** The reconciliation verdict (recorded vs drawn). */
  reconciliation: Reconciliation;
  /** Whether the scale transform was applied. */
  scaleApplied: boolean;
  /** The scale factor applied (null when none). */
  scaleFactor: number | null;
  /** Total generated track points. */
  pointCount: number;
}

/** The inputs the track derives from (a snapshot of the create store). */
export interface CreateTrackInput {
  vertices: readonly DrawVertex[];
  roadLegs: readonly RoadLeg[];
  spacingM: number | "off";
  /** Scale the drawn route to the recorded distance (the default). */
  matchDistance: boolean;
}

/**
 * Build the final track: densify the drawn chain, reconcile it with the
 * recorded distance, and spread the recorded duration across it. Returns
 * `null` until the route is drawable (≥ {@link MIN_CREATE_VERTICES}
 * vertices with a positive length) or the stats are missing.
 *
 * The user's statistics are authoritative by construction: the duration
 * enters `wholeActivityTimePlan` verbatim, and the distance enters as the
 * scaling target — the generated track therefore satisfies
 * distance ≈ recorded and duration = recorded exactly (to GPX coordinate
 * precision), and the pace falls out of their arithmetic.
 */
export function buildCreateTrack(
  stats: { distanceM: number; durationMs: number; startMs: number },
  input: CreateTrackInput,
): CreateTrack | null {
  if (input.vertices.length < MIN_CREATE_VERTICES) return null;

  // The drawn chain — no anchors, spacing + road legs applied, exactly
  // the geometry the map previewed (WYSIWYG).
  const drawnPath = resamplePath(
    null,
    input.vertices,
    null,
    input.spacingM,
    input.roadLegs,
  );
  if (drawnPath.length === 0) return null;
  const drawnDistanceM = drawnPath[drawnPath.length - 1].cumDistanceM;
  if (!(drawnDistanceM > 0)) return null;

  const reconciliation = computeReconciliation(stats.distanceM, drawnDistanceM);
  const scaleApplied = input.matchDistance && reconciliation.needsScaling;
  const path = scaleApplied
    ? scalePathAboutCentroid(drawnPath, reconciliation.scaleFactor!)
    : drawnPath;
  const finalDistanceM = path[path.length - 1].cumDistanceM;

  // The recorded duration, spread by movement along the final path. With
  // no anchor roles every point is interior, so every point is stamped:
  // first = start, last = start + duration (exactly the entered total).
  const plan = wholeActivityTimePlan(stats.durationMs, stats.startMs);
  const times = distributeTimestamps(path, plan);

  return {
    path,
    times,
    drawnDistanceM,
    finalDistanceM,
    reconciliation,
    scaleApplied,
    scaleFactor: scaleApplied ? reconciliation.scaleFactor : null,
    pointCount: path.length,
  };
}

/**
 * The final track as the map's route view — one committed-reconstruction
 * line in the app's signal color (the same treatment repaired sections
 * get: the app's own work, clearly not a recording).
 */
export function createTrackRouteView(track: CreateTrack): RouteViewData {
  return {
    lines: [],
    spans: [],
    markers: [],
    reconstructions: [
      {
        gapId: CREATE_ROUTE_ID,
        coordinates: track.path.map(
          (point) => [point.lon, point.lat] as [number, number],
        ),
      },
    ],
    usablePointCount: track.pointCount,
  };
}

/**
 * The download file name: `activity-YYYY-MM-DD.gpx`, dated by the
 * activity's start (the name platforms such as Strava title the activity
 * with by default).
 */
export function createTrackFileName(startMs: number): string {
  const date = new Date(startMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `activity-${year}-${month}-${day}.gpx`;
}
