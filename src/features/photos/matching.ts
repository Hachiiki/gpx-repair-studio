/**
 * Photo↔track matching (Phase 26 — docs/plans/v3/
 * phase-26-photo-geotagging.md §26.1): pin each photo to where the
 * watch says you were, against the camera's clock.
 *
 * The clock model, stated once and enforced everywhere:
 *
 *   EXIF DateTimeOriginal is NAIVE local time (no zone, by the EXIF
 *   spec). The track's times are UTC epoch ms. A photo matches at
 *
 *       effective = naive − timezoneOffset + drift
 *
 *   where `timezoneOffset` is the camera's zone (minutes east of UTC —
 *   the offset matrix: every zone on Earth including the half-hour
 *   ones, chosen explicitly, never sniffed from the photo because the
 *   photo does not carry it) and `drift` is the nudge slider's seconds
 *   (camera clocks drift; the preview re-matches live so the user can
 *   SEE the calibration land).
 *
 * Positions come from time-linear interpolation between the bracketing
 * track points — more points mean finer positions, the same density
 * argument Strava makes about segment timing. A photo beyond the
 * tolerance window is UNMATCHED with the distance stated, never
 * snapped to the nearest point silently. Photos whose bracket touches
 * a reconstructed (drawn-in) stretch carry the flag — the position is
 * estimated geometry, and the disclosure says so.
 *
 * Pure domain module (the §F boundary rules).
 *
 * Phase 26 — Photo geotagging. Pure TypeScript.
 */

import type { MergeResult } from "@/features/reconstruction/merge";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** One timed, positioned point of the working view (the one-merge rule). */
export interface TimedTrackPoint {
  timeMs: number;
  lat: number;
  lon: number;
  ele: number | null;
  /** The bracket rides drawn-in repair geometry (the honesty flag). */
  reconstructed: boolean;
}

/** The photo-side input distilled to what matching needs. */
export interface MatchPhotoInput {
  id: string;
  /** Naive epoch ms from EXIF DateTimeOriginal (null = no timestamp). */
  naiveTimeMs: number | null;
}

/** The calibration the user controls (§26.1). */
export interface MatchConfig {
  /** Camera zone, minutes east of UTC (UTC+10:00 → 600; UTC+5:30 → 330). */
  timezoneOffsetMinutes: number;
  /** The nudge slider, seconds (camera clock drift). */
  driftSeconds: number;
  /** How far from the track a photo may fall and still match. */
  toleranceSec: number;
}

/** The disclosed default window (readable in the card's rules). */
export const DEFAULT_MATCH_TOLERANCE_SEC = 120;

/** The nudge slider's bounds (seconds either way — a clock, not a calendar). */
export const DRIFT_SLIDER_MIN_SEC = -300;
export const DRIFT_SLIDER_MAX_SEC = 300;
export const DRIFT_SLIDER_STEP_SEC = 5;

/** What happened to one photo. */
export type PhotoMatch =
  | {
      id: string;
      status: "matched";
      /** Photo time minus matched track time (the shown delta). */
      deltaMs: number;
      lat: number;
      lon: number;
      ele: number | null;
      /** The fix's UTC epoch ms (the track's clock, written to EXIF). */
      trackTimeMs: number;
      /** The bracket includes drawn-in repair geometry (§25.3's rule). */
      onReconstructed: boolean;
    }
  | { id: string; status: "no-timestamp" }
  | {
      id: string;
      status: "out-of-window";
      /** Seconds from the nearest track end (the stated distance). */
      nearestDeltaSec: number;
    };

// ---------------------------------------------------------------------------
// The track projection (one-merge rule)
// ---------------------------------------------------------------------------

/**
 * Project the merged working view onto the timed population: every
 * point — recorded or reconstructed — that carries a timestamp,
 * sorted by time. The photos pin to the SAME route the map, export,
 * and statistics show; nothing is re-derived here.
 */
export function buildTimedTrack(merge: MergeResult): TimedTrackPoint[] {
  const out: TimedTrackPoint[] = [];
  for (const track of merge.tracks) {
    for (const view of track.points) {
      const point = view.point;
      const timeMs =
        typeof point.time === "number"
          ? point.time
          : point.time !== undefined
            ? point.time.value
            : undefined;
      if (timeMs === undefined) continue;
      const ele =
        typeof point.ele === "number"
          ? point.ele
          : point.ele !== undefined && point.ele !== null
            ? point.ele.value
            : null;
      out.push({
        timeMs,
        lat: point.lat,
        lon: point.lon,
        ele,
        reconstructed: point.source === "reconstructed",
      });
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Find [i, i+1] such that track[i].timeMs <= t <= track[i+1].timeMs. */
function bracketIndex(track: readonly TimedTrackPoint[], t: number): number {
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid]!.timeMs <= t) lo = mid + 1;
    else hi = mid;
  }
  // lo = first index with timeMs > t (or the last index); the bracket
  // is [lo-1, lo].
  return lo;
}

/** Linear interpolation between two points by time fraction. */
function lerp(a: TimedTrackPoint, b: TimedTrackPoint, t: number): { lat: number; lon: number; ele: number | null } {
  const span = b.timeMs - a.timeMs;
  if (span <= 0) return { lat: b.lat, lon: b.lon, ele: b.ele };
  const f = (t - a.timeMs) / span;
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    ele:
      a.ele !== null && b.ele !== null
        ? a.ele + (b.ele - a.ele) * f
        : a.ele ?? b.ele,
  };
}

/**
 * Match every photo against the timed track. Photos with no timestamp
 * are listed as exactly that (§26.3); photos outside the window state
 * their distance; matches carry the interpolated position and the
 * reconstruction flag. Deterministic and pure.
 */
export function matchPhotos(
  photos: readonly MatchPhotoInput[],
  track: readonly TimedTrackPoint[],
  config: MatchConfig,
): PhotoMatch[] {
  if (track.length === 0) {
    return photos.map((photo): PhotoMatch => {
      if (photo.naiveTimeMs === null) return { id: photo.id, status: "no-timestamp" };
      return {
        id: photo.id,
        status: "out-of-window",
        nearestDeltaSec: Number.POSITIVE_INFINITY,
      };
    });
  }
  const toleranceMs = config.toleranceSec * 1000;
  return photos.map((photo): PhotoMatch => {
    if (photo.naiveTimeMs === null) {
      return { id: photo.id, status: "no-timestamp" };
    }
    const effective =
      photo.naiveTimeMs -
      config.timezoneOffsetMinutes * 60_000 +
      config.driftSeconds * 1000;
    const first = track[0]!;
    const last = track[track.length - 1]!;
    // Before the start / after the end: the honest endpoint check.
    if (effective < first.timeMs) {
      const delta = effective - first.timeMs;
      if (-delta <= toleranceMs) {
        return matchedAt(photo.id, first, delta, first);
      }
      return {
        id: photo.id,
        status: "out-of-window",
        nearestDeltaSec: Math.round(-delta / 1000),
      };
    }
    if (effective > last.timeMs) {
      const delta = effective - last.timeMs;
      if (delta <= toleranceMs) {
        return matchedAt(photo.id, last, delta, last);
      }
      return {
        id: photo.id,
        status: "out-of-window",
        nearestDeltaSec: Math.round(delta / 1000),
      };
    }
    const hi = bracketIndex(track, effective);
    if (hi === 0) {
      // Exactly at (or bracketed by) the first point.
      return matchedAt(photo.id, first, effective - first.timeMs, first);
    }
    const a = track[hi - 1]!;
    const b = track[hi]!;
    if (b.timeMs === effective) {
      return matchedAt(photo.id, b, 0, b);
    }
    const position = lerp(a, b, effective);
    return {
      id: photo.id,
      status: "matched",
      deltaMs: 0,
      lat: position.lat,
      lon: position.lon,
      ele: position.ele,
      trackTimeMs: effective,
      onReconstructed: a.reconstructed || b.reconstructed,
    };
  });
}

/** A match pinned to a single point (window edges + exact hits). */
function matchedAt(
  id: string,
  point: TimedTrackPoint,
  deltaMs: number,
  timePoint: TimedTrackPoint,
): PhotoMatch {
  return {
    id,
    status: "matched",
    deltaMs,
    lat: point.lat,
    lon: point.lon,
    ele: point.ele,
    trackTimeMs: timePoint.timeMs,
    onReconstructed: point.reconstructed,
  };
}

// ---------------------------------------------------------------------------
// The offset matrix's UI vocabulary (pure, tested)
// ---------------------------------------------------------------------------

/**
 * Every zone a camera could plausibly sit in: −12:00 … +14:00 in
 * 30-minute steps (the half-hour zones — India +5:30, Nepal +5:45 is
 * rounded in, Iran +3:30, Newfoundland −3:30 — are first-class, the
 * matrix documented in §26.1).
 */
export function timezoneOffsetOptions(): number[] {
  const out: number[] = [];
  for (let minutes = -12 * 60; minutes <= 14 * 60; minutes += 30) {
    out.push(minutes);
  }
  return out;
}

/** "UTC", "UTC+10:00", "UTC−05:30" (the minus is a true minus sign). */
export function formatUtcOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "\u2212";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

/** The slider's human label: "+2:05" / "−3:40" / "on time". */
export function formatDriftSeconds(seconds: number): string {
  if (seconds === 0) return "0";
  const sign = seconds > 0 ? "+" : "\u2212";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return m > 0 ? `${sign}${m}:${String(s).padStart(2, "0")}` : `${sign}${s} s`;
}
