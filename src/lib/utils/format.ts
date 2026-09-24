/**
 * Centralized value formatting (docs/MASTER_PLAN.md §L-1).
 *
 * Every human-readable number in the UI flows through this module so that
 * distances, durations, speeds, times, and coordinates are formatted
 * identically everywhere:
 *   - distances: meters below 1 km, otherwise kilometers with 2 decimals
 *   - durations: m:ss below one hour, otherwise h:mm:ss
 *   - speeds: km/h with 1 decimal
 *   - timestamps: locale date-time (rendered only after user interaction,
 *     so no SSR hydration concerns)
 *
 * Pure string formatting — no React, no DOM. Pace formatting
 * (m:ss /km) arrives with the pace statistics module (Phase 5).
 */

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
