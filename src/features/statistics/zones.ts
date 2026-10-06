/**
 * Fitness zones — Phase 23.1/23.2 (docs/plans/v3/phase-23-fitness-zones-
 * metrics.md): the zone sets, their guardrails, time-in-zone over the
 * merged route, and the per-split zone breakdown.
 *
 * The zone SETS mirror the documented Strava shape (§RR of the Strava
 * interop research): heart-rate zones derive from a max HR (their
 * default 220 − age with a 190 bpm fallback — ours defaults to the
 * documented 190 fallback and stays editable, capped at 230), power
 * zones are seven derived from FTP (capped at 500 W), pace zones are
 * six set from a recent race result and runs are bucketed by GAP. The
 * BOUNDARY NUMBERS themselves are ours: Strava publishes zone names
 * and derivation rules, not percentages — ours are the classic
 * five-band HR preset (floors at 60/70/80/90% of max HR), Coggan's
 * published FTP percentages for power, and Riegel-normalized
 * one-hour-pace multipliers for pace. Every number the app shows names
 * its model in place (§RR-4: never claim parity number-for-number).
 *
 * Guardrails (adopted from Strava's documented customization rules):
 * boundaries cannot overlap, adjacent boundaries differ by at least
 * one unit, and everything stays inside the caps.
 *
 * Time-in-zone walks the SAME legs every stats walk uses: same-track
 * legs with 0 < Δt ≤ `timeGapMs` (the moving-time population). A leg's
 * zone comes from its ENDPOINT-AVERAGED value (hr/power) or its GAP
 * pace (pace zones — the Strava semantics); legs missing the metric at
 * an endpoint — every reconstructed stretch carries none — count their
 * time as `noDataMs`, disclosed, never guessed into a zone. A
 * metrics-free file renders "—" with its reason (§L-2 applies to zones
 * exactly as it applies to pace).
 *
 * Phase 23 — Fitness zones & metrics. Pure TypeScript: no React, no DOM.
 */

import type { MergeResult } from "@/features/reconstruction/merge";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import type { GapSummary } from "@/features/statistics/gap";
import {
  MINETTI_FLAT_COST_J_PER_KG_M,
  legGapTimeMs,
  legGrade,
  minettiCost,
} from "@/features/statistics/gap";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type {
  OriginalTrackPoint,
  ReconstructedPoint,
  TrackPointMetrics,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Zone sets — models, defaults, guardrails
// ---------------------------------------------------------------------------

/** HR zone set: max HR + the four bpm floors of zones 2–5. */
export interface HrZoneSet {
  /** bpm. Default 190 (Strava's documented fallback), cap 230. */
  maxHr: number;
  /**
   * Ascending bpm floors of zones 2–5 (zone 1 spans everything below
   * the first floor — every sample lands somewhere, Σ zones = moving
   * time). Defaults derive from maxHr at 60/70/80/90%.
   */
  boundaries: readonly [number, number, number, number];
}

/** Power zone set: FTP is the single knob (Coggan percentages derive). */
export interface PowerZoneSet {
  /** watts. Default 200, cap 500. */
  ftp: number;
}

/** Pace zone set: six zones from one recent race result. */
export interface PaceZoneSet {
  race: PaceRaceResult | null;
}

export interface PaceRaceResult {
  distanceM: number;
  timeMs: number;
}

/** The pickable race distances (the presets the settings offer). */
export const PACE_RACE_PRESETS: readonly {
  id: string;
  labelKey: string;
  distanceM: number;
}[] = [
  { id: "1mi", labelKey: "zones.race.1mi", distanceM: 1609.344 },
  { id: "5k", labelKey: "zones.race.5k", distanceM: 5000 },
  { id: "10k", labelKey: "zones.race.10k", distanceM: 10_000 },
  { id: "half", labelKey: "zones.race.half", distanceM: 21_097.5 },
  { id: "30k", labelKey: "zones.race.30k", distanceM: 30_000 },
  { id: "marathon", labelKey: "zones.race.marathon", distanceM: 42_195 },
];

export const MAX_HR_CAP = 230;
export const MAX_HR_MIN = 60;
export const DEFAULT_MAX_HR = 190; // the documented fallback (§RR-3)
export const HR_BOUNDARY_FRACTIONS = [0.6, 0.7, 0.8, 0.9] as const;
export const HR_ZONE_COUNT = 5;

export const FTP_CAP_W = 500;
export const FTP_MIN_W = 20;
export const DEFAULT_FTP_W = 200;
/** Coggan's published FTP percentages — floors of zones 2–7. */
export const POWER_ZONE_FTP_FRACTIONS = [
  0.55, 0.75, 0.9, 1.0, 1.2, 1.5,
] as const;
export const POWER_ZONE_COUNT = 7;

/** Riegel's exponent — the public-science race-normalization model. */
export const RIEGEL_EXPONENT = 1.06;
/** Our pace multipliers: zone floors as multiples of the one-hour pace. */
export const PACE_ZONE_MULTIPLIERS = [
  0.9, 1.0, 1.1, 1.25, 1.45,
] as const;
export const PACE_ZONE_COUNT = 6;

/** The four HR boundary bpm values derived from a max HR (ours). */
export function defaultHrBoundaries(
  maxHr: number,
): [number, number, number, number] {
  return HR_BOUNDARY_FRACTIONS.map((f) =>
    Math.round(f * maxHr),
  ) as [number, number, number, number];
}

export const DEFAULT_HR_ZONE_SET: HrZoneSet = {
  maxHr: DEFAULT_MAX_HR,
  boundaries: defaultHrBoundaries(DEFAULT_MAX_HR),
};

export const DEFAULT_POWER_ZONE_SET: PowerZoneSet = { ftp: DEFAULT_FTP_W };

export const DEFAULT_PACE_ZONE_SET: PaceZoneSet = { race: null };

/** The six power boundary watts derived from an FTP. */
export function powerBoundaries(
  ftp: number,
): [number, number, number, number, number, number] {
  return POWER_ZONE_FTP_FRACTIONS.map((f) =>
    Math.round(f * ftp),
  ) as [number, number, number, number, number, number];
}

/**
 * Riegel-normalized one-hour pace from a race result, ms per meter:
 * d60 = d1 · (3600 s / t1)^(1/1.06), p60 = 3600/d60.
 */
export function oneHourPaceMsPerMeter(race: PaceRaceResult): number | null {
  if (!(race.distanceM > 0) || !(race.timeMs > 0)) return null;
  const t1Seconds = race.timeMs / 1000;
  const d60 =
    race.distanceM * Math.pow(3600 / t1Seconds, 1 / RIEGEL_EXPONENT);
  if (!(d60 > 0)) return null;
  return 3_600_000 / d60;
}

/**
 * The five pace boundaries (ms per meter, ascending) from a race
 * result: the multipliers × the one-hour pace. `null` when the race is
 * unset or unusable.
 */
export function paceZoneBoundariesMsPerMeter(
  race: PaceRaceResult | null,
): [
  number,
  number,
  number,
  number,
  number,
] | null {
  if (race === null) return null;
  const p60 = oneHourPaceMsPerMeter(race);
  if (p60 === null || !(p60 > 0)) return null;
  return PACE_ZONE_MULTIPLIERS.map((m) => m * p60) as [
    number,
    number,
    number,
    number,
    number,
  ];
}

/** Guardrail codes (the UI maps each to its disclosure copy). */
export type ZoneGuardrailIssue =
  | "not-ascending" // boundaries must strictly increase
  | "adjacent-gap" // adjacent boundaries differ by < 1 unit
  | "out-of-range"; // a value sits outside its min/max

export function validateMaxHr(maxHr: number): ZoneGuardrailIssue | null {
  if (!Number.isFinite(maxHr) || maxHr < MAX_HR_MIN || maxHr > MAX_HR_CAP) {
    return "out-of-range";
  }
  return null;
}

/** The documented Strava customization guardrails, applied to bpm. */
export function validateHrBoundaries(
  boundaries: readonly number[],
  maxHr: number,
): ZoneGuardrailIssue | null {
  for (const b of boundaries) {
    if (!Number.isFinite(b) || b < 1 || b > maxHr) return "out-of-range";
  }
  for (let i = 1; i < boundaries.length; i += 1) {
    if (boundaries[i] <= boundaries[i - 1]) return "not-ascending";
    if (boundaries[i] - boundaries[i - 1] < 1) return "adjacent-gap";
  }
  return null;
}

export function validateFtp(ftp: number): ZoneGuardrailIssue | null {
  if (!Number.isFinite(ftp) || ftp < FTP_MIN_W || ftp > FTP_CAP_W) {
    return "out-of-range";
  }
  return null;
}

export function validateRaceResult(race: PaceRaceResult): ZoneGuardrailIssue | null {
  if (!(race.distanceM > 0) || !(race.timeMs > 0)) return "out-of-range";
  if (race.timeMs > 86_400_000) return "out-of-range";
  return null;
}

// ---------------------------------------------------------------------------
// Zone lookup
// ---------------------------------------------------------------------------

/**
 * HR/power zone of a value: 1 + (number of boundaries ≤ value) — the
 * floor is inclusive, so a value EXACTLY on a boundary opens the next
 * zone (the exact-at-limit rule the tests pin).
 */
export function upperZoneIndexForValue(
  boundaries: readonly number[],
  value: number,
): number {
  let count = 0;
  for (const b of boundaries) {
    if (b <= value) count += 1;
  }
  return count + 1;
}

/**
 * Pace zone of a ms-per-meter pace: 6 − (number of boundaries ≤ pace)
 * — zone 1 is the slowest (≥ 1.45 × p60), zone 6 the fastest.
 */
export function paceZoneIndexForValue(
  boundaries: readonly number[],
  paceMsPerMeter: number,
): number {
  let count = 0;
  for (const b of boundaries) {
    if (b <= paceMsPerMeter) count += 1;
  }
  return PACE_ZONE_COUNT - count;
}

// ---------------------------------------------------------------------------
// Time-in-zone — the shared walk
// ---------------------------------------------------------------------------

/**
 * One timed leg of the shared fitness walk (the Phase 23 performance
 * rule: ONE route walk feeds every analysis — hr, power, GAP-bucketed
 * pace, cadence, the GAP summary, and both calorie formulas — so the
 * upload path pays a single pass, not one per metric).
 */
export interface FitnessLegDatum {
  dtMs: number;
  /** Route-distance window of the leg (for split attribution). */
  d0: number;
  d1: number;
  /** The leg's geodesic length, meters (0 = a duplicate point). */
  legM: number;
  /** Endpoint-averaged heart rate; null when an endpoint lacks it. */
  hr: number | null;
  /** Endpoint-averaged watts; null when an endpoint lacks them. */
  watts: number | null;
  /** Endpoint-averaged cadence; null when an endpoint lacks it. */
  cad: number | null;
  /** Flat-equivalent duration (the Minetti curve; = dt when ungraded). */
  gapMs: number;
  /** Both endpoints carried elevation (a real grade was applied). */
  graded: boolean;
}

/** The whole-route blocks the walk accumulates beside the legs. */
export interface FitnessLegWalk {
  legs: readonly FitnessLegDatum[];
  /** The whole-run GAP summary (gapSummary's exact semantics). */
  gap: GapSummary;
  /**
   * The metabolic Minetti integral over EVERY usable leg (timing-free
   * — stopped time covers no distance and contributes ~nothing).
   */
  metabolic: {
    energyJ: number;
    distanceM: number;
    flatLegs: number;
    gradedLegs: number;
  };
  /** The power trapezoid over timed legs with watts at both endpoints. */
  power: {
    energyJ: number;
    seconds: number;
  };
  hasHrData: boolean;
  hasCadData: boolean;
  hasPowerData: boolean;
  hasTimingData: boolean;
}

interface WalkPoint {
  lat: number;
  lon: number;
  time?: number;
  ele?: number;
  metrics?: TrackPointMetrics;
  trackIndex: number;
}

function avgOrUndefined2(
  a: number | undefined,
  b: number | undefined,
): number | null {
  if (a === undefined || b === undefined) return null;
  return (a + b) / 2;
}

/**
 * The single shared walk: usable points, cumulative distance across
 * track boundaries, timed same-track legs carried with their metric
 * averages and flat-equivalent durations, plus the GAP / metabolic /
 * power accumulations — everything the Phase 23 analyses need, in one
 * O(n) pass.
 */
export function buildFitnessLegs(
  merge: MergeResult | null,
  options: { timeGapMs?: number } = {},
): FitnessLegWalk | null {
  if (!merge) return null;
  const timeGapMs = options.timeGapMs ?? Number.POSITIVE_INFINITY;

  const legs: FitnessLegDatum[] = [];
  let movingMs = 0;
  let gapTimeMs = 0;
  let gapDistanceM = 0;
  let gapFlatLegs = 0;
  let gapGradedLegs = 0;
  let hasTimingData = false;
  let hasElevationData = false;
  let hasHrData = false;
  let hasCadData = false;
  let hasPowerData = false;
  let metabolicEnergyJ = 0;
  let metabolicDistanceM = 0;
  let metabolicFlatLegs = 0;
  let metabolicGradedLegs = 0;
  let powerEnergyJ = 0;
  let powerSeconds = 0;

  let cumulative = 0;
  let previous: WalkPoint | null = null;

  for (const track of merge.tracks) {
    for (const view of track.points) {
      const point = view.point;
      const isReconstructed = point.source === "reconstructed";
      const usable =
        isReconstructed || isUsableStatsPoint(point as OriginalTrackPoint);
      if (!usable) continue;

      const metrics = isReconstructed
        ? undefined
        : (point as OriginalTrackPoint).metrics;
      if (metrics?.hr !== undefined) hasHrData = true;
      if (metrics?.cad !== undefined) hasCadData = true;
      if (metrics?.watts !== undefined) hasPowerData = true;

      const current: WalkPoint = {
        lat: point.lat,
        lon: point.lon,
        ...(isReconstructed
          ? {
              time: (point as ReconstructedPoint).time?.value,
              ele: (point as ReconstructedPoint).ele?.value,
            }
          : {
              time: (point as OriginalTrackPoint).time,
              ele: (point as OriginalTrackPoint).ele,
              ...(metrics !== undefined ? { metrics } : {}),
            }),
        trackIndex: track.trackIndex,
      };
      if (current.time !== undefined) hasTimingData = true;
      if (current.ele !== undefined && Number.isFinite(current.ele)) {
        hasElevationData = true;
      }

      if (previous !== null) {
        const legM = geodesicDistanceMeters(previous, current);
        const sameTrack = previous.trackIndex === current.trackIndex;
        const dt =
          sameTrack && previous.time !== undefined && current.time !== undefined
            ? current.time - previous.time
            : null;
        const usableLegM = Number.isFinite(legM) && legM > 0 ? legM : 0;

        // The metabolic integral runs over EVERY leg (timing-free):
        // distance was covered, energy applies.
        if (usableLegM > 0) {
          metabolicDistanceM += usableLegM;
          const grade = legGrade(previous.ele, current.ele, usableLegM);
          if (grade === null) {
            metabolicEnergyJ += MINETTI_FLAT_COST_J_PER_KG_M * usableLegM;
            metabolicFlatLegs += 1;
          } else {
            metabolicEnergyJ += minettiCost(grade) * usableLegM;
            metabolicGradedLegs += 1;
          }
        }

        if (dt !== null && dt > 0 && dt <= timeGapMs) {
          const { gapMs, graded } = legGapTimeMs(
            dt,
            usableLegM,
            previous.ele,
            current.ele,
          );
          const hr = avgOrUndefined2(
            previous.metrics?.hr,
            current.metrics?.hr,
          );
          const watts = avgOrUndefined2(
            previous.metrics?.watts,
            current.metrics?.watts,
          );
          const cad = avgOrUndefined2(
            previous.metrics?.cad,
            current.metrics?.cad,
          );
          const d0 = cumulative;
          const d1 = cumulative + usableLegM;
          legs.push({
            dtMs: dt,
            d0,
            d1,
            legM: usableLegM,
            hr,
            watts,
            cad,
            gapMs,
            graded,
          });
          cumulative = d1;
          movingMs += dt;
          if (usableLegM > 0) {
            gapDistanceM += usableLegM;
            gapTimeMs += gapMs;
            if (graded) gapGradedLegs += 1;
            else gapFlatLegs += 1;
          }
          if (watts !== null) {
            powerEnergyJ += watts * (dt / 1000);
            powerSeconds += dt / 1000;
          }
        } else {
          cumulative += usableLegM;
        }
      }

      previous = current;
    }
  }

  return {
    legs,
    gap: {
      movingMs,
      gapTimeMs,
      distanceM: gapDistanceM,
      // GAP requires at least one GRADED leg — an elevation-free route
      // has nothing to adjust (the honest "—").
      gapPaceMsPerMeter:
        gapGradedLegs > 0 && gapTimeMs > 0 && gapDistanceM > 0
          ? gapTimeMs / gapDistanceM
          : null,
      actualPaceMsPerMeter:
        movingMs > 0 && gapDistanceM > 0 ? movingMs / gapDistanceM : null,
      flatLegs: gapFlatLegs,
      gradedLegs: gapGradedLegs,
      hasTimingData,
      hasElevationData,
    },
    metabolic: {
      energyJ: metabolicEnergyJ,
      distanceM: metabolicDistanceM,
      flatLegs: metabolicFlatLegs,
      gradedLegs: metabolicGradedLegs,
    },
    power: { energyJ: powerEnergyJ, seconds: powerSeconds },
    hasHrData,
    hasCadData,
    hasPowerData,
    hasTimingData,
  };
}

/** Accepts a precomputed walk or a merge (tests + targeted callers). */
function resolveWalk(
  source: MergeResult | FitnessLegWalk | null,
  options: { timeGapMs?: number },
): FitnessLegWalk | null {
  if (source === null) return null;
  if ("legs" in source) return source;
  return buildFitnessLegs(source, options);
}

/** One classified leg (0-based zone, −1 = the metric is absent). */
export interface ZoneLegDatum {
  dtMs: number;
  /** Route-distance window of the leg (for split attribution). */
  d0: number;
  d1: number;
  /** 0-based zone index; −1 when the leg carries no usable metric. */
  zone: number;
}

/** One zone row of the whole-route distribution. */
export interface ZoneTimeRow {
  /** 1-based zone ordinal (zone 1 first — for pace, the slowest). */
  zone: number;
  /** Floor in native units (bpm / W / ms-per-meter); null = open. */
  fromValue: number | null;
  /** Ceiling in native units; null = open (the top zone). */
  toValue: number | null;
  timeMs: number;
  /** Share of accounted time (0..1); the no-data time is excluded. */
  share: number;
}

/** Whole-route time-in-zone result + the honesty bookkeeping. */
export interface ZoneTimeResult {
  rows: readonly ZoneTimeRow[];
  zoneCount: number;
  /** Σ accounted time = Σ rows' timeMs. */
  accountedMs: number;
  /** Moving-time legs missing the metric (reconstructed stretches). */
  noDataMs: number;
  /** accountedMs + noDataMs — equals the route's moving time. */
  movingMs: number;
  /** Any point anywhere carried the metric. */
  hasMetricData: boolean;
  /** Any leg anywhere was timed. */
  hasTimingData: boolean;
}

/** Per-split zone breakdown row (splits × zones). */
export interface SplitZoneRow {
  splitIndex: number;
  /** Time per 0-based zone, ms (index 0 = zone 1). */
  zoneTimesMs: readonly number[];
  noDataMs: number;
  /** 1-based zone holding the most accounted time (null when none). */
  dominantZone: number | null;
}

export interface SplitWindow {
  index: number;
  fromM: number;
  toM: number;
}

interface ZoneAnalysisOptions {
  timeGapMs?: number;
  /** Splits to attribute against (per-split breakdown). */
  splits?: readonly SplitWindow[];
}

function aggregate(
  walk: FitnessLegWalk,
  zoneOf: (leg: FitnessLegDatum) => number,
  zoneCount: number,
  hasMetricData: boolean,
  hasTimingData: boolean,
  rowValues: (zone: number) => { fromValue: number | null; toValue: number | null },
): ZoneTimeResult {
  const times = new Array<number>(zoneCount).fill(0);
  let noDataMs = 0;
  for (const leg of walk.legs) {
    const zone = zoneOf(leg);
    if (zone < 0) noDataMs += leg.dtMs;
    else times[zone] += leg.dtMs;
  }
  const accountedMs = times.reduce((sum, t) => sum + t, 0);
  return {
    rows: times.map((timeMs, i) => ({
      zone: i + 1,
      ...rowValues(i),
      timeMs,
      share: accountedMs > 0 ? timeMs / accountedMs : 0,
    })),
    zoneCount,
    accountedMs,
    noDataMs,
    movingMs: accountedMs + noDataMs,
    hasMetricData,
    hasTimingData,
  };
}

/**
 * Attribute each leg's time to the splits it overlaps (proportionally,
 * like `buildSplits` attributes time), bucketed by the leg's zone.
 * The window lookup is a BINARY search — the Phase 23 audit's finding:
 * a per-leg linear scan made 100k-point files pay legs × splits × 3
 * metrics and blew the §C-2 upload budget.
 */
function attributeSplits(
  walk: FitnessLegWalk,
  splits: readonly SplitWindow[],
  zoneCount: number,
  zoneOf: (leg: FitnessLegDatum) => number,
): SplitZoneRow[] {
  // Mutable working rows (frozen into the readonly result on return).
  const rows: {
    splitIndex: number;
    zoneTimesMs: number[];
    noDataMs: number;
    dominantZone: number | null;
  }[] = splits.map((split) => ({
    splitIndex: split.index,
    zoneTimesMs: new Array<number>(zoneCount).fill(0),
    noDataMs: 0,
    dominantZone: null,
  }));
  if (splits.length === 0) return rows;

  // Windows are ascending by fromM: binary-search the last window
  // whose fromM is at/before the distance.
  const splitIndexOf = (distanceM: number): number => {
    let lo = 0;
    let hi = splits.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (splits[mid].fromM <= distanceM) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && splits[lo].fromM > distanceM) lo -= 1;
    return lo;
  };

  for (const leg of walk.legs) {
    const duration = leg.dtMs;
    const zone = zoneOf(leg);
    if (leg.d1 > leg.d0) {
      const span = leg.d1 - leg.d0;
      let lastOverlap = -1;
      for (let k = splitIndexOf(leg.d0); k < splits.length; k += 1) {
        if (splits[k].fromM >= leg.d1) break;
        const lo = Math.max(leg.d0, splits[k].fromM);
        const hi = Math.min(leg.d1, splits[k].toM);
        if (hi <= lo) continue;
        lastOverlap = k;
        const share = (hi - lo) / span;
        const row = rows[k];
        if (zone < 0) row.noDataMs += duration * share;
        else row.zoneTimesMs[zone] += duration * share;
      }
      if (lastOverlap === -1) {
        // Before the first window cannot happen (windows start at 0);
        // keep the guard honest anyway.
        const row = rows[0];
        if (zone < 0) row.noDataMs += duration;
        else row.zoneTimesMs[zone] += duration;
      }
    } else {
      // Zero-length leg (duplicate point): time lands where the point
      // sits — the same rule `buildSplits` applies.
      const row = rows[splitIndexOf(leg.d0)];
      if (zone < 0) row.noDataMs += duration;
      else row.zoneTimesMs[zone] += duration;
    }
  }

  for (const row of rows) {
    let best = -1;
    let bestTime = -1;
    row.zoneTimesMs.forEach((timeMs, i) => {
      if (timeMs > bestTime) {
        bestTime = timeMs;
        best = i;
      }
    });
    row.dominantZone = bestTime > 0 ? best + 1 : null;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// HR zones
// ---------------------------------------------------------------------------

export interface HrZoneAnalysis {
  zones: ZoneTimeResult;
  perSplit: readonly SplitZoneRow[] | null;
}

/**
 * Time in the five heart-rate zones. Leg zone = the endpoint-averaged
 * hr; a leg missing hr at either endpoint counts as no-data. `null`
 * without a merge.
 */
export function analyzeHrZones(
  source: MergeResult | FitnessLegWalk | null,
  set: HrZoneSet,
  options: ZoneAnalysisOptions = {},
): HrZoneAnalysis | null {
  const walk = resolveWalk(source, options);
  if (!walk) return null;
  const boundaries = set.boundaries;
  const zoneOf = (leg: FitnessLegDatum): number =>
    leg.hr === null ? -1 : upperZoneIndexForValue(boundaries, leg.hr) - 1;
  const zones = aggregate(
    walk,
    zoneOf,
    HR_ZONE_COUNT,
    walk.hasHrData,
    walk.hasTimingData,
    (i) => ({
      fromValue: i === 0 ? null : boundaries[i - 1],
      toValue: i === HR_ZONE_COUNT - 1 ? null : boundaries[i],
    }),
  );
  return {
    zones,
    perSplit:
      options.splits !== undefined
        ? attributeSplits(walk, options.splits, HR_ZONE_COUNT, zoneOf)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Power zones
// ---------------------------------------------------------------------------

export interface PowerZoneAnalysis {
  zones: ZoneTimeResult;
  perSplit: readonly SplitZoneRow[] | null;
}

/**
 * Time in the seven FTP-derived power zones (Coggan's percentages,
 * ours to disclose). Leg zone = the endpoint-averaged watts.
 */
export function analyzePowerZones(
  source: MergeResult | FitnessLegWalk | null,
  set: PowerZoneSet,
  options: ZoneAnalysisOptions = {},
): PowerZoneAnalysis | null {
  const walk = resolveWalk(source, options);
  if (!walk) return null;
  const boundaries = powerBoundaries(set.ftp);
  const zoneOf = (leg: FitnessLegDatum): number =>
    leg.watts === null
      ? -1
      : upperZoneIndexForValue(boundaries, leg.watts) - 1;
  const zones = aggregate(
    walk,
    zoneOf,
    POWER_ZONE_COUNT,
    walk.hasPowerData,
    walk.hasTimingData,
    (i) => ({
      fromValue: i === 0 ? null : boundaries[i - 1],
      toValue: i === POWER_ZONE_COUNT - 1 ? null : boundaries[i],
    }),
  );
  return {
    zones,
    perSplit:
      options.splits !== undefined
        ? attributeSplits(walk, options.splits, POWER_ZONE_COUNT, zoneOf)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Pace zones (GAP-bucketed, the Strava semantics)
// ---------------------------------------------------------------------------

export interface PaceZoneAnalysis {
  zones: ZoneTimeResult;
  perSplit: readonly SplitZoneRow[] | null;
  /** ms per meter — null when the race result is unset or unusable. */
  boundaries: readonly number[] | null;
}

/**
 * Time in the six pace zones, bucketed by each leg's GRADE-ADJUSTED
 * pace (the Strava semantics — a hill's effort reads at its flat
 * equivalent). A race result must be set; a leg missing timing,
 * distance, or grade data at an endpoint falls back to its actual
 * pace at factor 1 — except legs with no elevation at all, which keep
 * factor 1 and are disclosed by the GAP summary's `flatLegs`.
 */
export function analyzePaceZones(
  source: MergeResult | FitnessLegWalk | null,
  set: PaceZoneSet,
  options: ZoneAnalysisOptions = {},
): PaceZoneAnalysis | null {
  const walk = resolveWalk(source, options);
  if (!walk) return null;
  const boundaries = paceZoneBoundariesMsPerMeter(set.race);
  if (boundaries === null) {
    // No (usable) race result: an empty, honest result — the UI shows
    // the "set a race result" reason.
    return {
      zones: {
        rows: [],
        zoneCount: PACE_ZONE_COUNT,
        accountedMs: 0,
        noDataMs: 0,
        movingMs: 0,
        hasMetricData: false,
        hasTimingData: walk.hasTimingData,
      },
      perSplit: null,
      boundaries: null,
    };
  }
  const zoneOf = (leg: FitnessLegDatum): number => {
    if (!(leg.legM > 0)) return -1;
    return paceZoneIndexForValue(boundaries, leg.gapMs / leg.legM) - 1;
  };
  const zones = aggregate(
    walk,
    zoneOf,
    PACE_ZONE_COUNT,
    true, // the "metric" here is timing+distance+grade — presence flows
    walk.hasTimingData,
    (i) => {
      // Zone 1 is the slowest: [b5, ∞); zone 6 the fastest: (−∞, b1).
      const b = boundaries;
      if (i === 0) return { fromValue: b[4], toValue: null };
      if (i === PACE_ZONE_COUNT - 1) return { fromValue: null, toValue: b[0] };
      return { fromValue: b[PACE_ZONE_COUNT - 1 - i], toValue: b[PACE_ZONE_COUNT - i] };
    },
  );
  return {
    zones,
    perSplit:
      options.splits !== undefined
        ? attributeSplits(walk, options.splits, PACE_ZONE_COUNT, zoneOf)
        : null,
    boundaries,
  };
}

// ---------------------------------------------------------------------------
// Cadence ranges
// ---------------------------------------------------------------------------

export const CADENCE_RANGE_WIDTH = 10;

export interface CadenceRangeRow {
  /** Inclusive floor of the bucket (rpm or spm — unit-agnostic). */
  from: number;
  /** Exclusive ceiling; null = the top open bucket. */
  to: number | null;
  timeMs: number;
  share: number;
}

export interface CadenceRangesResult {
  rows: readonly CadenceRangeRow[];
  accountedMs: number;
  noDataMs: number;
  movingMs: number;
  hasCadenceData: boolean;
  hasTimingData: boolean;
}

/**
 * Time in cadence ranges — fixed 10-unit buckets over the observed
 * span (rpm and spm are indistinguishable in a GPX/TCX/FIT file, so
 * the buckets stay unit-agnostic and the copy says so). Leg bucket =
 * the endpoint-averaged cadence.
 */
export function analyzeCadenceRanges(
  source: MergeResult | FitnessLegWalk | null,
  options: ZoneAnalysisOptions = {},
): CadenceRangesResult | null {
  const walk = resolveWalk(source, options);
  if (!walk) return null;
  const zoneOf = (leg: FitnessLegDatum): number =>
    leg.cad === null ? -1 : Math.floor(leg.cad / CADENCE_RANGE_WIDTH);

  const times = new Map<number, number>();
  let noDataMs = 0;
  for (const leg of walk.legs) {
    const zone = zoneOf(leg);
    if (zone < 0) noDataMs += leg.dtMs;
    else times.set(zone, (times.get(zone) ?? 0) + leg.dtMs);
  }
  const accountedMs = [...times.values()].reduce((sum, t) => sum + t, 0);
  const buckets = [...times.keys()].sort((a, b) => a - b);
  const rows: CadenceRangeRow[] = buckets.map((bucket) => ({
    from: bucket * CADENCE_RANGE_WIDTH,
    to: (bucket + 1) * CADENCE_RANGE_WIDTH,
    timeMs: times.get(bucket) ?? 0,
    share: accountedMs > 0 ? (times.get(bucket) ?? 0) / accountedMs : 0,
  }));
  if (rows.length > 0) {
    rows[rows.length - 1].to = null; // the observed top bucket reads open
  }

  return {
    rows,
    accountedMs,
    noDataMs,
    movingMs: accountedMs + noDataMs,
    hasCadenceData: walk.hasCadData,
    hasTimingData: walk.hasTimingData,
  };
}

// ---------------------------------------------------------------------------
// The persisted settings aggregate (ui-store shape)
// ---------------------------------------------------------------------------

/** Everything the Phase 23 settings popover edits, in one persisted object. */
export interface FitnessSettings {
  hr: HrZoneSet;
  power: PowerZoneSet;
  pace: PaceZoneSet;
  /** Phase 23.4 — the stopped-time threshold, m/s (default 0.5). */
  stopSpeedMps: number;
  /** Phase 23 amendment — the opt-in calorie estimate. */
  calories: {
    enabled: boolean;
    /** kg — stored locally only, never exported. */
    weightKg: number | null;
  };
}

export const STOP_SPEED_MIN = 0.1;
export const STOP_SPEED_MAX = 5;
export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 250;

export function validateStopSpeedMps(value: number): ZoneGuardrailIssue | null {
  if (!Number.isFinite(value) || value < STOP_SPEED_MIN || value > STOP_SPEED_MAX) {
    return "out-of-range";
  }
  return null;
}

export function validateWeightKg(value: number): ZoneGuardrailIssue | null {
  if (!Number.isFinite(value) || value < WEIGHT_MIN_KG || value > WEIGHT_MAX_KG) {
    return "out-of-range";
  }
  return null;
}

export const DEFAULT_FITNESS_SETTINGS: FitnessSettings = {
  hr: DEFAULT_HR_ZONE_SET,
  power: DEFAULT_POWER_ZONE_SET,
  pace: DEFAULT_PACE_ZONE_SET,
  stopSpeedMps: 0.5,
  calories: { enabled: false, weightKg: null },
};
