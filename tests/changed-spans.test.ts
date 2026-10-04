// @vitest-environment jsdom
/**
 * Changed-span tests (Phase 19, §EE 19.1): the overlay's highlight
 * derivation.
 *
 * Pins the contract: deletions mark the legs around the point and
 * adjacent spans merge; elevation overrides mark without moving
 * geometry; sorts and structural entries mark whole segments; derived
 * ids (split tails' sources, duplicate copies) never resolve against
 * the original and are skipped, never guessed.
 */

import { describe, expect, it } from "vitest";
import { parseFixture, parseXml } from "./helpers/gpxTestUtils";
import { buildChangedSpans } from "@/features/compare/changedSpans";
import type { WorkingEdit } from "@/types/domain";

type PointId = import("@/types/domain").PointId;
const pid = (i: number) => `t0s0:${i}` as PointId;

function edit(entries: WorkingEdit["entries"]): WorkingEdit {
  return { id: "fix/1", label: "test fix", reason: "spike", appliedAt: 1, entries };
}

describe("buildChangedSpans — the empty cases", () => {
  it("no edits → no spans", () => {
    const data = parseFixture("deep-defects.gpx");
    expect(buildChangedSpans(data, [])).toEqual([]);
  });

  it("empty log entries → no spans", () => {
    const data = parseFixture("deep-defects.gpx");
    expect(buildChangedSpans(data, [edit([])])).toEqual([]);
  });
});

describe("buildChangedSpans — point deletions", () => {
  const data = parseFixture("deep-defects.gpx");

  it("one deletion marks the surrounding legs (i-1 … i+1)", () => {
    const spans = buildChangedSpans(data, [
      edit([{ kind: "point-deletion", pointId: pid(10) }]),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      segmentId: "t0s0",
      fromIndex: 9,
      toIndex: 11,
      kind: "deleted",
    });
  });

  it("adjacent deletions merge into one span", () => {
    const spans = buildChangedSpans(data, [
      edit([
        { kind: "point-deletion", pointId: pid(10) },
        { kind: "point-deletion", pointId: pid(11) },
        { kind: "point-deletion", pointId: pid(12) },
      ]),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ fromIndex: 9, toIndex: 13 });
  });

  it("distant deletions stay separate spans", () => {
    const spans = buildChangedSpans(data, [
      edit([
        { kind: "point-deletion", pointId: pid(10) },
        { kind: "point-deletion", pointId: pid(30) },
      ]),
    ]);
    expect(spans).toHaveLength(2);
  });

  it("an end-point deletion clamps to the segment bounds", () => {
    const spans = buildChangedSpans(data, [
      edit([{ kind: "point-deletion", pointId: pid(0) }]),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0].fromIndex).toBe(0);
    expect(spans[0].toIndex).toBe(1);
  });
});

describe("buildChangedSpans — kinds and structure", () => {
  it("an elevation override marks its neighborhood as elevation", () => {
    const data = parseFixture("deep-defects.gpx");
    const spans = buildChangedSpans(data, [
      edit([
        {
          kind: "elevation-override",
          pointId: pid(5),
          ele: 42,
          method: "interpolated",
        },
      ]),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("elevation");
    expect(spans[0].fromIndex).toBe(4);
    expect(spans[0].toIndex).toBe(6);
  });

  it("a sort marks the whole segment", () => {
    const data = parseFixture("deep-defects.gpx");
    const spans = buildChangedSpans(data, [
      edit([{ kind: "segment-sort", segmentId: "t0s0" as never }]),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("sorted");
    expect(spans[0].fromIndex).toBe(0);
    expect(spans[0].toIndex).toBe(data.segments[0].points.length - 1);
  });

  it("split, duplicate, and order mark their segments as structure", () => {
    const data = parseXml(
      `<?xml version="1.0"?>
       <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
         <trk><trkseg>
           <trkpt lat="0" lon="0"></trkpt>
           <trkpt lat="0.001" lon="0"></trkpt>
           <trkpt lat="0.002" lon="0"></trkpt>
         </trkseg></trk>
       </gpx>`,
    );
    const spans = buildChangedSpans(data, [
      edit([
        { kind: "segment-split", segmentId: "t0s0" as never, atPointId: pid(1) },
        { kind: "segment-duplicate", segmentId: "t0s0" as never },
        {
          kind: "segment-order",
          order: ["t0s0" as never, "t0s0~s1" as never],
        },
      ]),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("structure");
    expect(spans[0].fromIndex).toBe(0);
    expect(spans[0].toIndex).toBe(2);
  });

  it("derived ids never resolve — skipped, not guessed", () => {
    const data = parseFixture("deep-defects.gpx");
    // A duplicated segment's copied point id only exists in the working
    // view; the span derivation must skip it (the source segment is
    // already marked by the structural entry).
    const spans = buildChangedSpans(data, [
      edit([
        { kind: "point-deletion", pointId: "t0s0~d1:3" as PointId },
      ]),
    ]);
    expect(spans).toHaveLength(0);
  });

  it("overlapping kinds keep the dominant one (structure > sorted)", () => {
    const data = parseFixture("deep-defects.gpx");
    const spans = buildChangedSpans(data, [
      edit([
        { kind: "point-deletion", pointId: pid(10) },
        { kind: "segment-sort", segmentId: "t0s0" as never },
      ]),
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0].kind).toBe("sorted");
  });
});
