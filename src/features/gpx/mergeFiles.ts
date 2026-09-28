/**
 * Multi-file merge (Task 43 — the Merge tool's domain core).
 *
 * Combines two or more PARSED GPX models into ONE model shaped exactly
 * like a fresh parse of a single-file export, so every downstream
 * consumer (validation, statistics, map route view, identity export)
 * works on the merged file unchanged.
 *
 * Merge contract ("one route with all the things"):
 *   - ONE `<trk>`: every source segment becomes one `<trkseg>` of the
 *     single track, in source order, document order preserved within a
 *     source. The track's (and the file's) `<name>` is the user-chosen
 *     combined name.
 *   - Every recorded point is carried VERBATIM — the same frozen point
 *     objects (same verbatim raw captures) with re-keyed ids only. The
 *     §H "original data untouched" invariant holds for merges too: no
 *     lat/lon/ele/time value is ever rewritten.
 *   - Waypoints (`<wpt>`) and routes (`<rte>`) concatenate, re-emitted
 *     from their verbatim snapshots.
 *   - Segment-anchored extras (`<trkseg>` vendor children) carry with
 *     their segment — the anchor (point count) is segment-local and
 *     unaffected by the merge.
 *   - Re-imported `gpxr` repair markers survive: they are re-keyed to
 *     the new point ids, so a merged file of previous repairs keeps its
 *     provenance on re-upload.
 *
 * Deliberate drops (documented honesty, not data loss of recordings):
 *   - Root extras and per-file metadata extras (`<author>`, copyright,
 *     keywords, …) describe ONE file; N of them cannot be combined
 *     without inventing an ordering that lies. They stay in the source
 *     files and out of the merge.
 *   - Per-track extras and track `desc`/`type` of the SOURCES: the
 *     merged file has exactly one track; re-anchoring several files'
 *     track-level vendor extensions onto it would be fabrication.
 *   - Source-file `<metadata><name>`: replaced by the combined name.
 *
 * Version policy: the merged document uses the FIRST source's GPX
 * version (1.0 or 1.1) and namespace. Point children re-emit from raw
 * captures regardless of source version, and snapshot re-imports carry
 * their own namespaces, so mixed-version merges are safe; the choice
 * only fixes the document element and namespace.
 *
 * Determinism: same sources (same order) + same options → byte-stable
 * model. Re-running a merge after a reorder is a fresh pure call.
 *
 * Task 43 — Merge tool. Pure TypeScript; the XmlIo never touches this
 * module (merging works on parsed models only).
 */

import { deepFreeze } from "./deepFreeze";
import type {
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
  RepairMarker,
  SegmentId,
  TrackMeta,
} from "@/types/domain";
import { pointId, segmentId } from "@/types/ids";

// ---------------------------------------------------------------------------
// Per-file summary (the intake's and the studio's list rows)
// ---------------------------------------------------------------------------

/** What the file lists show about one parsed source file. */
export interface FileSummary {
  fileName: string;
  pointCount: number;
  trackCount: number;
  segmentCount: number;
  waypointCount: number;
  routeCount: number;
  /** Any point carries a reliable timestamp. */
  hasTimingData: boolean;
  /** Min/max reliable point time, when timing exists. */
  firstTimeMs?: number;
  lastTimeMs?: number;
}

/** Summarize one parsed model for display (pure; O(points)). */
export function fileSummary(fileName: string, model: OriginalTrackData): FileSummary {
  let pointCount = 0;
  let hasTimingData = false;
  let firstTimeMs: number | undefined;
  let lastTimeMs: number | undefined;

  for (const segment of model.segments) {
    pointCount += segment.points.length;
    for (const point of segment.points) {
      // Mirrors the time-stats notion of a usable timestamp: an epoch
      // value the parser considered reliable (absent/unreliable →
      // `undefined`). Unreliable times are not shown as file bounds.
      const t = point.time;
      if (t !== undefined) {
        hasTimingData = true;
        if (firstTimeMs === undefined || t < firstTimeMs) firstTimeMs = t;
        if (lastTimeMs === undefined || t > lastTimeMs) lastTimeMs = t;
      }
    }
  }

  return {
    fileName,
    pointCount,
    trackCount: model.tracks.length,
    segmentCount: model.segments.length,
    waypointCount: model.waypoints.length,
    routeCount: model.routes.length,
    hasTimingData,
    ...(firstTimeMs !== undefined ? { firstTimeMs } : {}),
    ...(lastTimeMs !== undefined ? { lastTimeMs } : {}),
  };
}

// ---------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------

/** One parsed source file, in merge position order. */
export interface MergeSourceInput {
  fileName: string;
  /** A validated parse outcome (the frozen model of a good upload). */
  model: OriginalTrackData;
}

/** User-controlled merge options. */
export interface MergeOptions {
  /**
   * The combined activity's name — written to BOTH the file metadata
   * `<name>` and the single track's `<name>`. `undefined` → no name
   * elements (matching an unnamed source export).
   */
  name?: string;
}

/** The merge result: one model + the per-source summaries in order. */
export interface MergeOutcome {
  model: OriginalTrackData;
  sources: readonly FileSummary[];
}

/** The creator attribute stamped on merged exports. */
export function mergedCreator(fileCount: number): string {
  return `GPX Repair Studio (merged ${fileCount} file${fileCount === 1 ? "" : "s"})`;
}

/** ISO-8601 UTC, millisecond-trimmed like the exporter's timestamps. */
function isoUtc(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  return iso.endsWith(".000Z") ? iso.slice(0, -5) + "Z" : iso;
}

/**
 * Merge parsed GPX models into one. See the module header for the full
 * contract. `sources` must be non-empty (the UI enforces ≥ 2; a
 * single-source merge still works and is the identity shape minus
 * dropped extras — useful for tests).
 */
export function mergeGpxFiles(
  sources: readonly MergeSourceInput[],
  options: MergeOptions = {},
): MergeOutcome {
  if (sources.length === 0) {
    throw new Error("mergeGpxFiles: at least one source is required");
  }

  const first = sources[0].model;

  // ---- Pass 1: walk the sources, re-keying ids and collecting pieces ----
  const mergedSegments: OriginalSegment[] = [];
  const waypoints = [...first.waypoints];
  const routes = [...first.routes];
  /** old point id → new point id (repair marker re-keying). */
  const idRemap = new Map<PointId, PointId>();
  /** new point id → its merged segment id (marker segment re-keying). */
  const pointToSegment = new Map<PointId, SegmentId>();
  const summaries: FileSummary[] = [];
  /** Markers pending re-keying, one array per source, in source order. */
  const pendingMarkers: RepairMarker[][] = [];

  // Concatenate waypoints/routes from the remaining sources (the first
  // source's were seeded above — verbatim snapshots, order preserved).
  for (let s = 1; s < sources.length; s++) {
    waypoints.push(...sources[s].model.waypoints);
    routes.push(...sources[s].model.routes);
  }

  for (const source of sources) {
    const { model } = source;
    summaries.push(fileSummary(source.fileName, model));

    for (const segment of model.segments) {
      const newSegId: SegmentId = segmentId(0, mergedSegments.length);
      const points: OriginalTrackPoint[] = segment.points.map((point, i) => {
        const newId = pointId(newSegId, i);
        idRemap.set(point.id, newId);
        pointToSegment.set(newId, newSegId);
        // Same frozen point, same raw capture — only the id is new (the
        // id encodes document position, which the merge changed).
        return { ...point, id: newId };
      });
      mergedSegments.push({
        id: newSegId,
        trackIndex: 0,
        points,
        // Segment-anchored extras carry unchanged: their anchor is the
        // point count within their own segment, which the merge preserves.
        extras: segment.extras,
      });
    }

    pendingMarkers.push([...(model.repairMarkers ?? [])]);
  }

  // Re-key the repair markers onto the merged document positions: a
  // marker's pointId resolves through the id map; its segmentId is the
  // segment that now holds that point (redundant with the pointId —
  // kept consistent). Unresolvable markers (defensive: should not
  // exist — every marker's point was parsed into the model) are dropped
  // rather than fabricated onto a wrong position.
  const repairMarkers: RepairMarker[] = [];
  for (const sourceMarkers of pendingMarkers) {
    for (const marker of sourceMarkers) {
      const newPointId = idRemap.get(marker.pointId);
      if (newPointId === undefined) continue;
      repairMarkers.push({
        pointId: newPointId,
        segmentId: pointToSegment.get(newPointId) ?? marker.segmentId,
        ...(marker.timeMethod !== undefined
          ? { timeMethod: marker.timeMethod }
          : {}),
        ...(marker.eleMethod !== undefined
          ? { eleMethod: marker.eleMethod }
          : {}),
      });
    }
  }

  // ---- The single merged track ------------------------------------------------
  const track: TrackMeta = {
    trackIndex: 0,
    ...(options.name !== undefined ? { name: options.name } : {}),
    extras: [], // source track extras dropped — see module header
  };

  // ---- File metadata ----------------------------------------------------------
  // Documented policy: first source's version; earliest reliable time
  // across sources as the file `<time>`; creator discloses the merge.
  let earliest: number | undefined;
  for (const summary of summaries) {
    if (summary.firstTimeMs !== undefined) {
      if (earliest === undefined || summary.firstTimeMs < earliest) {
        earliest = summary.firstTimeMs;
      }
    }
  }

  const model: OriginalTrackData = {
    tracks: [track],
    segments: mergedSegments,
    waypoints,
    routes,
    rootExtras: [], // dropped — see module header
    fileMeta: {
      creator: mergedCreator(sources.length),
      version: first.fileMeta.version,
      ...(options.name !== undefined ? { name: options.name } : {}),
      ...(earliest !== undefined ? { time: earliest } : {}),
      raw: {
        version: first.fileMeta.raw.version,
        creator: mergedCreator(sources.length),
        ...(earliest !== undefined ? { metadataTime: isoUtc(earliest) } : {}),
      },
      metadataExtras: [], // dropped — see module header
    },
    issues: [],
    ...(repairMarkers.length > 0 ? { repairMarkers } : {}),
  };

  return { model: deepFreeze(model), sources: summaries };
}
