/**
 * Activity statistics — the "create from activity stats" workflow's Step 1
 * domain (the watch recorded the workout, but not the map).
 *
 * The user enters what their watch DID record — distance, average pace,
 * total time, and when the activity started — and the app reconstructs a
 * GPX around those numbers. Two rules govern this module:
 *
 *   1. The user's values are AUTHORITATIVE. Nothing entered is ever
 *      silently overwritten or "corrected" — the mathematical
 *      relationship `time ≈ distance × pace` is only ever CHECKED, and a
 *      disagreement is surfaced as a non-blocking notice (watches round
 *      their displays; a few seconds of drift is normal, and the user
 *      keeps going either way).
 *   2. Units are normalized ONCE, here. The form works in the app's pace
 *      unit (km or mi, the same preference the statistics panel uses);
 *      everything downstream is meters / milliseconds / pace-per-km, so
 *      no consumer ever multiplies by a unit factor again.
 *
 * Pure TypeScript: no React, no DOM, no stores.
 */

import { PACE_METERS_PER_UNIT, type PaceUnit } from "@/lib/utils/format";

/** What the watch recorded, normalized (the create store's stats slice). */
export interface ActivityStats {
  /** Total distance in meters — always the user's entered value. */
  distanceM: number;
  /** Total duration in milliseconds — always the user's entered value. */
  durationMs: number;
  /** Average pace in ms per KILOMETER (normalized from the entry unit). */
  paceMsPerKm: number;
  /** Activity start (epoch ms) — the timestamp anchor of the GPX. */
  startMs: number;
}

/** The raw shape the form collects before normalization. */
export interface StatsEntryFields {
  /** Distance in the entry unit (km or mi), as typed. */
  distance: number | null;
  /** Pace minutes component (per entry unit), as typed. */
  paceMinutes: number | null;
  /** Pace seconds component (per entry unit), as typed. */
  paceSeconds: number | null;
  /** Total duration in ms (parsed h/m/s fields, `durationFieldsToMs`). */
  durationMs: number | null;
  /** Activity start (epoch ms), from a datetime-local input. */
  startMs: number | null;
}

/**
 * Field-level validation outcomes — one message per field, `null` when the
 * field is valid. `pace` covers the minutes/seconds pair as one logical
 * field (they render as one pace entry); `start` covers the datetime.
 * Messages are short, plain, and actionable (they render under the field,
 * in the destructive color).
 */
export type StatsFieldErrors = Partial<
  Record<keyof StatsEntryFields | "pace" | "start", string>
>;

/** Sane entry windows — wide enough for every real activity. */
export const STATS_LIMITS = {
  /** Maximum distance in the entry unit (a very long ultra/cycle). */
  maxDistance: 9999,
  /** Maximum pace minutes per unit (15 h/km covers any hike). */
  maxPaceMinutes: 899,
  /** Maximum total duration (99 h 59 m 59 s). */
  maxDurationMs: ((99 * 60 + 59) * 60 + 59) * 1000,
} as const;

/**
 * Validate the raw fields. Returns the normalized {@link ActivityStats}
 * when everything is usable, or the per-field errors when it is not.
 * Never throws; never repairs values.
 */
export function validateStatsEntry(
  fields: StatsEntryFields,
  unit: PaceUnit,
): { ok: true; stats: ActivityStats } | { ok: false; errors: StatsFieldErrors } {
  const errors: StatsFieldErrors = {};

  if (fields.distance === null || !Number.isFinite(fields.distance)) {
    errors.distance = "Enter the distance your watch recorded.";
  } else if (fields.distance <= 0) {
    errors.distance = "Distance must be greater than zero.";
  } else if (fields.distance > STATS_LIMITS.maxDistance) {
    errors.distance = `Distance must be at most ${STATS_LIMITS.maxDistance}.`;
  }

  const paceUsable =
    fields.paceMinutes !== null &&
    Number.isFinite(fields.paceMinutes) &&
    fields.paceSeconds !== null &&
    Number.isFinite(fields.paceSeconds) &&
    fields.paceMinutes >= 0 &&
    fields.paceSeconds >= 0 &&
    fields.paceSeconds < 60;
  const paceTotalSeconds =
    (fields.paceMinutes ?? 0) * 60 + (fields.paceSeconds ?? 0);
  if (!paceUsable) {
    errors.pace = "Enter your average pace — minutes and seconds.";
  } else if (paceTotalSeconds <= 0) {
    errors.pace = "Pace must be greater than zero.";
  } else if (fields.paceMinutes! > STATS_LIMITS.maxPaceMinutes) {
    errors.pace = `Pace minutes must be at most ${STATS_LIMITS.maxPaceMinutes}.`;
  }

  if (fields.durationMs === null || !Number.isFinite(fields.durationMs)) {
    errors.durationMs = "Enter the total time your watch recorded.";
  } else if (fields.durationMs <= 0) {
    errors.durationMs = "Total time must be greater than zero.";
  } else if (fields.durationMs > STATS_LIMITS.maxDurationMs) {
    errors.durationMs = "Total time must be under 100 hours.";
  }

  if (fields.startMs === null || !Number.isFinite(fields.startMs)) {
    errors.start = "Set when the activity started — platforms use it to place the activity.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Normalize: distance → meters, pace → ms/km (the entry unit only ever
  // affects this one conversion).
  const metersPerUnit = PACE_METERS_PER_UNIT[unit];
  const paceMsPerUnit = paceTotalSeconds * 1000;
  return {
    ok: true,
    stats: {
      distanceM: fields.distance! * metersPerUnit,
      durationMs: fields.durationMs!,
      paceMsPerKm: (paceMsPerUnit * PACE_METERS_PER_UNIT.km) / metersPerUnit,
      startMs: fields.startMs!,
    },
  };
}

// ---------------------------------------------------------------------------
// Consistency (time ≈ distance × pace) — checked, never enforced
// ---------------------------------------------------------------------------

/** How far the entered triple disagrees with its own arithmetic. */
export type ConsistencyLevel =
  | "consistent" // within normal watch rounding — nothing to say
  | "rounding" // a few seconds off — mention it, keep going
  | "mismatch"; // far off — probably a typo; still keep going

/** The consistency verdict rendered as the form's non-blocking notice. */
export interface ConsistencyNotice {
  level: ConsistencyLevel;
  /** The duration the entered distance × pace implies (ms). */
  impliedDurationMs: number;
  /** Signed deviation of the entered duration from the implied one. */
  deviationMs: number;
  /** |deviation| as a fraction of the entered duration (0..1). */
  deviationRatio: number;
}

/** Below this |deviation ratio|: watch rounding, say nothing. */
const CONSISTENCY_QUIET_RATIO = 0.005;
/** Below this: mention the rounding; above it: suggest a typo check. */
const CONSISTENCY_ROUNDING_RATIO = 0.05;

/**
 * Check `time ≈ distance × pace` over normalized stats. Pure; total over
 * any inputs (a zero pace yields "consistent" — the field validators own
 * that case).
 */
export function checkStatsConsistency(
  stats: Pick<ActivityStats, "distanceM" | "durationMs" | "paceMsPerKm">,
): ConsistencyNotice {
  const impliedDurationMs =
    (stats.distanceM / 1000) * stats.paceMsPerKm;
  const deviationMs = stats.durationMs - impliedDurationMs;
  const deviationRatio =
    stats.durationMs > 0 ? Math.abs(deviationMs) / stats.durationMs : 0;
  const level: ConsistencyLevel =
    deviationRatio < CONSISTENCY_QUIET_RATIO
      ? "consistent"
      : deviationRatio < CONSISTENCY_ROUNDING_RATIO
        ? "rounding"
        : "mismatch";
  return {
    level,
    impliedDurationMs,
    deviationMs,
    deviationRatio,
  };
}

/**
 * Render the pace a file will imply (duration ÷ distance) in the display
 * unit — the summary's "average pace" is always the file's own arithmetic,
 * never a re-statement of the entered pace.
 */
export function impliedPaceMsPerUnit(
  durationMs: number,
  distanceM: number,
  unit: PaceUnit,
): number | null {
  if (!(durationMs > 0) || !(distanceM > 0)) return null;
  // ms-per-meter × meters-per-unit = ms-per-unit.
  return (durationMs / distanceM) * PACE_METERS_PER_UNIT[unit];
}
