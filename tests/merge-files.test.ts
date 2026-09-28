// @vitest-environment jsdom
/**
 * Task 43 — multi-file merge domain tests (features/gpx/mergeFiles).
 *
 * Covers the merge contract end to end:
 *   - structure: one track, segments concatenated in source order,
 *     document order preserved within a source;
 *   - identity: every recorded point's values (lat/lon/ele/time and the
 *     verbatim raw capture) survive unchanged — only ids re-key;
 *   - id hygiene: merged ids are unique and match the scheme a fresh
 *     parse of the exported document would produce;
 *   - waypoints/routes/segment extras concatenate and re-emit;
 *   - repair markers re-key; drops are the documented ones only;
 *   - metadata: combined name (file + track), first-source version,
 *     merge-disclosing creator, earliest time;
 *   - the merged model flows through validate/stats/identity export —
 *     the "looks like a fresh parse" guarantee.
 */

import { describe, expect, it } from "vitest";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import {
  fileSummary,
  mergeGpxFiles,
  mergedCreator,
  type MergeSourceInput,
} from "@/features/gpx/mergeFiles";
import { originalDistanceStats } from "@/features/statistics/distance";
import { originalTimeStats } from "@/features/statistics/time";
import { validateGpx } from "@/features/gpx/validate";
import { parseFixture, parseXml, roundTrip, makeIo } from "./helpers/gpxTestUtils";
import type { OriginalTrackData } from "@/types/domain";

/** Parse + validate, the exact pipeline the merge intake runs. */
function validated(data: OriginalTrackData): OriginalTrackData {
  return validateGpx(data).data;
}

describe("fileSummary", () => {
  it("counts points/tracks/segments/waypoints/routes", () => {
    const model = parseFixture("multi-segment.gpx");
    const summary = fileSummary("a.gpx", model);
    expect(summary.fileName).toBe("a.gpx");
    expect(summary.pointCount).toBe(
      model.segments.reduce((n, s) => n + s.points.length, 0),
    );
    expect(summary.trackCount).toBe(model.tracks.length);
    expect(summary.segmentCount).toBe(model.segments.length);
    expect(summary.waypointCount).toBe(model.waypoints.length);
    expect(summary.routeCount).toBe(model.routes.length);
  });

  it("derives timing bounds from reliable point times", () => {
    const model = parseFixture("valid-1.1.gpx");
    const summary = fileSummary("valid.gpx", model);
    expect(summary.hasTimingData).toBe(true);
    expect(summary.firstTimeMs).toBe(Date.parse("2024-05-01T07:00:00Z"));
    expect(summary.lastTimeMs).toBe(Date.parse("2024-05-01T07:00:15Z"));
  });

  it("no-timing files report hasTimingData false and no bounds", () => {
    const model = parseFixture("no-time.gpx");
    const summary = fileSummary("no-time.gpx", model);
    expect(summary.hasTimingData).toBe(false);
    expect(summary.firstTimeMs).toBeUndefined();
    expect(summary.lastTimeMs).toBeUndefined();
  });
});

describe("mergeGpxFiles — structure", () => {
  const A = () => validated(parseFixture("valid-1.1.gpx"));
  const B = () => validated(parseFixture("multi-segment.gpx"));

  it("produces exactly one track whose name is the combined name", () => {
    const outcome = mergeGpxFiles(
      [
        { fileName: "a.gpx", model: A() },
        { fileName: "b.gpx", model: B() },
      ],
      { name: "Weekend double" },
    );
    expect(outcome.model.tracks).toHaveLength(1);
    expect(outcome.model.tracks[0].name).toBe("Weekend double");
    expect(outcome.model.tracks[0].trackIndex).toBe(0);
    expect(outcome.model.fileMeta.name).toBe("Weekend double");
  });

  it("concatenates segments in source order, document order within a source", () => {
    const a = A();
    const b = B();
    const outcome = mergeGpxFiles(
      [
        { fileName: "a.gpx", model: a },
        { fileName: "b.gpx", model: b },
      ],
      {},
    );
    const merged = outcome.model;
    expect(merged.segments).toHaveLength(a.segments.length + b.segments.length);
    // Every merged segment belongs to the single track.
    for (const segment of merged.segments) {
      expect(segment.trackIndex).toBe(0);
    }
    // First a.segments.length segments are a's, verbatim point values.
    for (let i = 0; i < a.segments.length; i++) {
      expect(merged.segments[i].points).toHaveLength(a.segments[i].points.length);
      for (let j = 0; j < a.segments[i].points.length; j++) {
        expect(merged.segments[i].points[j].lat).toBe(a.segments[i].points[j].lat);
        expect(merged.segments[i].points[j].lon).toBe(a.segments[i].points[j].lon);
        expect(merged.segments[i].points[j].ele).toBe(a.segments[i].points[j].ele);
        expect(merged.segments[i].points[j].time).toBe(a.segments[i].points[j].time);
      }
    }
  });

  it("reorders when the source order changes (the studio's core edit)", () => {
    const outcomeAB = mergeGpxFiles(
      [
        { fileName: "a.gpx", model: A() },
        { fileName: "b.gpx", model: B() },
      ],
      {},
    );
    const outcomeBA = mergeGpxFiles(
      [
        { fileName: "b.gpx", model: B() },
        { fileName: "a.gpx", model: A() },
      ],
      {},
    );
    // The first segment of each merge is the first segment of its first source.
    const firstPointAB = outcomeAB.model.segments[0].points[0];
    const firstPointBA = outcomeBA.model.segments[0].points[0];
    expect(firstPointAB.lat).toBe(A().segments[0].points[0].lat);
    expect(firstPointBA.lat).toBe(B().segments[0].points[0].lat);
    expect(outcomeAB.sources.map((s) => s.fileName)).toEqual(["a.gpx", "b.gpx"]);
    expect(outcomeBA.sources.map((s) => s.fileName)).toEqual(["b.gpx", "a.gpx"]);
  });

  it("re-keys ids: unique, and matching the fresh-parse scheme", () => {
    const outcome = mergeGpxFiles(
      [
        { fileName: "a.gpx", model: A() },
        { fileName: "b.gpx", model: B() },
      ],
      {},
    );
    const ids = outcome.model.segments.flatMap((s) => s.points.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length); // unique despite per-file collisions

    // The scheme a fresh parse of the exported document would produce.
    const xml = exportGpxIdentity(outcome.model, makeIo());
    const reparsed = parseXml(xml);
    const freshIds = reparsed.segments.flatMap((s) => s.points.map((p) => p.id));
    expect(ids).toEqual(freshIds);
  });

  it("keeps the same raw capture objects (verbatim reuse, not copies)", () => {
    const a = A();
    const outcome = mergeGpxFiles([{ fileName: "a.gpx", model: a }], {});
    expect(outcome.model.segments[0].points[0].raw).toBe(a.segments[0].points[0].raw);
    expect(outcome.model.segments[0].extras).toBe(a.segments[0].extras);
  });
});

describe("mergeGpxFiles — all the things", () => {
  it("concatenates waypoints and routes from every source", () => {
    const wpt = parseFixture("wpt-rte.gpx");
    const plain = parseFixture("valid-1.1.gpx");
    const outcome = mergeGpxFiles(
      [
        { fileName: "plain.gpx", model: plain },
        { fileName: "wpt.gpx", model: wpt },
      ],
      {},
    );
    expect(outcome.model.waypoints).toHaveLength(
      plain.waypoints.length + wpt.waypoints.length,
    );
    expect(outcome.model.routes).toHaveLength(plain.routes.length + wpt.routes.length);
    // Verbatim snapshots, first source's first (valid-1.1 has none, so
    // the wpt fixture's lead the merged file).
    const firstWaypointSource = plain.waypoints.length > 0 ? plain : wpt;
    expect(outcome.model.waypoints[0]).toBe(firstWaypointSource.waypoints[0]);
  });

  it("carries segment-anchored extras with their segments", () => {
    const extra = parseFixture("extra-children.gpx");
    const outcome = mergeGpxFiles(
      [
        { fileName: "e.gpx", model: extra },
        { fileName: "v.gpx", model: parseFixture("valid-1.1.gpx") },
      ],
      {},
    );
    for (let i = 0; i < extra.segments.length; i++) {
      expect(outcome.model.segments[i].extras).toBe(extra.segments[i].extras);
    }
  });

  it("re-keys repair markers from a previously repaired source", () => {
    // A repaired export re-imported: build one via the gpxr round-trip —
    // use the provenance fixture if present, else synthesize via export.
    const model = parseFixture("strava-export.gpx");
    const markers = model.repairMarkers ?? [];
    const outcome = mergeGpxFiles(
      [
        { fileName: "s.gpx", model },
        { fileName: "v.gpx", model: parseFixture("valid-1.1.gpx") },
      ],
      {},
    );
    // Whatever markers existed are preserved 1:1 and now reference ids
    // that exist in the merged model.
    expect(outcome.model.repairMarkers ?? []).toHaveLength(markers.length);
    const mergedIds = new Set(
      outcome.model.segments.flatMap((s) => s.points.map((p) => p.id)),
    );
    for (const marker of outcome.model.repairMarkers ?? []) {
      expect(mergedIds.has(marker.pointId)).toBe(true);
      expect(mergedIds.has(marker.segmentId as never)).toBe(true);
    }
  });

  it("documented drops: root extras, metadata extras, source track extras", () => {
    const garmin = parseFixture("garmin-extensions.gpx");
    const outcome = mergeGpxFiles([{ fileName: "g.gpx", model: garmin }], {});
    expect(outcome.model.rootExtras).toEqual([]);
    expect(outcome.model.fileMeta.metadataExtras).toEqual([]);
    expect(outcome.model.tracks[0].extras).toEqual([]);
    // …and nothing else is lost (points all present).
    expect(outcome.model.segments.reduce((n, s) => n + s.points.length, 0)).toBe(
      garmin.segments.reduce((n, s) => n + s.points.length, 0),
    );
  });
});

describe("mergeGpxFiles — metadata", () => {
  it("uses the first source's version; discloses the merge in creator", () => {
    const v10 = parseFixture("valid-1.0.gpx");
    const v11 = parseFixture("valid-1.1.gpx");
    const outcome = mergeGpxFiles(
      [
        { fileName: "old.gpx", model: v10 },
        { fileName: "new.gpx", model: v11 },
      ],
      {},
    );
    expect(outcome.model.fileMeta.version).toBe("1.0");
    expect(outcome.model.fileMeta.raw.version).toBe("1.0");
    expect(outcome.model.fileMeta.creator).toBe(mergedCreator(2));
    expect(outcome.model.fileMeta.raw.creator).toBe(mergedCreator(2));
  });

  it("earliest reliable time becomes the file time (raw + parsed)", () => {
    // valid-1.1 starts 07:00; multi-segment starts later — earliest wins
    // regardless of order.
    const early = parseFixture("valid-1.1.gpx");
    const late = parseFixture("multi-segment.gpx");
    const earlyFirst = Date.parse("2024-05-01T07:00:00Z");
    const lateFirst = Math.min(
      ...late.segments.flatMap((s) =>
        s.points.filter((p) => p.time !== undefined).map((p) => p.time as number),
      ),
    );
    const laterSource = mergeGpxFiles(
      [
        { fileName: "late.gpx", model: late },
        { fileName: "early.gpx", model: early },
      ],
      {},
    );
    const expected = Math.min(earlyFirst, lateFirst);
    expect(laterSource.model.fileMeta.time).toBe(expected);
    expect(laterSource.model.fileMeta.raw.metadataTime).toBe(
      new Date(expected).toISOString().replace(".000Z", "Z"),
    );
  });

  it("no name option → no name elements, matching an unnamed export", () => {
    const outcome = mergeGpxFiles(
      [{ fileName: "a.gpx", model: parseFixture("valid-1.1.gpx") }],
      {},
    );
    expect(outcome.model.tracks[0].name).toBeUndefined();
    expect(outcome.model.fileMeta.name).toBeUndefined();
    const xml = exportGpxIdentity(outcome.model, makeIo());
    expect(xml).not.toContain("<name>");
  });
});

describe("mergeGpxFiles — downstream guarantees", () => {
  const SOURCES = (): MergeSourceInput[] => [
    { fileName: "a.gpx", model: validated(parseFixture("valid-1.1.gpx")) },
    { fileName: "b.gpx", model: validated(parseFixture("multi-segment.gpx")) },
    { fileName: "w.gpx", model: validated(parseFixture("wpt-rte.gpx")) },
  ];

  it("validates like a fresh file (flag-enriched copy works)", () => {
    const merged = mergeGpxFiles(SOURCES(), { name: "Three into one" });
    const result = validateGpx(merged.model);
    expect(result.data.segments).toHaveLength(merged.model.segments.length);
    // Merged model itself is untouched (validateGpx copies).
    expect(merged.model.issues).toEqual([]);
  });

  it("statistics run over the merged model (distance/time)", () => {
    const merged = mergeGpxFiles(SOURCES(), {});
    const distance = originalDistanceStats(merged.model);
    const time = originalTimeStats(merged.model, 120_000);
    const totalPoints = merged.model.segments.reduce((n, s) => n + s.points.length, 0);
    expect(distance.perSegment).toHaveLength(merged.model.segments.length);
    expect(time.pointsTotal).toBe(totalPoints);
  });

  it("identity export round-trips (byte-stable, re-parseable)", () => {
    const merged = mergeGpxFiles(SOURCES(), { name: "Round trip" });
    const { xml, second } = roundTrip(merged.model);
    expect(second.segments).toHaveLength(merged.model.segments.length);
    expect(second.waypoints).toHaveLength(merged.model.waypoints.length);
    // Deterministic: same inputs → same bytes.
    const again = exportGpxIdentity(
      mergeGpxFiles(SOURCES(), { name: "Round trip" }).model,
      makeIo(),
    );
    expect(again).toBe(xml);
  });

  it("freezes the merged model in test builds", () => {
    const merged = mergeGpxFiles(SOURCES(), {});
    expect(Object.isFrozen(merged.model)).toBe(true);
    expect(Object.isFrozen(merged.model.segments[0].points[0])).toBe(true);
  });

  it("throws on the empty merge (defensive — UI gates at ≥ 2)", () => {
    expect(() => mergeGpxFiles([])).toThrow();
  });

  it("single-source merge is the identity shape minus documented drops", () => {
    const model = validated(parseFixture("valid-1.1.gpx"));
    const outcome = mergeGpxFiles([{ fileName: "only.gpx", model }], {});
    expect(outcome.model.segments).toHaveLength(model.segments.length);
    expect(outcome.model.segments[0].points[0].lat).toBe(
      model.segments[0].points[0].lat,
    );
    expect(outcome.sources[0].pointCount).toBe(
      model.segments.reduce((n, s) => n + s.points.length, 0),
    );
  });
});
