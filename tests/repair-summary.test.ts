// @vitest-environment jsdom
/**
 * Repair-summary tests (Phase 19, §EE 19.2): the provenance table's
 * pure core.
 *
 * Pins the contract: zero-count kinds are omitted (the table states
 * what happened); every kind carries its count, its provenance word,
 * and its honest disclosure; the history preserves log order; the
 * total counts modifications but never the skipped gaps.
 */

import { translatorFor } from "@/i18n/runtime";

const t = translatorFor("en");
import { describe, expect, it } from "vitest";
import { buildRepairSummary } from "@/features/compare/repairSummary";
import type { WorkingEdit } from "@/types/domain";

type PointId = import("@/types/domain").PointId;
type SegmentId = import("@/types/domain").SegmentId;
const pid = (i: number) => `t0s0:${i}` as PointId;

function edit(
  entries: WorkingEdit["entries"],
  id = "fix/1",
  label = "test fix",
): WorkingEdit {
  return { id, label, reason: "spike", appliedAt: 5_000, entries };
}

const NO_REPAIR = {
  edits: [] as readonly import("@/types/domain").WorkingEdit[],
  repair: null,
  skippedGapIds: [],
  reimportMarkerCount: 0,
};

describe("buildRepairSummary — the pristine case", () => {
  it("no edits, no repairs → empty table, zero changes", () => {
    const summary = buildRepairSummary(NO_REPAIR);
    expect(summary.rows).toEqual([]);
    expect(summary.totalChanges).toBe(0);
    expect(summary.history).toEqual([]);
  });
});

describe("buildRepairSummary — working-copy rows", () => {
  it("deletions, sorts, and overrides each get their row", () => {
    const summary = buildRepairSummary({
      ...NO_REPAIR,
      edits: [
        edit([
          { kind: "point-deletion", pointId: pid(3) },
          { kind: "point-deletion", pointId: pid(4) },
        ]),
        edit([{ kind: "segment-sort", segmentId: "t0s0" as SegmentId }], "fix/2", "sort fix"),
        edit(
          [
            {
              kind: "elevation-override",
              pointId: pid(9),
              ele: 42,
              method: "interpolated",
            },
          ],
          "fix/3",
          "smooth fix",
        ),
      ],
    });
    const kinds = summary.rows.map((row) => row.kind);
    expect(kinds).toEqual(["filtered", "sorted", "estimated"]);
    expect(summary.rows[0]).toMatchObject({
      labelKey: "summary.row.filtered",
      count: 2,
      provenance: "modified",
    });
    expect(summary.rows[1]).toMatchObject({
      count: 1,
      provenance: "estimated",
    });
    expect(summary.rows[2]).toMatchObject({
      count: 1,
      provenance: "estimated",
    });
    expect(summary.totalChanges).toBe(4);
    // History keeps log order with labels.
    expect(summary.history.map((h) => h.label)).toEqual([
      "test fix",
      "sort fix",
      "smooth fix",
    ]); // legacy string labels render verbatim (LocalLabel passthrough)
  });

  it("structural entries surface as structure rows", () => {
    const summary = buildRepairSummary({
      ...NO_REPAIR,
      edits: [
        edit([
          { kind: "segment-split", segmentId: "t0s0" as SegmentId, atPointId: pid(2) },
          { kind: "segment-duplicate", segmentId: "t0s0" as SegmentId },
          {
            kind: "segment-order",
            order: ["t0s0" as SegmentId, "t0s0~s1" as SegmentId],
          },
        ]),
      ],
    });
    const labels = summary.rows.map((row) => t(row.labelKey));
    expect(labels).toEqual([
      "Segments split",
      "Segment copies inserted",
      "Manual reorders",
    ]);
    expect(summary.rows.every((row) => row.provenance === "modified")).toBe(
      true,
    );
  });
});

describe("buildRepairSummary — the repair population", () => {
  it("reconstructions, snapped legs, skipped gaps, and re-imports", () => {
    const summary = buildRepairSummary({
      edits: [],
      repair: {
        gapCount: 3,
        snappedLegs: [
          {
            a: { lat: 0, lon: 0 },
            b: { lat: 0.001, lon: 0 },
            coordinates: [
              [0, 0],
              [0, 0.001],
            ],
            routeDistanceM: 120,
          },
          {
            a: { lat: 0.001, lon: 0 },
            b: { lat: 0.002, lon: 0 },
            coordinates: [
              [0, 0.001],
              [0, 0.002],
            ],
            routeDistanceM: 110,
          },
        ],
      },
      skippedGapIds: ["gap/a/b" as never, "gap/c/d" as never],
      reimportMarkerCount: 14,
    });
    const kinds = summary.rows.map((row) => row.kind);
    expect(kinds).toEqual(["authored", "snapped", "skipped", "estimated"]);
    expect(summary.rows[0].count).toBe(3);
    expect(summary.rows[1].count).toBe(2);
    expect(summary.rows[2].count).toBe(2);
    expect(summary.rows[3].count).toBe(14);
    // Skipped gaps are not modifications.
    expect(summary.totalChanges).toBe(3 + 2 + 14);
    expect(summary.history).toEqual([]);
  });
});
