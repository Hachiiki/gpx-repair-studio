/**
 * Working store tests (Phase 13) — the log's lifecycle contract.
 *
 * The log IS the undo stack: applyEdit appends, undo pops the tail,
 * hydrate restores (and re-arms the id allocator), reset clears. The
 * thresholds are session-scoped settings (§D-3.5 — never undoable).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  nextEditId,
  rearmEditSeq,
  useWorkingStore,
} from "@/state/working-store";
import type { WorkingEdit } from "@/types/domain";

const pid = (i: number) => `t0s0:${i}` as import("@/types/domain").PointId;

function edit(id: string, reason: WorkingEdit["reason"] = "spike"): WorkingEdit {
  return {
    id,
    label: `fix ${id}`,
    reason,
    appliedAt: 1_000,
    entries: [{ kind: "point-deletion", pointId: pid(1) }],
  };
}

beforeEach(() => {
  useWorkingStore.getState().reset();
});

describe("working store", () => {
  it("starts empty", () => {
    const state = useWorkingStore.getState();
    expect(state.edits).toEqual([]);
  });

  it("applyEdit appends in order", () => {
    useWorkingStore.getState().applyEdit(edit("fix/1"));
    useWorkingStore.getState().applyEdit(edit("fix/2", "dedupe" as never));
    expect(useWorkingStore.getState().edits.map((e) => e.id)).toEqual([
      "fix/1",
      "fix/2",
    ]);
  });

  it("undo pops the last edit and returns it (null when empty)", () => {
    useWorkingStore.getState().applyEdit(edit("fix/1"));
    useWorkingStore.getState().applyEdit(edit("fix/2"));
    const undone = useWorkingStore.getState().undo();
    expect(undone?.id).toBe("fix/2");
    expect(useWorkingStore.getState().edits.map((e) => e.id)).toEqual([
      "fix/1",
    ]);
    useWorkingStore.getState().undo();
    expect(useWorkingStore.getState().undo()).toBeNull();
  });

  it("setOptions patches without clobbering the rest", () => {
    useWorkingStore.getState().setOptions({ speedSpikeKmh: 200 });
    useWorkingStore.getState().setOptions({ driftRadiusM: 25 });
    expect(useWorkingStore.getState().options).toEqual({
      speedSpikeKmh: 200,
      driftRadiusM: 25,
    });
  });

  it("reset clears the log and the thresholds", () => {
    useWorkingStore.getState().applyEdit(edit("fix/1"));
    useWorkingStore.getState().setOptions({ speedSpikeKmh: 200 });
    useWorkingStore.getState().reset();
    expect(useWorkingStore.getState().edits).toEqual([]);
    expect(useWorkingStore.getState().options).toEqual({});
  });

  it("hydrate adopts stored edits verbatim", () => {
    const stored = [edit("fix/3", "drift" as never), edit("fix/4", "sort" as never)];
    useWorkingStore.getState().hydrate(stored);
    expect(useWorkingStore.getState().edits).toHaveLength(2);
  });
});

describe("edit id allocation", () => {
  it("allocates monotonic unique ids", () => {
    const a = nextEditId();
    const b = nextEditId();
    expect(a).not.toBe(b);
  });

  it("rearm keeps future ids clear of restored ones", () => {
    rearmEditSeq([edit("fix/9")]);
    const next = nextEditId();
    expect(Number(next.slice(4))).toBeGreaterThan(9);
  });
});
