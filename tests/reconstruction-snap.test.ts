/**
 * Unit tests — snap (features/reconstruction/snap.ts).
 *
 * Candidate building (the pure join over the original model) and nearest
 * resolution: anchor priority, threshold strictness, damaged-point
 * exclusion via the shared usability predicate, candidate bounding.
 */

import { describe, expect, it } from "vitest";
import {
  buildSnapCandidates,
  nearestSnap,
  type SnapCandidate,
} from "@/features/reconstruction/snap";
import type {
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
  SegmentId,
} from "@/types/domain";
import { pointId, segmentId } from "@/types/ids";

const seg0 = segmentId(0, 0);

/** A minimal usable recorded point at (lat, lon). */
function recPoint(index: number, lat: number, lon: number): OriginalTrackPoint {
  const id = pointId(seg0, index);
  return {
    source: "original",
    id,
    lat,
    lon,
    flags: [],
    raw: { lat: String(lat), lon: String(lon), children: [] },
  };
}

/** A point damaged at parse time (invalid coordinates). */
function damagedPoint(index: number): OriginalTrackPoint {
  return {
    source: "original",
    id: pointId(seg0, index),
    lat: NaN,
    lon: NaN,
    flags: ["invalid-coord"],
    raw: { lat: "x", lon: "y", children: [] },
  };
}

function modelWith(points: OriginalTrackPoint[]): OriginalTrackData {
  return {
    tracks: [{ trackIndex: 0, extras: [] }],
    segments: [{ id: seg0, trackIndex: 0, points, extras: [] }],
    waypoints: [],
    routes: [],
    rootExtras: [],
    fileMeta: {
      version: "1.1",
      raw: { version: "1.1" },
      metadataExtras: [],
    },
    issues: [],
  };
}

const GAP = {
  before: { lat: 52.52, lon: 13.405 },
  after: { lat: 52.525, lon: 13.41 },
};

describe("buildSnapCandidates", () => {
  it("always starts with the two anchors (priority) + in-box usable points", () => {
    const data = modelWith([
      recPoint(0, 52.5205, 13.4055), // inside the inflated box
      recPoint(1, 52.523, 13.408), // inside
      recPoint(2, 48.85, 2.35), // far outside (Paris)
    ]);
    const candidates = buildSnapCandidates(data, GAP);
    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toEqual({ ...GAP.before, isAnchor: true });
    expect(candidates[1]).toEqual({ ...GAP.after, isAnchor: true });
    const pointIds = candidates.map((c) => c.pointId);
    expect(pointIds).toContain(pointId(seg0, 0));
    expect(pointIds).toContain(pointId(seg0, 1));
    expect(pointIds).not.toContain(pointId(seg0, 2));
  });

  it("excludes damaged coordinates (shared usability predicate)", () => {
    const data = modelWith([
      recPoint(0, 52.521, 13.406),
      damagedPoint(1),
      recPoint(2, 52.0, 0.0), // Null Island artifact — flagged elsewhere
    ]);
    const flagged = data.segments[0].points[2];
    flagged.flags = ["zero-coord"];
    const candidates = buildSnapCandidates(data, GAP);
    const ids = candidates.map((c) => c.pointId);
    expect(ids).toContain(pointId(seg0, 0));
    expect(ids).not.toContain(pointId(seg0, 1));
    expect(ids).not.toContain(pointId(seg0, 2));
  });

  it("bounds the candidate list to maxCandidates (nearest kept)", () => {
    const points: OriginalTrackPoint[] = [];
    for (let i = 0; i < 50; i += 1) {
      points.push(recPoint(i, 52.52 + i * 0.0001, 13.405 + i * 0.0001));
    }
    const data = modelWith(points);
    const candidates = buildSnapCandidates(data, GAP, { maxCandidates: 10 });
    expect(candidates).toHaveLength(12); // 2 anchors + 10 points
  });
});

describe("nearestSnap", () => {
  const anchor: SnapCandidate = { lat: 52.52, lon: 13.405, isAnchor: true };
  const near: SnapCandidate = {
    lat: 52.5205,
    lon: 13.4055,
    pointId: pointId(seg0, 3) as PointId,
  };
  const far: SnapCandidate = { lat: 52.9, lon: 13.9 };

  it("returns null when nothing is within the threshold", () => {
    expect(nearestSnap([far], { lat: 52.52, lon: 13.405 }, 10)).toBeNull();
    expect(nearestSnap([], { lat: 52.52, lon: 13.405 }, 10)).toBeNull();
    expect(
      nearestSnap([near], { lat: NaN, lon: 13.4 }, 10),
    ).toBeNull();
  });

  it("prefers an anchor over a marginally closer ordinary point", () => {
    // Target is ~40 m from the anchor and ~27 m from `near` — both inside
    // the 100 m threshold, the ordinary point is closer, and the anchor
    // still wins (exact anchor connection is the stronger intent signal).
    const target = { lat: 52.5203, lon: 13.4053 };
    const result = nearestSnap([anchor, near], target, 100);
    expect(result).toBe(anchor);
  });

  it("falls back to the nearest ordinary point when no anchor is in range", () => {
    const target = { lat: 52.5205, lon: 13.4055 };
    const result = nearestSnap([anchor, near], target, 20);
    expect(result).toBe(near);
  });

  it("strictly enforces the threshold (boundary is inclusive)", () => {
    // ~6.7 m from the anchor at this latitude.
    const target = { lat: 52.52006, lon: 13.405 };
    expect(nearestSnap([anchor], target, 5)).toBeNull();
    expect(nearestSnap([anchor], target, 7)).toBe(anchor);
  });
});
