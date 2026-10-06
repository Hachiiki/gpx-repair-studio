// @vitest-environment jsdom
/**
 * Minetti GAP goldens (Phase 23.6 verification): the curve's own
 * published values, the clamp, the leg helper, whole-run GAP, and the
 * per-split attribution through the REAL merge pipeline — with
 * hand-computed expectations on the equator-line geometry (equal Δlon
 * → bitwise-equal legs).
 */

import { describe, expect, it } from "vitest";
import {
  MINETTI_FLAT_COST_J_PER_KG_M,
  MINETTI_GRADE_CLAMP,
  gapSummary,
  legGapTimeMs,
  legGrade,
  minettiCost,
  minettiGapFactor,
} from "@/features/statistics/gap";
import { buildFitnessLegs } from "@/features/statistics/zones";
import {
  buildSplits,
  splitGapPaceMsPerMeter,
} from "@/features/statistics/splits";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { metricsMerge } from "./helpers/metricsTestUtils";

const closeTo = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);

/** Equator positions (the splits-test convention). */
const lonAt = (steps: number) => -0.02 + steps * 0.008;
const LAT = 0;

function legM(): number {
  return geodesicDistanceMeters(
    { lat: LAT, lon: lonAt(0) },
    { lat: LAT, lon: lonAt(1) },
  );
}

describe("minettiCost — the published curve", () => {
  it("C(0) is the flat cost 3.6 J·kg⁻¹·m⁻¹", () => {
    closeTo(minettiCost(0), 3.6, 12);
  });

  it("matches the polynomial at +10% and −10%", () => {
    // 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6, i = ±0.1
    closeTo(minettiCost(0.1), 5.968_214, 6);
    closeTo(minettiCost(-0.1), 2.151_706, 6);
  });

  it("clamps to the fit's ±45% measurement range", () => {
    expect(minettiCost(0.9)).toBe(minettiCost(MINETTI_GRADE_CLAMP));
    expect(minettiCost(-3)).toBe(minettiCost(-MINETTI_GRADE_CLAMP));
  });

  it("the factor is cost over flat cost (uphill > 1, downhill < 1)", () => {
    closeTo(minettiGapFactor(0), 1, 12);
    expect(minettiGapFactor(0.1)).toBeGreaterThan(1.6);
    expect(minettiGapFactor(-0.1)).toBeLessThan(0.61);
    closeTo(minettiGapFactor(0.1), minettiCost(0.1) / 3.6, 12);
  });

  it("the flat constant is exported for the disclosures", () => {
    expect(MINETTI_FLAT_COST_J_PER_KG_M).toBe(3.6);
  });
});

describe("legGrade / legGapTimeMs", () => {
  it("grade is Δele over HORIZONTAL distance", () => {
    closeTo(legGrade(100, 117.7, 887.6)!, 0.02, 3);
    expect(legGrade(undefined, 100, 887.6)).toBeNull();
    expect(legGrade(100, 110, 0)).toBeNull();
  });

  it("a leg without elevation passes through at factor 1", () => {
    expect(legGapTimeMs(10_000, 887.6, undefined, 100)).toEqual({
      gapMs: 10_000,
      graded: false,
    });
  });

  it("an uphill leg's flat-equivalent time is shorter", () => {
    const L = legM();
    // +2% grade over one equator leg (grade over horizontal distance).
    const dEle = 0.02 * L;
    const grade = dEle / Math.sqrt(L * L - dEle * dEle);
    const { gapMs, graded } = legGapTimeMs(380_000, L, 100, 100 + dEle);
    expect(graded).toBe(true);
    expect(gapMs).toBeLessThan(380_000);
    closeTo(gapMs, 380_000 / minettiGapFactor(grade), 6);
  });

  it("a downhill leg's flat-equivalent time is longer", () => {
    const { gapMs, graded } = legGapTimeMs(380_000, 887.6, 117.7, 100);
    expect(graded).toBe(true);
    expect(gapMs).toBeGreaterThan(380_000);
  });
});

describe("gapSummary — whole-run GAP", () => {
  const L = legM();

  it("flat route: GAP equals actual pace", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), ele: 100, time: 300_000 },
      { lat: LAT, lon: lonAt(2), ele: 100, time: 600_000 },
    ]);
    const gap = gapSummary(merge)!;
    expect(gap.hasTimingData).toBe(true);
    expect(gap.hasElevationData).toBe(true);
    expect(gap.gradedLegs).toBe(2);
    expect(gap.flatLegs).toBe(0);
    closeTo(gap.gapPaceMsPerMeter!, 600_000 / (2 * L), 6);
    closeTo(gap.actualPaceMsPerMeter!, 600_000 / (2 * L), 6);
  });

  it("uphill then downhill route: GAP faster than actual uphill time", () => {
    // Leg 1 climbs +2% (factor > 1), leg 2 descends −2% (factor < 1):
    // the flat-equivalent total is closer to flat than the actual total.
    const dEle = 0.02 * L;
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), ele: 100 + dEle, time: 380_000 },
      { lat: LAT, lon: lonAt(2), ele: 100, time: 700_000 },
    ]);
    const gap = gapSummary(merge)!;
    const grade = dEle / Math.sqrt(L * L - dEle * dEle);
    const up = minettiGapFactor(grade);
    const down = minettiGapFactor(-grade);
    closeTo(gap.gapTimeMs, 380_000 / up + 320_000 / down, 3);
    closeTo(gap.movingMs, 700_000, 6);
    closeTo(gap.distanceM, 2 * L, 6);
  });

  it("legs missing elevation count at the flat cost and are tallied", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), time: 300_000 }, // no ele on this endpoint
      { lat: LAT, lon: lonAt(2), ele: 100, time: 600_000 },
    ]);
    const gap = gapSummary(merge)!;
    expect(gap.gradedLegs).toBe(0);
    expect(gap.flatLegs).toBe(2);
    closeTo(gap.gapTimeMs, 600_000, 6);
  });

  it("the shared fitness walk's GAP block equals the standalone summary", () => {
    // The hook reads walk.gap; gapSummary is the standalone API — the
    // two must agree exactly (one definition of honesty).
    const dEle = 0.02 * legM();
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), ele: 100 + dEle, time: 380_000 },
      { lat: LAT, lon: lonAt(2), ele: 100, time: 700_000, hr: 150, cad: 88 },
    ]);
    const walk = buildFitnessLegs(merge, { timeGapMs: 60_000 })!;
    const standalone = gapSummary(merge, { timeGapMs: 60_000 })!;
    expect(walk.gap).toEqual(standalone);
  });

  it("an untimed route has no GAP pace (the honest null)", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100 },
      { lat: LAT, lon: lonAt(1), ele: 102 },
      { lat: LAT, lon: lonAt(2), ele: 104 },
    ]);
    const gap = gapSummary(merge)!;
    expect(gap.hasTimingData).toBe(false);
    expect(gap.gapPaceMsPerMeter).toBeNull();
    expect(gapSummary(null)).toBeNull();
  });
});

describe("buildSplits — per-split GAP attribution (23.6)", () => {
  const L = legM();

  it("attributes flat-equivalent time exactly like time", () => {
    const dEle = 0.02 * L;
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), ele: 100 + dEle, time: 380_000 },
      { lat: LAT, lon: lonAt(2), ele: 100 + 2 * dEle, time: 760_000 },
    ]);
    const splits = buildSplits(merge, { splitLengthM: L })!;
    expect(splits.hasGradeData).toBe(true);
    expect(splits.rows).toHaveLength(2);
    const grade = dEle / Math.sqrt(L * L - dEle * dEle);
    const factor = minettiGapFactor(grade);
    closeTo(splits.rows[0].gapTimeMs, 380_000 / factor, 3);
    closeTo(splits.rows[1].gapTimeMs, 380_000 / factor, 3);
    closeTo(splits.totalGapTimeMs, 760_000 / factor, 3);
    // GAP pace per split is the flat-equivalent over distance.
    closeTo(splitGapPaceMsPerMeter(splits.rows[0])!, (380_000 / factor) / L, 3);
    expect(splits.gapEstimated).toBe(false);
  });

  it("unelevated routes report no grade data (the column stays hidden)", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0 },
      { lat: LAT, lon: lonAt(1), time: 300_000 },
    ]);
    const splits = buildSplits(merge, { splitLengthM: L })!;
    expect(splits.hasGradeData).toBe(false);
    // Untimed legs keep factor 1 (flat assumption), tallied honestly.
    expect(splits.gapFlatLegs).toBe(1);
    closeTo(splits.rows[0].gapTimeMs, 300_000, 6);
  });
});
