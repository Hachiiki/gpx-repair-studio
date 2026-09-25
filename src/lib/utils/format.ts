/**
 * Centralized value formatting (docs/MASTER_PLAN.md §L-1).
 *
 * Every human-readable number in the UI flows through this module so that
 * distances, durations, speeds, times, and coordinates are formatted
 * identically everywhere:
 *   - distances: meters below 1 km, otherwise kilometers with 2 decimals
 *   - durations: m:ss below one hour, otherwise h:mm:ss
 *   - speeds: km/h with 1 decimal
 *   - pace: m:ss per km or per mile (Phase 5 — the unit is a setting)
 *   - timestamps: locale date-time (rendered only after user interaction,
 *     so no SSR hydration concerns)
 *   - share-card forms (Task 20): compact durations ("1h 45m") and
 *     distance in the pace unit ("13.12 mi")
 *
 * Pure string/number formatting — no React, no DOM. Pace arithmetic
 * (which durations and distances produce which rows, with what
 * provenance) lives in features/statistics/pace.ts; this module only
 * renders values.
 */

/** Pace display units (§J-2: min/km with a min/mi toggle). */
export type PaceUnit = "km" | "mi";

/** Meters per pace unit — exact definitions (1 mi = 1609.344 m). */
export const PACE_METERS_PER_UNIT: Record<PaceUnit, number> = {
  km: 1000,
  mi: 1609.344,
};

/** Meters below 1 km, kilometers with 2 decimals otherwise. */
export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (Math.abs(meters) < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * A duration in ms as `m:ss` below one hour, `h:mm:ss` otherwise.
 * Zero renders as "0:00"; negative values (a bug upstream) render "—".
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A duration in ms as the compact share-card form (Task 20): `1h 45m`
 * at one hour and above (seconds dropped, the Strava convention),
 * `45m 30s` below it, `0s` for zero. Non-finite/negative render "—"
 * (the honesty "—" — the caller supplies the reason).
 */
export function formatDurationCompactMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Distance in the pace display unit (Task 20): kilometers/meters for
 * "km" (the `formatDistanceMeters` convention), always miles with two
 * decimals for "mi" — so a card's distance and pace read in one unit
 * ("13.12 mi" pairs with "8:02 /mi", never with "21.12 km").
 */
export function formatDistanceForUnit(
  meters: number,
  unit: PaceUnit,
): string {
  if (!Number.isFinite(meters)) return "—";
  if (unit === "km") return formatDistanceMeters(meters);
  return `${(meters / PACE_METERS_PER_UNIT.mi).toFixed(2)} mi`;
}

/** Speed in km/h with 1 decimal. */
export function formatSpeedKmh(kmh: number): string {
  if (!Number.isFinite(kmh)) return "—";
  return `${kmh.toFixed(1)} km/h`;
}

/**
 * Epoch ms as a locale date-time string with seconds.
 * Returns "—" for missing/unreliable values (`undefined` upstream).
 */
export function formatDateTime(epochMs: number | undefined): string {
  if (epochMs === undefined || !Number.isFinite(epochMs)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(epochMs));
}

/**
 * A coordinate pair as `lat, lon` with 5 decimals (~1 m precision at
 * mid-latitudes — the convention for GPX tooling).
 */
export function formatLatLon(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "—";
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/**
 * A pace value (duration per ONE unit) as `m:ss` below one hour,
 * `h:mm:ss` otherwise. Non-finite/non-positive values render "—".
 */
export function formatPaceMs(paceMs: number): string {
  if (!Number.isFinite(paceMs) || paceMs <= 0) return "—";
  return formatDurationMs(paceMs);
}

/**
 * Pace over a distance in the requested unit: `5:23 /km` or `8:41 /mi`.
 * "—" when duration or distance is not usable (the honesty "—": the
 * caller supplies the reason text).
 */
export function formatPace(
  durationMs: number | null,
  distanceM: number,
  unit: PaceUnit,
): string {
  if (durationMs === null || !(durationMs > 0) || !(distanceM > 0)) {
    return "—";
  }
  const perUnit = (durationMs / distanceM) * PACE_METERS_PER_UNIT[unit];
  return `${formatPaceMs(perUnit)} /${unit}`;
}

// ---------------------------------------------------------------------------
// Duration-field parsing (the manual-duration inputs share one parser)
// ---------------------------------------------------------------------------

/**
 * One h/m/s field of a duration entry. Each value is a non-negative
 * number (string inputs from number fields, "" counts as 0).
 */
export interface DurationFields {
  hours: number | string;
  minutes: number | string;
  seconds: number | string;
}

/**
 * Parse h/m/s fields into whole milliseconds. `null` when any field is
 * negative or not a number — the caller keeps the dialog open and
 * explains; a valid all-zero entry returns 0 (a legitimate duration).
 */
export function durationFieldsToMs(fields: DurationFields): number | null {
  const part = (value: number | string): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 ? value : null;
    }
    const text = value.trim();
    if (text === "") return 0;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const h = part(fields.hours);
  const m = part(fields.minutes);
  const s = part(fields.seconds);
  if (h === null || m === null || s === null) return null;
  return Math.round(((h * 60 + m) * 60 + s) * 1000);
}

/** Split whole milliseconds into h/m/s fields (for prefilling inputs). */
export function msToDurationFields(
  ms: number,
): { hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
