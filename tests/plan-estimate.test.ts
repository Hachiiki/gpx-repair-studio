/**
 * Unit tests — the plan section's pure estimation math
 * (features/plan/estimate.ts).
 *
 * The planner's numbers are the feature: distance over the rendered
 * join, the crow-flies comparison, and the pace/speed/split arithmetic
 * a user-entered time implies. These tests pin the arithmetic with
 * hand-checkable numbers (the §L-1 conventions the whole app shares)
 * and the honesty "undefined/null" contracts.
 */

import { describe, expect, it } from "vitest";
import {
  crowFliesDistanceM,
  detourFactor,
  planElevationSignature,
  planJoin,
  plannedPaceMsPerUnit,
  plannedSplits,
  plannedSpeedKmh,
  plannedTail,
} from "@/features/plan/estimate";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { DrawVertex, RoadLeg } from "@/types/domain";
import { vertexId } from "@/types/ids";

function vertex(lat: number, lon: number, seq: number): DrawVertex {
  return { id: vertexId(seq), lat, lon };
}

/** A road leg with a straight-line interior a→b (a synthetic resolved leg). */
function syntheticLeg(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  interior: { lat: number; lon: number }[],
): RoadLeg {
  return {
    a,
    b,
    coordinates: [
      [a.lon, a.lat],
      ...interior.map((point) => [point.lon, point.lat] as [number, number]),
      [b.lon, b.lat],
    ],
    routeDistanceM: 0,
  };
}

describe("planJoin — the rendered route with cumulative distances", () => {
  it("is empty for no vertices and single-point for one", () => {
    expect(planJoin([], [], "off").points).toHaveLength(0);
    const single = planJoin([vertex(52.52, 13.405, 1)], [], "off");
    expect(single.points).toHaveLength(1);
    expect(single.points[0].cumDistanceM).toBe(0);
    expect(single.distanceM).toBe(0);
  });

  it("walks the straight-line join and accumulates geodesic distance", () => {
    const join = planJoin(
      [vertex(52.52, 13.405, 1), vertex(52.53, 13.405, 2)],
      [],
      "off",
    );
    expect(join.points).toHaveLength(2);
    const expected = geodesicDistanceMeters(
      { lat: 52.52, lon: 13.405 },
      { lat: 52.53, lon: 13.405 },
    );
    expect(join.distanceM).toBeCloseTo(expected, 6);
    expect(join.points[1].cumDistanceM).toBeCloseTo(expected, 6);
  });

  it("stitches a resolved road leg's interior into the chain", () => {
    const a = { lat: 52.52, lon: 13.405 };
    const b = { lat: 52.53, lon: 13.405 };
    const mid = { lat: 52.525, lon: 13.407 };
    const legs = [syntheticLeg(a, b, [mid])];
    const join = planJoin(
      [vertex(a.lat, a.lon, 1), vertex(b.lat, b.lon, 2)],
      legs,
      "car",
    );
    // a → mid → b: the interior participates in the cumulative walk.
    expect(join.points).toHaveLength(3);
    expect(join.points[1]).toMatchObject({ lat: mid.lat, lon: mid.lon });
    expect(join.distanceM).toBeCloseTo(
      geodesicDistanceMeters(a, mid) + geodesicDistanceMeters(mid, b),
      6,
    );
  });

  it("runs the curve style through the local spline (more than the nodes)", () => {
    const join = planJoin(
      [
        vertex(52.52, 13.405, 1),
        vertex(52.525, 13.41, 2),
        vertex(52.53, 13.405, 3),
      ],
      [],
      "curve",
    );
    // The spline contributes interior points between the clicked nodes.
    expect(join.points.length).toBeGreaterThan(3);
    // The endpoints survive exactly (the user's data).
    expect(join.points[0]).toMatchObject({ lat: 52.52, lon: 13.405 });
    expect(join.points[join.points.length - 1]).toMatchObject({
      lat: 52.53,
      lon: 13.405,
    });
    // Cumulative distances stay monotonic.
    for (let i = 1; i < join.points.length; i += 1) {
      expect(join.points[i].cumDistanceM).toBeGreaterThanOrEqual(
        join.points[i - 1].cumDistanceM,
      );
    }
  });
});

describe("crow-flies comparison", () => {
  it("has no span below two points", () => {
    expect(crowFliesDistanceM(planJoin([], [], "off"))).toBeNull();
    expect(
      crowFliesDistanceM(planJoin([vertex(52.52, 13.405, 1)], [], "off")),
    ).toBeNull();
  });

  it("is the geodesic start-to-finish line, not the path", () => {
    // An L-shaped route: path = two legs, crow = the diagonal.
    const join = planJoin(
      [
        vertex(52.52, 13.405, 1),
        vertex(52.53, 13.405, 2),
        vertex(52.53, 13.42, 3),
      ],
      [],
      "off",
    );
    const crow = crowFliesDistanceM(join);
    expect(crow).not.toBeNull();
    expect(crow!).toBeLessThan(join.distanceM);
    expect(crow!).toBeCloseTo(
      geodesicDistanceMeters({ lat: 52.52, lon: 13.405 }, { lat: 52.53, lon: 13.42 }),
      6,
    );
    const detour = detourFactor(join);
    expect(detour).not.toBeNull();
    expect(detour!).toBeCloseTo(join.distanceM / crow!, 6);
  });

  it("refuses the detour factor for loops (zero crow flight)", () => {
    const join = planJoin(
      [
        vertex(52.52, 13.405, 1),
        vertex(52.53, 13.41, 2),
        vertex(52.52, 13.405, 3),
      ],
      [],
      "off",
    );
    expect(crowFliesDistanceM(join)).toBe(0);
    expect(detourFactor(join)).toBeNull();
  });
});

describe("planned pace, speed, splits, tail", () => {
  it("computes the pace from a time over a distance (§L-1 arithmetic)", () => {
    // 30 minutes over 5 km → 6:00 /km (360,000 ms per km).
    expect(plannedPaceMsPerUnit(1_800_000, 5000, "km")).toBe(360_000);
    // The same effort in min/mi: 30 min / 3.106856 mi.
    expect(plannedPaceMsPerUnit(1_800_000, 5000, "mi")).toBeCloseTo(
      (1_800_000 / 5000) * 1609.344,
      6,
    );
    // Speed: 5 km in 0.5 h → 10 km/h.
    expect(plannedSpeedKmh(1_800_000, 5000)).toBeCloseTo(10, 9);
  });

  it("is undefined for unusable inputs (the honesty —)", () => {
    expect(plannedPaceMsPerUnit(null, 5000, "km")).toBeUndefined();
    expect(plannedPaceMsPerUnit(0, 5000, "km")).toBeUndefined();
    expect(plannedPaceMsPerUnit(1_800_000, 0, "km")).toBeUndefined();
    expect(plannedSpeedKmh(null, 5000)).toBeUndefined();
    expect(plannedSpeedKmh(1_800_000, 0)).toBeUndefined();
  });

  it("builds the even-pace split table for whole units", () => {
    // 32:35 over 5.23 km → five whole-km splits at even pace.
    const splits = plannedSplits(1_955_000, 5230, "km");
    expect(splits).toHaveLength(5);
    const pacePerMeter = 1_955_000 / 5230;
    expect(splits[0]).toEqual({
      unit: 1,
      distanceM: 1000,
      elapsedMs: Math.round(1000 * pacePerMeter),
    });
    expect(splits[4].distanceM).toBe(5000);
    // The elapsed time grows linearly with distance.
    expect(splits[4].elapsedMs).toBeCloseTo(5 * splits[0].elapsedMs, -2);
  });

  it("has no splits below one whole unit or with unusable inputs", () => {
    expect(plannedSplits(1_800_000, 900, "km")).toEqual([]);
    expect(plannedSplits(null, 5000, "km")).toEqual([]);
    expect(plannedSplits(1_800_000, 0, "km")).toEqual([]);
  });

  it("tails the final partial unit with the end time", () => {
    // 5.23 km → a 230 m tail; the end time is the whole entered time.
    const tail = plannedTail(1_955_000, 5230, "km");
    expect(tail).not.toBeNull();
    expect(tail!.distanceM).toBeCloseTo(230, 6);
    expect(tail!.elapsedMsAtEnd).toBe(1_955_000);
    // A route of exactly whole units has no tail.
    expect(plannedTail(1_800_000, 5000, "km")).toBeNull();
    expect(plannedTail(null, 5230, "km")).toBeNull();
  });

  it("splits in miles when the unit says so", () => {
    // 10 km is 6.21 mi → six whole-mile splits.
    const splits = plannedSplits(3_600_000, 10_000, "mi");
    expect(splits).toHaveLength(6);
    expect(splits[0].distanceM).toBeCloseTo(1609.344, 3);
  });
});

describe("planElevationSignature — the freshness signature", () => {
  it("moves with the road legs, the path style, and the session token", () => {
    const a = { lat: 52.52, lon: 13.405 };
    const b = { lat: 52.53, lon: 13.405 };
    const base = planElevationSignature([], "off", 0);
    expect(planElevationSignature([], "off", 0)).toBe(base);

    const withLeg = planElevationSignature([syntheticLeg(a, b, [])], "off", 0);
    expect(withLeg).not.toBe(base);
    expect(planElevationSignature([], "car", 0)).not.toBe(base);
    expect(planElevationSignature([], "off", 1)).not.toBe(base);
  });
});
