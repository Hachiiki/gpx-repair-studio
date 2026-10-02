/**
 * Shared provenance + stat plumbing for the Phase 14 exporters (§EE 14.4).
 *
 * Every export format carries the provenance labels — GPX through
 * `gpxr` markers, KML through its description + ExtendedData, GeoJSON
 * through feature properties, CSV through the per-point provenance
 * column. This module is the single source for the numbers and sentences
 * those labels need, so the three formats can never disagree:
 *
 *   - `formatProvenanceSummary` — the repair/working-copy note sentences
 *     (deliberately the same voice as the GPX metadata note, with a
 *     format-specific closing clause about HOW this format discloses).
 *   - `trackExportStats` — per-track point counts by provenance plus
 *     the optional hr/cad aggregates from the passthrough metrics.
 *
 * Phase 14 — Formats in & out. Pure TypeScript.
 */

import type {
  MergedPointView,
  WorkingMeta,
  WorkingTrackPoint,
} from "@/types/domain";
import type {
  MergedTrack,
  MergeResult as MergeResultLike,
} from "@/features/reconstruction/merge";
import { formatDistanceMeters } from "@/lib/utils/format";

/** The merge shape the note reads (structural alias — see merge.ts). */
export type MergeResult = MergeResultLike;

/** How the target format discloses provenance (the note's closing clause). */
export type ProvenanceFormatTail = "kml" | "geojson" | "csv";

const FORMAT_TAILS: Record<ProvenanceFormatTail, string> = {
  kml:
    "KML carries no per-point provenance — this description and each " +
    "placemark's ExtendedData hold the disclosure.",
  geojson:
    "Per-point provenance rides in each feature's properties " +
    "(recorded_points / estimated_points / modified_points).",
  csv:
    "The provenance column marks every point " +
    "(recorded / estimated / modified).",
};

/**
 * The honest note every non-GPX export embeds: repairs, working-copy
 * fixes, and how this particular format discloses them.
 */
export function formatProvenanceSummary(
  merge: MergeResultLike,
  working: WorkingMeta | undefined,
  tail: ProvenanceFormatTail,
  originalCreator?: string,
): string {
  const parts: string[] = [];
  if (merge.repairCount > 0) {
    parts.push(
      `Repaired with GPX Repair Studio — ${merge.repairCount} gap` +
        `${merge.repairCount === 1 ? "" : "s"} reconstructed, ` +
        `${formatDistanceMeters(merge.reconstructedDistanceM)} added.`,
    );
  } else {
    parts.push("Exported with GPX Repair Studio.");
  }
  if (merge.elevatedRepairCount > 0 && merge.elevationProviders.length > 0) {
    parts.push(
      `Elevation of reconstructed points estimated from ${merge.elevationProviders.join(", ")}.`,
    );
  }
  if (working?.hasEdits) {
    const sentences: string[] = [];
    if (working.deletedPointCount > 0) {
      sentences.push(
        `${working.deletedPointCount} damaged point` +
          `${working.deletedPointCount === 1 ? " was" : "s were"} removed ` +
          `(spikes, duplicates, or GPS drift)`,
      );
    }
    if (working.sortedSegmentIds.length > 0) {
      sentences.push(
        `${working.sortedSegmentIds.length} segment` +
          `${working.sortedSegmentIds.length === 1 ? " was" : "s were"} ` +
          `reordered by timestamp (order is estimated)`,
      );
    }
    if (working.overriddenEleCount > 0) {
      sentences.push(
        `${working.overriddenEleCount} elevation` +
          `${working.overriddenEleCount === 1 ? " was" : "s were"} ` +
          `smoothed (interpolated)`,
      );
    }
    if (sentences.length > 0) parts.push(`Working copy: ${sentences.join("; ")}.`);
  }
  parts.push(FORMAT_TAILS[tail]);
  if (originalCreator !== undefined) {
    parts.push(`Original creator: ${originalCreator}.`);
  }
  return parts.join(" ");
}

/** Per-point provenance word (the CSV column, the count buckets). */
export function pointProvenance(point: MergedPointView["point"]): "recorded" | "estimated" | "modified" {
  if (point.source === "reconstructed") return "estimated";
  if ((point as WorkingTrackPoint).workingEle !== undefined) return "modified";
  return "recorded";
}

/** Aggregates one merged track's points for labels and properties. */
export interface TrackExportStats {
  totalPoints: number;
  recordedPoints: number;
  estimatedPoints: number;
  modifiedPoints: number;
  /** First/last timestamp of the track (epoch ms), when timed. */
  firstTimeMs?: number;
  lastTimeMs?: number;
  /** hr/cad aggregates over points that carry the passthrough metrics. */
  avgHr?: number;
  maxHr?: number;
  avgCad?: number;
}

/**
 * Fold one merged track's flat point view into the export labels.
 * hr/cad averages are rounded to whole units (they are labels, not
 * measurements — the raw values live in the CSV columns/GeoJSON
 * coordinates where present).
 */
export function trackExportStats(track: MergedTrack): TrackExportStats {
  let recorded = 0;
  let estimated = 0;
  let modified = 0;
  let first: number | undefined;
  let last: number | undefined;
  let hrSum = 0;
  let hrCount = 0;
  let maxHr: number | undefined;
  let cadSum = 0;
  let cadCount = 0;

  for (const view of track.points) {
    const provenance = pointProvenance(view.point);
    if (provenance === "estimated") estimated += 1;
    else if (provenance === "modified") modified += 1;
    else recorded += 1;

    const time =
      view.point.source === "reconstructed"
        ? view.point.time?.value
        : view.point.time;
    if (time !== undefined) {
      if (first === undefined || time < first) first = time;
      if (last === undefined || time > last) last = time;
    }
    const metrics =
      view.point.source === "original" ? view.point.metrics : undefined;
    if (metrics?.hr !== undefined) {
      hrSum += metrics.hr;
      hrCount += 1;
      if (maxHr === undefined || metrics.hr > maxHr) maxHr = metrics.hr;
    }
    if (metrics?.cad !== undefined) {
      cadSum += metrics.cad;
      cadCount += 1;
    }
  }

  return {
    totalPoints: track.points.length,
    recordedPoints: recorded,
    estimatedPoints: estimated,
    modifiedPoints: modified,
    ...(first !== undefined ? { firstTimeMs: first } : {}),
    ...(last !== undefined ? { lastTimeMs: last } : {}),
    ...(hrCount > 0 ? { avgHr: Math.round(hrSum / hrCount), maxHr } : {}),
    ...(cadCount > 0 ? { avgCad: Math.round(cadSum / cadCount) } : {}),
  };
}
