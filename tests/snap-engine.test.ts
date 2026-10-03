/**
 * Unit tests — snapEngine (§EE 17.3, the whole-line snap's pure half).
 *
 * The contract:
 *   - request waypoints: endpoints kept, count bounded, shape kept;
 *   - monotone waypoint matching (the provider snaps waypoints onto
 *     roads, so matches are NEAR — never exact);
 *   - slicing the routed geometry back into per-pair legs (the SAME
 *     RoadLeg vocabulary the renderer joins — WYSIWYG preview);
 *   - the applied waypoints: the routed geometry reduced to the
 *     vertex cap, Douglas-Peucker with endpoints pinned;
 *   - the preview numbers: the drawn chain's RENDERED length vs the
 *     routed chain's rendered length (the badge's own join);
 *   - the apply plan: waypoints + legs for the NEW pairs.
 */

import { describe, expect, it } from "vitest";
import {
  appliedWaypoints,
  matchWaypointIndices,
  planSnapApply,
  requestWaypoints,
  sliceRoutedPolyline,
  snapPreviewNumbers,
  snapProfileLabel,
} from "@/features/reconstruction/snapEngine";
import { MAX_VERTICES } from "@/features/reconstruction/drawModel";
import { polylineLengthMeters } from "@/lib/geo/geodesy";
import type { LatLon } from "@/types/domain";

const A: LatLon = { lat: 52.52, lon: 13.405 };
const B: LatLon = { lat: 52.527, lon: 13.414 };
const C: LatLon = { lat: 52.53, lon: 13.425 };

/**
 * A road geometry that bulges north: provider-snapped endpoints
 * (near, not exactly on, the clicked nodes) plus interior points.
 */
const ROUTED: [number, number][] = [
  [13.4051, 52.5202],
  [13.408, 52.5245],
  [13.4105, 52.5265],
  [13.4139, 52.5268],
  [13.4185, 52.5288],
  [13.4249, 52.5298],
];

describe("requestWaypoints (the request budget)", () => {
  it("keeps a small chain untouched", () => {
    const nodes = [A, B, C];
    expect(requestWaypoints(nodes, 48)).toEqual(nodes);
  });

  it("bounds a long chain to the budget with endpoints pinned", () => {
    const nodes: LatLon[] = [];
    for (let i = 0; i < 200; i += 1) {
      nodes.push({ lat: A.lat + i * 1e-4, lon: A.lon + i * 1e-4 });
    }
    const waypoints = requestWaypoints(nodes, 48);
    expect(waypoints.length).toBeLessThanOrEqual(48);
    expect(waypoints[0]).toEqual(nodes[0]);
    expect(waypoints[waypoints.length - 1]).toEqual(nodes[nodes.length - 1]);
    // monotone along the original
    let lastIndex = -1;
    for (const waypoint of waypoints) {
      const index = nodes.indexOf(waypoint);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("drops non-finite nodes", () => {
    const waypoints = requestWaypoints(
      [A, { lat: Number.NaN, lon: 13.4 }, B],
      48,
    );
    expect(waypoints).toEqual([A, B]);
  });
});

describe("matchWaypointIndices (monotone matching)", () => {
  it("matches waypoints near their road vertices, in order", () => {
    const indices = matchWaypointIndices(ROUTED, [A, B, C]);
    expect(indices).toEqual([0, 3, 5]);
  });

  it("searches forward only — a waypoint before the previous match still lands after it", () => {
    // B is closest to an early vertex, but the monotone search must
    // still resolve it AFTER A's match.
    const indices = matchWaypointIndices(ROUTED, [A, B]);
    expect(indices).toBeTruthy();
    expect(indices![0]).toBeLessThan(indices![1]);
  });

  it("refuses degenerate geometry", () => {
    expect(matchWaypointIndices(ROUTED, [A])).toBeNull();
    expect(matchWaypointIndices([], [A, B])).toBeNull();
    expect(matchWaypointIndices([[13.4, 52.52]], [A, B])).toBeNull();
  });

  it("a pair collapsed onto the tail degrades to the straight stitch (honest, never a guess)", () => {
    // Two waypoints both nearest the SAME tail vertex: the matcher
    // resolves them there, and the slice hands the second pair a
    // straight stitch — the line keeps the user's exact node.
    const tailOnly: [number, number][] = [
      [13.40, 52.52],
      [13.401, 52.521],
      [13.402, 52.522],
    ];
    const w1 = { lat: 52.5215, lon: 13.4015 };
    const w2 = { lat: 52.5216, lon: 13.4016 };
    const indices = matchWaypointIndices(tailOnly, [w1, w2]);
    expect(indices).toEqual([2, 2]);
    const legs = sliceRoutedPolyline([w1, w2], tailOnly);
    expect(legs).toHaveLength(1);
    expect(legs![0].coordinates).toEqual([
      [w1.lon, w1.lat],
      [w2.lon, w2.lat],
    ]);
  });
});

describe("sliceRoutedPolyline (per-pair legs)", () => {
  it("slices the geometry between consecutive node matches", () => {
    const legs = sliceRoutedPolyline([A, B, C], ROUTED);
    expect(legs).not.toBeNull();
    expect(legs).toHaveLength(2);
    // Leg 1: A→B, coordinates from match(A) to match(B) inclusive.
    expect(legs![0].a).toEqual(A);
    expect(legs![0].b).toEqual(B);
    expect(legs![0].coordinates[0]).toEqual(ROUTED[0]);
    expect(legs![0].coordinates[legs![0].coordinates.length - 1]).toEqual(
      ROUTED[3],
    );
    // Leg 2 picks up where leg 1 ended.
    expect(legs![1].coordinates[0]).toEqual(ROUTED[3]);
    expect(legs![1].coordinates[legs![1].coordinates.length - 1]).toEqual(
      ROUTED[5],
    );
  });

  it("returns null when the geometry cannot serve the chain", () => {
    expect(sliceRoutedPolyline([A, B], [])).toBeNull();
  });

  it("single-node chain produces no legs (nothing to pair)", () => {
    expect(sliceRoutedPolyline([A], ROUTED)).toBeNull();
  });
});

describe("appliedWaypoints (the vertex cap)", () => {
  it("keeps a short geometry verbatim", () => {
    const points = ROUTED.map(([lon, lat]) => ({ lat, lon }));
    expect(appliedWaypoints(points, 128)).toEqual(points);
  });

  it("reduces to the cap with endpoints pinned", () => {
    const points: LatLon[] = [];
    for (let i = 0; i < 500; i += 1) {
      points.push({ lat: 52.52 + i * 2e-4, lon: 13.405 + i * 1e-4 });
    }
    const reduced = appliedWaypoints(points, 100);
    expect(reduced.length).toBeLessThanOrEqual(100);
    expect(reduced[0]).toEqual(points[0]);
    expect(reduced[reduced.length - 1]).toEqual(points[points.length - 1]);
  });

  it("the default cap is the reconstruction vertex cap", () => {
    const points = Array.from({ length: MAX_VERTICES + 50 }, (_, i) => ({
      lat: 52.52 + i * 1e-4,
      lon: 13.405 + i * 1e-4,
    }));
    expect(appliedWaypoints(points).length).toBeLessThanOrEqual(MAX_VERTICES);
  });
});

describe("snapPreviewNumbers (honest deltas)", () => {
  it("drawn = the rendered chain WITH current legs; routed = with the routed legs", () => {
    const nodes = [A, B];
    // A pre-existing road leg on A→B (a shorter road than the new one).
    const drawnLegs = [
      {
        a: A,
        b: B,
        coordinates: [
          [13.405, 52.52],
          [13.409, 52.523],
          [13.414, 52.527],
        ] as [number, number][],
        routeDistanceM: 0,
      },
    ];
    const routedLegs = sliceRoutedPolyline(nodes, ROUTED)!;
    const numbers = snapPreviewNumbers(nodes, drawnLegs, routedLegs);
    const drawnLength = polylineLengthMeters([
      A,
      { lat: 52.523, lon: 13.409 },
      B,
    ]);
    // The stitched routed chain: the exact nodes, the leg's interior
    // (the WYSIWYG join drops the provider-snapped endpoints), so the
    // number the box states is the number the badge renders.
    const routedLength = polylineLengthMeters([
      A,
      { lat: ROUTED[1][1], lon: ROUTED[1][0] },
      { lat: ROUTED[2][1], lon: ROUTED[2][0] },
      B,
    ]);
    expect(numbers.drawnDistanceM).toBeCloseTo(drawnLength, 6);
    expect(numbers.routedDistanceM).toBeCloseTo(routedLength, 6);
    expect(numbers.deltaM).toBeCloseTo(routedLength - drawnLength, 6);
  });

  it("with no legs on either side the numbers are the straight chain", () => {
    const numbers = snapPreviewNumbers([A, B], [], []);
    expect(numbers.deltaM).toBeCloseTo(0, 9);
  });
});

describe("planSnapApply (the apply plan)", () => {
  it("builds waypoints + legs for the NEW consecutive pairs", () => {
    const plan = planSnapApply(ROUTED);
    expect(plan).not.toBeNull();
    expect(plan!.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(plan!.waypoints.length).toBeLessThanOrEqual(MAX_VERTICES);
    expect(plan!.legs).toHaveLength(plan!.waypoints.length - 1);
    // The first waypoint IS the geometry's start (endpoints pinned).
    expect(plan!.waypoints[0]).toEqual({ lat: ROUTED[0][1], lon: ROUTED[0][0] });
    const last = plan!.waypoints[plan!.waypoints.length - 1];
    expect(last).toEqual({
      lat: ROUTED[ROUTED.length - 1][1],
      lon: ROUTED[ROUTED.length - 1][0],
    });
    // Every leg's coordinates reference the geometry's own points.
    for (const leg of plan!.legs) {
      expect(leg.coordinates[0][0]).toBeCloseTo(
        ROUTED.find(
          (c) =>
            Math.abs(c[1] - leg.a.lat) < 1e-9 &&
            Math.abs(c[0] - leg.a.lon) < 1e-9,
        )![0],
        12,
      );
    }
  });

  it("refuses degenerate geometry", () => {
    expect(planSnapApply([])).toBeNull();
    expect(planSnapApply([[13.4, 52.52]])).toBeNull();
  });
});

describe("snapProfileLabel", () => {
  it("labels the profiles in plain words", () => {
    expect(snapProfileLabel("car")).toBe("roads");
    expect(snapProfileLabel("foot")).toBe("footpaths");
  });
});
