/**
 * Stats CSV export (docs/MASTER_PLAN.md §EE 15.4) — the dashboard as a
 * machine-clean spreadsheet.
 *
 * LONG FORMAT: one row per metric, the shape analysts can pivot without
 * parsing headers of headers. Columns:
 *
 *   section   — meta | summary | split | stop
 *   label     — the metric's stable name (split_3_time, total_distance…)
 *   value     — the number (or string, for meta rows)
 *   unit      — m | s | percent | (empty for meta strings)
 *   provenance— recorded | estimated | mixed | (empty for meta)
 *   note      — the honesty caveats that apply to that row
 *
 * Every number is the SAME number the on-screen dashboard renders —
 * the builder consumes the view models the cards consume, never a
 * second computation (the one-merge rule). Paces ship in BOTH per-km
 * and per-mi seconds so no unit setting can make the file ambiguous.
 * Stops carry their distance marker and duration; splits carry their
 * honesty flags (gapped/untimed/reversed legs, estimated elevation)
 * in the note column.
 *
 * RFC 4180 (CRLF, minimal quoting via the shared `csvField`), a single
 * header row, no comment lines.
 *
 * Phase 15 — Stats dashboard. Pure TypeScript.
 */

import { csvField } from "@/features/formats/export-csv";
import type { MotionSummary } from "@/features/statistics/motion";
import type { SplitsResult, SplitRow } from "@/features/statistics/splits";
import { splitPaceMsPerMeter } from "@/features/statistics/splits";

const CRLF = "\r\n";

/** The dashboard inputs (view models — all derived, never stored). */
export interface StatsCsvInput {
  fileName: string | null;
  /** ISO timestamp the sheet was generated at. */
  generatedAtIso: string;
  splits: SplitsResult | null;
  motion: MotionSummary | null;
  /** §L-1 rows the stats panel renders (null merge = all "—"). */
  elevation:
    | {
        gainM: number | null;
        lossM: number | null;
        coverage: number;
        insufficient: boolean;
      }
    | null;
  /** The panel's distance/time joins (working-copy basis). */
  distance: {
    totalDistanceM: number;
    recordedDistanceM: number;
    repairedDistanceM: number;
    hasRepairs: boolean;
  };
  time: {
    hasTimingData: boolean;
    recordedMovingMs: number;
    wallMs?: number;
  };
  /** Phase 13 working-copy counts (the "modified" disclosure). */
  working: {
    deletedPointCount: number;
    sortedSegmentCount: number;
    overriddenEleCount: number;
    hasEdits: boolean;
  };
}

interface StatsRow {
  section: string;
  label: string;
  value: string;
  unit?: string;
  provenance?: string;
  note?: string;
}

function num(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(decimals)));
}

function splitNote(row: SplitRow): string | undefined {
  const notes: string[] = [];
  if (row.gapLegs > 0) notes.push(`${row.gapLegs} gap leg${row.gapLegs === 1 ? "" : "s"}`);
  if (row.untimedLegs > 0)
    notes.push(`${row.untimedLegs} untimed leg${row.untimedLegs === 1 ? "" : "s"}`);
  if (row.reversedLegs > 0)
    notes.push(`${row.reversedLegs} reversed leg${row.reversedLegs === 1 ? "" : "s"}`);
  if (row.eleEstimated) notes.push("elevation includes estimated values");
  if (notes.length === 0) return undefined;
  return `partial time: ${notes.join(", ")}`;
}

/** Build the stats sheet. Always returns a full CSV (header included). */
export function buildStatsCsv(input: StatsCsvInput): string {
  const rows: StatsRow[] = [];

  // --- meta ---------------------------------------------------------------
  rows.push(
    { section: "meta", label: "app", value: "GPX Repair Studio" },
    { section: "meta", label: "source_file", value: input.fileName ?? "" },
    { section: "meta", label: "generated_at", value: input.generatedAtIso },
    {
      section: "meta",
      label: "privacy",
      value: "computed locally in the browser",
    },
  );
  if (input.splits) {
    rows.push({
      section: "meta",
      label: "split_length",
      value: num(input.splits.splitLengthM),
      unit: "m",
      note: "follows the app's pace unit setting",
    });
  }
  if (input.working.hasEdits) {
    rows.push({
      section: "meta",
      label: "working_copy",
      value: "modified",
      note: `${input.working.deletedPointCount} points removed, ${input.working.sortedSegmentCount} segments sorted, ${input.working.overriddenEleCount} elevations smoothed`,
    });
  }

  // --- summary ------------------------------------------------------------
  const d = input.distance;
  rows.push({
    section: "summary",
    label: "total_distance",
    value: num(d.totalDistanceM),
    unit: "m",
    provenance: d.hasRepairs ? "mixed" : "recorded",
    note: "merged route: working copy plus committed repairs",
  });
  if (d.hasRepairs) {
    rows.push({
      section: "summary",
      label: "recorded_distance",
      value: num(d.recordedDistanceM),
      unit: "m",
      provenance: "recorded",
    });
    rows.push({
      section: "summary",
      label: "repaired_distance",
      value: num(d.repairedDistanceM),
      unit: "m",
      provenance: "estimated",
    });
  }
  if (input.time.hasTimingData) {
    rows.push({
      section: "summary",
      label: "recorded_moving_time",
      value: num(input.time.recordedMovingMs / 1000),
      unit: "s",
      provenance: "recorded",
    });
    if (input.time.wallMs !== undefined) {
      rows.push({
        section: "summary",
        label: "wall_time",
        value: num(input.time.wallMs / 1000),
        unit: "s",
        provenance: "recorded",
      });
    }
  }
  const motion = input.motion;
  if (motion && motion.hasTimingData) {
    rows.push({
      section: "summary",
      label: "stopped_time",
      value: num(motion.stoppedMs / 1000),
      unit: "s",
      provenance: motion.hasEstimatedLegs ? "mixed" : "recorded",
      note: `speed below ${motion.stopSpeedMps} m/s; ${motion.stopEvents.length} stop event${motion.stopEvents.length === 1 ? "" : "s"}`,
    });
    rows.push({
      section: "summary",
      label: "in_motion_time",
      value: num(motion.inMotionMs / 1000),
      unit: "s",
      provenance: motion.hasEstimatedLegs ? "mixed" : "recorded",
    });
  }
  if (input.elevation) {
    const e = input.elevation;
    if (!e.insufficient && e.gainM !== null) {
      rows.push({
        section: "summary",
        label: "elevation_gain",
        value: num(e.gainM),
        unit: "m",
        provenance: "mixed",
        note: "hysteresis deadband, mixed recorded and estimated sources",
      });
      rows.push({
        section: "summary",
        label: "elevation_loss",
        value: num(e.lossM ?? 0),
        unit: "m",
        provenance: "mixed",
      });
    }
    rows.push({
      section: "summary",
      label: "elevation_coverage",
      value: num(e.coverage * 100),
      unit: "percent",
    });
  }

  // --- splits ---------------------------------------------------------------
  const splits = input.splits;
  if (splits) {
    for (const row of splits.rows) {
      const label = `split_${row.index}`;
      rows.push({
        section: "split",
        label: `${label}_distance`,
        value: num(row.distanceM),
        unit: "m",
        provenance: row.provenance,
        note: splitNote(row),
      });
      if (row.timeMs > 0) {
        rows.push({
          section: "split",
          label: `${label}_time`,
          value: num(row.timeMs / 1000),
          unit: "s",
          provenance: row.provenance,
          note: splitNote(row),
        });
        const pace = splitPaceMsPerMeter(row);
        if (pace !== undefined) {
          rows.push({
            section: "split",
            label: `${label}_pace_per_km`,
            value: num(pace * 1000),
            unit: "s",
            provenance: row.provenance,
          });
          rows.push({
            section: "split",
            label: `${label}_pace_per_mi`,
            value: num(pace * 1609.344),
            unit: "s",
            provenance: row.provenance,
          });
        }
      }
      if (row.eleGainM !== null) {
        rows.push({
          section: "split",
          label: `${label}_elevation_gain`,
          value: num(row.eleGainM),
          unit: "m",
          provenance: row.eleEstimated ? "estimated" : "recorded",
          note: row.eleEstimated ? "includes estimated elevation" : undefined,
        });
      }
    }
  }

  // --- stops ----------------------------------------------------------------
  if (motion && motion.stopEvents.length > 0) {
    for (const event of motion.stopEvents) {
      rows.push({
        section: "stop",
        label: `stop_${event.index}_duration`,
        value: num(event.durationMs / 1000),
        unit: "s",
        provenance: event.provenance,
        note: `at ${num(event.atDistanceM)} m into the route`,
      });
      if (event.startMs !== undefined) {
        rows.push({
          section: "stop",
          label: `stop_${event.index}_start`,
          value: new Date(event.startMs).toISOString(),
          provenance: event.provenance,
        });
      }
    }
  }

  const header = ["section", "label", "value", "unit", "provenance", "note"];
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.section,
        row.label,
        row.value,
        row.unit ?? "",
        row.provenance ?? "",
        row.note ?? "",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `${lines.join(CRLF)}${CRLF}`;
}
