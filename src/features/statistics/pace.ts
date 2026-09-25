/**
 * Pace statistics (docs/MASTER_PLAN.md §L-1, Phase 5).
 *
 * The §L-1 pace rows as one pure join:
 *
 *   - pace_original    = originalDistance / recordedMovingTime
 *                        → labelled "recorded (excl. gaps)";
 *   - pace_reconstructed = reconstructedDistance / gapDuration
 *                        → labelled **estimated** (§J-2: the system
 *                          never presents estimated pace as measured);
 *   - pace_total       = totalDistance / (recordedMovingTime +
 *                        reconstructedTime) → labelled "mixed".
 *
 * Computability follows the honesty rules (§L-2): a row whose inputs
 * are missing or incomplete carries `durationMs: null` plus a
 * `missingReason` the UI renders as "—" with the reason — never a
 * fabricated or silently partial value. A partially-dated repair set
 * (some gaps without a duration) yields NO repaired/overall pace: the
 * distance is fully known but the time is not, and a partial sum would
 * read as fast.
 *
 * Formatting lives in lib/utils/format.ts (components cannot import
 * features/); this module owns the arithmetic and provenance decisions.
 *
 * Phase 5 — Time & Pace Reconstruction. Pure TypeScript.
 */

import type { PaceUnit } from "@/lib/utils/format";

/** Which §L-1 pace row this is. */
export type PaceRowId = "recorded" | "repaired" | "overall";

/** §L-2 provenance vocabulary (mirrors ProvenanceBadge kinds). */
export type PaceProvenance = "recorded" | "estimated" | "mixed";

/** One pace row: inputs + provenance + computability. */
export interface PaceRow {
  id: PaceRowId;
  provenance: PaceProvenance;
  /** The duration the pace is taken over; `null` = not computable. */
  durationMs: number | null;
  /** The distance the pace is taken over (always known). */
  distanceM: number;
  /** One-line reason while `durationMs` is null (the "—" explanation). */
  missingReason?: string;
}

/** Everything the pace rows depend on (session stats + repair join). */
export interface PaceRowsInput {
  /** The file carries at least one usable timestamp. */
  hasTimingData: boolean;
  /** §L-1 recorded moving time (Σ legs' Δt within the gap threshold). */
  recordedMovingTimeMs: number;
  /** Σ original geodesic distance. */
  recordedDistanceM: number;
  /** Σ committed reconstruction distances (rendered path lengths). */
  repairDistanceM: number;
  /** Σ known reconstruction durations; `null` when none is known. */
  repairTimeMs: number | null;
  /** Committed repairs that still lack a duration. */
  repairsWithoutDuration: number;
  /** At least one committed repair exists. */
  hasRepairs: boolean;
  /** File-level manual total (no-timing-data files), when entered. */
  manualTotalDurationMs: number | null;
}

/**
 * Build the §L-1 pace rows. The "repaired" and "overall" rows exist
 * only when repairs exist (without them they would duplicate the
 * recorded row); the overall row degrades to the manual total for
 * no-timing files.
 */
export function buildPaceRows(input: PaceRowsInput): PaceRow[] {
  const rows: PaceRow[] = [];

  // A recorded row is only computable with timing data AND a positive
  // moving time — zero moving time (all legs gapped/paused) is a "—"
  // with its reason, keeping the null-when-uncomputable contract exact.
  const recordedComputable =
    input.hasTimingData && input.recordedMovingTimeMs > 0;
  rows.push({
    id: "recorded",
    provenance: "recorded",
    durationMs: recordedComputable ? input.recordedMovingTimeMs : null,
    distanceM: input.recordedDistanceM,
    ...(input.hasTimingData
      ? input.recordedMovingTimeMs <= 0
        ? { missingReason: "no recorded moving time (all legs are gaps or pauses)" }
        : {}
      : { missingReason: "no timing data in this file" }),
  });

  if (!input.hasRepairs) {
    // Without repairs the overall row only adds information on a
    // no-timing file (there it IS the prompt for a total duration —
    // §J-2 "pace shows '—' plus a prompt to supply duration"); on a
    // timed file it would duplicate the recorded row.
    if (input.hasTimingData) return rows;
    rows.push({
      id: "overall",
      provenance: "mixed",
      durationMs:
        input.manualTotalDurationMs !== null && input.manualTotalDurationMs > 0
          ? input.manualTotalDurationMs
          : null,
      distanceM: input.recordedDistanceM,
      ...(input.manualTotalDurationMs === null || input.manualTotalDurationMs <= 0
        ? { missingReason: "enter a total duration for this activity" }
        : {}),
    });
    return rows;
  }

  const repairsComplete = input.repairsWithoutDuration === 0;
  const repairDuration =
    repairsComplete && input.repairTimeMs !== null ? input.repairTimeMs : null;

  rows.push({
    id: "repaired",
    provenance: "estimated",
    durationMs: repairDuration,
    distanceM: input.repairDistanceM,
    ...(repairDuration === null
      ? input.repairsWithoutDuration > 0
        ? {
            missingReason: `${input.repairsWithoutDuration} repair${
              input.repairsWithoutDuration === 1 ? "" : "s"
            } still need${input.repairsWithoutDuration === 1 ? "s" : ""} a duration`,
          }
        : {}
      : {}),
  });

  // Overall = total distance over total moving time. For a no-timing
  // file the manual total stands in (recorded distance + manual time —
  // a mixed row by §L-2).
  if (input.hasTimingData) {
    rows.push({
      id: "overall",
      provenance: "mixed",
      durationMs:
        repairDuration === null
          ? null
          : input.recordedMovingTimeMs + repairDuration,
      distanceM: input.recordedDistanceM + input.repairDistanceM,
      ...(repairDuration === null
        ? { missingReason: "repairs need durations before a combined pace is honest" }
        : {}),
    });
  } else if (input.manualTotalDurationMs !== null && input.manualTotalDurationMs > 0) {
    rows.push({
      id: "overall",
      provenance: "mixed",
      durationMs: input.manualTotalDurationMs,
      distanceM: input.recordedDistanceM + input.repairDistanceM,
    });
  } else {
    rows.push({
      id: "overall",
      provenance: "mixed",
      durationMs: null,
      distanceM: input.recordedDistanceM + input.repairDistanceM,
      missingReason: "enter a total duration for this activity",
    });
  }

  return rows;
}

/**
 * Pace in ms per unit, the raw number behind a formatted row.
 * `undefined` when not computable (non-positive inputs — §L-2 "—").
 */
export function paceMsPerUnit(
  durationMs: number | null,
  distanceM: number,
  unit: PaceUnit,
): number | undefined {
  if (durationMs === null || !(durationMs > 0) || !(distanceM > 0)) {
    return undefined;
  }
  const metersPerUnit = unit === "km" ? 1000 : 1609.344;
  return (durationMs / distanceM) * metersPerUnit;
}
