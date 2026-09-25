/**
 * Share card content derivation (docs/MASTER_PLAN.md §O — Task 20).
 *
 * The one join that turns session statistics into the card's
 * Distance / Pace / Time trio, with the §L-2 honesty rules intact:
 *
 *   - **Distance** — the file's total geodesic length (recorded legs;
 *     for a re-uploaded repair, the previously reconstructed stretches
 *     are part of the file and stay included — the card shows the
 *     activity as the file records it).
 *   - **Pace** — total distance over recorded moving time (the same
 *     definition as the statistics panel's pace rows).
 *   - **Time** — the recorded elapsed time (`t_last − t_first`), the
 *     Strava share-card convention.
 *
 * Uncomputable values render "—" and carry a reason in `notes` — the
 * same never-invent contract as every other panel. A file without
 * timestamps produces an honest distance-only card, never a fabricated
 * pace. No editor state is involved: the card describes the uploaded
 * file, repairs included only when they are already inside it.
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
}

/** Everything the derivation needs (session stats + display unit). */
export interface ShareCardContentInput {
  distance: Pick<DistanceStats, "totalDistanceM">;
  time: TimeStats;
  reimport?: ReimportStats | null;
  unit: PaceUnit;
}

/** Derive the trio. Pure; unit-testable with hand-built stats. */
export function buildShareCardContent(
  input: ShareCardContentInput,
): ShareCardContent {
  const { distance, time, reimport, unit } = input;
  const notes: string[] = [];

  const distanceText = formatDistanceForUnit(distance.totalDistanceM, unit);

  // Pace: total distance over recorded moving time (§L-1). The §L-2
  // "—" rules mirror buildPaceRows' recorded row.
  const paceComputable = time.hasTimingData && time.recordedMovingTimeMs > 0;
  const paceText = paceComputable
    ? formatPace(time.recordedMovingTimeMs, distance.totalDistanceM, unit)
    : "—";
  if (!time.hasTimingData) {
    notes.push(
      "This file has no usable timestamps — an honest pace and time cannot be derived, so both show “—”.",
    );
  } else if (!paceComputable) {
    notes.push(
      "No recorded moving time (every leg is a gap or a pause) — pace shows “—”.",
    );
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

  return {
    distance: distanceText,
    pace: paceText,
    time: timeText,
    complete: paceComputable && time.wallTimeMs !== undefined,
    notes,
    includesReimported,
  };
}
