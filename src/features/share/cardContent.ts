/**
 * Share card content derivation (docs/MASTER_PLAN.md §O — Task 20;
 * Task 35: committed-repair join).
 *
 * The one join that turns session statistics into the card's
 * Distance / Pace / Time trio, with the §L-2 honesty rules intact:
 *
 *   - **Distance** — the file's total geodesic length (recorded legs;
 *     for a re-uploaded repair, the previously reconstructed stretches
 *     are part of the file and stay included), PLUS the live committed
 *     repairs' distance when they exist (Task 35: the card renders the
 *     edited route, so its headline number is the outcome — the same
 *     "Total with repairs" the statistics panel shows).
 *   - **Pace** — with repairs, the overall pace (total distance over
 *     recorded moving time + repair time — the statistics panel's
 *     "Overall pace" row); without, total distance over recorded
 *     moving time. A no-timing file falls back to the entered total
 *     duration when one exists.
 *   - **Time** — the recorded elapsed time (`t_last − t_first`), the
 *     Strava share-card convention. Repairs never change it: the
 *     watch's clock is the clock.
 *
 * Uncomputable values render "—" and carry a reason in `notes` — the
 * same never-invent contract as every other panel. A file without
 * timestamps produces an honest distance-only card, never a fabricated
 * pace. Repairs that still lack durations keep the distance honest but
 * withhold the combined pace (a partial sum would read as fast).
 *
 * Pure TypeScript. Formatting lives in lib/utils/format.ts.
 */

import type { ReimportStats } from "@/features/statistics/reimport";
import type { DistanceStats } from "@/features/statistics/distance";
import type { TimeStats } from "@/features/statistics/time";
import {
  formatDistanceForUnit,
  formatDurationCompactMs,
  formatPace,
  type PaceUnit,
} from "@/lib/utils/format";

/** The card's trio plus the honesty context around it. */
export interface ShareCardContent {
  /** Pre-formatted values for the three stat columns. */
  distance: string;
  pace: string;
  time: string;
  /** True when all three values are computable from recorded data. */
  complete: boolean;
  /** Explanations for every "—" and for included re-imported repairs. */
  notes: readonly string[];
  /** True when the file carries previously-reconstructed (gpxr) points. */
  includesReimported: boolean;
  /** True when committed live repairs are included (Task 35). Optional
   * so hand-built fixtures without it keep compiling. */
  includesRepairs?: boolean;
}

/**
 * The live committed-repair join (Task 35) — the same population the
 * statistics panel's repair rows use (`RepairTimeStats` narrowed to
 * what the card needs).
 */
export interface ShareRepairJoin {
  /** Committed repairs (the statistics join's gapCount). */
  repairCount: number;
  /** Σ committed reconstruction distances, meters. */
  reconstructedDistanceM: number;
  /** Σ known repair durations, ms; `null` when none is known. */
  repairTimeMs: number | null;
  /** Committed repairs still lacking a duration. */
  gapsWithoutDuration: number;
  /** File-level manual total (no-timing files), when entered. */
  manualTotalDurationMs?: number | null;
}

/** Everything the derivation needs (session stats + display unit). */
export interface ShareCardContentInput {
  distance: Pick<DistanceStats, "totalDistanceM">;
  time: TimeStats;
  reimport?: ReimportStats | null;
  unit: PaceUnit;
  /** Task 35: the committed-repair join; omitted/null → the file as
   * recorded (the exact pre-Task-35 behavior). */
  repair?: ShareRepairJoin | null;
}

/** Derive the trio. Pure; unit-testable with hand-built stats. */
export function buildShareCardContent(
  input: ShareCardContentInput,
): ShareCardContent {
  const { distance, time, reimport, unit, repair } = input;
  const notes: string[] = [];

  const hasRepairs = (repair?.repairCount ?? 0) > 0;
  // The outcome distance: the file's own total (reimport stretches
  // already inside it) plus the live committed repairs — the same
  // arithmetic as the statistics panel's "Total with repairs".
  const totalDistanceM =
    distance.totalDistanceM + (hasRepairs ? repair!.reconstructedDistanceM : 0);

  const distanceText = formatDistanceForUnit(totalDistanceM, unit);

  // Pace (§L-1): without repairs, total distance over recorded moving
  // time. With repairs, the OVERALL pace — the stats panel's overall
  // row — which needs every repair to carry a duration first (a
  // partial sum would read as fast). A no-timing file falls back to
  // the entered total duration, exactly like the overall row does.
  let paceComputable = false;
  let paceText = "—";
  if (!time.hasTimingData) {
    const manualTotal = repair?.manualTotalDurationMs ?? null;
    if (manualTotal !== null && manualTotal > 0 && totalDistanceM > 0) {
      paceComputable = true;
      paceText = formatPace(manualTotal, totalDistanceM, unit);
    } else {
      notes.push(
        "This file has no usable timestamps — an honest pace and time cannot be derived, so both show “—”.",
      );
    }
  } else if (time.recordedMovingTimeMs <= 0) {
    notes.push(
      "No recorded moving time (every leg is a gap or a pause) — pace shows “—”.",
    );
  } else if (hasRepairs) {
    const repairsComplete =
      repair!.gapsWithoutDuration === 0 && repair!.repairTimeMs !== null;
    if (repairsComplete) {
      paceComputable = true;
      paceText = formatPace(
        time.recordedMovingTimeMs + repair!.repairTimeMs!,
        totalDistanceM,
        unit,
      );
    } else {
      notes.push(
        `${repair!.gapsWithoutDuration} repair${
          repair!.gapsWithoutDuration === 1 ? "" : "s"
        } still need${repair!.gapsWithoutDuration === 1 ? "s" : ""} a duration — the overall pace shows “—” until then (a partial sum would read as fast).`,
      );
    }
  } else {
    paceComputable = true;
    paceText = formatPace(time.recordedMovingTimeMs, totalDistanceM, unit);
  }

  // Time: the recorded elapsed span. Missing when timing data is
  // absent or non-monotonic (TimeStats omits wallTimeMs there).
  const timeText =
    time.wallTimeMs !== undefined
      ? formatDurationCompactMs(time.wallTimeMs)
      : "—";
  if (time.hasTimingData && time.wallTimeMs === undefined && paceComputable) {
    notes.push(
      "Timestamps are not monotonic — the elapsed time shows “—” rather than a negative span.",
    );
  }

  const includesReimported = (reimport?.markerCount ?? 0) > 0;
  if (includesReimported) {
    notes.push(
      `${reimport!.markerCount} points in this file were reconstructed by a previous repair — they are part of the route and its totals.`,
    );
  }

  if (hasRepairs) {
    notes.push(
      `Includes your committed repairs — ${repair!.repairCount} reconstructed ${
        repair!.repairCount === 1 ? "stretch" : "stretches"
      }, +${formatDistanceForUnit(repair!.reconstructedDistanceM, unit)} added to the route.`,
    );
  }

  return {
    distance: distanceText,
    pace: paceText,
    time: timeText,
    complete: paceComputable && time.wallTimeMs !== undefined,
    notes,
    includesReimported,
    includesRepairs: hasRepairs,
  };
}
