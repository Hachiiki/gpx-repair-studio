// @vitest-environment jsdom
/**
 * Repaired-export tests (docs/MASTER_PLAN.md §H-7, §N — Phase 7).
 *
 * The non-negotiable invariants under test:
 *
 *   1. **Identity reduction** — no repairs + Mode A + compact output is
 *      byte-for-byte the identity export.
 *   2. **Original-values-untouched** — every original point's verbatim
 *      values (lat/lon attribute strings, ele/time texts) survive the
 *      export in both modes, in document order (the property suite runs
 *      over the whole fixture corpus).
 *   3. **Provenance survives** — reconstructed points carry
 *      `gpxr:reconstructed` markers; re-import recognizes them
 *      (`repairMarkers` with their time methods); identity re-export of
 *      a re-imported file preserves the markers.
 *   4. **Valid GPX** — every export re-parses; pretty-printing changes
 *      nothing semantic.
 */

import { describe, expect, it } from "vitest";
import {
  exportGpxIdentity,
  exportGpxRepaired,
  type ExportSettings,
} from "@/features/gpx/exportGpx";
import { mergeRepairs, type MergeRepairSite } from "@/features/reconstruction/merge";
import { parseGpx } from "@/features/gpx/parse";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { createDomXmlIo } from "@/lib/utils/xml";
import { vertexId } from "@/types/ids";
import type { GapId, OriginalTrackData, PointId } from "@/types/domain";
import {
  PARSEABLE_FIXTURES,
  makeIo,
  parseFixture,
  projectModel,
} from "./helpers/gpxTestUtils";

const COMPACT_A: ExportSettings = { mode: "structure-preserving", prettyPrint: false };
const COMPACT_B: ExportSettings = { mode: "merged", prettyPrint: false };
const PRETTY_A: ExportSettings = { mode: "structure-preserving", prettyPrint: true };
const TIMED = { fileHasTimingData: true, fileTiming: { startMs: null, totalDurationMs: null } };

function mustParse(xml: string): OriginalTrackData {
  const result = parseGpx(xml, makeIo());
  if (!result.ok) {
    throw new Error(`export failed to re-parse: ${JSON.stringify(result.error)}\n${xml.slice(0, 400)}`);
  }
  return result.data;
}

/** A bounded repair between two adjacent usable points of the first segment. */
function syntheticRepair(data: OriginalTrackData): {
  site: MergeRepairSite;
  before: PointId;
  after: PointId;
} | null {
  for (const segment of data.segments) {
    for (let i = 0; i + 1 < segment.points.length; i += 1) {
      const a = segment.points[i];
      const b = segment.points[i + 1];
      if (isUsableStatsPoint(a) && isUsableStatsPoint(b)) {
        return {
          before: a.id,
          after: b.id,
          site: {
            gapId: `gap/${a.id}/${b.id}` as GapId,
            beforePointId: a.id,
            afterPointId: b.id,
            vertices: [
              { id: vertexId(1), lat: a.lat + 0.0008, lon: a.lon + 0.0008 },
              { id: vertexId(2), lat: b.lat + 0.0008, lon: b.lon + 0.0008 },
            ],
            resampleSpacingM: "off",
            timeStrategy: { kind: "distance-proportional" },
            roadLegs: [],
          },
        };
      }
    }
  }
  return null;
}

/** Flat verbatim projection of every original point, in document order. */
function flatOriginalValues(data: OriginalTrackData): unknown[] {
  const flat: unknown[] = [];
  for (const segment of data.segments) {
    for (const point of segment.points) {
      flat.push({
        lat: point.raw.lat,
        lon: point.raw.lon,
        eleTime: point.raw.children
          .filter((c) => c.kind === "ele" || c.kind === "time")
          .map((c) => (c as { kind: "ele" | "time"; text: string }).text),
      });
    }
  }
  return flat;
}

/** Flat verbatim projection of the UNMARKED points of a re-parsed export. */
function flatUnmarkedValues(data: OriginalTrackData): unknown[] {
  const marked = new Set((data.repairMarkers ?? []).map((m) => m.pointId));
  const flat: unknown[] = [];
  for (const segment of data.segments) {
    for (const point of segment.points) {
      if (marked.has(point.id)) continue;
      flat.push({
        lat: point.raw.lat,
        lon: point.raw.lon,
        eleTime: point.raw.children
          .filter((c) => c.kind === "ele" || c.kind === "time")
          .map((c) => (c as { kind: "ele" | "time"; text: string }).text),
      });
    }
  }
  return flat;
}

// ---------------------------------------------------------------------------
// 1. Identity reduction
// ---------------------------------------------------------------------------

describe("repaired export — identity reduction (no repairs)", () => {
  for (const fixture of PARSEABLE_FIXTURES) {
    it(`${fixture} — Mode A compact === identity export`, () => {
      const data = parseFixture(fixture);
      const merge = mergeRepairs(data, [], TIMED);
      const output = exportGpxRepaired(data, merge, COMPACT_A, makeIo());
      expect(output).toBe(exportGpxIdentity(data, makeIo()));
      expect(output).not.toContain("gpx-repair.studio");
    });
  }
});

// ---------------------------------------------------------------------------
// 2/3/4. The property suite: original values untouched + provenance survives
// ---------------------------------------------------------------------------

describe("repaired export — property suite over the fixture corpus", () => {
  const repairable = PARSEABLE_FIXTURES.map((name) => {
    const data = parseFixture(name);
    return { name, data, repair: syntheticRepair(data) };
  }).filter((entry) => entry.repair !== null);

  it("covers the corpus (not everything was silently skipped)", () => {
    expect(repairable.length).toBeGreaterThanOrEqual(20);
  });

  for (const { name, data, repair } of repairable) {
    it(`${name} — both modes: original values verbatim, markers round-trip`, () => {
      const merge = mergeRepairs(data, [repair!.site], TIMED);
      expect(merge.repairCount).toBe(1);

      for (const settings of [COMPACT_A, COMPACT_B]) {
        const xml = exportGpxRepaired(data, merge, settings, makeIo());
        expect(xml).toContain("gpx-repair.studio");

        const reparsed = mustParse(xml);
        // Every original value survives, in document order.
        expect(flatUnmarkedValues(reparsed)).toEqual(flatOriginalValues(data));
        // Provenance survives: exactly the inserted points are marked.
        expect(reparsed.repairMarkers).toHaveLength(merge.insertedPoints);
        // Case 1 (both boundaries timed, span not reversed) → the marker
        // carries its distribution method. (Reversed/missing boundary
        // times honestly produce no timestamps — the dedicated structure
        // tests cover those.)
        const before = data.segments
          .flatMap((s) => s.points)
          .find((p) => p.id === repair!.before);
        const after = data.segments
          .flatMap((s) => s.points)
          .find((p) => p.id === repair!.after);
        const case1 =
          before?.time !== undefined &&
          after?.time !== undefined &&
          after.time > before.time;
        if (case1) {
          for (const marker of reparsed.repairMarkers ?? []) {
            expect(marker.timeMethod).toBe("distance-proportional");
          }
        }
      }
    });
  }

  it("re-imported file: identity re-export preserves the markers", () => {
    const data = parseFixture("valid-1.1.gpx");
    const repair = syntheticRepair(data)!;
    const merge = mergeRepairs(data, [repair.site], TIMED);
    const xml = exportGpxRepaired(data, merge, COMPACT_A, makeIo());
    const reimported = mustParse(xml);
    expect((reimported.repairMarkers ?? []).length).toBeGreaterThan(0);

    // Identity re-export keeps the verbatim extension snapshots → the
    // markers survive another round-trip unchanged.
    const again = mustParse(exportGpxIdentity(reimported, makeIo()));
    expect(again.repairMarkers).toEqual(reimported.repairMarkers);
  });
});

// ---------------------------------------------------------------------------
// Mode A structure
// ---------------------------------------------------------------------------

describe("repaired export — Mode A structure", () => {
  it("inserts the reconstruction as its own trkseg at the gap position", () => {
    const data = parseFixture("time-gap.gpx");
    const segment = data.segments[0];
    const before = segment.points[3];
    const after = segment.points[4];
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${before.id}/${after.id}` as GapId,
          beforePointId: before.id,
          afterPointId: after.id,
          vertices: [{ id: vertexId(1), lat: 52.5206, lon: 13.4055 }],
          resampleSpacingM: "off",
          timeStrategy: { kind: "distance-proportional" },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const xml = exportGpxRepaired(data, merge, COMPACT_A, makeIo());
    const reparsed = mustParse(xml);

    // Three segments: [0..3] recorded, [recon] , [4..7] recorded.
    expect(reparsed.segments).toHaveLength(3);
    expect(reparsed.segments[0].points).toHaveLength(4);
    expect(reparsed.segments[1].points).toHaveLength(1);
    expect(reparsed.segments[2].points).toHaveLength(4);
    // The recon segment's single point is the marked one.
    const markerIds = new Set(
      (reparsed.repairMarkers ?? []).map((m) => m.pointId),
    );
    expect(markerIds.has(reparsed.segments[1].points[0].id)).toBe(true);
    expect(reparsed.segments[1].points[0].time).toBeDefined();
    // Estimated time strictly between the boundary times.
    const t = reparsed.segments[1].points[0].time!;
    expect(t).toBeGreaterThan(before.time!);
    expect(t).toBeLessThan(after.time!);
  });

  it("emits creator, metadata note, and per-track gpxr:summary", () => {
    const data = parseFixture("time-gap.gpx");
    const segment = data.segments[0];
    const before = segment.points[3];
    const after = segment.points[4];
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${before.id}/${after.id}` as GapId,
          beforePointId: before.id,
          afterPointId: after.id,
          vertices: [{ id: vertexId(1), lat: 52.5206, lon: 13.4055 }],
          resampleSpacingM: "off",
          timeStrategy: { kind: "distance-proportional" },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const xml = exportGpxRepaired(data, merge, COMPACT_A, makeIo());

    expect(xml).toContain('creator="GPX Repair Studio"');
    expect(xml).toContain("Repaired with GPX Repair Studio");
    expect(xml).toContain("recorded values are untouched");
    expect(xml).toContain("Original creator: Paused Watch");
    expect(xml).toMatch(/<gpxr:summary[^]*reconstructedDistanceM="\d+"/);
    expect(xml).toMatch(/<gpxr:summary[^]*gapCount="1"/);
    expect(xml).toMatch(/<gpxr:reconstructed[^]*timeMethod="distance-proportional"/);
  });

  it("keeps empty segments (structure-preserving)", () => {
    const data = parseFixture("empty-segment.gpx");
    const merge = mergeRepairs(data, [], TIMED);
    const xml = exportGpxRepaired(data, merge, COMPACT_A, makeIo());
    expect(xml).toBe(exportGpxIdentity(data, makeIo()));
  });
});

// ---------------------------------------------------------------------------
// Mode B structure
// ---------------------------------------------------------------------------

describe("repaired export — Mode B structure", () => {
  it("merges each track into one continuous trkseg with repairs interleaved", () => {
    const data = parseFixture("multi-segment.gpx");
    const repair = syntheticRepair(data);
    expect(repair).not.toBeNull();
    const merge = mergeRepairs(data, [repair!.site], TIMED);
    const xml = exportGpxRepaired(data, merge, COMPACT_B, makeIo());
    const reparsed = mustParse(xml);

    // One track → one segment, and it contains both recorded and marked points.
    const segmentCount = reparsed.segments.filter(
      (s) => s.trackIndex === 0,
    ).length;
    expect(segmentCount).toBe(1);
    const merged = reparsed.segments.find((s) => s.trackIndex === 0)!;
    const markedIds = new Set(
      (reparsed.repairMarkers ?? []).map((m) => m.pointId),
    );
    const marked = merged.points.filter((p) => markedIds.has(p.id));
    expect(marked).toHaveLength(merge.insertedPoints);
    // Original points keep their verbatim values.
    expect(flatUnmarkedValues(reparsed)).toEqual(flatOriginalValues(data));
  });
});

// ---------------------------------------------------------------------------
// Version handling + pretty-print
// ---------------------------------------------------------------------------

describe("repaired export — version + pretty-print", () => {
  it("upgrades GPX 1.0 to 1.1 when repairs exist (and keeps it without)", () => {
    const data = parseFixture("valid-1.0.gpx");
    const repair = syntheticRepair(data);
    expect(repair).not.toBeNull();

    const withRepairs = mergeRepairs(data, [repair!.site], TIMED);
    const upgraded = exportGpxRepaired(data, withRepairs, COMPACT_A, makeIo());
    expect(upgraded).toContain('version="1.1"');
    expect(upgraded).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    mustParse(upgraded);

    const without = mergeRepairs(data, [], TIMED);
    const kept = exportGpxRepaired(data, without, COMPACT_A, makeIo());
    expect(kept).toBe(exportGpxIdentity(data, makeIo()));
    expect(kept).toContain('version="1.0"');
  });

  it("pretty-printing is semantic-neutral", () => {
    const data = parseFixture("time-gap.gpx");
    const repair = syntheticRepair(data)!;
    const merge = mergeRepairs(data, [repair.site], TIMED);
    const compact = exportGpxRepaired(data, merge, COMPACT_A, makeIo());
    const pretty = exportGpxRepaired(data, merge, PRETTY_A, makeIo());

    // Indented output…
    expect(pretty).toMatch(/\n {2}</);
    // …that re-parses to the exact same model as the compact one.
    expect(projectModel(mustParse(pretty))).toEqual(projectModel(mustParse(compact)));
    // And every original value still survives.
    expect(flatUnmarkedValues(mustParse(pretty))).toEqual(flatOriginalValues(data));
  });

  it("export never mutates the model", () => {
    const data = parseFixture("valid-1.1.gpx");
    const repair = syntheticRepair(data)!;
    const before = JSON.stringify(data);
    const merge = mergeRepairs(data, [repair.site], TIMED);
    exportGpxRepaired(data, merge, COMPACT_A, makeIo());
    exportGpxRepaired(data, merge, COMPACT_B, makeIo());
    exportGpxRepaired(data, merge, PRETTY_A, makeIo());
    expect(JSON.stringify(data)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Anchored extras
// ---------------------------------------------------------------------------

describe("repaired export — anchored segment extras", () => {
  function parseWithExtra(): OriginalTrackData {
    return mustParse(
      `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="X" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.52" lon="13.40"><time>2024-05-01T07:00:00Z</time></trkpt>
    <trkpt lat="52.53" lon="13.41"><time>2024-05-01T07:00:10Z</time></trkpt>
    <trkpt lat="52.54" lon="13.42"><time>2024-05-01T07:00:20Z</time></trkpt>
    <vendor:segext xmlns:vendor="urn:vendor:x">keep-me</vendor:segext>
  </trkseg></trk>
</gpx>`,
    );
  }

  it("Mode A: the extra stays with the piece containing its anchor point", () => {
    const data = parseWithExtra();
    const segment = data.segments[0];
    // Split after point 1 (the extra is anchored after point 3, k = 3).
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${segment.points[0].id}/${segment.points[1].id}` as GapId,
          beforePointId: segment.points[0].id,
          afterPointId: segment.points[1].id,
          vertices: [{ id: vertexId(1), lat: 52.525, lon: 13.405 }],
          resampleSpacingM: "off",
          timeStrategy: { kind: "distance-proportional" },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const xml = exportGpxRepaired(data, merge, COMPACT_A, makeIo());
    expect(xml).toContain("keep-me");
    // The extra follows its anchor point (the last one) — emitted in the
    // final recorded piece, after the last original point.
    const idx = xml.indexOf("keep-me");
    const lastPointIdx = xml.indexOf('lat="52.54"');
    expect(idx).toBeGreaterThan(lastPointIdx);
    mustParse(xml);
  });

  it("Mode B: the extra is re-anchored inside the merged segment", () => {
    const data = parseWithExtra();
    const segment = data.segments[0];
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${segment.points[0].id}/${segment.points[1].id}` as GapId,
          beforePointId: segment.points[0].id,
          afterPointId: segment.points[1].id,
          vertices: [{ id: vertexId(1), lat: 52.525, lon: 13.405 }],
          resampleSpacingM: "off",
          timeStrategy: { kind: "distance-proportional" },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const xml = exportGpxRepaired(data, merge, COMPACT_B, makeIo());
    expect(xml).toContain("keep-me");
    // After the last original point (its anchor), inside the merged trkseg.
    const idx = xml.indexOf("keep-me");
    const lastPointIdx = xml.indexOf('lat="52.54"');
    expect(idx).toBeGreaterThan(lastPointIdx);
    mustParse(xml);
  });
});
