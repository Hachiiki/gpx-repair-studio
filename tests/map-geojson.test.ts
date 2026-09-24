/**
 * Unit tests — GeoJSON source builders (lib/map/geojson.ts).
 *
 * Pure data shaping: plain view data in, structurally valid GeoJSON out
 * (coordinate order `[lon, lat]`, properties carried for styling and hit
 * testing).
 */

import { describe, expect, it } from "vitest";
import {
  gapMarkerCollection,
  gapSpanCollection,
  routeLineCollection,
  type GapBoundaryMarker,
  type GapSpanPart,
  type RouteLinePart,
} from "@/lib/map/geojson";
import type { GapId, PointId, SegmentId } from "@/types/domain";

const seg = (id: string) => id as SegmentId;
const gap = (id: string) => id as GapId;
const point = (id: string) => id as PointId;

describe("routeLineCollection", () => {
  it("builds one LineString feature per line part with [lon, lat] coords", () => {
    const lines: RouteLinePart[] = [
      {
        segmentId: seg("t0s0"),
        trackIndex: 0,
        coordinates: [
          [13.405, 52.52],
          [13.406, 52.521],
        ],
      },
      {
        segmentId: seg("t0s1"),
        trackIndex: 0,
        coordinates: [
          [13.41, 52.53],
          [13.411, 52.531],
          [13.412, 52.532],
        ],
      },
    ];

    const collection = routeLineCollection(lines);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(2);

    const [first, second] = collection.features;
    expect(first.geometry.type).toBe("LineString");
    expect(first.geometry.coordinates).toEqual([
      [13.405, 52.52],
      [13.406, 52.521],
    ]);
    expect(first.properties).toEqual({ segmentId: "t0s0", trackIndex: 0 });
    expect(second.geometry.coordinates).toHaveLength(3);
  });

  it("returns an empty (not null) collection for no lines", () => {
    const collection = routeLineCollection([]);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toEqual([]);
  });
});

describe("gapSpanCollection", () => {
  it("carries gapId, kind, and severity on each span feature", () => {
    const spans: GapSpanPart[] = [
      {
        gapId: gap("gap/a/b"),
        kind: "time-gap",
        severity: "severe",
        coordinates: [
          [13.4, 52.5],
          [13.5, 52.6],
        ],
      },
    ];

    const collection = gapSpanCollection(spans);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].geometry.type).toBe("LineString");
    expect(collection.features[0].geometry.coordinates).toEqual([
      [13.4, 52.5],
      [13.5, 52.6],
    ]);
    expect(collection.features[0].properties).toEqual({
      gapId: "gap/a/b",
      kind: "time-gap",
      severity: "severe",
    });
  });
});

describe("gapMarkerCollection", () => {
  it("builds Point features with role and severity for hit-testing", () => {
    const markers: GapBoundaryMarker[] = [
      {
        gapId: gap("gap/a/b"),
        pointId: point("t0s0:3"),
        role: "before",
        severity: "suspect",
        lat: 52.52,
        lon: 13.405,
      },
      {
        gapId: gap("gap/a/b"),
        pointId: point("t0s0:4"),
        role: "after",
        severity: "suspect",
        lat: 52.521,
        lon: 13.406,
      },
    ];

    const collection = gapMarkerCollection(markers);
    expect(collection.features).toHaveLength(2);
    const [before, after] = collection.features;
    expect(before.geometry.type).toBe("Point");
    expect(before.geometry.coordinates).toEqual([13.405, 52.52]);
    expect(before.properties.role).toBe("before");
    expect(after.properties.role).toBe("after");
    expect(after.properties.gapId).toBe("gap/a/b");
    expect(after.properties.pointId).toBe("t0s0:4");
  });

  it("empty marker input yields an empty collection", () => {
    expect(gapMarkerCollection([]).features).toEqual([]);
    expect(gapSpanCollection([]).features).toEqual([]);
  });
});
