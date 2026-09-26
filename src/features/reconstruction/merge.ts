/**
 * Merge — insert derived `ReconstructedPoint`s between repair anchors,
 * producing the ordered merged view (docs/MASTER_PLAN.md §H-6, Phase 7).
 *
 * The merge is the single basis for BOTH export modes (§H-7): it never
 * touches the original model — it walks the recorded points in document
 * order and *inserts* each committed repair's interior at its anchor
 * position:
 *
 *   - **bounded** repairs (detected gaps, replace/insert spans): the
 *     interior is inserted immediately after the `before` anchor. Detected
 *     gaps and insert spans have adjacent boundaries, so this is exactly
 *     "between the anchors"; a replace span over a stretch with recorded
 *     points in between keeps those points (repairs are additive — the
 *     same population the statistics join uses).
 *   - **extend-after**: the interior is inserted after the anchor.
 *   - **extend-before**: the interior is inserted before the anchor, in
 *     reversed path order (the drawn chain runs anchor → vertices; route
 *     order runs vertices → anchor).
 *
 * Timestamps reuse the §J-1 case matrix verbatim (`resolveGapTimePlan` +
 * `distributeTimestamps` — anchors never receive times; original
 * timestamps are never rewritten). One export-time addition (§J-1 Case 3):
 * for a file WITHOUT timing data, a file-level start time + total duration
 * spread the total distance-proportionally across the whole merged route —
 * repairs that already carry their own manual duration keep it (the more
 * specific estimate wins); without a start time, points are exported with
 * no `<time>` (valid GPX, §J-2 honesty).
 *
 * The result is **runs per track**: contiguous recorded slices of the
 * original segments plus reconstructed interior runs, in route order.
 * Mode A (structure-preserving export) emits each run as its own
 * `<trkseg>`; Mode B (merged) concatenates them into one. Runs carry the
 * original slice bounds so segment extras can be re-anchored exactly.
 *
 * Phase 7 — Merge & Export. Pure TypeScript: no React, no DOM, no fetch.
 * Original data is read-only here — the frozen model is never mutated.
 */

import {
  interpolateSample,
  type GapElevationResult,
} from "@/features/elevation/samples";
import { resamplePath } from "@/features/reconstruction/resample";
import {
  distributeTimestamps,
  resolveGapTimePlan,
  type FileTimingContext,
} from "@/features/reconstruction/timestamps";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  DrawVertex,
  GapId,
  MergedPointView,
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
  ReconstructedPoint,
  RoadLeg,
  SegmentId,
  TimeStrategy,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

/**
 * One committed repair, resolved for merging: the site's geometry and time
 * settings plus its anchor point ids. Boundaries are route-ordered (the
 * earlier point first); an open extension carries only its anchor and a
 * side. Dangling anchors (points that no longer exist) are skipped with a
 * reason — merge is total, it never throws.
 */
export interface MergeRepairSite {
  gapId: GapId;
  /** Bounded repairs: the earlier boundary point. */
  beforePointId?: PointId;
  /** Bounded repairs: the later boundary point. */
  afterPointId?: PointId;
  /** Open extensions: which side of the anchor the drawn path attaches to. */
  extendSide?: "before" | "after";
  vertices: readonly DrawVertex[];
  resampleSpacingM: number | "off";
  timeStrategy: TimeStrategy;
  roadLegs: readonly RoadLeg[];
  /**
   * Fresh elevation samples for this repair (Phase 6): interpolated onto
   * the interior points as `Estimated<number>` (`elevation-api` at sample
   * hits, `interpolated` between them). The caller guarantees freshness —
   * stale results are never attached (exported ele must be current).
   */
  elevation?: GapElevationResult;
}

/** File-level timing context (§J-1 Case 3) + its applicability. */
export interface MergeOptions {
  fileTiming: FileTimingContext;
  /**
   * Whether any recorded point carries a usable timestamp. When false and
   * the file-level total + start are set, the whole-activity spread
   * applies to otherwise-untimed repairs.
   */
  fileHasTimingData: boolean;
}

/**
 * One ordered run of the merged view. `recorded` runs are contiguous
 * slices of ONE original segment (`startIndex`/`endIndex` are inclusive
 * indices into that segment's points — the basis for re-anchoring segment
 * extras on export); `reconstructed` runs are a repair's interior points
 * in route order.
 */
export type MergedRun =
  | {
      kind: "recorded";
      segmentId: SegmentId;
      startIndex: number;
      endIndex: number;
      points: readonly OriginalTrackPoint[];
    }
  | {
      kind: "reconstructed";
      gapId: GapId;
      points: readonly ReconstructedPoint[];
    };

/** One track's merged content: ordered runs + the flat point view. */
export interface MergedTrack {
  trackIndex: number;
  runs: readonly MergedRun[];
  /** The §G `MergedPointView` projection (global `order` across the file). */
  points: readonly MergedPointView[];
  /** Repairs inserted into this track (its `gpxr:summary` gapCount). */
  repairCount: number;
  /** Σ path lengths of this track's repairs, meters (summary + stats). */
  reconstructedDistanceM: number;
}

/** The merge of every committed repair with the original model. */
export interface MergeResult {
  tracks: readonly MergedTrack[];
  /** Sites whose interior was inserted. */
  repairCount: number;
  /** Σ full anchor-to-anchor path lengths, meters (matches the stats join). */
  reconstructedDistanceM: number;
  /** Σ interior points inserted. */
  insertedPoints: number;
  /** Repairs carrying ≥1 estimated elevation (export attribution). */
  elevatedRepairCount: number;
  /** Unique provider display names behind those elevations. */
  elevationProviders: readonly string[];
  /** Sites skipped (dangling anchors) with the honest reason. */
  skipped: readonly { gapId: GapId; reason: string }[];
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

interface ResolvedSite {
  site: MergeRepairSite;
  /** Path start anchor (always exists). */
  near: { segment: OriginalSegment; index: number; point: OriginalTrackPoint };
  /** Path end anchor, when bounded. */
  far: OriginalTrackPoint | null;
  /** Reversed against route order (extend-before). */
  followsRouteOrder: boolean;
  /** Route-order times of the original boundary points. */
  routeBeforeMs?: number;
  routeAfterMs?: number;
  interior: ReconstructedPoint[];
  /** Full anchor-to-anchor path length, meters (the stats-join number). */
  pathLengthM: number;
}

/** Ordered insertion lists per anchor point id. */
interface InsertionPlan {
  after: Map<PointId, ResolvedSite[]>;
  before: Map<PointId, ResolvedSite[]>;
}

/**
 * Merge every committed repair into the original model. Pure and
 * deterministic: same inputs → same output; the frozen original model is
 * only ever read.
 */
export function mergeRepairs(
  data: OriginalTrackData,
  sites: readonly MergeRepairSite[],
  options: MergeOptions,
): MergeResult {
  // --- point index --------------------------------------------------------
  const byId = new Map<
    PointId,
    { segment: OriginalSegment; index: number; point: OriginalTrackPoint }
  >();
  for (const segment of data.segments) {
    segment.points.forEach((point, index) => {
      byId.set(point.id, { segment, index, point });
    });
  }

  // --- resolve sites: geometry + timestamps -------------------------------
  const skipped: { gapId: GapId; reason: string }[] = [];
  const resolved: ResolvedSite[] = [];

  for (const site of sites) {
    const bounded =
      site.beforePointId !== undefined && site.afterPointId !== undefined;
    const anchorId =
      site.beforePointId ?? site.afterPointId ?? undefined;

    if (bounded) {
      const beforeEntry = byId.get(site.beforePointId!);
      const afterEntry = byId.get(site.afterPointId!);
      if (!beforeEntry || !afterEntry) {
        skipped.push({
          gapId: site.gapId,
          reason: "a boundary point no longer exists in the file",
        });
        continue;
      }
      resolved.push(
        resolveSite(
          site,
          beforeEntry,
          afterEntry.point,
          true,
          beforeEntry.point.time,
          afterEntry.point.time,
          options,
        ),
      );
    } else if (anchorId !== undefined && site.extendSide !== undefined) {
      const anchorEntry = byId.get(anchorId);
      if (!anchorEntry) {
        skipped.push({
          gapId: site.gapId,
          reason: "the anchor point no longer exists in the file",
        });
        continue;
      }
      // Extend-before rows expose the anchor as the ROUTE-AFTER boundary;
      // extend-after as the route-before one. The plan boundary case
      // (before-only vs after-only) then anchors the distribution the
      // right way around.
      const routeBeforeMs =
        site.extendSide === "after" ? anchorEntry.point.time : undefined;
      const routeAfterMs =
        site.extendSide === "before" ? anchorEntry.point.time : undefined;
      resolved.push(
        resolveSite(
          site,
          anchorEntry,
          null,
          site.extendSide !== "before",
          routeBeforeMs,
          routeAfterMs,
          options,
        ),
      );
    } else {
      skipped.push({
        gapId: site.gapId,
        reason: "the repair has no usable anchor",
      });
    }
  }

  // --- whole-activity Case-3 spread (no-timing files, §J-1) ---------------
  const spreadEligible =
    !options.fileHasTimingData &&
    options.fileTiming.startMs !== null &&
    options.fileTiming.totalDurationMs !== null;

  // --- insertion plan -----------------------------------------------------
  const plan: InsertionPlan = { after: new Map(), before: new Map() };
  const push = (
    map: Map<PointId, ResolvedSite[]>,
    key: PointId,
    value: ResolvedSite,
  ) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const site of resolved) {
    if (site.site.beforePointId !== undefined && site.far !== null) {
      push(plan.after, site.site.beforePointId, site);
    } else if (site.site.extendSide === "before" && site.site.afterPointId !== undefined) {
      push(plan.before, site.site.afterPointId, site);
    } else if (site.site.beforePointId !== undefined) {
      push(plan.after, site.site.beforePointId, site);
    }
  }

  // --- walk tracks → segments → points ------------------------------------
  const tracks: MergedTrack[] = [];
  let reconstructedDistanceM = 0;
  let insertedPoints = 0;
  let elevatedRepairCount = 0;
  const elevationProviders = new Set<string>();
  let order = 0;

  for (const meta of data.tracks) {
    const runs: MergedRun[] = [];
    const views: MergedPointView[] = [];
    let trackRepairCount = 0;
    let trackDistanceM = 0;
    let current: {
      segmentId: SegmentId;
      startIndex: number;
      endIndex: number;
      points: OriginalTrackPoint[];
    } | null = null;

    const closeRun = () => {
      if (current !== null) {
        runs.push({ kind: "recorded", ...current });
        current = null;
      }
    };

    const emitReconstructed = (site: ResolvedSite) => {
      closeRun();
      runs.push({ kind: "reconstructed", gapId: site.site.gapId, points: site.interior });
      for (const point of site.interior) {
        views.push({ point, order: order++, belongsToGap: site.site.gapId });
      }
      insertedPoints += site.interior.length;
      trackRepairCount += 1;
      trackDistanceM += site.pathLengthM;
    };

    for (const segment of data.segments) {
      if (segment.trackIndex !== meta.trackIndex) continue;

      // Segments are separate runs by definition (Mode A preserves the
      // `<trkseg>` structure); a repair's interior may split one further.
      closeRun();

      // Empty segments keep their place in the structure (§H-7 Mode A
      // preserves them): a point-less recorded run emits the `<trkseg>`
      // element with its anchored extras.
      if (segment.points.length === 0) {
        runs.push({
          kind: "recorded",
          segmentId: segment.id,
          startIndex: 0,
          endIndex: -1,
          points: [],
        });
        continue;
      }

      segment.points.forEach((point, index) => {
        for (const site of plan.before.get(point.id) ?? []) {
          emitReconstructed(site);
        }
        if (current === null) {
          current = {
            segmentId: segment.id,
            startIndex: index,
            endIndex: index,
            points: [point],
          };
        } else {
          current.points.push(point);
          current.endIndex = index;
        }
        views.push({ point, order: order++ });
        for (const site of plan.after.get(point.id) ?? []) {
          emitReconstructed(site);
        }
      });
    }
    closeRun();

    // Case-3 whole-activity spread: compute per-track cumulative distances
    // and timestamp otherwise-untimed reconstructed points. (Tracks are
    // independent activities — each spreads the SAME total over its own
    // route, which is the honest interpretation for the single-track files
    // this mode addresses.)
    if (spreadEligible) {
      applyFileTotalSpread(runs, views, options.fileTiming);
    }

    tracks.push({
      trackIndex: meta.trackIndex,
      runs,
      points: views,
      repairCount: trackRepairCount,
      reconstructedDistanceM: trackDistanceM,
    });
  }

  for (const site of resolved) {
    reconstructedDistanceM += site.pathLengthM;
    if (site.interior.some((point) => point.ele !== undefined)) {
      elevatedRepairCount += 1;
      if (site.site.elevation) elevationProviders.add(site.site.elevation.providerName);
    }
  }

  return {
    tracks,
    repairCount: resolved.length,
    reconstructedDistanceM,
    insertedPoints,
    elevatedRepairCount,
    elevationProviders: [...elevationProviders],
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Site resolution (path + timestamps)
// ---------------------------------------------------------------------------

function resolveSite(
  site: MergeRepairSite,
  near: {
    segment: OriginalSegment;
    index: number;
    point: OriginalTrackPoint;
  },
  far: OriginalTrackPoint | null,
  followsRouteOrder: boolean,
  routeBeforeMs: number | undefined,
  routeAfterMs: number | undefined,
  options: MergeOptions,
): ResolvedSite {
  const path = resamplePath(
    { lat: near.point.lat, lon: near.point.lon },
    site.vertices,
    far ? { lat: far.lat, lon: far.lon } : null,
    site.resampleSpacingM,
    site.roadLegs,
  );
  const pathLengthM = path.length > 0 ? path[path.length - 1].cumDistanceM : 0;

  const plan = resolveGapTimePlan(
    {
      ...(routeBeforeMs !== undefined ? { routeBeforeMs } : {}),
      ...(routeAfterMs !== undefined ? { routeAfterMs } : {}),
    },
    site.timeStrategy,
    options.fileTiming,
  );
  const times = distributeTimestamps(path, plan, followsRouteOrder);

  const interior: ReconstructedPoint[] = [];
  for (let i = 0; i < path.length; i += 1) {
    const role = path[i].role;
    if (role === "before-anchor" || role === "after-anchor") continue;
    const time = times[i];
    // Phase 6: elevation rides the same cumulative-distance metric the
    // samples were stored on — sample hits are `elevation-api`, points
    // between two samples are `interpolated` (§K-2 honesty).
    const ele = site.elevation
      ? interpolateSample(site.elevation.samples, path[i].cumDistanceM)
      : undefined;
    interior.push({
      source: "reconstructed",
      lat: path[i].lat,
      lon: path[i].lon,
      ...(path[i].vertexId !== undefined ? { vertexId: path[i].vertexId } : {}),
      ...(time !== undefined ? { time } : {}),
      ...(ele !== undefined ? { ele } : {}),
      cumDistanceM: path[i].cumDistanceM,
    });
  }

  // Extend-before: the geometric path runs anchor → vertices; route order
  // is the reverse, so the interior (and its distributed times, which are
  // index-aligned) flip together.
  if (!followsRouteOrder) interior.reverse();

  return {
    site,
    near,
    far,
    followsRouteOrder,
    routeBeforeMs,
    routeAfterMs,
    interior,
    pathLengthM,
  };
}

// ---------------------------------------------------------------------------
// Case-3 whole-activity spread
// ---------------------------------------------------------------------------

/**
 * Spread the file-level total duration across one track's merged route,
 * distance-proportionally (§J-1 Case 3). Only reconstructed points that
 * carry no timestamp yet receive one — a repair's own manual duration
 * (already distributed, anchored at the file start) is the more specific
 * estimate and wins. Original points never receive timestamps.
 */
function applyFileTotalSpread(
  runs: readonly MergedRun[],
  views: readonly MergedPointView[],
  fileTiming: FileTimingContext,
): void {
  const startMs = fileTiming.startMs;
  const totalMs = fileTiming.totalDurationMs;
  if (startMs === null || totalMs === null || totalMs <= 0) return;

  // Cumulative distance at every merged position (usable originals only —
  // the same honesty rule the distance statistics use; reconstructed
  // points are always usable).
  let cumulative = 0;
  let previous: { lat: number; lon: number } | null = null;
  const cumAt: number[] = [];
  for (const view of views) {
    const usable =
      view.point.source === "reconstructed" ||
      isUsableStatsPoint(view.point as OriginalTrackPoint);
    if (usable) {
      if (previous !== null) {
        const legM = geodesicDistanceMeters(previous, view.point);
        if (Number.isFinite(legM)) cumulative += legM;
      }
      previous = view.point;
    }
    cumAt.push(cumulative);
  }
  const totalDistance = cumulative;
  if (totalDistance <= 0) return;

  // Runs and views hold the same points in the same order — walk both
  // with one cursor and timestamp the still-untimed reconstructed points.
  let cursor = 0;
  for (const run of runs) {
    if (run.kind === "recorded") {
      cursor += run.points.length;
      continue;
    }
    for (const point of run.points) {
      const cum = cumAt[cursor] ?? 0;
      cursor += 1;
      if (point.time !== undefined) continue; // specific estimate wins
      point.time = {
        value: startMs + totalMs * (cum / totalDistance),
        method: "distance-proportional",
      };
    }
  }
}
