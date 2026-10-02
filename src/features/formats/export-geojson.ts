/**
 * GeoJSON export (docs/MASTER_PLAN.md §EE 14.4).
 *
 * An RFC 7946 FeatureCollection: one Feature per track, geometry a
 * MultiLineString with one line per merged run (the same run basis the
 * GPX export writes as segments — repairs stay continuous), properties
 * carrying the stats + provenance labels (point counts by provenance,
 * repairs, hr/cad aggregates) and the provenance note. Coordinates are
 * [lon, lat, ele?] per the RFC; the third position is the elevation in
 * meters (RFC 7946 permits it).
 *
 * `JSON.stringify` gives the escaping; numbers are emitted at full
 * double precision (same lossless rule as the converted-point capture).
 *
 * Phase 14 — Formats in & out. Pure TypeScript.
 */

import type { WorkingTrackData } from "@/types/domain";
import type { MergeResult } from "@/features/reconstruction/merge";
import type { MergedRun, MergedTrack } from "@/features/reconstruction/merge";
import {
  formatProvenanceSummary,
  trackExportStats,
} from "./provenance-note";
import type { FormatExportOptions } from "./export-kml";
import { formatSynthTimestamp } from "./convert";

/** [lon, lat, ele?] position for a GeoJSON line. */
function position(point: MergedRun["points"][number]): [number, number] | [number, number, number] {
  const ele =
    point.source === "reconstructed" ? point.ele?.value : point.ele;
  return ele !== undefined ? [point.lon, point.lat, ele] : [point.lon, point.lat];
}

/** One track's feature object (plain — stringified by the caller). */
function trackFeature(
  track: MergedTrack,
  trackName: string,
): Record<string, unknown> {
  const meta = trackExportStats(track);
  const coordinates = track.runs
    .filter((run) => run.points.length > 0)
    .map((run) => run.points.map(position));

  const properties: Record<string, unknown> = {
    name: trackName,
    points: meta.totalPoints,
    recorded_points: meta.recordedPoints,
    estimated_points: meta.estimatedPoints,
    modified_points: meta.modifiedPoints,
    ...(track.repairCount > 0
      ? {
          repairs: track.repairCount,
          repaired_distance_m: Math.round(track.reconstructedDistanceM),
        }
      : {}),
    ...(meta.firstTimeMs !== undefined
      ? { start_time: formatSynthTimestamp(meta.firstTimeMs) }
      : {}),
    ...(meta.lastTimeMs !== undefined
      ? { end_time: formatSynthTimestamp(meta.lastTimeMs) }
      : {}),
    ...(meta.avgHr !== undefined ? { avg_heart_rate_bpm: meta.avgHr } : {}),
    ...(meta.maxHr !== undefined ? { max_heart_rate_bpm: meta.maxHr } : {}),
    ...(meta.avgCad !== undefined ? { avg_cadence_rpm: meta.avgCad } : {}),
  };

  return {
    type: "Feature",
    properties,
    geometry: {
      type: "MultiLineString",
      coordinates,
    },
  };
}

/** Serialize the working copy + merge as a GeoJSON FeatureCollection. */
export function exportGeoJson(
  data: WorkingTrackData,
  merge: MergeResult,
  options: FormatExportOptions,
): string {
  const note = formatProvenanceSummary(
    merge,
    data.working,
    "geojson",
    data.fileMeta.raw.creator,
  );

  const namesByIndex = new Map<number, string>();
  data.tracks.forEach((meta, index) => {
    namesByIndex.set(meta.trackIndex, meta.name ?? `Track ${index + 1}`);
  });

  const collection = {
    type: "FeatureCollection",
    features: merge.tracks.map((track) =>
      trackFeature(
        track,
        namesByIndex.get(track.trackIndex) ?? `Track ${track.trackIndex + 1}`,
      ),
    ),
    properties: {
      generator: "GPX Repair Studio",
      note,
      ...(options.stats
        ? {
            distance_m: Math.round(options.stats.distanceM),
            ...(options.stats.movingMs !== undefined
              ? { moving_time_ms: Math.round(options.stats.movingMs) }
              : {}),
          }
        : {}),
    },
  };

  return `${JSON.stringify(collection, null, options.prettyPrint ? 2 : 0)}\n`;
}
