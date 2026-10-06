/**
 * The library CSV — Phase 24.1's portable table export: one row per
 * indexed session, the same numbers the cards render (RFC 4180, CRLF,
 * the stats sheet's `csvField` quoting). Machine-shaped by design —
 * meters, seconds, ISO timestamps — with a two-row preamble carrying
 * the generation time, the app, and the privacy line (the artifacts
 * pin English, like every export).
 *
 * Phase 24 — Activity library, records & trends. Pure TypeScript.
 */

import { csvField } from "@/features/formats/export-csv";
import type { SessionIndex } from "@/features/library/index-session";

/** One CSV row: the shelf entry joined with its derived index. */
export interface LibraryCsvRow {
  name: string;
  section: string;
  savedAtIso: string;
  index: SessionIndex;
}

export interface LibraryCsvInput {
  generatedAtIso: string;
  rows: readonly LibraryCsvRow[];
}

const APP_NAME = "GPX Repair Studio";

/**
 * Build the whole-library CSV: preamble (2 rows) + header + one row
 * per session. Sessions without an index (planned routes, failed
 * re-reads) stay absent — the table carries what was computed, never
 * a guessed row.
 */
export function buildLibraryCsv(input: LibraryCsvInput): string {
  const lines: string[] = [];

  lines.push(
    [
      csvField("generated_at"),
      csvField(input.generatedAtIso),
    ].join(","),
  );
  lines.push(
    [
      csvField("app"),
      csvField(APP_NAME),
    ].join(","),
  );
  lines.push(
    [csvField("note"), csvField("computed on-device; nothing leaves the browser")].join(
      ",",
    ),
  );

  lines.push(
    [
      "name",
      "section",
      "saved_at",
      "activity_start",
      "distance_m",
      "moving_time_s",
      "avg_pace_s_per_km",
      "avg_pace_s_per_mi",
      "elevation_gain_m",
      "avg_heart_rate_bpm",
      "reconstructed_distance_m",
      "best_effort_400m_s",
      "best_effort_1k_s",
      "best_effort_1mi_s",
      "best_effort_5k_s",
      "best_effort_10k_s",
      "best_effort_half_marathon_s",
      "best_effort_marathon_s",
    ]
      .map((header) => csvField(header))
      .join(","),
  );

  for (const row of input.rows) {
    const { index } = row;
    // Pace needs BOTH distance and moving time — an untimed session
    // has no pace (empty field, never a zero).
    const pacePerKm =
      index.distanceM > 0 && index.movingTimeMs > 0
        ? index.movingTimeMs / 1000 / (index.distanceM / 1000)
        : null;
    const pacePerMi =
      index.distanceM > 0 && index.movingTimeMs > 0
        ? index.movingTimeMs / 1000 / (index.distanceM / 1609.344)
        : null;
    const effortSeconds = (distanceM: number): string => {
      const effort = index.efforts.find((e) => e.distanceM === distanceM);
      return effort === undefined ? "" : (effort.timeMs / 1000).toFixed(1);
    };
    lines.push(
      [
        csvField(row.name),
        csvField(row.section),
        csvField(row.savedAtIso),
        csvField(
          index.activityStartMs === null
            ? ""
            : new Date(index.activityStartMs).toISOString(),
        ),
        csvField(index.distanceM.toFixed(1)),
        csvField((index.movingTimeMs / 1000).toFixed(1)),
        csvField(pacePerKm === null ? "" : pacePerKm.toFixed(2)),
        csvField(pacePerMi === null ? "" : pacePerMi.toFixed(2)),
        csvField(index.gainM === null ? "" : index.gainM.toFixed(1)),
        csvField(index.avgHrBpm === null ? "" : index.avgHrBpm.toFixed(0)),
        csvField(index.reconstructedDistanceM.toFixed(1)),
        csvField(effortSeconds(400)),
        csvField(effortSeconds(1000)),
        csvField(effortSeconds(1609.344)),
        csvField(effortSeconds(5000)),
        csvField(effortSeconds(10_000)),
        csvField(effortSeconds(21_097.5)),
        csvField(effortSeconds(42_195)),
      ].join(","),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}
