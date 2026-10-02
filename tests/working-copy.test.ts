// @vitest-environment jsdom
/**
 * Working-copy layer tests (Phase 13, §EE 13.2 verification: "fix
 * round-trip unit tests").
 *
 * Pins the layer's contract: the original is never mutated, the empty
 * log returns the original OBJECT (identity — effect keys stay quiet),
 * deletions/sorts/overrides compose in log order, segment extras
 * re-anchor honestly, and applying → undoing restores the pristine view.
 */

import { describe, expect, it } from "vitest";
import { parseFixture, parseXml } from "./helpers/gpxTestUtils";
import {
  applyWorkingEdits,
  PRISTINE_META,
  workingMetaOf,
} from "@/features/validation/workingCopy";
import type { WorkingEdit } from "@/types/domain";

const pid = (i: number) => `t0s0:${i}` as import("@/types/domain").PointId;

function edit(
  entries: WorkingEdit["entries"],
  reason: WorkingEdit["reason"] = "spike",
  id = "fix/1",
): WorkingEdit {
  return { id, label: "test fix", reason, appliedAt: 1_000, entries };
}

describe("applyWorkingEdits — the identity rule", () => {
  it("returns the original object itself when the log is empty", () => {
    const data = parseFixture("deep-defects.gpx");
    const view = applyWorkingEdits(data, []);
    expect(view).toBe(data);
  });

  it("derives a pristine meta for the empty log", () => {
    expect(workingMetaOf([])).toEqual(PRISTINE_META);
  });
});

describe("applyWorkingEdits — point deletions", () => {
  const data = parseFixture("deep-defects.gpx");

  it("removes exactly the deleted points and no others", () => {
    const view = applyWorkingEdits(data, [
      edit([
        { kind: "point-deletion", pointId: pid(10) },
        { kind: "point-deletion", pointId: pid(11) },
      ]),
    ]);
    expect(view.segments[0].points).toHaveLength(43);
    const ids = view.segments[0].points.map((p) => p.id);
    expect(ids).not.toContain(pid(10));
    expect(ids).not.toContain(pid(11));
    expect(ids[9]).toBe(pid(9));
    expect(ids[10]).toBe(pid(12));
  });

  it("never mutates the original model", () => {
    const before = JSON.stringify(data.segments[0].points.map((p) => p.id));
    applyWorkingEdits(data, [
      edit([{ kind: "point-deletion", pointId: pid(1) }]),
    ]);
    expect(JSON.stringify(data.segments[0].points.map((p) => p.id))).toBe(
      before,
    );
    expect(data.segments[0].points).toHaveLength(45);
  });

  it("labels the meta with the deleted count", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "point-deletion", pointId: pid(10) }]),
    ]);
    expect(view.working).toEqual({
      deletedPointCount: 1,
      sortedSegmentIds: [],
      overriddenEleCount: 0,
      hasEdits: true,
    });
  });

  it("deleting an already-deleted point is a no-op (logs compose)", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "point-deletion", pointId: pid(10) }], "spike", "fix/1"),
      edit([{ kind: "point-deletion", pointId: pid(10) }], "duplicate", "fix/2"),
    ]);
    expect(view.segments[0].points).toHaveLength(44);
  });
});

describe("applyWorkingEdits — segment sort", () => {
  const data = parseFixture("deep-defects.gpx");

  it("stably reorders by timestamp (the backwards block moves)", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-sort", segmentId: "t0s0" as import("@/types/domain").SegmentId }], "sort"),
    ]);
    const times = view.segments[0].points.map((p) => p.time);
    const sorted = [...times].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
    expect(times).toEqual(sorted);
    // The point count is unchanged; the original untouched.
    expect(view.segments[0].points).toHaveLength(45);
    expect(data.segments[0].points[15].time).toBe(
      new Date("2024-05-01T10:00:04Z").getTime(),
    );
  });

  it("records the sorted segment in the meta", () => {
    const view = applyWorkingEdits(data, [
      edit([{ kind: "segment-sort", segmentId: "t0s0" as import("@/types/domain").SegmentId }], "sort"),
    ]);
    expect(view.working?.sortedSegmentIds).toEqual(["t0s0"]);
    expect(view.working?.deletedPointCount).toBe(0);
  });
});

describe("applyWorkingEdits — elevation overrides", () => {
  const data = parseFixture("deep-defects.gpx");

  it("replaces the ele and keeps the provenance", () => {
    const view = applyWorkingEdits(data, [
      edit(
        [
          {
            kind: "elevation-override",
            pointId: pid(20),
            ele: 50.5,
            method: "interpolated",
            originalEle: 118,
          },
        ],
        "elevation",
      ),
    ]);
    const point = view.segments[0].points.find((p) => p.id === pid(20));
    expect(point?.ele).toBe(50.5);
    expect(point?.workingEle).toEqual({
      ele: 50.5,
      method: "interpolated",
      originalEle: 118,
    });
    // The raw capture keeps the recorded text (identity export basis).
    expect(point?.raw.children).toEqual(data.segments[0].points[20].raw.children);
  });

  it("counts overrides in the meta (a point overridden twice counts once)", () => {
    const view = applyWorkingEdits(data, [
      edit(
        [
          {
            kind: "elevation-override",
            pointId: pid(20),
            ele: 50.5,
            method: "interpolated",
          },
        ],
        "elevation",
        "fix/1",
      ),
      edit(
        [
          {
            kind: "elevation-override",
            pointId: pid(20),
            ele: 51,
            method: "interpolated",
          },
        ],
        "elevation",
        "fix/2",
      ),
    ]);
    expect(view.working?.overriddenEleCount).toBe(1);
    expect(
      view.segments[0].points.find((p) => p.id === pid(20))?.ele,
    ).toBe(51);
  });
});

describe("applyWorkingEdits — extras re-anchoring", () => {
  const xml =
    `<?xml version="1.0"?><gpx version="1.1" creator="t" ` +
    `xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>` +
    // 4 timed points, a vendor extra after point 1, another after point 3.
    `<trkpt lat="52.5" lon="13.4"><ele>40</ele><time>2024-05-01T10:00:00Z</time></trkpt>` +
    `<trkpt lat="52.501" lon="13.4"><ele>41</ele><time>2024-05-01T10:00:03Z</time></trkpt>` +
    `<extensions><vendor:note xmlns:vendor="urn:v">after-1</vendor:note></extensions>` +
    `<trkpt lat="52.502" lon="13.4"><ele>42</ele><time>2024-05-01T10:00:06Z</time></trkpt>` +
    `<trkpt lat="52.503" lon="13.4"><ele>43</ele><time>2024-05-01T10:00:09Z</time></trkpt>` +
    `<extensions><vendor:note xmlns:vendor="urn:v">after-3</vendor:note></extensions>` +
    `</trkseg></trk></gpx>`;

  it("keeps an extra behind its surviving anchor point", () => {
    const data = parseXml(xml);
    expect(data.segments[0].extras).toHaveLength(2);
    // Delete point 1 (the extra after it rides behind the survivor before it).
    const view = applyWorkingEdits(data, [
      edit([{ kind: "point-deletion", pointId: pid(1) }]),
    ]);
    const extras = view.segments[0].extras;
    // afterPointCount 2 (followed original point 1, gone) -> after survivor 0.
    expect(extras.find((e) => e.xml.includes("after-1"))?.afterPointCount).toBe(
      1,
    );
    // afterPointCount 4 (followed original point 3, alive at index 2) -> 3.
    expect(extras.find((e) => e.xml.includes("after-3"))?.afterPointCount).toBe(
      3,
    );
  });
});

describe("applyWorkingEdits — undo round-trips", () => {
  const data = parseFixture("deep-defects.gpx");

  it("applying a log then emptying it restores the identity view", () => {
    const edits: WorkingEdit[] = [
      edit(
        [
          { kind: "point-deletion", pointId: pid(10) },
          { kind: "point-deletion", pointId: pid(11) },
        ],
        "spike",
        "fix/1",
      ),
      edit(
        [{ kind: "segment-sort", segmentId: "t0s0" as import("@/types/domain").SegmentId }],
        "sort",
        "fix/2",
      ),
    ];
    const fixed = applyWorkingEdits(data, edits);
    expect(fixed.segments[0].points).toHaveLength(43);
    expect(fixed.working?.hasEdits).toBe(true);
    // Undo pops the tail: only the sort remains applied.
    const afterUndo = applyWorkingEdits(data, edits.slice(0, 1));
    expect(afterUndo.segments[0].points).toHaveLength(43);
    expect(afterUndo.working?.sortedSegmentIds).toEqual([]);
    // Both undone: the identity object.
    expect(applyWorkingEdits(data, [])).toBe(data);
  });
});
