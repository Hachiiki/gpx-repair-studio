// @vitest-environment jsdom
/**
 * Calorie-estimate goldens (the Phase 23 amendment's verification):
 * the power formula (trapezoid watts ÷ 24% efficiency), the metabolic
 * Minetti integral, the opt-in gate, and the honest no-data cases.
 */

import { describe, expect, it } from "vitest";
import {
  HUMAN_EFFICIENCY,
  JOULES_PER_KCAL,
  caloriesEstimate,
} from "@/features/statistics/calories";
import { minettiCost } from "@/features/statistics/gap";
import { metricsMerge } from "./helpers/metricsTestUtils";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";

const closeTo = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);

const lonAt = (steps: number) => -0.02 + steps * 0.008;
const LAT = 0;
const legM = (): number =>
  geodesicDistanceMeters(
    { lat: LAT, lon: lonAt(0) },
    { lat: LAT, lon: lonAt(1) },
  );

describe("caloriesEstimate — the opt-in gate", () => {
  it("never appears uninvited (enabled: false → null)", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, watts: 200 },
      { lat: LAT, lon: lonAt(1), time: 10_000, watts: 200 },
    ]);
    expect(caloriesEstimate(merge, { enabled: false, weightKg: 70 })).toBeNull();
    expect(caloriesEstimate(null, { enabled: true, weightKg: 70 })).toBeNull();
  });

  it("the metabolic estimate needs a weight (the honest null)", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, ele: 100 },
      { lat: LAT, lon: lonAt(1), time: 300_000, ele: 100 },
    ]);
    expect(
      caloriesEstimate(merge, { enabled: true, weightKg: null }),
    ).toBeNull();
  });
});

describe("caloriesEstimate — the power formula", () => {
  it("integrates trapezoid watts over moving time at 24% efficiency", () => {
    // 60 s at a constant 200 W: E = 12_000 J / 0.24 = 50_000 J.
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, watts: 200 },
      { lat: LAT, lon: lonAt(1), time: 10_000, watts: 200 },
      { lat: LAT, lon: lonAt(2), time: 20_000, watts: 200 },
      { lat: LAT, lon: lonAt(3), time: 30_000, watts: 200 },
      { lat: LAT, lon: lonAt(4), time: 40_000, watts: 200 },
      { lat: LAT, lon: lonAt(5), time: 50_000, watts: 200 },
      { lat: LAT, lon: lonAt(6), time: 60_000, watts: 200 },
    ]);
    const estimate = caloriesEstimate(merge, {
      enabled: true,
      weightKg: 70,
    })!;
    expect(estimate.kind).toBe("power");
    closeTo(estimate.kcal, 50_000 / JOULES_PER_KCAL, 6);
    closeTo(estimate.averageWatts!, 200, 6);
    closeTo(estimate.powerSeconds!, 60, 6);
    expect(HUMAN_EFFICIENCY).toBe(0.24);
  });

  it("gap legs are excluded (power during them is unknown, never zero-filled)", () => {
    // 10 s at 200 W, then a 300 s gap, then 10 s at 200 W.
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0, watts: 200 },
      { lat: LAT, lon: lonAt(1), time: 10_000, watts: 200 },
      { lat: LAT, lon: lonAt(2), time: 310_000, watts: 200 },
      { lat: LAT, lon: lonAt(3), time: 320_000, watts: 200 },
    ]);
    const estimate = caloriesEstimate(
      merge,
      { enabled: true, weightKg: 70 },
      { timeGapMs: 60_000 },
    )!;
    expect(estimate.kind).toBe("power");
    closeTo(estimate.kcal, 4_000 / 0.24 / JOULES_PER_KCAL, 6);
    closeTo(estimate.powerSeconds!, 20, 6);
  });
});

describe("caloriesEstimate — the metabolic (running) model", () => {
  it("a flat route is weight × 3.6 J·kg⁻¹·m⁻¹ × distance", () => {
    const L = legM();
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), ele: 100, time: 300_000 },
      { lat: LAT, lon: lonAt(2), ele: 100, time: 600_000 },
      { lat: LAT, lon: lonAt(3), ele: 100, time: 900_000 },
    ]);
    const estimate = caloriesEstimate(merge, {
      enabled: true,
      weightKg: 70,
    })!;
    expect(estimate.kind).toBe("metabolic");
    closeTo(estimate.distanceM!, 3 * L, 6);
    closeTo(estimate.kcal, (70 * 3.6 * 3 * L) / JOULES_PER_KCAL, 3);
    closeTo(estimate.weightKg!, 70, 6);
    expect(estimate.gradedLegs).toBe(3);
    expect(estimate.flatLegs).toBe(0);
  });

  it("climbing costs more than flat (the Minetti integral)", () => {
    const L = legM();
    const dEle = 0.05 * L;
    const flat = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), ele: 100, time: 300_000 },
    ]);
    const climb = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), ele: 100 + dEle, time: 300_000 },
    ]);
    const flatKcal = caloriesEstimate(flat, { enabled: true, weightKg: 70 })!
      .kcal;
    const climbKcal = caloriesEstimate(climb, { enabled: true, weightKg: 70 })!
      .kcal;
    expect(climbKcal).toBeGreaterThan(flatKcal);
    closeTo(
      climbKcal,
      (70 * minettiCost(0.05 / Math.sqrt(1 - 0.05 * 0.05)) * L) /
        JOULES_PER_KCAL,
      3,
    );
  });

  it("legs without elevation count at the flat cost and are tallied", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0 },
      { lat: LAT, lon: lonAt(1), time: 300_000 }, // no ele
      { lat: LAT, lon: lonAt(2), ele: 100, time: 600_000 },
    ]);
    const estimate = caloriesEstimate(merge, {
      enabled: true,
      weightKg: 70,
    })!;
    expect(estimate.flatLegs).toBe(2);
    expect(estimate.gradedLegs).toBe(0);
    const L = legM();
    closeTo(estimate.kcal, (70 * 3.6 * 2 * L) / JOULES_PER_KCAL, 3);
  });

  it("an untimed route still estimates (distance carries the energy)", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100 },
      { lat: LAT, lon: lonAt(1), ele: 100 },
    ]);
    const estimate = caloriesEstimate(merge, {
      enabled: true,
      weightKg: 70,
    })!;
    expect(estimate.kind).toBe("metabolic");
    closeTo(estimate.kcal, (70 * 3.6 * legM()) / JOULES_PER_KCAL, 3);
  });
});
