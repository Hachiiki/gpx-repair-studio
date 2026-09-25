// @vitest-environment jsdom
/**
 * Merge unit tests (docs/MASTER_PLAN.md §H-6, Phase 7).
 *
 * The merge inserts committed repair interiors at their anchor positions
 * and distributes timestamps per the §J-1 case matrix. These tests pin:
 *
 *   - run structure (recorded slices + reconstructed interiors, order);
 *   - insertion positions for bounded / extend-after / extend-before;
 *   - additivity — recorded points are never removed or reordered;
 *   - timestamps: Case 1 (distance-proportional), Case 2 (manual,
 *     after-anchored), Case 4 (manual override), Case 3 (file-level total
 *     spread, no-timing files) with manual-duration precedence;
 *   - totals (path lengths match the stats join's WYSIWYG numbers);
 *   - totality — dangling anchors are skipped with a reason, never thrown.
 */

import { describe, expect, it } from "vitest";
import { mergeRepairs, type MergeRepairSite, type MergedRun } from "@/features/reconstruction/merge";
import { parseGpx } from "@/features/gpx/parse";
import { createDomXmlIo } from "@/lib/utils/xml";
import { buildGpxXml, parseXml } from "./helpers/gpxTestUtils";
import { gapId, gapIdEnd, gapIdStart, vertexId } from "@/types/ids";
import type {
  GapId,
  OriginalTrackData,
  PointId,
} from "@/types/domain";

const io = createDomXmlIo();

function parseTimeGap(): OriginalTrackData {
  const result = parseGpx(
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"><time>2024-05-01T07:00:00Z</time></trkpt>
    <trkpt lat="52.520051" lon="13.405024"><time>2024-05-01T07:00:03Z</time></trkpt>
    <trkpt lat="52.520096" lon="13.405094"><time>2024-05-01T07:00:06Z</time></trkpt>
    <trkpt lat="52.520141" lon="13.405164"><time>2024-05-01T07:00:09Z</time></trkpt>
    <trkpt lat="52.520186" lon="13.405234"><time>2024-05-01T07:05:09Z</time></trkpt>
    <trkpt lat="52.520231" lon="13.405304"><time>2024-05-01T07:05:12Z</time></trkpt>
  </trkseg></trk>
</gpx>`,
    io,
  );
  if (!result.ok) throw new Error("fixture failed to parse");
  return result.data;
}

const P = (i: number): PointId => `t0s0:${i}` as PointId;

function site(
  partial: Partial<MergeRepairSite> & { gapId: GapId },
): MergeRepairSite {
  return {
    vertices: [
      { id: vertexId(1), lat: 52.5206, lon: 13.4055 },
      { id: vertexId(2), lat: 52.5202, lon: 13.4058 },
    ],
    resampleSpacingM: "off",
    timeStrategy: { kind: "distance-proportional" },
    roadLegs: [],
    ...partial,
  };
}

const NO_TIMING = { fileHasTimingData: false, fileTiming: { startMs: null, totalDurationMs: null } };
const TIMED = { fileHasTimingData: true, fileTiming: { startMs: null, totalDurationMs: null } };

/** Flatten a track's runs into kind markers for structural assertions. */
function runKinds(runs: readonly MergedRun[]): string[] {
  return runs.map((run) =>
    run.kind === "recorded"
      ? `rec:${run.startIndex}-${run.endIndex}`
      : `recon:${run.gapId}`,
  );
}

describe("merge — run structure", () => {
  it("bounded gap between adjacent points splits the segment into three runs", () => {
    const data = parseTimeGap();
    const gap = gapId(P(3), P(4));
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: P(3), afterPointId: P(4) })],
      TIMED,
    );

    expect(result.repairCount).toBe(1);
    expect(runKinds(result.tracks[0].runs)).toEqual([
      "rec:0-3",
      `recon:${gap}`,
      "rec:4-5",
    ]);
    // Interior = exactly the two vertices (spacing off, no road legs).
    const recon = result.tracks[0].runs[1];
    expect(recon.kind === "reconstructed" && recon.points).toHaveLength(2);
    expect(result.insertedPoints).toBe(2);
  });

  it("no repairs → whole segments as runs (the identity basis)", () => {
    const data = parseTimeGap();
    const result = mergeRepairs(data, [], TIMED);
    expect(runKinds(result.tracks[0].runs)).toEqual(["rec:0-5"]);
    expect(result.repairCount).toBe(0);
    expect(result.reconstructedDistanceM).toBe(0);
  });

  it("extend-after appends the interior after the anchor", () => {
    const data = parseTimeGap();
    const gap = gapIdEnd(P(5));
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: P(5), extendSide: "after" })],
      TIMED,
    );
    expect(runKinds(result.tracks[0].runs)).toEqual([
      "rec:0-5",
      `recon:${gap}`,
    ]);
  });

  it("extend-before inserts the reversed interior before the anchor", () => {
    const data = parseTimeGap();
    const gap = gapIdStart(P(0));
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: gap,
          afterPointId: P(0),
          extendSide: "before",
          vertices: [
            { id: vertexId(1), lat: 52.5195, lon: 13.4045 },
            { id: vertexId(2), lat: 52.5198, lon: 13.4047 },
          ],
        }),
      ],
      TIMED,
    );
    expect(runKinds(result.tracks[0].runs)).toEqual([
      `recon:${gap}`,
      "rec:0-5",
    ]);
    // Route order: reversed — the last drawn vertex is now first.
    const recon = result.tracks[0].runs[0];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    expect(recon.points[0].vertexId).toBe(vertexId(2));
    expect(recon.points[1].vertexId).toBe(vertexId(1));
  });

  it("replace span over a recorded stretch is additive: interior after the before anchor, recorded points kept", () => {
    const data = parseTimeGap();
    const gap = gapId(P(1), P(4));
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: P(1), afterPointId: P(4) })],
      TIMED,
    );
    // The interior lands right after p1; p2/p3 follow untouched.
    expect(runKinds(result.tracks[0].runs)).toEqual([
      "rec:0-1",
      `recon:${gap}`,
      "rec:2-5",
    ]);
    // Every recorded point appears exactly once, in document order.
    const flat = result.tracks[0].points
      .filter((v) => v.point.source === "original")
      .map((v) => (v.point as { id: string }).id);
    expect(flat).toEqual([P(0), P(1), P(2), P(3), P(4), P(5)]);
  });

  it("road legs contribute their geometry to the interior", () => {
    const data = parseTimeGap();
    const gap = gapId(P(3), P(4));
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: gap,
          beforePointId: P(3),
          afterPointId: P(4),
          vertices: [{ id: vertexId(1), lat: 52.5206, lon: 13.4055 }],
          roadLegs: [
            {
              a: { lat: 52.520141, lon: 13.405164 },
              b: { lat: 52.5206, lon: 13.4055 },
              coordinates: [
                [13.405164, 52.520141],
                [13.4053, 52.5203],
                [13.4054, 52.52045],
                [13.4055, 52.5206],
              ],
              routeDistanceM: 80,
            },
          ],
        }),
      ],
      TIMED,
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    // Two road interior points + the vertex.
    expect(recon.points).toHaveLength(3);
    expect(recon.points[0].lat).toBeCloseTo(52.5203, 6);
    expect(recon.points[1].lat).toBeCloseTo(52.52045, 6);
    expect(recon.points[2].vertexId).toBe(vertexId(1));
  });

  it("empty segments survive as point-less runs", () => {
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name>
    <trkseg>
      <trkpt lat="52.52" lon="13.40"/>
      <trkpt lat="52.53" lon="13.41"/>
    </trkseg>
    <trkseg/>
  </trk>
</gpx>`,
    );
    const result = mergeRepairs(data, [], TIMED);
    expect(runKinds(result.tracks[0].runs)).toEqual(["rec:0-1", "rec:0--1"]);
  });

  it("multi-track files: a repair lands only in its anchor's track", () => {
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>A</name><trkseg>
    <trkpt lat="52.52" lon="13.40"><time>2024-05-01T07:00:00Z</time></trkpt>
    <trkpt lat="52.53" lon="13.41"><time>2024-05-01T07:00:10Z</time></trkpt>
  </trkseg></trk>
  <trk><name>B</name><trkseg>
    <trkpt lat="48.85" lon="2.35"><time>2024-05-01T07:00:00Z</time></trkpt>
    <trkpt lat="48.86" lon="2.36"><time>2024-05-01T07:00:10Z</time></trkpt>
  </trkseg></trk>
</gpx>`,
    );
    const gap = gapId("t0s0:0" as PointId, "t0s0:1" as PointId);
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: "t0s0:0" as PointId, afterPointId: "t0s0:1" as PointId })],
      TIMED,
    );
    expect(runKinds(result.tracks[0].runs)).toEqual([
      "rec:0-0",
      `recon:${gap}`,
      "rec:1-1",
    ]);
    expect(runKinds(result.tracks[1].runs)).toEqual(["rec:0-1"]);
  });
});

describe("merge — timestamps (§J-1)", () => {
  it("Case 1: both boundaries timed → distance-proportional interior times", () => {
    const data = parseTimeGap();
    // Gap between p3 (07:00:09) and p4 (07:05:09): 300 000 ms interior.
    const gap = gapId(P(3), P(4));
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: P(3), afterPointId: P(4) })],
      TIMED,
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    for (const point of recon.points) {
      expect(point.time).toBeDefined();
      expect(point.time!.method).toBe("distance-proportional");
    }
    const t3 = Date.parse("2024-05-01T07:00:09Z");
    const t4 = Date.parse("2024-05-01T07:05:09Z");
    for (const point of recon.points) {
      expect(point.time!.value).toBeGreaterThan(t3);
      expect(point.time!.value).toBeLessThan(t4);
    }
    // Distance-proportional: monotonic in route order, strictly between.
    const first = recon.points[0].time!.value;
    const second = recon.points[1].time!.value;
    expect(second).toBeGreaterThan(first);
  });

  it("Case 4: manual duration overrides the interior span only", () => {
    const data = parseTimeGap();
    const gap = gapId(P(3), P(4));
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: gap,
          beforePointId: P(3),
          afterPointId: P(4),
          timeStrategy: { kind: "manual-duration", durationMs: 60_000 },
        }),
      ],
      TIMED,
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    const t3 = Date.parse("2024-05-01T07:00:09Z");
    for (const point of recon.points) {
      expect(point.time!.method).toBe("manual");
      expect(point.time!.value).toBeGreaterThan(t3);
      expect(point.time!.value).toBeLessThan(t3 + 60_000);
    }
    const last = recon.points[recon.points.length - 1].time!.value;
    expect(last).toBeLessThan(t3 + 60_000);
  });

  it("extend-before with manual duration counts back from the anchor (anchor keeps the latest time)", () => {
    const data = parseTimeGap();
    const gap = gapIdStart(P(0));
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: gap,
          afterPointId: P(0),
          extendSide: "before",
          vertices: [
            { id: vertexId(1), lat: 52.5195, lon: 13.4045 },
            { id: vertexId(2), lat: 52.5198, lon: 13.4047 },
          ],
          timeStrategy: { kind: "manual-duration", durationMs: 120_000 },
        }),
      ],
      TIMED,
    );
    const recon = result.tracks[0].runs[0];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    const t0 = Date.parse("2024-05-01T07:00:00Z");
    // Route order: [v2, v1, anchor(t0)] — times increase toward the anchor
    // and stay within [t0 − 120 s, t0].
    const times = recon.points.map((p) => p.time!.value);
    expect(times[0]).toBeLessThan(times[1]);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(t0 - 120_000);
      expect(t).toBeLessThan(t0);
    }
  });

  it("Case 3: no-timing file with start + total → whole-activity distance-proportional spread", () => {
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"/>
    <trkpt lat="52.520096" lon="13.405094"/>
  </trkseg></trk>
</gpx>`,
    );
    const gap = gapId(P(0), P(1));
    const start = Date.parse("2024-05-01T07:00:00Z");
    const total = 1_800_000; // 30 min
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: P(0), afterPointId: P(1) })],
      { fileHasTimingData: false, fileTiming: { startMs: start, totalDurationMs: total } },
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    for (const point of recon.points) {
      expect(point.time).toBeDefined();
      expect(point.time!.method).toBe("distance-proportional");
      // The recorded legs before the interior consume part of the total,
      // so interior times sit strictly between start and start + total.
      expect(point.time!.value).toBeGreaterThan(start);
      expect(point.time!.value).toBeLessThan(start + total);
    }
    // Original points gained no timestamps (repair only inserts).
    for (const view of result.tracks[0].points) {
      if (view.point.source === "original") {
        expect((view.point as { time?: number }).time).toBeUndefined();
      }
    }
  });

  it("Case 3: a per-repair manual duration wins over the file-level spread", () => {
    const data = parseXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520006" lon="13.404954"/>
    <trkpt lat="52.520096" lon="13.405094"/>
  </trkseg></trk>
</gpx>`,
    );
    const gap = gapId(P(0), P(1));
    const start = Date.parse("2024-05-01T07:00:00Z");
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: gap,
          beforePointId: P(0),
          afterPointId: P(1),
          timeStrategy: { kind: "manual-duration", durationMs: 90_000 },
        }),
      ],
      { fileHasTimingData: false, fileTiming: { startMs: start, totalDurationMs: 1_800_000 } },
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    for (const point of recon.points) {
      expect(point.time!.method).toBe("manual");
      expect(point.time!.value).toBeLessThan(start + 90_000);
    }
  });

  it("Case 3 without a file start: no timestamps (valid GPX, no fabrication)", () => {
    const data = parseXml(buildGpxXml([
      { lat: 52.520006, lon: 13.404954 },
      { lat: 52.520096, lon: 13.405094 },
    ]));
    const gap = gapId(P(0), P(1));
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: P(0), afterPointId: P(1) })],
      { fileHasTimingData: false, fileTiming: { startMs: null, totalDurationMs: 1_800_000 } },
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    for (const point of recon.points) {
      expect(point.time).toBeUndefined();
    }
  });

  it("no time strategy → interior carries no timestamps", () => {
    const data = parseTimeGap();
    const gap = gapId(P(3), P(4));
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: gap,
          beforePointId: P(3),
          afterPointId: P(4),
          timeStrategy: { kind: "none" },
        }),
      ],
      TIMED,
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    expect(recon.points.every((p) => p.time === undefined)).toBe(true);
  });
});

describe("merge — honesty & totality", () => {
  it("dangling anchors are skipped with a reason, never thrown", () => {
    const data = parseTimeGap();
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: "gap/t0s0:99/t0s0:100" as GapId,
          beforePointId: "t0s0:99" as PointId,
          afterPointId: "t0s0:100" as PointId,
        }),
      ],
      TIMED,
    );
    expect(result.repairCount).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("no longer exists");
    expect(runKinds(result.tracks[0].runs)).toEqual(["rec:0-5"]);
  });

  it("the original model is never mutated", () => {
    const data = parseTimeGap();
    const before = JSON.stringify(data);
    mergeRepairs(
      data,
      [site({ gapId: gapId(P(3), P(4)), beforePointId: P(3), afterPointId: P(4) })],
      TIMED,
    );
    expect(JSON.stringify(data)).toBe(before);
  });

  it("reconstructedDistanceM matches the full anchor-to-anchor path length (WYSIWYG stats)", () => {
    const data = parseTimeGap();
    const gap = gapId(P(3), P(4));
    const result = mergeRepairs(
      data,
      [site({ gapId: gap, beforePointId: P(3), afterPointId: P(4) })],
      TIMED,
    );
    // Anchor-to-anchor with two vertices: strictly longer than the
    // straight chord and reported as the path length.
    expect(result.reconstructedDistanceM).toBeGreaterThan(50);
    expect(result.repairCount).toBe(1);
  });

  it("spacing densifies the interior (vertices kept exactly)", () => {
    const data = parseTimeGap();
    const gap = gapId(P(3), P(4));
    const result = mergeRepairs(
      data,
      [
        site({
          gapId: gap,
          beforePointId: P(3),
          afterPointId: P(4),
          resampleSpacingM: 10,
        }),
      ],
      TIMED,
    );
    const recon = result.tracks[0].runs[1];
    if (recon.kind !== "reconstructed") throw new Error("expected recon run");
    // ~200 m path at 10 m spacing → roughly 20+ points.
    expect(recon.points.length).toBeGreaterThan(10);
    // Both user vertices survive exactly.
    const vertexIds = recon.points
      .map((p) => p.vertexId)
      .filter((v): v is NonNullable<typeof v> => v !== undefined);
    expect(vertexIds).toEqual([vertexId(1), vertexId(2)]);
  });
});
