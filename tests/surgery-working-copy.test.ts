// @vitest-environment jsdom
/**
 * Surgery working-copy tests (Phase 16, §EE 16.1 verification:
 * "surgery unit tests (geometry + provenance)").
 *
 * Pins the structural interpreter's contract: splits cut after the
 * point with derived ids and stable point ids, extras partition with
 * their points, duplicates rewrite ids so later edits can address
 * them, orders permute without crossing tracks, derived-id intents
 * (a fix planned on a copied point) apply in the post-sweep, and the
 * whole derivation is deterministic — the same log always derives
 * the same ids, so undo/hydrate can never alias.
 */

import { describe, expect, it } from "vitest";
import { parseXml } from "./helpers/gpxTestUtils";
import {
  applyWorkingEdits,
  workingMetaOf,
} from "@/features/validation/workingCopy";
import type {
  PointId,
  SegmentId,
  WorkingEdit,
} from "@/types/domain";

/*
 * Two tracks: A holds two segments (4 + 2 points, two anchored
 * extras), B holds one. Times ascend, so a sort is observable.
 */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Surgery" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>A</name>
 <trkseg>
  <trkpt lat="0" lon="0"><ele>10</ele><time>2024-05-01T07:00:00Z</time></trkpt>
  <trkpt lat="0.001" lon="0"><ele>11</ele><time>2024-05-01T07:00:10Z</time></trkpt>
  <extensions><gpxx:segTag xmlns:gpxx="urn:test">after-1</gpxx:segTag></extensions>
  <trkpt lat="0.002" lon="0"><ele>12</ele><time>2024-05-01T07:00:20Z</time></trkpt>
  <extensions><gpxx:segTag xmlns:gpxx="urn:test">after-3</gpxx:segTag></extensions>
  <trkpt lat="0.003" lon="0"><ele>13</ele><time>2024-05-01T07:00:30Z</time></trkpt>
 </trkseg>
 <trkseg>
  <trkpt lat="0.1" lon="0.1"><ele>20</ele><time>2024-05-01T08:00:00Z</time></trkpt>
  <trkpt lat="0.101" lon="0.1"><ele>21</ele><time>2024-05-01T08:00:10Z</time></trkpt>
 </trkseg>
</trk>
<trk><name>B</name>
 <trkseg>
  <trkpt lat="1" lon="1"><ele>30</ele><time>2024-05-01T09:00:00Z</time></trkpt>
 </trkseg>
</trk>
</gpx>`;

const pid = (s: string, i: number) => `${s}:${i}` as PointId;
const sid = (s: string) => s as SegmentId;

function edit(
  entries: WorkingEdit["entries"],
  reason: WorkingEdit["reason"] = "split",
  id = "fix/1",
): WorkingEdit {
  return { id, label: "test", reason, appliedAt: 1_000, entries };
}

const idsOf = (view: ReturnType<typeof applyWorkingEdits>) =>
  view.segments.map((s) => s.id);
const pointsOf = (
  view: ReturnType<typeof applyWorkingEdits>,
  id: string,
) => view.segments.find((s) => s.id === id)?.points.map((p) => p.id);

describe("segment-split", () => {
  const data = parseXml(XML);

  it("cuts after the point; the tail becomes a derived segment; points keep their ids", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-split", segmentId: sid("t0s0"), atPointId: pid("t0s0", 1) }]),
    ]);
    expect(idsOf(view)).toEqual(["t0s0", "t0s0~s1", "t0s1", "t1s0"]);
    expect(pointsOf(view, "t0s0")).toEqual([pid("t0s0", 0), pid("t0s0", 1)]);
    expect(pointsOf(view, "t0s0~s1")).toEqual([pid("t0s0", 2), pid("t0s0", 3)]);
    // The piece stays in its parent track (the merge/export walk keys
    // on trackIndex).
    expect(view.segments[1].trackIndex).toBe(0);
    // Geometry is untouched — the same points, regrouped.
    expect(view.segments[0].points[0].lat).toBe(data.segments[0].points[0].lat);
    expect(view.working).toMatchObject({ splitCount: 1, hasEdits: true });
  });

  it("partitions extras with their points, re-anchored piece-locally", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-split", segmentId: sid("t0s0"), atPointId: pid("t0s0", 1) }]),
    ]);
    const head = view.segments[0];
    const tail = view.segments[1];
    // after-1 sits after TWO original points (its anchor is point 1,
    // the split point itself — head territory): the count survives
    // verbatim because the head keeps the prefix order.
    expect(head.extras).toHaveLength(1);
    expect(head.extras[0].afterPointCount).toBe(2);
    expect(head.extras[0].xml).toContain("after-1");
    // after-3 sits after three original points (its anchor is point 2
    // — tail territory): it rides with the tail, re-anchored one point
    // into it.
    expect(tail.extras).toHaveLength(1);
    expect(tail.extras[0].afterPointCount).toBe(1);
    expect(tail.extras[0].xml).toContain("after-3");
  });

  it("a split at the last point is an honest no-op", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-split", segmentId: sid("t0s1"), atPointId: pid("t0s1", 1) }]),
    ]);
    expect(idsOf(view)).toEqual(["t0s0", "t0s1", "t1s0"]);
  });

  it("splitting a derived piece composes (the id chain deepens)", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-split", segmentId: sid("t0s0"), atPointId: pid("t0s0", 1) }], "split", "fix/1"),
      edit(
        [{ kind: "segment-split", segmentId: sid("t0s0~s1"), atPointId: pid("t0s0", 2) }],
        "split",
        "fix/2",
      ),
    ]);
    expect(idsOf(view)).toEqual(["t0s0", "t0s0~s1", "t0s0~s1~s2", "t0s1", "t1s0"]);
    expect(pointsOf(view, "t0s0~s1~s2")).toEqual([pid("t0s0", 3)]);
    expect(view.working).toMatchObject({ splitCount: 2 });
  });
});

describe("segment-duplicate", () => {
  const data = parseXml(XML);

  it("inserts the copy right after the source with rewritten point ids", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-duplicate", segmentId: sid("t0s1") }], "copy"),
    ]);
    expect(idsOf(view)).toEqual(["t0s0", "t0s1", "t0s1~d1", "t1s0"]);
    expect(pointsOf(view, "t0s1~d1")).toEqual([
      pid("t0s1~d1", 0),
      pid("t0s1~d1", 1),
    ]);
    // Values are carried verbatim (a copy is a copy).
    const [a, b] = view.segments[2].points;
    expect([a.lat, a.lon, a.ele]).toEqual([0.1, 0.1, 20]);
    expect([b.lat, b.lon, b.ele]).toEqual([0.101, 0.1, 21]);
    expect(view.working).toMatchObject({ duplicatedSegmentCount: 1 });
  });

  it("a copied point can be addressed by a later fix without touching the source", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-duplicate", segmentId: sid("t0s1") }], "copy", "fix/1"),
      edit(
        [{ kind: "point-deletion", pointId: pid("t0s1~d1", 1) }],
        "spike",
        "fix/2",
      ),
    ]);
    expect(pointsOf(view, "t0s1")).toHaveLength(2);
    expect(pointsOf(view, "t0s1~d1")).toEqual([pid("t0s1~d1", 0)]);
    expect(view.working).toMatchObject({ deletedPointCount: 1 });
  });

  it("an elevation override on a copied point applies (and only there)", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-duplicate", segmentId: sid("t0s1") }], "copy", "fix/1"),
      edit(
        [
          {
            kind: "elevation-override",
            pointId: pid("t0s1~d1", 0),
            ele: 99,
            method: "interpolated",
            originalEle: 20,
          },
        ],
        "elevation",
        "fix/2",
      ),
    ]);
    expect(view.segments[2].points[0].ele).toBe(99);
    expect(view.segments[2].points[0].workingEle?.ele).toBe(99);
    expect(view.segments[1].points[0].ele).toBe(20); // the source is untouched
  });

  it("a split piece can be time-sorted (the derived segment id composes)", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-duplicate", segmentId: sid("t0s1") }], "copy", "fix/1"),
      edit([{ kind: "segment-sort", segmentId: sid("t0s1~d1") }], "sort", "fix/2"),
    ]);
    expect(view.working?.sortedSegmentIds).toContain("t0s1~d1");
  });
});

describe("segment-order", () => {
  const data = parseXml(XML);

  it("permutes the segments within their tracks", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-order", order: [sid("t1s0"), sid("t0s1"), sid("t0s0")] }], "reorder"),
    ]);
    // The global list follows the entry; each segment keeps its track.
    expect(idsOf(view)).toEqual(["t1s0", "t0s1", "t0s0"]);
    expect(view.segments[0].trackIndex).toBe(1);
    expect(view.segments[1].trackIndex).toBe(0);
    expect(view.working).toMatchObject({ reorderedSegmentCount: 1 });
  });

  it("segments the order does not mention keep their relative order at the end", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-order", order: [sid("t1s0")] }], "reorder"),
    ]);
    expect(idsOf(view)).toEqual(["t1s0", "t0s0", "t0s1"]);
  });

  it("reordering after a split moves the pieces like any other segment", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-split", segmentId: sid("t0s0"), atPointId: pid("t0s0", 1) }], "split", "fix/1"),
      edit(
        [
          {
            kind: "segment-order",
            order: [sid("t0s1"), sid("t0s0~s1"), sid("t0s0"), sid("t1s0")],
          },
        ],
        "reorder",
        "fix/2",
      ),
    ]);
    expect(idsOf(view)).toEqual(["t0s1", "t0s0~s1", "t0s0", "t1s0"]);
    expect(pointsOf(view, "t0s0~s1")).toEqual([pid("t0s0", 2), pid("t0s0", 3)]);
  });
});

describe("determinism & undo", () => {
  const data = parseXml(XML);
  const log: WorkingEdit[] = [
    edit([{ kind: "segment-split", segmentId: sid("t0s0"), atPointId: pid("t0s0", 1) }], "split", "fix/1"),
    edit([{ kind: "segment-duplicate", segmentId: sid("t0s1") }], "copy", "fix/2"),
    edit(
      [{ kind: "segment-order", order: [sid("t1s0"), sid("t0s0"), sid("t0s0~s1"), sid("t0s1"), sid("t0s1~d2")] }],
      "reorder",
      "fix/3",
    ),
    edit(
      [{ kind: "point-deletion", pointId: pid("t0s1~d2", 0) }],
      "range",
      "fix/4",
    ),
  ];

  it("the same log always derives the same structure and ids", () => {
    const first = applyWorkingEdits(data, log);
    const second = applyWorkingEdits(data, log);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(idsOf(first)).toEqual(["t1s0", "t0s0", "t0s0~s1", "t0s1", "t0s1~d2"]);
  });

  it("popping the last edit undoes exactly it (the log is the undo stack)", () => {
    const full = applyWorkingEdits(data, log);
    const withoutLast = applyWorkingEdits(data, log.slice(0, -1));
    expect(pointsOf(full, "t0s1~d2")).toEqual([pid("t0s1~d2", 1)]);
    expect(pointsOf(withoutLast, "t0s1~d2")).toEqual([
      pid("t0s1~d2", 0),
      pid("t0s1~d2", 1),
    ]);
  });

  it("an empty tail restores the pristine structure (ids included)", () => {
    const undone = applyWorkingEdits(data, []);
    expect(idsOf(undone)).toEqual(["t0s0", "t0s1", "t1s0"]);
    expect(undone).toBe(data);
  });
});

describe("workingMetaOf mirrors the applied meta", () => {
  const data = parseXml(XML);
  const log: WorkingEdit[] = [
    edit([{ kind: "segment-split", segmentId: sid("t0s0"), atPointId: pid("t0s0", 1) }], "split", "fix/1"),
    edit([{ kind: "segment-duplicate", segmentId: sid("t0s1") }], "copy", "fix/2"),
    edit(
      [
        { kind: "point-deletion", pointId: pid("t0s0", 0) },
        { kind: "point-deletion", pointId: pid("t0s1~d2", 0) },
      ],
      "range",
      "fix/3",
    ),
  ];

  it("counts entries the same way the view does", () => {
    const meta = workingMetaOf(log);
    expect(meta).toEqual(applyWorkingEdits(data, log).working);
    expect(meta.splitCount).toBe(1);
    expect(meta.duplicatedSegmentCount).toBe(1);
    expect(meta.deletedPointCount).toBe(2);
  });
});
