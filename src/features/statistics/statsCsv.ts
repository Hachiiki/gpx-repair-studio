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
import type { CaloriesEstimate } from "@/features/statistics/calories";
import type { GapSummary } from "@/features/statistics/gap";
import type { MotionSummary } from "@/features/statistics/motion";
import type { SplitsResult, SplitRow } from "@/features/statistics/splits";
import {
  splitGapPaceMsPerMeter,
  splitPaceMsPerMeter,
} from "@/features/statistics/splits";
import type {
  CadenceRangesResult,
  FitnessSettings,
  PaceZoneAnalysis,
  PowerZoneAnalysis,
  HrZoneAnalysis,
  ZoneTimeResult,
} from "@/features/statistics/zones";

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
  /** Phase 23 — the zone analysis (null/absent keeps the sheet as it was). */
  zones?: ZonesCsvInput | null;
}

/** The Phase 23 zone analysis (view models — the ZonesCard's own). */
export interface ZonesCsvInput {
  hr: HrZoneAnalysis | null;
  power: PowerZoneAnalysis | null;
  pace: PaceZoneAnalysis | null;
  cadence: CadenceRangesResult | null;
  gap: GapSummary | null;
  calories: CaloriesEstimate | null;
  /** The settings the analysis ran with (the sheet discloses them). */
  settings: FitnessSettings;
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

/** The bpm/W range of one zone row, as the sheet's note words it. */
function unitRangeNote(zones: ZoneTimeResult): string {
  const first = zones.rows[0];
  const last = zones.rows[zones.rows.length - 1];
  if (first === undefined || last === undefined) return "";
  const floor =
    first.toValue === null ? "" : `under ${Math.round(first.toValue)}`;
  const ceil =
    last.fromValue === null ? "" : `${Math.round(last.fromValue)} and above`;
  return `${floor} … ${ceil}`;
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

  // --- meta: the Phase 23 zone models (the sheet names its numbers) ----
  const zonesIn = input.zones ?? null;
  if (zonesIn) {
    rows.push({
      section: "meta",
      label: "zone_model",
      value: "our defaults mirroring the documented Strava set",
      note: "boundary percentages are this app's own; Strava publishes derivation rules, not percentages",
    });
    rows.push({
      section: "meta",
      label: "hr_max",
      value: num(zonesIn.settings.hr.maxHr, 0),
      unit: "bpm",
      note: `zone floors ${zonesIn.settings.hr.boundaries
        .map((b) => Math.round(b))
        .join("/")} bpm (default 60/70/80/90% of max)`,
    });
    rows.push({
      section: "meta",
      label: "power_ftp",
      value: num(zonesIn.settings.power.ftp, 0),
      unit: "W",
      note: "seven zones at Coggan percentages 55/75/90/100/120/150% of FTP",
    });
    if (zonesIn.settings.pace.race !== null) {
      rows.push({
        section: "meta",
        label: "pace_race_distance",
        value: num(zonesIn.settings.pace.race.distanceM),
        unit: "m",
      });
      rows.push({
        section: "meta",
        label: "pace_race_time",
        value: num(zonesIn.settings.pace.race.timeMs / 1000),
        unit: "s",
        note: "Riegel-normalized to a one-hour pace; zone multipliers ours",
      });
    }
    rows.push({
      section: "meta",
      label: "stop_speed",
      value: num(zonesIn.settings.stopSpeedMps, 2),
      unit: "m/s",
      note: "stopped-time threshold (default 0.5)",
    });
    if (zonesIn.settings.calories.enabled) {
      rows.push({
        section: "meta",
        label: "calories_weight",
        value:
          zonesIn.settings.calories.weightKg === null
            ? ""
            : num(zonesIn.settings.calories.weightKg, 0),
        unit: "kg",
        note: "opt-in, stored locally only, never exported",
      });
    }
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

  // --- summary: the Phase 23 GAP + calorie rows --------------------------
  if (zonesIn) {
    const gap = zonesIn.gap;
    if (gap !== null && gap.gapPaceMsPerMeter !== null) {
      rows.push({
        section: "summary",
        label: "gap_pace_per_km",
        value: num(gap.gapPaceMsPerMeter, 3),
        unit: "s",
        provenance: "recorded",
        note: "grade-adjusted pace, Minetti grade-energy curve (our model)",
      });
      rows.push({
        section: "summary",
        label: "gap_pace_per_mi",
        value: num(gap.gapPaceMsPerMeter * 1.609344, 3),
        unit: "s",
        provenance: "recorded",
      });
    }
    const calories = zonesIn.calories;
    if (calories !== null) {
      rows.push({
        section: "summary",
        label: "calories_kcal",
        value: num(calories.kcal, 0),
        unit: "kcal",
        provenance: "estimated",
        note:
          calories.kind === "power"
            ? `estimate: trapezoid watts over ${Math.round(calories.powerSeconds ?? 0)} s at 24% human efficiency`
            : "estimate: running model, weight times the Minetti cost curve",
      });
    }
  }

  // --- zones (whole route) ----------------------------------------------
  if (zonesIn) {
    const zoneRow = (
      metric: string,
      zone: number,
      timeMs: number,
      note?: string,
    ) => {
      rows.push({
        section: "zone",
        label: `${metric}_zone_${zone}_time`,
        value: num(timeMs / 1000),
        unit: "s",
        provenance: "recorded",
        ...(note !== undefined ? { note } : {}),
      });
    };
    const noDataRow = (metric: string, timeMs: number) => {
      if (timeMs <= 0) return;
      rows.push({
        section: "zone",
        label: `${metric}_no_data_time`,
        value: num(timeMs / 1000),
        unit: "s",
        note: "moving-time legs without the metric (reconstructed stretches record none)",
      });
    };
    if (zonesIn.hr !== null && zonesIn.hr.zones.hasMetricData) {
      for (const row of zonesIn.hr.zones.rows) {
        zoneRow("hr", row.zone, row.timeMs);
      }
      rows.push({
        section: "zone",
        label: "hr_zone_range",
        value: unitRangeNote(zonesIn.hr.zones),
        note: "bpm; zones plus no-data sum to moving time",
      });
      noDataRow("hr", zonesIn.hr.zones.noDataMs);
    }
    if (zonesIn.power !== null && zonesIn.power.zones.hasMetricData) {
      for (const row of zonesIn.power.zones.rows) {
        zoneRow("power", row.zone, row.timeMs);
      }
      rows.push({
        section: "zone",
        label: "power_zone_range",
        value: unitRangeNote(zonesIn.power.zones),
        note: "watts, from FTP",
      });
      noDataRow("power", zonesIn.power.zones.noDataMs);
    }
    if (
      zonesIn.pace !== null &&
      zonesIn.pace.boundaries !== null &&
      zonesIn.pace.zones.hasTimingData
    ) {
      for (const row of zonesIn.pace.zones.rows) {
        zoneRow("pace", row.zone, row.timeMs, "GAP-bucketed (Minetti curve)");
      }
      noDataRow("pace", zonesIn.pace.zones.noDataMs);
    }
    if (zonesIn.cadence !== null && zonesIn.cadence.hasCadenceData) {
      for (const row of zonesIn.cadence.rows) {
        rows.push({
          section: "zone",
          label: `cadence_range_${row.from}_${row.to ?? "open"}_time`,
          value: num(row.timeMs / 1000),
          unit: "s",
          provenance: "recorded",
          note: "unit-agnostic ranges (a file cannot say rpm from spm)",
        });
      }
      noDataRow("cadence", zonesIn.cadence.noDataMs);
    }
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
          // pace is ms per meter — NUMERICALLY seconds per km (the
          // Phase 23 audit: the old `pace * 1000` emitted ms/km under
          // a seconds label, 1000x too big; ratios hid it).
          rows.push({
            section: "split",
            label: `${label}_pace_per_km`,
            value: num(pace, 3),
            unit: "s",
            provenance: row.provenance,
          });
          rows.push({
            section: "split",
            label: `${label}_pace_per_mi`,
            value: num(pace * 1.609344, 3),
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
      // Phase 23.6 — the split's grade-adjusted pace (only when the
      // file carried real grades; the flat fallback stays a UI/summary
      // disclosure, not a per-split number).
      const gapPace =
        splits.hasGradeData ? splitGapPaceMsPerMeter(row) : undefined;
      if (gapPace !== undefined) {
        rows.push({
          section: "split",
          label: `${label}_gap_pace_per_km`,
          value: num(gapPace, 3),
          unit: "s",
          provenance: row.gapEstimated ? "estimated" : "recorded",
          note: "Minetti curve, our model",
        });
        rows.push({
          section: "split",
          label: `${label}_gap_pace_per_mi`,
          value: num(gapPace * 1.609344, 3),
          unit: "s",
          provenance: row.gapEstimated ? "estimated" : "recorded",
        });
      }
    }
  }

  // --- split zones (the per-split breakdown) ------------------------------
  if (zonesIn) {
    const perSplitRow = (
      metric: string,
      splitIndex: number,
      zone: number | "no_data",
      timeMs: number,
    ) => {
      if (timeMs <= 0) return;
      rows.push({
        section: "split_zone",
        label: `split_${splitIndex}_${metric}_${zone === "no_data" ? "no_data" : `zone_${zone}`}_time`,
        value: num(timeMs / 1000),
        unit: "s",
        provenance: "recorded",
      });
    };
    if (zonesIn.hr?.perSplit !== null && zonesIn.hr !== null) {
      for (const row of zonesIn.hr.perSplit ?? []) {
        row.zoneTimesMs.forEach((timeMs, i) =>
          perSplitRow("hr", row.splitIndex, i + 1, timeMs));
        perSplitRow("hr", row.splitIndex, "no_data", row.noDataMs);
      }
    }
    if (zonesIn.power?.perSplit !== null && zonesIn.power !== null) {
      for (const row of zonesIn.power.perSplit ?? []) {
        row.zoneTimesMs.forEach((timeMs, i) =>
          perSplitRow("power", row.splitIndex, i + 1, timeMs));
        perSplitRow("power", row.splitIndex, "no_data", row.noDataMs);
      }
    }
    if (
      zonesIn.pace?.perSplit !== null &&
      zonesIn.pace !== null &&
      zonesIn.pace.boundaries !== null
    ) {
      for (const row of zonesIn.pace.perSplit ?? []) {
        row.zoneTimesMs.forEach((timeMs, i) =>
          perSplitRow("pace", row.splitIndex, i + 1, timeMs));
        perSplitRow("pace", row.splitIndex, "no_data", row.noDataMs);
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
