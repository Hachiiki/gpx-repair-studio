/**
 * Unit tests — features/elevation/samples.ts (Phase 6): the per-gap cap
 * sampling, cumulative-distance interpolation, road-leg signature, and
 * the per-gap summary.
 */

import { describe, expect, it } from "vitest";
import {
  ELEVATION_POINT_CAP,
  gapElevationSummary,
  interpolateSample,
  pickFetchPoints,
  roadLegsSignature,
  type ElevationSample,
} from "@/features/elevation/samples";
import type { RoadLeg } from "@/types/domain";

describe("pickFetchPoints (per-gap cap, §K-2)", () => {
  it("returns the input unchanged at or under the cap", () => {
    const interior = Array.from({ length: ELEVATION_POINT_CAP }, (_, i) => i);
    expect(pickFetchPoints(interior)).toBe(interior);
    expect(pickFetchPoints([])).toEqual([]);
  });

  it("decimates above the cap, keeping the count at or under it", () => {
    const interior = Array.from({ length: 1000 }, (_, i) => i);
    const picked = pickFetchPoints(interior);
    expect(picked.length).toBeLessThanOrEqual(ELEVATION_POINT_CAP);
    expect(picked.length).toBeGreaterThan(300); // stride 3 → ~334
    // Strictly ascending, first kept, last kept.
    expect(picked[0]).toBe(0);
    expect(picked[picked.length - 1]).toBe(999);
    for (let i = 1; i < picked.length; i += 1) {
      expect(picked[i]).toBeGreaterThan(picked[i - 1]);
    }
  });

  it("never lets the last point be dropped by the stride", () => {
    // 801 points: stride 3 lands on 798, but 800 must be kept — the
    // replacement keeps the cap while bracketing the chain end.
    const interior = Array.from({ length: 801 }, (_, i) => i);
    const picked = pickFetchPoints(interior);
    expect(picked[picked.length - 1]).toBe(800);
    expect(picked.length).toBeLessThanOrEqual(ELEVATION_POINT_CAP);
  });
});

describe("interpolateSample", () => {
  const samples: ElevationSample[] = [
    { cumDistanceM: 0, ele: 10 },
    { cumDistanceM: 100, ele: 20 },
    { cumDistanceM: 200, ele: 40 },
  ];

  it("returns the sampled value at exact hits (method elevation-api)", () => {
    expect(interpolateSample(samples, 0)).toEqual({
      value: 10,
      method: "elevation-api",
    });
    expect(interpolateSample(samples, 100)).toEqual({
      value: 20,
      method: "elevation-api",
    });
  });

  it("linearly interpolates between samples (method interpolated)", () => {
    expect(interpolateSample(samples, 50)).toEqual({
      value: 15,
      method: "interpolated",
    });
    expect(interpolateSample(samples, 150)).toEqual({
      value: 30,
      method: "interpolated",
    });
    expect(interpolateSample(samples, 175)).toEqual({
      value: 35,
      method: "interpolated",
    });
  });

  it("clamps to the end samples outside the sampled span", () => {
    expect(interpolateSample(samples, -10)).toEqual({
      value: 10,
      method: "elevation-api",
    });
    expect(interpolateSample(samples, 500)).toEqual({
      value: 40,
      method: "elevation-api",
    });
  });

  it("is total for degenerate inputs", () => {
    expect(interpolateSample([], 50)).toBeUndefined();
    expect(interpolateSample([{ cumDistanceM: 10, ele: 7 }], 50)).toEqual({
      value: 7,
      method: "elevation-api",
    });
    // Zero-width span between two samples: the first (left clamp) wins.
    expect(
      interpolateSample(
        [
          { cumDistanceM: 10, ele: 7 },
          { cumDistanceM: 10, ele: 9 },
        ],
        10,
      ),
    ).toEqual({ value: 7, method: "elevation-api" });
  });

  it("uses binary search correctly on long sample lists", () => {
    const many: ElevationSample[] = Array.from({ length: 1000 }, (_, i) => ({
      cumDistanceM: i * 10,
      ele: i,
    }));
    expect(interpolateSample(many, 5555)).toEqual({
      value: 555.5,
      method: "interpolated",
    });
  });
});

describe("roadLegsSignature", () => {
  const leg = (aLat: number, coords = 3): RoadLeg => ({
    a: { lat: aLat, lon: 13.4 },
    b: { lat: 52.53, lon: 13.41 },
    coordinates: Array.from({ length: coords }, () => [13.4, 52.52]) as [
      number,
      number,
    ][],
    routeDistanceM: 100,
  });

  it("maps the empty set to a constant", () => {
    expect(roadLegsSignature([])).toBe("none");
  });

  it("is stable for identical legs and sensitive to every input", () => {
    const legs = [leg(52.52), leg(52.54, 5)];
    expect(roadLegsSignature(legs)).toBe(roadLegsSignature([leg(52.52), leg(52.54, 5)]));
    expect(roadLegsSignature(legs)).not.toBe(roadLegsSignature([leg(52.52)]));
    expect(roadLegsSignature(legs)).not.toBe(
      roadLegsSignature([leg(52.525), leg(52.54, 5)]),
    );
    expect(roadLegsSignature(legs)).not.toBe(
      roadLegsSignature([leg(52.52), leg(52.54, 4)]),
    );
  });

  it("rounds below the signature grid (5 dp ≈ 1.1 m)", () => {
    const base = roadLegsSignature([leg(52.520001)]);
    const jittered = roadLegsSignature([leg(52.5200004)]);
    expect(base).toBe(jittered);
  });
});

describe("gapElevationSummary", () => {
  it("summarizes min/max and hysteresis gain/loss of the samples", () => {
    const samples: ElevationSample[] = [
      { cumDistanceM: 0, ele: 100 },
      { cumDistanceM: 10, ele: 110 },
      { cumDistanceM: 20, ele: 104 },
      { cumDistanceM: 30, ele: 112 },
    ];
    const summary = gapElevationSummary(samples, 2);
    // Gain: 100→110 (+10), 104→112 (+8) = 18; loss: 110→104 (−6).
    expect(summary).not.toBeNull();
    expect(summary!.minEleM).toBe(100);
    expect(summary!.maxEleM).toBe(112);
    expect(summary!.gainM).toBeCloseTo(18, 6);
    expect(summary!.lossM).toBeCloseTo(6, 6);
  });

  it("returns null for empty or all-non-finite samples", () => {
    expect(gapElevationSummary([], 2)).toBeNull();
    expect(
      gapElevationSummary([{ cumDistanceM: 0, ele: Number.NaN }], 2),
    ).toBeNull();
  });
});
