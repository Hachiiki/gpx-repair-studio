/**
 * Unit tests — features/elevation/smoothing.ts (§N-1: hysteresis on
 * synthetic noisy ramps; smoothing window).
 *
 * Hand-computed scenarios pin the two behaviors the statistics depend
 * on: sub-threshold noise contributes NOTHING, and committed excursions
 * accrue in full.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_HYSTERESIS_THRESHOLD_M,
  hysteresisGainLoss,
  movingAverage,
} from "@/features/elevation/smoothing";

describe("hysteresisGainLoss", () => {
  it("returns zero for empty and single-point series", () => {
    expect(hysteresisGainLoss([])).toEqual({ gainM: 0, lossM: 0 });
    expect(hysteresisGainLoss([100])).toEqual({ gainM: 0, lossM: 0 });
  });

  it("treats sub-threshold noise as flat (the SRTM noise case)", () => {
    // ±1.5 m wander around 100 — never 2 m from the reference.
    const noisy = [100, 101.5, 99, 100.5, 98.8, 100.2, 99.5, 100];
    expect(hysteresisGainLoss(noisy, 2)).toEqual({ gainM: 0, lossM: 0 });
  });

  it("accrues a monotonic climb, dropping the sub-threshold residual", () => {
    // 0 → 100 in 1 m steps: gain commits in 2 m chunks from each new
    // reference; the last partial (< 2 m) is dropped.
    const climb = Array.from({ length: 101 }, (_, i) => i);
    const { gainM, lossM } = hysteresisGainLoss(climb, 2);
    expect(lossM).toBe(0);
    expect(gainM).toBeGreaterThanOrEqual(98);
    expect(gainM).toBeLessThanOrEqual(100);
  });

  it("accrues a monotonic descent as loss", () => {
    const descent = Array.from({ length: 51 }, (_, i) => 50 - i);
    const { gainM, lossM } = hysteresisGainLoss(descent, 2);
    expect(gainM).toBe(0);
    expect(lossM).toBeGreaterThanOrEqual(48);
    expect(lossM).toBeLessThanOrEqual(50);
  });

  it("counts real switchbacks in full (climb AND descend)", () => {
    // Repeated +3/−3 around 100: every step crosses the threshold both
    // ways. Ten (100, 103) pairs: ten climbs of 3, nine descents of 3
    // (the opening 100 only sets the reference).
    const switchbacks: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      switchbacks.push(100, 103);
    }
    const { gainM, lossM } = hysteresisGainLoss(switchbacks, 2);
    expect(gainM).toBeCloseTo(30, 6); // 10 × 3 up
    expect(lossM).toBeCloseTo(27, 6); // 9 × 3 down
  });

  it("commits exactly at the threshold (boundary is inclusive)", () => {
    expect(hysteresisGainLoss([100, 102], 2)).toEqual({ gainM: 2, lossM: 0 });
    expect(hysteresisGainLoss([100, 98], 2)).toEqual({ gainM: 0, lossM: 2 });
    expect(hysteresisGainLoss([100, 101.999], 2)).toEqual({ gainM: 0, lossM: 0 });
  });

  it("keeps accumulating an excursion against the same reference", () => {
    // 1 m drifts that ADD UP: the commit happens at 102 (net +2 from the
    // reference); the trailing 1 m stays in the noise band — deadband
    // semantics, not a running sum.
    const drift = [100, 101, 102, 103];
    const { gainM } = hysteresisGainLoss(drift, 2);
    expect(gainM).toBeCloseTo(2, 6);
  });

  it("skips undefined entries and continues from the last reference", () => {
    // Climb 100 → 103, hole, then 105: total gain 5 (the hole contributes
    // nothing but does not reset the integrator).
    const withHole = [100, 103, undefined, 105] as (number | undefined)[];
    expect(hysteresisGainLoss(withHole, 2)).toEqual({ gainM: 5, lossM: 0 });
  });

  it("skips non-finite values defensively", () => {
    // NaN/Infinity are holes: gain comes only from 100 → 103; the final
    // 104 is 1 m off the new reference (noise band).
    const junk = [100, Number.NaN, 103, Infinity, 104] as never[];
    expect(hysteresisGainLoss(junk, 2)).toEqual({ gainM: 3, lossM: 0 });
  });

  it("defaults to the 2.0 m threshold", () => {
    expect(DEFAULT_HYSTERESIS_THRESHOLD_M).toBe(2);
    expect(hysteresisGainLoss([100, 101.5]).gainM).toBe(0);
  });
});

describe("movingAverage (display-only smoothing)", () => {
  it("is the identity for window <= 1", () => {
    const values = [1, undefined, 3, 5];
    expect(movingAverage(values, 1)).toEqual(values);
    expect(movingAverage(values, 0)).toEqual(values);
  });

  it("averages the centered window over defined neighbors", () => {
    // Window 5, all defined: each output is the mean of ±2 neighbors.
    const out = movingAverage([0, 0, 30, 0, 0], 5);
    expect(out[0]).toBeCloseTo(10, 6); // (0+0+30)/3 — clamped left edge
    expect(out[2]).toBeCloseTo(6, 6); // mean of all five
    expect(out[4]).toBeCloseTo(10, 6); // clamped right edge
  });

  it("preserves holes as holes", () => {
    const out = movingAverage([1, undefined, 3], 5);
    expect(out[1]).toBeUndefined();
    expect(out[0]).toBeCloseTo(2, 6); // defined neighbors only
  });

  it("averages only the defined values inside the window", () => {
    // Window 5 centers on ±2: index 0 sees [10,·,·] → 10; index 3 sees
    // [·,·,20] → 20. The distant 20 is NOT in index 0's window.
    const out = movingAverage([10, undefined, undefined, 20], 5);
    expect(out[0]).toBeCloseTo(10, 6);
    expect(out[3]).toBeCloseTo(20, 6);
  });

  it("smooths a ramp toward its local trend", () => {
    const ramp = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = movingAverage(ramp, 5);
    // Interior points of a linear ramp are unchanged by averaging.
    for (let i = 2; i < ramp.length - 2; i += 1) {
      expect(out[i]).toBeCloseTo(ramp[i], 9);
    }
    // Edges pull inward (fewer neighbors).
    expect(out[0]).toBeCloseTo(1, 9);
    expect(out[9]).toBeCloseTo(8, 9);
  });

  it("handles an all-undefined series", () => {
    expect(movingAverage([undefined, undefined])).toEqual([
      undefined,
      undefined,
    ]);
  });
});
