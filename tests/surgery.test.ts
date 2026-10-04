// @vitest-environment jsdom
/**
 * Surgery planner tests (Phase 16, §EE 16.1): every operation is
 * planned purely before it exists — entries, guards, and the
 * what-would-change lines the preview dialog renders.
 */

import { translateLabel, translatorFor } from "@/i18n/runtime";

const t = translatorFor("en");
const labelOf = (l: unknown) => translateLabel(t, l as never);

import { describe, expect, it } from "vitest";
import { parseXml } from "./helpers/gpxTestUtils";
import { applyWorkingEdits } from "@/features/validation/workingCopy";
import {
  isSurgeryKind,
  locateWorkingPoint,
  planDeleteRange,
  planDuplicateSegment,
  planSegmentOrder,
  planSplitSegment,
  reasonOfSurgeryKind,
} from "@/features/validation/surgery";
import { editFromPlan } from "@/features/validation/fixes";
import type { SegmentId } from "@/types/domain";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Surgery" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>A</name>
 <trkseg>
  <trkpt lat="0" lon="0"><ele>10</ele><time>2024-05-01T07:00:00Z</time></trkpt>
  <trkpt lat="0.001" lon="0"><ele>11</ele><time>2024-05-01T07:00:10Z</time></trkpt>
  <trkpt lat="0.002" lon="0"><ele>12</ele><time>2024-05-01T07:00:20Z</time></trkpt>
  <trkpt lat="0.003" lon="0"><ele>13</ele><time>2024-05-01T07:00:30Z</time></trkpt>
 </trkseg>
 <trkseg>
  <trkpt lat="0.1" lon="0.1"><ele>20</ele><time>2024-05-01T08:00:00Z</time></trkpt>
  <trkpt lat="0.101" lon="0.1"><ele>21</ele><time>2024-05-01T08:00:10Z</time></trkpt>
 </trkseg>
</trk>
</gpx>`;

const sid = (s: string) => s as SegmentId;

describe("planSplitSegment", () => {
  const data = parseXml(XML);

  it("plans the cut with its entries and honest summary", () => {
    const plan = planSplitSegment(data, sid("t0s0"), "t0s0:1");
    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe("split-segment");
    expect(plan?.entries).toEqual([
      { kind: "segment-split", segmentId: sid("t0s0"), atPointId: "t0s0:1" as never },
    ]);
    expect(labelOf(plan?.label)).toContain("after point #2");
    expect(labelOf(plan?.summary?.[0])).toContain("the 2 points after it move");
  });

  it("refuses the last point (the cut would be empty)", () => {
    expect(planSplitSegment(data, sid("t0s0"), "t0s0:3")).toBeNull();
  });

  it("refuses unknown segments and points", () => {
    expect(planSplitSegment(data, sid("t9s9"), "t0s0:1")).toBeNull();
    expect(planSplitSegment(data, sid("t0s0"), "t0s1:0")).toBeNull();
  });
});

describe("planDeleteRange", () => {
  const data = parseXml(XML);

  it("plans N point-deletions for the inclusive stretch (either order)", () => {
    const forward = planDeleteRange(data, sid("t0s0"), "t0s0:1", "t0s0:3");
    const backward = planDeleteRange(data, sid("t0s0"), "t0s0:3", "t0s0:1");
    expect(forward?.entries).toEqual(backward?.entries);
    expect(forward?.entries).toHaveLength(3);
    expect(forward?.entries.every((e) => e.kind === "point-deletion")).toBe(true);
    expect(labelOf(forward?.label)).toContain("3 points");
  });

  it("the whole segment is legal and says so", () => {
    const plan = planDeleteRange(data, sid("t0s1"), "t0s1:0", "t0s1:1");
    expect(plan?.entries).toHaveLength(2);
    expect(plan?.summary.map((s) => labelOf(s)).join(" ")).toContain("empty segment");
  });

  it("refuses endpoints outside the segment", () => {
    expect(planDeleteRange(data, sid("t0s1"), "t0s1:0", "t0s0:2")).toBeNull();
  });
});

describe("planDuplicateSegment", () => {
  const data = parseXml(XML);

  it("plans one entry and discloses the id rewrite and extras", () => {
    const plan = planDuplicateSegment(data, sid("t0s0"));
    expect(plan?.entries).toEqual([
      { kind: "segment-duplicate", segmentId: sid("t0s0") },
    ]);
    expect(labelOf(plan?.label)).toContain("4 points");
    expect(plan?.summary.map((s) => labelOf(s)).join(" ")).toContain("fresh ids");
    expect(plan?.summary.map((s) => labelOf(s)).join(" ")).toContain("not copied");
  });

  it("refuses empty or unknown segments", () => {
    expect(planDuplicateSegment(data, sid("t9s9"))).toBeNull();
  });
});

describe("planSegmentOrder", () => {
  const data = parseXml(XML);

  it("plans the permutation and counts the movers (a swap moves both)", () => {
    const plan = planSegmentOrder(data, [sid("t0s1"), sid("t0s0")]);
    expect(plan?.entries).toEqual([
      { kind: "segment-order", order: [sid("t0s1"), sid("t0s0")] },
    ]);
    expect(labelOf(plan?.label)).toContain("2 move");
  });

  it("refuses a non-permutation (missing, extra, or duplicate ids)", () => {
    expect(planSegmentOrder(data, [sid("t0s0")])).toBeNull();
    expect(planSegmentOrder(data, [sid("t0s0"), sid("t0s1"), sid("t9s9")])).toBeNull();
    expect(planSegmentOrder(data, [sid("t0s0"), sid("t0s0"), sid("t0s1")])).toBeNull();
  });

  it("refuses the identity order (nothing would change)", () => {
    expect(planSegmentOrder(data, [sid("t0s0"), sid("t0s1")])).toBeNull();
  });
});

describe("kind vocabulary & the shared preview flow", () => {
  it("isSurgeryKind discriminates and reasons map", () => {
    expect(isSurgeryKind("split-segment")).toBe(true);
    expect(isSurgeryKind("delete-range")).toBe(true);
    expect(isSurgeryKind("dedupe")).toBe(false);
    expect(reasonOfSurgeryKind("split-segment")).toBe("split");
    expect(reasonOfSurgeryKind("delete-range")).toBe("range");
    expect(reasonOfSurgeryKind("duplicate-segment")).toBe("copy");
    expect(reasonOfSurgeryKind("reorder-segments")).toBe("reorder");
  });

  it("editFromPlan stamps a surgery plan with its reason (one undo step)", () => {
    const plan = planSplitSegment(parseXml(XML), sid("t0s0"), "t0s0:1");
    const stamped = editFromPlan(plan!, "fix/9", 42);
    expect(stamped.reason).toBe("split");
    expect(stamped.id).toBe("fix/9");
    expect(stamped.appliedAt).toBe(42);
  });

  it("a planned + applied surgery op lands in the working view", () => {
    const data = parseXml(XML);
    const plan = planSplitSegment(data, sid("t0s0"), "t0s0:1");
    const view = applyWorkingEdits(data, [editFromPlan(plan!, "fix/1", 1)]);
    expect(view.segments.map((s) => s.id)).toEqual(["t0s0", "t0s0~s1", "t0s1"]);
  });
});

describe("locateWorkingPoint (the pick resolver)", () => {
  it("locates original and derived ids alike", () => {
    const data = parseXml(XML);
    expect(locateWorkingPoint(data, "t0s1:1")).toEqual({
      segmentId: sid("t0s1"),
      index: 1,
      count: 2,
    });
    const split = applyWorkingEdits(data, [
      editFromPlan(planSplitSegment(data, sid("t0s0"), "t0s0:1")!, "fix/1", 1),
    ]);
    // The tail point keeps its original id but lives in the piece.
    expect(locateWorkingPoint(split, "t0s0:2")).toEqual({
      segmentId: sid("t0s0~s1"),
      index: 0,
      count: 2,
    });
    expect(locateWorkingPoint(split, "nowhere:0")).toBeNull();
  });
});
