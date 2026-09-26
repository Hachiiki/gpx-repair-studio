// @vitest-environment jsdom
/**
 * Unit tests — state/elevation-store.ts (Phase 6): the per-gap record
 * state machine (begin → progress → finish), gap-scoped writes, prune,
 * and reset.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useElevationStore } from "@/state/elevation-store";
import type { GapId } from "@/types/domain";

const GAP_A = "gap/t0s0:2/t0s0:3" as GapId;
const GAP_B = "gap/t0s0:3/t0s0:4" as GapId;

beforeEach(() => {
  useElevationStore.getState().reset();
});

describe("elevation store", () => {
  it("begins a fetch with the provenance snapshot", () => {
    useElevationStore.getState().beginFetch(GAP_A, {
      providerId: "opentopodata",
      fetchedAtRevision: 3,
      fetchedAtRoadSignature: "none",
      totalPoints: 900,
      sentPoints: 340,
    });
    const record = useElevationStore.getState().byGap[GAP_A];
    expect(record).toMatchObject({
      status: "fetching",
      providerId: "opentopodata",
      fetchedAtRevision: 3,
      fetchedAtRoadSignature: "none",
      samples: [],
      totalPoints: 900,
      sentPoints: 340,
      answeredPoints: 0,
      resolvedPoints: 0,
    });
  });

  it("streams progress only while the fetch owns the record", () => {
    const store = useElevationStore.getState();
    const seq = store.beginFetch(GAP_A, {
      providerId: "opentopodata",
      fetchedAtRevision: 1,
      fetchedAtRoadSignature: "none",
      totalPoints: 10,
      sentPoints: 10,
    });
    store.setProgress(GAP_A, seq, 5, 4);
    expect(useElevationStore.getState().byGap[GAP_A]).toMatchObject({
      answeredPoints: 5,
      resolvedPoints: 4,
    });

    store.finish(GAP_A, seq, {
      status: "complete",
      samples: [{ cumDistanceM: 0, ele: 12 }],
      resolvedPoints: 10,
    });
    // Late progress ticks after finish are ignored.
    store.setProgress(GAP_A, seq, 9, 9);
    expect(useElevationStore.getState().byGap[GAP_A]).toMatchObject({
      status: "complete",
      answeredPoints: 5,
      resolvedPoints: 10,
    });
  });

  it("finishes with partial/failed statuses and error copy", () => {
    const store = useElevationStore.getState();
    const seq = store.beginFetch(GAP_A, {
      providerId: "opentopodata",
      fetchedAtRevision: 1,
      fetchedAtRoadSignature: "none",
      totalPoints: 10,
      sentPoints: 10,
    });
    store.finish(GAP_A, seq, {
      status: "failed",
      samples: [],
      resolvedPoints: 0,
      error: "unreachable",
    });
    expect(useElevationStore.getState().byGap[GAP_A]).toMatchObject({
      status: "failed",
      error: "unreachable",
    });
  });

  it("finish only touches a fetching record (a newer fetch wins)", () => {
    const store = useElevationStore.getState();
    const firstSeq = store.beginFetch(GAP_A, {
      providerId: "opentopodata",
      fetchedAtRevision: 1,
      fetchedAtRoadSignature: "none",
      totalPoints: 10,
      sentPoints: 10,
    });
    // A second fetch replaces the record (a re-estimate while the first
    // is in flight) — the FIRST fetch's late finish must be dropped.
    store.beginFetch(GAP_A, {
      providerId: "opentopodata",
      fetchedAtRevision: 2,
      fetchedAtRoadSignature: "none",
      totalPoints: 12,
      sentPoints: 12,
    });
    store.finish(GAP_A, firstSeq, {
      status: "complete",
      samples: [{ cumDistanceM: 0, ele: 1 }],
      resolvedPoints: 10,
    });
    // Still fetching with the SECOND fetch's numbers.
    expect(useElevationStore.getState().byGap[GAP_A]).toMatchObject({
      status: "fetching",
      totalPoints: 12,
      samples: [],
    });
  });

  it("clears, prunes unknown gaps, and resets", () => {
    const store = useElevationStore.getState();
    for (const gap of [GAP_A, GAP_B]) {
      const seq = store.beginFetch(gap, {
        providerId: "opentopodata",
        fetchedAtRevision: 1,
        fetchedAtRoadSignature: "none",
        totalPoints: 5,
        sentPoints: 5,
      });
      store.finish(gap, seq, {
        status: "complete",
        samples: [{ cumDistanceM: 0, ele: 1 }],
        resolvedPoints: 5,
      });
    }

    useElevationStore.getState().clear(GAP_B);
    expect(useElevationStore.getState().byGap[GAP_B]).toBeUndefined();
    expect(useElevationStore.getState().byGap[GAP_A]).toBeDefined();

    useElevationStore.getState().prune([GAP_B]);
    expect(useElevationStore.getState().byGap[GAP_A]).toBeUndefined();

    useElevationStore.getState().reset();
    expect(Object.keys(useElevationStore.getState().byGap)).toHaveLength(0);
  });
});
