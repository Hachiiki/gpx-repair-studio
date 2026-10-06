// @vitest-environment jsdom
/**
 * Zone-engine goldens (Phase 23.1/23.2 verification): boundary
 * derivation, EXACT-AT-LIMIT zone membership (the plan's own wording),
 * the documented guardrails, time-in-zone over the real merge
 * pipeline, the no-data honesty cases, cadence ranges, and the
 * per-split attribution.
 */

import { describe, expect, it } from "vitest";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { buildSplits } from "@/features/statistics/splits";
import {
  CADENCE_RANGE_WIDTH,
  DEFAULT_FITNESS_SETTINGS,
  DEFAULT_MAX_HR,
  HR_ZONE_COUNT,
  PACE_RACE_PRESETS,
  POWER_ZONE_COUNT,
  POWER_ZONE_FTP_FRACTIONS,
  analyzeCadenceRanges,
  analyzeHrZones,
  analyzePaceZones,
  analyzePowerZones,
  defaultHrBoundaries,
  oneHourPaceMsPerMeter,
  paceZoneBoundariesMsPerMeter,
  paceZoneIndexForValue,
  powerBoundaries,
  upperZoneIndexForValue,
  validateFtp,
  validateHrBoundaries,
  validateMaxHr,
  validateRaceResult,
  validateStopSpeedMps,
  validateWeightKg,
} from "@/features/statistics/zones";
import { minettiGapFactor } from "@/features/statistics/gap";
import { parseXml } from "./helpers/gpxTestUtils";
import { metricsMerge, TIMED } from "./helpers/metricsTestUtils";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { vertexId } from "@/types/ids";
import type { GapId, PointId } from "@/types/domain";

const closeTo = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);

/** Equator positions (the splits-test convention). */
const lonAt = (steps: number) => -0.02 + steps * 0.008;
const LAT = 0;
const legM = (): number =>
  geodesicDistanceMeters(
    { lat: LAT, lon: lonAt(0) },
    { lat: LAT, lon: lonAt(1) },
  );

// ---------------------------------------------------------------------------
// The zone model
// ---------------------------------------------------------------------------

describe("zone sets — derivation goldens", () => {
  it("HR boundaries derive at 60/70/80/90% of max (default 190)", () => {
    expect(DEFAULT_MAX_HR).toBe(190); // the documented fallback (§RR-3)
    expect(defaultHrBoundaries(190)).toEqual([114, 133, 152, 171]);
    expect(DEFAULT_FITNESS_SETTINGS.hr).toEqual({
      maxHr: 190,
      boundaries: [114, 133, 152, 171],
    });
    expect(HR_ZONE_COUNT).toBe(5);
  });

  it("power boundaries derive at Coggan's percentages of FTP", () => {
    expect(powerBoundaries(200)).toEqual([110, 150, 180, 200, 240, 300]);
    expect(powerBoundaries(250)).toEqual(
      POWER_ZONE_FTP_FRACTIONS.map((f) => Math.round(f * 250)),
    );
    expect(POWER_ZONE_COUNT).toBe(7);
  });

  it("the Riegel one-hour pace of a 25:00 5k is ~5:15/km", () => {
    const p60 = oneHourPaceMsPerMeter({
      distanceM: 5000,
      timeMs: 25 * 60 * 1000,
    })!;
    closeTo(p60, 315.2, 0); // ms per meter ≈ 5:15 /km
    const boundaries = paceZoneBoundariesMsPerMeter({
      distanceM: 5000,
      timeMs: 25 * 60 * 1000,
    })!;
    expect(boundaries).toHaveLength(5);
    boundaries.forEach((b, i) => closeTo(b, p60 * [0.9, 1.0, 1.1, 1.25, 1.45][i], 6));
  });

  it("an unusable race result yields no boundaries (the honest null)", () => {
    expect(paceZoneBoundariesMsPerMeter(null)).toBeNull();
    expect(
      paceZoneBoundariesMsPerMeter({ distanceM: 0, timeMs: 1000 }),
    ).toBeNull();
  });

  it("the race presets carry their exact distances", () => {
    const byId = new Map(PACE_RACE_PRESETS.map((p) => [p.id, p.distanceM]));
    expect(byId.get("1mi")).toBeCloseTo(1609.344, 3);
    expect(byId.get("marathon")).toBe(42195);
  });
});

describe("zone membership — exact-at-limit", () => {
  const boundaries = [114, 133, 152, 171];

  it("a value exactly on a boundary opens the NEXT zone (floor-inclusive)", () => {
    expect(upperZoneIndexForValue(boundaries, 113.99)).toBe(1);
    expect(upperZoneIndexForValue(boundaries, 114)).toBe(2);
    expect(upperZoneIndexForValue(boundaries, 133)).toBe(3);
    expect(upperZoneIndexForValue(boundaries, 152)).toBe(4);
    expect(upperZoneIndexForValue(boundaries, 171)).toBe(5);
    expect(upperZoneIndexForValue(boundaries, 230)).toBe(5);
  });

  it("pace membership inverts: zone 1 is the slowest, zone 6 the fastest", () => {
    const b = [90, 100, 110, 125, 145]; // arbitrary ascending ms/m
    expect(paceZoneIndexForValue(b, 89)).toBe(6);
    expect(paceZoneIndexForValue(b, 90)).toBe(5);
    expect(paceZoneIndexForValue(b, 100)).toBe(4);
    expect(paceZoneIndexForValue(b, 125)).toBe(2);
    expect(paceZoneIndexForValue(b, 145)).toBe(1);
    expect(paceZoneIndexForValue(b, 400)).toBe(1);
  });
});

describe("guardrails — the documented Strava rules, adopted", () => {
  it("boundaries must strictly increase", () => {
    expect(validateHrBoundaries([114, 114, 152, 171], 190)).toBe(
      "not-ascending",
    );
    expect(validateHrBoundaries([180, 152, 152, 171], 190)).toBe(
      "not-ascending",
    );
    expect(validateHrBoundaries([114, 133, 152, 171], 190)).toBeNull();
  });

  it("adjacent boundaries differ by at least one unit", () => {
    expect(validateHrBoundaries([100, 100.5, 152, 171], 190)).toBe(
      "adjacent-gap",
    );
  });

  it("values stay inside the caps", () => {
    expect(validateHrBoundaries([50, 100, 150, 250], 190)).toBe("out-of-range");
    expect(validateMaxHr(231)).toBe("out-of-range");
    expect(validateMaxHr(59)).toBe("out-of-range");
    expect(validateMaxHr(190)).toBeNull();
    expect(validateFtp(10)).toBe("out-of-range");
    expect(validateFtp(501)).toBe("out-of-range");
    expect(validateFtp(200)).toBeNull();
    expect(validateStopSpeedMps(0.05)).toBe("out-of-range");
    expect(validateStopSpeedMps(6)).toBe("out-of-range");
    expect(validateStopSpeedMps(0.5)).toBeNull();
    expect(validateWeightKg(10)).toBe("out-of-range");
    expect(validateWeightKg(300)).toBe("out-of-range");
    expect(validateWeightKg(70)).toBeNull();
    expect(
      validateRaceResult({ distanceM: 5000, timeMs: 0 }),
    ).toBe("out-of-range");
    expect(
      validateRaceResult({ distanceM: 5000, timeMs: 90_000_000 }),
    ).toBe("out-of-range");
    expect(
      validateRaceResult({ distanceM: 5000, timeMs: 1_500_000 }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Time-in-zone over the real pipeline
// ---------------------------------------------------------------------------

describe("analyzeHrZones — endpoint-averaged legs, honest no-data", () => {
  it("attributes each leg's time to its endpoint-averaged zone", () => {
    // Legs average 120 (Z2), 145 (Z3), 167.5 (Z4) — 10 s each.
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, hr: 110 },
      { lat: LAT, lon: lonAt(1), time: 10_000, hr: 130 },
      { lat: LAT, lon: lonAt(2), time: 20_000, hr: 160 },
      { lat: LAT, lon: lonAt(3), time: 30_000, hr: 175 },
    ]);
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr)!;
    expect(analysis.zones.hasMetricData).toBe(true);
    expect(analysis.zones.hasTimingData).toBe(true);
    const byZone = new Map(analysis.zones.rows.map((r) => [r.zone, r.timeMs]));
    closeTo(byZone.get(2)!, 10_000);
    closeTo(byZone.get(3)!, 10_000);
    closeTo(byZone.get(4)!, 10_000);
    expect(byZone.get(1)).toBe(0);
    expect(byZone.get(5)).toBe(0);
    closeTo(analysis.zones.accountedMs, 30_000);
    closeTo(analysis.zones.movingMs, 30_000);
    expect(analysis.zones.noDataMs).toBe(0);
    // Σ shares = 1 (every sample lands somewhere).
    closeTo(
      analysis.zones.rows.reduce((sum, r) => sum + r.share, 0),
      1,
      9,
    );
  });

  it("an exact-at-boundary average opens the next zone", () => {
    // Leg average exactly 114 (the Z2 floor): the whole leg is Z2.
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, hr: 104 },
      { lat: LAT, lon: lonAt(1), time: 10_000, hr: 124 },
    ]);
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr)!;
    closeTo(analysis.zones.rows[1].timeMs, 10_000); // Z2
    closeTo(analysis.zones.rows[0].timeMs, 0); // Z1
  });

  it("legs missing hr at an endpoint count as no-data, never guessed", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, hr: 110 },
      { lat: LAT, lon: lonAt(1), time: 10_000 }, // no hr
      { lat: LAT, lon: lonAt(2), time: 20_000, hr: 160 },
    ]);
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr)!;
    closeTo(analysis.zones.noDataMs, 20_000); // BOTH legs lose their endpoint
    closeTo(analysis.zones.accountedMs, 0);
    closeTo(analysis.zones.movingMs, 20_000);
  });

  it("a metrics-free file reports no metric data (the honesty '—')", () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `<trk><name>T</name><trkseg>` +
      `<trkpt lat="0" lon="-0.02"><time>2024-05-01T07:00:00Z</time></trkpt>` +
      `<trkpt lat="0" lon="-0.012"><time>2024-05-01T07:00:10Z</time></trkpt>` +
      `</trkseg></trk>\n</gpx>\n`;
    const merge = mergeRepairs(parseXml(xml), [], TIMED);
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr)!;
    expect(analysis.zones.hasMetricData).toBe(false);
    expect(analysis.zones.hasTimingData).toBe(true);
    closeTo(analysis.zones.noDataMs, 10_000);
  });

  it("reconstructed stretches carry no metrics — no-data, disclosed", () => {
    // A GPX with a big time gap at leg 1→2, repaired by one drawn
    // vertex: the reconstructed points have no hr, so their legs fall
    // to no-data (the recorded legs keep their zones).
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `<trk><name>T</name><trkseg>` +
      `<trkpt lat="0" lon="-0.02"><time>2024-05-01T07:00:00Z</time></trkpt>` +
      `<trkpt lat="0" lon="-0.012"><time>2024-05-01T07:00:10Z</time></trkpt>` +
      `<trkpt lat="0" lon="0.012"><time>2024-05-01T07:30:00Z</time></trkpt>` +
      `<trkpt lat="0" lon="0.02"><time>2024-05-01T07:30:10Z</time></trkpt>` +
      `</trkseg></trk>\n</gpx>\n`;
    const data = parseXml(xml);
    const P = (i: number): PointId => `t0s0:${i}` as PointId;
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${P(1)}/${P(2)}` as GapId,
          beforePointId: P(1),
          afterPointId: P(2),
          vertices: [{ id: vertexId(1), lat: 0.001, lon: 0 }],
          resampleSpacingM: "off",
          timeStrategy: { kind: "distance-proportional" },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr)!;
    expect(analysis.zones.hasMetricData).toBe(false);
    expect(analysis.zones.noDataMs).toBeGreaterThan(0);
  });

  it("gap legs and untimed legs contribute nothing (the moving-time rule)", () => {
    // The 2→3 leg is a 300 s gap — over any default threshold.
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, hr: 110 },
      { lat: LAT, lon: lonAt(1), time: 10_000, hr: 130 },
      { lat: LAT, lon: lonAt(2), time: 310_000, hr: 160 },
      { lat: LAT, lon: lonAt(3), time: 320_000, hr: 175 },
    ]);
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr, {
      timeGapMs: 60_000,
    })!;
    closeTo(analysis.zones.accountedMs, 20_000);
    closeTo(analysis.zones.movingMs, 20_000);
  });
});

describe("analyzePowerZones", () => {
  it("buckets endpoint-averaged watts into the seven FTP zones", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, watts: 90 }, // avg 100 → Z1 (<110)
      { lat: LAT, lon: lonAt(1), time: 10_000, watts: 110 },
      { lat: LAT, lon: lonAt(2), time: 20_000, watts: 210 }, // avg 160 → Z3 [150,180)
      { lat: LAT, lon: lonAt(3), time: 30_000, watts: 260 }, // avg 235 → Z5 [200,240)
    ]);
    const analysis = analyzePowerZones(merge, { ftp: 200 })!;
    expect(analysis.zones.zoneCount).toBe(7);
    const byZone = new Map(analysis.zones.rows.map((r) => [r.zone, r.timeMs]));
    closeTo(byZone.get(1)!, 10_000);
    closeTo(byZone.get(3)!, 10_000);
    closeTo(byZone.get(5)!, 10_000);
    expect(byZone.get(7)).toBe(0);
  });
});

describe("analyzePaceZones — GAP-bucketed, race-gated", () => {
  it("without a race result the analysis is empty and honest", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, ele: 100 },
      { lat: LAT, lon: lonAt(1), time: 300_000, ele: 100 },
    ]);
    const analysis = analyzePaceZones(merge, { race: null })!;
    expect(analysis.boundaries).toBeNull();
    expect(analysis.zones.rows).toHaveLength(0);
    expect(analysis.zones.hasMetricData).toBe(false);
    expect(analysis.perSplit).toBeNull();
  });

  it("flat legs bucket by their actual pace (factor 1)", () => {
    // 5k in 25:00 → p60 ≈ 315.2 ms/m; Z4 = [315.2, 346.7).
    const L = legM();
    const race = { distanceM: 5000, timeMs: 1_500_000 };
    const legTime = Math.round(330 * L); // ms — a pace of ~330 ms/m, inside Z4
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, ele: 100 },
      { lat: LAT, lon: lonAt(1), time: legTime, ele: 100 },
      { lat: LAT, lon: lonAt(2), time: 2 * legTime, ele: 100 },
    ]);
    const analysis = analyzePaceZones(merge, { race })!;
    expect(analysis.boundaries).not.toBeNull();
    const byZone = new Map(analysis.zones.rows.map((r) => [r.zone, r.timeMs]));
    closeTo(byZone.get(4)!, 2 * legTime, 3);
  });

  it("an uphill leg reads at its flat equivalent — the GAP semantics", () => {
    // Same actual pace as the flat test, but climbing +5%: the GAP
    // pace drops by the Minetti factor and the leg lands a FASTER zone.
    const L = legM();
    const race = { distanceM: 5000, timeMs: 1_500_000 };
    const legTime = Math.round(450 * L); // ms — actual pace ~450 ms/m, Z2 flat
    const dEle = 0.05 * L;
    const grade = dEle / Math.sqrt(L * L - dEle * dEle);
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, ele: 100 },
      { lat: LAT, lon: lonAt(1), time: legTime, ele: 100 + dEle },
      { lat: LAT, lon: lonAt(2), time: 2 * legTime, ele: 100 + 2 * dEle },
    ]);
    const analysis = analyzePaceZones(merge, { race })!;
    const gapPacePerM = legTime / L / minettiGapFactor(grade);
    expect(gapPacePerM).toBeLessThan(346.7); // inside Z4's ceiling…
    expect(gapPacePerM).toBeGreaterThanOrEqual(315.2); // …and above its floor
    const byZone = new Map(analysis.zones.rows.map((r) => [r.zone, r.timeMs]));
    // The GAP pace (~345 ms/m) lands the legs in Z4 — not the actual
    // pace's Z2. The Strava semantics, on our curve.
    closeTo(byZone.get(4)!, 2 * legTime, 3);
    closeTo(byZone.get(2)!, 0, 6);
  });
});

describe("analyzeCadenceRanges", () => {
  it("buckets endpoint-averaged cadence into 10-unit ranges", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, cad: 82 },
      { lat: LAT, lon: lonAt(1), time: 10_000, cad: 88 }, // avg 85 → [80,90)
      { lat: LAT, lon: lonAt(2), time: 20_000, cad: 95 }, // avg 91.5 → [90,100)
    ]);
    const result = analyzeCadenceRanges(merge)!;
    expect(result.hasCadenceData).toBe(true);
    expect(CADENCE_RANGE_WIDTH).toBe(10);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].from).toBe(80);
    expect(result.rows[0].to).toBe(90);
    closeTo(result.rows[0].timeMs, 10_000);
    closeTo(result.rows[1].timeMs, 10_000);
    // The observed top bucket reads open.
    expect(result.rows[result.rows.length - 1].to).toBeNull();
  });

  it("no cadence → the honest empty result", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0 },
      { lat: LAT, lon: lonAt(1), time: 10_000 },
    ]);
    const result = analyzeCadenceRanges(merge)!;
    expect(result.hasCadenceData).toBe(false);
    expect(result.rows).toHaveLength(0);
    closeTo(result.noDataMs, 10_000);
  });
});

describe("per-split zone attribution", () => {
  it("attributes leg time to overlapped splits proportionally", () => {
    const L = legM();
    // hr averages 120 (Z2), 145 (Z3) on two legs; splits of 1.5 legs
    // → split 1 owns all of leg 1 + half of leg 2; split 2 the rest.
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, hr: 110 },
      { lat: LAT, lon: lonAt(1), time: 10_000, hr: 130 },
      { lat: LAT, lon: lonAt(2), time: 20_000, hr: 160 },
      { lat: LAT, lon: lonAt(3), time: 30_000, hr: 170 },
    ]);
    const splits = buildSplits(merge, { splitLengthM: 1.5 * L })!;
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr, {
      splits: splits.rows,
    })!;
    // Legs: L1 avg 120 → Z2 (10 s); L2 avg 145 → Z3 (10 s); L3 avg 165 → Z4.
    // Split 1 = [0, 1.5L): all of L1 + half of L2 → Z2 10 s, Z3 5 s.
    // Split 2 = [1.5L, 3L): half of L2 + all of L3 → Z3 5 s, Z4 10 s.
    expect(analysis.perSplit).not.toBeNull();
    const [s1, s2] = analysis.perSplit!;
    expect(s1.splitIndex).toBe(1);
    closeTo(s1.zoneTimesMs[1], 10_000, 3); // Z2
    closeTo(s1.zoneTimesMs[2], 5_000, 3); // Z3
    closeTo(s2.zoneTimesMs[2], 5_000, 3); // Z3
    closeTo(s2.zoneTimesMs[3], 10_000, 3); // Z4
    expect(s1.dominantZone).toBe(2);
    expect(s2.dominantZone).toBe(4);
    // Σ per-split zone times = the route-level zone times.
    const routeZ2 = analysis.zones.rows[1].timeMs;
    const sumZ2 = analysis.perSplit!.reduce((acc, r) => acc + r.zoneTimesMs[1], 0);
    closeTo(sumZ2, routeZ2, 3);
  });

  it("no splits provided → perSplit stays null", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, hr: 110 },
      { lat: LAT, lon: lonAt(1), time: 10_000, hr: 130 },
    ]);
    const analysis = analyzeHrZones(merge, DEFAULT_FITNESS_SETTINGS.hr)!;
    expect(analysis.perSplit).toBeNull();
    expect(analyzeHrZones(null, DEFAULT_FITNESS_SETTINGS.hr)).toBeNull();
    expect(analyzePowerZones(null, { ftp: 200 })).toBeNull();
    expect(analyzePaceZones(null, { race: null })).toBeNull();
    expect(analyzeCadenceRanges(null)).toBeNull();
  });
});
