/**
 * KML export (docs/MASTER_PLAN.md §EE 14.4).
 *
 * One `<Placemark>` per track, one `<LineString>` per merged run (the
 * same run basis the GPX export writes as segments — repairs stay
 * visually continuous), and the stats + provenance labels as
 * `<ExtendedData>`. The document-level `<description>` carries the
 * provenance note (the same sentences the GPX metadata note uses, with
 * the KML-specific disclosure clause); `<Document>` is a KML Feature,
 * so it also carries the file-level totals as its own ExtendedData.
 *
 * Altitude: coordinates include the elevation as the third tuple value
 * but no `<altitudeMode>` is written — the KML default
 * (clampToGround) keeps every consumer rendering the line on the map
 * while tools that read z keep the data.
 *
 * Built as a controlled string: the element set is fixed and small, all
 * text passes through `escapeXmlText`, and coordinates are numeric — so
 * the output is well-formed by construction and fully deterministic
 * (golden-testable). `prettyPrint` indents the element tree; coordinate
 * runs always stay on one line.
 *
 * Phase 14 — Formats in & out. Pure TypeScript.
 */

import type { WorkingTrackData } from "@/types/domain";
import type { MergeResult } from "@/features/reconstruction/merge";
import type { MergedRun, MergedTrack } from "@/features/reconstruction/merge";
import { formatDurationCompactMs } from "@/lib/utils/format";
import {
  formatProvenanceSummary,
  trackExportStats,
} from "./provenance-note";
import { escapeXmlText, formatSynthTimestamp } from "./convert";

/** Options shared by the KML/GeoJSON/CSV exporters (§EE 14.4). */
export interface FormatExportOptions {
  prettyPrint: boolean;
  /** The upload's name — labels the KML Document (cosmetic, honest). */
  sourceName?: string;
  /**
   * Working-copy totals for the document-level labels: the same numbers
   * the stats panel shows (never recomputed differently here).
   */
  stats?: {
    /** `DistanceStats.totalDistanceM` of the working copy. */
    distanceM: number;
    /** `TimeStats.recordedMovingTimeMs`; absent for untimed files. */
    movingMs?: number;
  };
}

const KML_NS = "http://www.opengis.net/xml/kml/2.2";

/** lon,lat[,ele] tuple for a KML coordinates run. */
function coordinate(point: MergedRun["points"][number]): string {
  const ele =
    point.source === "reconstructed" ? point.ele?.value : point.ele;
  return ele !== undefined
    ? `${point.lon},${point.lat},${ele}`
    : `${point.lon},${point.lat}`;
}

function dataElement(name: string, value: string): string {
  return `<Data name="${name}"><value>${escapeXmlText(value)}</value></Data>`;
}

/** Serialize one track as a placemark (the geometry + its labels). */
function placemark(
  track: MergedTrack,
  trackName: string,
  indent: (depth: number) => string,
  sep: string,
): string {
  const meta = trackExportStats(track);
  const extended: string[] = [
    dataElement("points", String(meta.totalPoints)),
    dataElement("recorded_points", String(meta.recordedPoints)),
    dataElement("estimated_points", String(meta.estimatedPoints)),
    dataElement("modified_points", String(meta.modifiedPoints)),
  ];
  if (track.repairCount > 0) {
    extended.push(dataElement("repairs", String(track.repairCount)));
    extended.push(
      dataElement("repaired_distance", `${track.reconstructedDistanceM.toFixed(0)} m`),
    );
  }
  if (meta.firstTimeMs !== undefined) {
    extended.push(dataElement("start_time", formatSynthTimestamp(meta.firstTimeMs)));
  }
  if (meta.lastTimeMs !== undefined) {
    extended.push(dataElement("end_time", formatSynthTimestamp(meta.lastTimeMs)));
  }
  if (meta.avgHr !== undefined) {
    extended.push(dataElement("avg_heart_rate_bpm", String(meta.avgHr)));
    if (meta.maxHr !== undefined) {
      extended.push(dataElement("max_heart_rate_bpm", String(meta.maxHr)));
    }
  }
  if (meta.avgCad !== undefined) {
    extended.push(dataElement("avg_cadence_rpm", String(meta.avgCad)));
  }

  const lines = track.runs
    .filter((run) => run.points.length > 0)
    .map((run) =>
      [
        `${indent(4)}<LineString>`,
        `${indent(5)}<tessellate>1</tessellate>`,
        `${indent(5)}<coordinates>${run.points.map(coordinate).join(" ")}</coordinates>`,
        `${indent(4)}</LineString>`,
      ].join(sep),
    )
    .join(sep);

  return [
    `${indent(2)}<Placemark>`,
    `${indent(3)}<name>${escapeXmlText(trackName)}</name>`,
    `${indent(3)}<ExtendedData>`,
    extended.map((d) => `${indent(4)}${d}`).join(sep),
    `${indent(3)}</ExtendedData>`,
    `${indent(3)}<MultiGeometry>`,
    lines,
    `${indent(3)}</MultiGeometry>`,
    `${indent(2)}</Placemark>`,
  ].join(sep);
}

/** Serialize the working copy + merge as KML 2.2. */
export function exportKml(
  data: WorkingTrackData,
  merge: MergeResult,
  options: FormatExportOptions,
): string {
  const note = formatProvenanceSummary(
    merge,
    data.working,
    "kml",
    data.fileMeta.raw.creator,
  );

  const documentName =
    options.sourceName?.replace(/\.(gpx|tcx|fit)$/i, "") ??
    data.fileMeta.name ??
    "Activity";

  const indent = options.prettyPrint
    ? (depth: number) => "  ".repeat(depth)
    : () => "";

  // Track names come from the model's TrackMeta (the merge keeps indices).
  const namesByIndex = new Map<number, string>();
  data.tracks.forEach((meta, index) => {
    namesByIndex.set(
      meta.trackIndex,
      meta.name ?? `Track ${index + 1}`,
    );
  });

  const sep = options.prettyPrint ? "\n" : "";
  const placemarks = merge.tracks
    .map((track) =>
      placemark(
        track,
        namesByIndex.get(track.trackIndex) ?? `Track ${track.trackIndex + 1}`,
        indent,
        sep,
      ),
    )
    .join(sep);

  const documentData: string[] = [];
  if (options.stats) {
    documentData.push(
      dataElement("distance", `${(options.stats.distanceM / 1000).toFixed(2)} km`),
    );
    if (options.stats.movingMs !== undefined) {
      documentData.push(
        dataElement("moving_time", formatDurationCompactMs(options.stats.movingMs)),
      );
    }
  }

  const body = [
    `${indent(0)}<kml xmlns="${KML_NS}">`,
    `${indent(1)}<Document>`,
    `${indent(2)}<name>${escapeXmlText(documentName)}</name>`,
    `${indent(2)}<description>${escapeXmlText(note)}</description>`,
    ...(documentData.length > 0
      ? [
          `${indent(2)}<ExtendedData>`,
          ...documentData.map((d) => `${indent(3)}${d}`),
          `${indent(2)}</ExtendedData>`,
        ]
      : []),
    placemarks,
    `${indent(1)}</Document>`,
    `${indent(0)}</kml>`,
  ].join(options.prettyPrint ? "\n" : "");

  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
}
