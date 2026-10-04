// @vitest-environment jsdom
/**
 * Batch-summary tests (Phase 19, §EE 19.2 "per-batch manifest
 * variant"): the printable table's pure core.
 *
 * Pins the contract: parsed files carry their numbers, their
 * working-meta counts (the MANIFEST vocabulary), and a thumbnail;
 * failed files stay listed with no numbers; the aggregate reconciles
 * with the rows.
 */

import { describe, expect, it } from "vitest";
import { parseFixture } from "./helpers/gpxTestUtils";
import { buildBatchSummary } from "@/features/compare/batchSummary";
import type { BatchSummaryItem } from "@/features/compare/batchSummary";
import type { WorkingEdit } from "@/types/domain";

type PointId = import("@/types/domain").PointId;
const pid = (i: number) => `t0s0:${i}` as PointId;

function edit(entries: WorkingEdit["entries"]): WorkingEdit {
  return { id: "fix/1", label: "test fix", reason: "spike", appliedAt: 1, entries };
}

function parsedItem(
  fileName: string,
  edits: readonly WorkingEdit[] = [],
  presetName: string | null = null,
): BatchSummaryItem {
  const data = parseFixture("deep-defects.gpx");
  return {
    fileName,
    status: "parsed",
    data,
    edits,
    working: null, // the builder never reads it (the meta comes from edits)
    presetName,
  };
}

describe("buildBatchSummary — rows", () => {
  it("a parsed clean file: numbers, no changes, a thumbnail", () => {
    const summary = buildBatchSummary([parsedItem("ride.gpx")]);
    expect(summary.rows).toHaveLength(1);
    const row = summary.rows[0];
    expect(row.status).toBe("parsed");
    expect(row.pointCount).toBeGreaterThan(0);
    expect(row.distanceM).toBeGreaterThan(0);
    expect(row.changed).toBe(false);
    expect(row.snapshotSvg).not.toBeNull();
    expect(row.snapshotSvg).toContain("<polyline");
  });

  it("a fixed file carries its working-meta counts and preset", () => {
    const summary = buildBatchSummary([
      parsedItem(
        "ride.gpx",
        [
          edit([
            { kind: "point-deletion", pointId: pid(3) },
            { kind: "point-deletion", pointId: pid(7) },
          ]),
          edit([{ kind: "segment-sort", segmentId: "t0s0" as never }]),
        ],
        "Drift cleanup",
      ),
    ]);
    const row = summary.rows[0];
    expect(row.changed).toBe(true);
    expect(row.deletedPoints).toBe(2);
    expect(row.sortedSegments).toBe(1);
    expect(row.presetName).toBe("Drift cleanup");
  });

  it("a failed file stays listed, honestly numberless", () => {
    const summary = buildBatchSummary([
      {
        fileName: "broken.gpx",
        status: "failed",
        data: null,
        edits: [],
        working: null,
        presetName: null,
      },
    ]);
    const row = summary.rows[0];
    expect(row.status).toBe("failed");
    expect(row.pointCount).toBeNull();
    expect(row.distanceM).toBeNull();
    expect(row.snapshotSvg).toBeNull();
    expect(row.changed).toBe(false);
  });

  it("queued/parsing files read as pending", () => {
    const summary = buildBatchSummary([
      {
        fileName: "waiting.gpx",
        status: "queued",
        data: null,
        edits: [],
        working: null,
        presetName: null,
      },
    ]);
    expect(summary.rows[0].status).toBe("pending");
  });
});

describe("buildBatchSummary — the aggregate", () => {
  it("reconciles with the rows", () => {
    const summary = buildBatchSummary([
      parsedItem("a.gpx"),
      parsedItem("b.gpx", [edit([{ kind: "point-deletion", pointId: pid(3) }])]),
      {
        fileName: "broken.gpx",
        status: "failed",
        data: null,
        edits: [],
        working: null,
        presetName: null,
      },
    ]);
    const aggregate = summary.aggregate;
    expect(aggregate.total).toBe(3);
    expect(aggregate.parsed).toBe(2);
    expect(aggregate.failed).toBe(1);
    expect(aggregate.changed).toBe(1);
    expect(aggregate.deletedPoints).toBe(1);
    expect(aggregate.recordedPoints).toBeGreaterThan(0);
    expect(aggregate.recordedDistanceM).toBeGreaterThan(0);
    // The recorded figures sum the PARSED originals.
    const expectedPoints = summary.rows
      .filter((row) => row.pointCount !== null)
      .reduce((sum, row) => sum + (row.pointCount ?? 0), 0);
    expect(aggregate.recordedPoints).toBe(expectedPoints);
  });

  it("an empty queue aggregates to zeros", () => {
    const summary = buildBatchSummary([]);
    expect(summary.rows).toEqual([]);
    expect(summary.aggregate).toEqual({
      total: 0,
      parsed: 0,
      failed: 0,
      changed: 0,
      deletedPoints: 0,
      recordedPoints: 0,
      recordedDistanceM: 0,
    });
  });
});
