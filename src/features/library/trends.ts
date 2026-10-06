/**
 * Trends — Phase 24.3 (docs/plans/v3/phase-24-activity-library-records.md):
 * weekly/monthly volume over the local library, and the fitness-fatigue
 * line — the Banister 1975 impulse-response model as Coggan applied it
 * (fitness on the long timescale, fatigue short, form the difference),
 * public science, cited in place.
 *
 * Honesty rules this module owns:
 *   - the daily impulse is MOVING TIME (seconds), nothing else. The
 *     model knows nothing about intensity — no heart-rate stress, no
 *     power stress — and the copy says so. It is a volume model with
 *     Coggan's time constants, not a training-load oracle.
 *   - DAYS ARE LOCAL (the browser's calendar), volume buckets are ISO
 *     weeks (Monday start) and calendar months — a training diary is a
 *     local artifact.
 *   - sessions without timestamps cannot sit on a calendar; they are
 *     excluded and COUNTED, never bucketed at their save time.
 *   - the fitness line has honest minimum counts (a 21-day span and 8
 *     sessions — Coggan's own guidance that CTL needs weeks to mean
 *     anything); below them the engine still computes the series but
 *     flags `minCountMet` false so the UI renders the reason, not a
 *     confident curve over three rides.
 *   - the EMA starts from zero load at the first activity day — the
 *     model has no history before your library does, and says so.
 *
 * The discrete update is the standard TrainingPeaks form:
 *   v_t = v_{t-1} + (load_t − v_{t-1}) · (1 − e^(−1/τ))
 * with τ = 42 days (CTL, fitness) and τ = 7 days (ATL, fatigue);
 * form = CTL − ATL, all in seconds per day.
 *
 * Phase 24 — Activity library, records & trends. Pure TypeScript.
 */

import type { LibraryIndexRow } from "@/features/library/records";

/** Fitness time constant, days (Coggan's CTL). */
export const CTL_TIME_CONSTANT_DAYS = 42;
/** Fatigue time constant, days (Coggan's ATL). */
export const ATL_TIME_CONSTANT_DAYS = 7;
/** The fitness line's minimum span, days. */
export const FITNESS_MIN_SPAN_DAYS = 21;
/** The fitness line's minimum session count. */
export const FITNESS_MIN_SESSIONS = 8;

export type VolumePeriod = "week" | "month";

/** One volume bucket as the chart draws it. */
export interface VolumeRow {
  /** Local-midnight epoch ms of the bucket's first day. */
  startMs: number;
  distanceM: number;
  movingTimeMs: number;
  activities: number;
}

/** The fitness-fatigue series (daily, seconds per day). */
export interface FitnessFatiguePoint {
  /** Local-midnight epoch ms of the day. */
  dayMs: number;
  /** Fitness — 42-day exponentially weighted average, s/day. */
  ctl: number;
  /** Fatigue — 7-day exponentially weighted average, s/day. */
  atl: number;
  /** Form = fitness − fatigue, s/day. */
  form: number;
}

export interface FitnessFatigueResult {
  points: readonly FitnessFatiguePoint[];
  /** Days from the first to the last activity (inclusive). */
  spanDays: number;
  /** Sessions that carried timestamps and joined the model. */
  sessionCount: number;
  /** Sessions excluded (no timestamps), counted and disclosed. */
  untimedCount: number;
  /** Both minimum counts met — the UI's gate for drawing the line. */
  minCountMet: boolean;
}

// ---------------------------------------------------------------------------
// Local-day keys (a training diary is a local artifact)
// ---------------------------------------------------------------------------

/** Local-midnight epoch ms of the day containing `epochMs`. */
export function localDayStartMs(epochMs: number): number {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** The ISO week (Monday start) containing the local day, as its Monday. */
function isoWeekStartMs(dayMs: number): number {
  const date = new Date(dayMs);
  // JS: Sunday 0 … Saturday 6 → ISO weekday 1…7 (Monday 1).
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  const monday = new Date(dayMs);
  monday.setDate(monday.getDate() - (weekday - 1));
  return monday.getTime();
}

/** The calendar month (the 1st) containing the local day. */
function monthStartMs(dayMs: number): number {
  const date = new Date(dayMs);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

/**
 * Bucket the dated, indexed sessions into ISO weeks or calendar
 * months. Buckets with no activity are absent (a diary shows what
 * happened), sorted ascending by start. Undated sessions never appear.
 */
export function volumeByPeriod(
  rows: readonly LibraryIndexRow[],
  period: VolumePeriod,
): VolumeRow[] {
  const buckets = new Map<number, VolumeRow>();
  for (const row of rows) {
    const { index } = row;
    if (index.activityStartMs === null) continue;
    const day = localDayStartMs(index.activityStartMs);
    const key = period === "week" ? isoWeekStartMs(day) : monthStartMs(day);
    const bucket = buckets.get(key) ?? {
      startMs: key,
      distanceM: 0,
      movingTimeMs: 0,
      activities: 0,
    };
    bucket.distanceM += index.distanceM;
    bucket.movingTimeMs += index.movingTimeMs;
    bucket.activities += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.startMs - b.startMs);
}

// ---------------------------------------------------------------------------
// Fitness & fatigue
// ---------------------------------------------------------------------------

/** One EMA step of the discrete impulse-response update. */
function emaStep(
  previous: number,
  load: number,
  tauDays: number,
): number {
  const factor = 1 - Math.exp(-1 / tauDays);
  return previous + (load - previous) * factor;
}

/**
 * The daily fitness-fatigue series over the dated, indexed sessions.
 * Days run from the first activity's day to the last's (inclusive);
 * every day carries its load (0 on rest days) and both averages. The
 * series is always computed — `minCountMet` is the UI's honesty gate.
 */
export function fitnessFatigue(
  rows: readonly LibraryIndexRow[],
): FitnessFatigueResult | null {
  const daily = new Map<number, number>(); // dayMs → moving seconds
  let untimedCount = 0;
  let sessionCount = 0;
  for (const row of rows) {
    const { index } = row;
    if (
      index.activityStartMs === null ||
      !index.hasTimingData ||
      !(index.movingTimeMs > 0)
    ) {
      untimedCount += 1;
      continue;
    }
    sessionCount += 1;
    const day = localDayStartMs(index.activityStartMs);
    daily.set(day, (daily.get(day) ?? 0) + index.movingTimeMs / 1000);
  }
  if (daily.size === 0) {
    return untimedCount > 0
      ? {
          points: [],
          spanDays: 0,
          sessionCount: 0,
          untimedCount,
          minCountMet: false,
        }
      : null;
  }

  const days = [...daily.keys()].sort((a, b) => a - b);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const DAY_MS = 86_400_000;
  const spanDays = Math.round((last - first) / DAY_MS) + 1;

  const points: FitnessFatiguePoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let day = first; day <= last; day += DAY_MS) {
    // DST can make a local-midnight step 23/25 h; normalize the key
    // back to local midnight so rest days never duplicate or skip.
    const key = localDayStartMs(day);
    const load = daily.get(key) ?? 0;
    ctl = emaStep(ctl, load, CTL_TIME_CONSTANT_DAYS);
    atl = emaStep(atl, load, ATL_TIME_CONSTANT_DAYS);
    points.push({ dayMs: key, ctl, atl, form: ctl - atl });
  }

  return {
    points,
    spanDays,
    sessionCount,
    untimedCount,
    minCountMet:
      spanDays >= FITNESS_MIN_SPAN_DAYS && sessionCount >= FITNESS_MIN_SESSIONS,
  };
}
