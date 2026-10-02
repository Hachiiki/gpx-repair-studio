/**
 * CSV export (docs/MASTER_PLAN.md §EE 14.4) — one row per trackpoint.
 *
 * The tabular equivalent of the merged view: every point of every track
 * in route order, with its track/segment/point ordinals, coordinates,
 * elevation, ISO-8601 (UTC) time, and the per-point PROVENANCE column
 * (recorded / estimated / modified) — the honesty rule for this format.
 * The optional hr/cad/watts columns appear only when at least one point
 * carries the passthrough metrics (TCX/FIT imports).
 *
 * RFC 4180: CRLF line endings, minimal quoting (fields containing the
 * delimiter, a quote, or a newline), a single header row. No comment
 * lines and no summary rows — summaries live in the other formats'
 * metadata; the CSV stays machine-clean.
 *
 * Time normalization (documented): GPX timestamps recorded with an
 * offset are emitted as their UTC equivalent (`2024-05-01T08:00:00+02:00`
 * → `2024-05-01T06:00:00Z`) — same instant, canonical spelling.
 *
 * Phase 14 — Formats in & out. Pure TypeScript.
 */

import type { WorkingTrackData } from "@/types/domain";
import type { MergeResult } from "@/features/reconstruction/merge";
import type { MergedRun, MergedTrack } from "@/features/reconstruction/merge";
import { pointProvenance } from "./provenance-note";
import type { FormatExportOptions } from "./export-kml";
import { formatSynthTimestamp } from "./convert";

const CRLF = "\r\n";

/** RFC 4180 field escaping: quote only when needed, double the quotes.
 * Phase 15: shared with the stats CSV exporter (one escaper, one rule). */
export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface CsvRow {
  track: string;
  segment: number;
  point: number;
  lat: string;
  lon: string;
  ele?: string;
  time?: string;
  provenance: string;
  hr?: string;
  cad?: string;
  watts?: string;
}

/** Serialize the working copy + merge as CSV. */
export function exportCsv(
  data: WorkingTrackData,
  merge: MergeResult,
  _options: FormatExportOptions,
): string {
  const namesByIndex = new Map<number, string>();
  data.tracks.forEach((meta, index) => {
    namesByIndex.set(meta.trackIndex, meta.name ?? `Track ${index + 1}`);
  });

  const rows: CsvRow[] = [];
  let anyMetrics = false;

  for (const track of merge.tracks) {
    const trackName = namesByIndex.get(track.trackIndex) ?? `Track ${track.trackIndex + 1}`;
    // Run index = the segment ordinal in the merged view; the point
    // ordinal restarts per track (route order, the same order the
    // exported GPX writes the points in).
    let pointOrdinal = 0;
    track.runs.forEach((run: MergedRun, runIndex: number) => {
      for (const point of run.points) {
        const metrics = point.source === "original" ? point.metrics : undefined;
        if (metrics !== undefined) anyMetrics = true;
        const ele =
          point.source === "reconstructed" ? point.ele?.value : point.ele;
        const time =
          point.source === "reconstructed" ? point.time?.value : point.time;
        rows.push({
          track: trackName,
          segment: runIndex + 1,
          point: pointOrdinal + 1,
          lat: String(point.lat),
          lon: String(point.lon),
          ...(ele !== undefined ? { ele: String(ele) } : {}),
          ...(time !== undefined ? { time: formatSynthTimestamp(time) } : {}),
          provenance: pointProvenance(point),
          ...(metrics?.hr !== undefined ? { hr: String(metrics.hr) } : {}),
          ...(metrics?.cad !== undefined ? { cad: String(metrics.cad) } : {}),
          ...(metrics?.watts !== undefined ? { watts: String(metrics.watts) } : {}),
        });
        pointOrdinal += 1;
      }
    });
  }

  const header = [
    "track",
    "segment",
    "point",
    "latitude",
    "longitude",
    "elevation_m",
    "time_iso",
    "provenance",
    ...(anyMetrics ? ["hr_bpm", "cadence_rpm", "power_w"] : []),
  ];

  const lines = [header.map(csvField).join(",")];
  for (const row of rows) {
    const fields = [
      row.track,
      String(row.segment),
      String(row.point),
      row.lat,
      row.lon,
      row.ele ?? "",
      row.time ?? "",
      row.provenance,
      ...(anyMetrics ? [row.hr ?? "", row.cad ?? "", row.watts ?? ""] : []),
    ];
    lines.push(fields.map(csvField).join(","));
  }

  void _options;
  return `${lines.join(CRLF)}${CRLF}`;
}
