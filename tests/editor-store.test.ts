/**
 * Unit tests — the editor store (state/editor-store.ts).
 *
 * The editor state machine (Phase 4 acceptance "editor state machine"):
 * open → draw (add/insert/move/delete) → undo/redo/clear → close, plus
 * skip transitions, prune-on-re-detection, reset-on-new-file, and the
 * derived gap-status join. Runs against the real zustand store outside
 * React (plain node environment).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  activeReconstruction,
  deriveGapStatus,
  useEditorStore,
} from "@/state/editor-store";
import { MAX_VERTICES } from "@/features/reconstruction/drawModel";
import type { GapId, VertexId } from "@/types/domain";
import { vertexId } from "@/types/ids";

const gapA = "gap/t0s0:0/t0s0:4" as GapId;
const gapB = "gap/t0s0:4/t0s0:8" as GapId;

const pos = (lat: number, lon: number) => ({ lat, lon });

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("session lifecycle", () => {
  it("openEditor creates an empty reconstruction, enables draw mode, unskips", () => {
    useEditorStore.getState().toggleSkip(gapA);
    useEditorStore.getState().openEditor(gapA);

    const state = useEditorStore.getState();
    expect(state.activeGapId).toBe(gapA);
    expect(state.drawMode).toBe(true);
    expect(state.skippedGapIds).not.toContain(gapA);
    expect(state.reconstructions[gapA]).toMatchObject({
      gapId: gapA,
      vertices: [],
      resampleSpacingM: "off",
      geometryRevision: 0,
    });
  });

  it("closeEditor keeps the reconstruction but drops the history", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(52.52, 13.405));
    expect(useEditorStore.getState().history.undo).toHaveLength(1);

    useEditorStore.getState().closeEditor();
    const state = useEditorStore.getState();
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
    expect(state.history.undo).toHaveLength(0);
    expect(state.reconstructions[gapA].vertices).toHaveLength(1);
  });

  it("reopening the same gap restores its vertices with a fresh history", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.closeEditor();
    store.openEditor(gapA);

    const state = useEditorStore.getState();
    expect(state.reconstructions[gapA].vertices).toHaveLength(1);
    expect(state.history.undo).toHaveLength(0);
  });

  it("reset returns to the pristine state", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.toggleSkip(gapB);
    useEditorStore.getState().reset();

    const state = useEditorStore.getState();
    expect(state.activeGapId).toBeNull();
    expect(state.reconstructions).toEqual({});
    expect(state.skippedGapIds).toEqual([]);
    expect(state.vertexSeq).toBe(0);
    expect(state.snapEnabled).toBe(true);
  });
});

describe("vertex commands through the store", () => {
  it("addVertex → insertVertex → moveVertex → deleteVertex round trip", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);

    store.addVertex(pos(52.52, 13.405));
    store.addVertex(pos(52.53, 13.42));
    store.insertVertex(1, pos(52.525, 13.41));
    let vertices = useEditorStore.getState().reconstructions[gapA].vertices;
    expect(vertices.map((v) => v.lat)).toEqual([52.52, 52.525, 52.53]);

    const moved: VertexId = vertices[0].id;
    useEditorStore.getState().moveVertex(moved, { ...pos(52.521, 13.406), snappedTo: "t0s0:2" as never });
    vertices = useEditorStore.getState().reconstructions[gapA].vertices;
    expect(vertices[0].lat).toBe(52.521);
    expect(vertices[0].snappedTo).toBe("t0s0:2" as never);

    useEditorStore.getState().deleteVertex(moved);
    vertices = useEditorStore.getState().reconstructions[gapA].vertices;
    expect(vertices).toHaveLength(2);
    expect(vertices[0].lat).toBe(52.525);

    expect(useEditorStore.getState().history.undo).toHaveLength(5);
  });

  it("vertex ids are never reused within a session", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.deleteVertex(vertexId(1));
    store.addVertex(pos(3, 4));

    const vertices = useEditorStore.getState().reconstructions[gapA].vertices;
    expect(vertices.map((v) => v.id)).toEqual([vertexId(2)]);
  });

  it("the hard cap is enforced: no 129th vertex", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    for (let i = 0; i < MAX_VERTICES + 5; i += 1) {
      useEditorStore.getState().addVertex(pos(52 + i * 0.0001, 13));
    }
    const vertices = useEditorStore.getState().reconstructions[gapA].vertices;
    expect(vertices).toHaveLength(MAX_VERTICES);
  });

  it("undo/redo/clear work through the store", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.addVertex(pos(3, 4));

    useEditorStore.getState().undo();
    expect(
      useEditorStore.getState().reconstructions[gapA].vertices,
    ).toHaveLength(1);

    useEditorStore.getState().redo();
    expect(
      useEditorStore.getState().reconstructions[gapA].vertices,
    ).toHaveLength(2);

    useEditorStore.getState().clearVertices();
    expect(
      useEditorStore.getState().reconstructions[gapA].vertices,
    ).toHaveLength(0);

    // Undo restores the full cleared list.
    useEditorStore.getState().undo();
    expect(
      useEditorStore.getState().reconstructions[gapA].vertices,
    ).toHaveLength(2);
  });

  it("commands for a gap with no open editor are ignored", () => {
    useEditorStore.getState().addVertex(pos(1, 2));
    expect(useEditorStore.getState().reconstructions).toEqual({});
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().history.undo).toHaveLength(0);
  });
});

describe("settings (not commands)", () => {
  it("setResampleSpacing updates the reconstruction without touching history", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    const historyDepth = useEditorStore.getState().history.undo.length;

    useEditorStore.getState().setResampleSpacing(gapA, 25);
    const state = useEditorStore.getState();
    expect(state.reconstructions[gapA].resampleSpacingM).toBe(25);
    expect(state.reconstructions[gapA].geometryRevision).toBe(1); // from add only
    expect(state.history.undo).toHaveLength(historyDepth);
  });

  it("snapEnabled and drawMode are transient flags", () => {
    useEditorStore.getState().setDrawMode(false);
    expect(useEditorStore.getState().drawMode).toBe(false);
    useEditorStore.getState().setSnapEnabled(false);
    expect(useEditorStore.getState().snapEnabled).toBe(false);
  });

  it("setTimeStrategy updates the reconstruction without touching history", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    const historyDepth = useEditorStore.getState().history.undo.length;

    // Default from emptyReconstruction: distance-proportional.
    expect(useEditorStore.getState().reconstructions[gapA].timeStrategy).toEqual({
      kind: "distance-proportional",
    });

    useEditorStore.getState().setTimeStrategy(gapA, { kind: "uniform" });
    useEditorStore
      .getState()
      .setTimeStrategy(gapA, { kind: "manual-duration", durationMs: 300_000 });

    const state = useEditorStore.getState();
    expect(state.reconstructions[gapA].timeStrategy).toEqual({
      kind: "manual-duration",
      durationMs: 300_000,
    });
    expect(state.reconstructions[gapA].geometryRevision).toBe(1); // from add only
    expect(state.history.undo).toHaveLength(historyDepth);

    // No-op when the same manual duration is set again.
    useEditorStore
      .getState()
      .setTimeStrategy(gapA, { kind: "manual-duration", durationMs: 300_000 });
    expect(useEditorStore.getState().reconstructions[gapA].timeStrategy).toEqual({
      kind: "manual-duration",
      durationMs: 300_000,
    });

    // Unknown gap ids are ignored.
    useEditorStore.getState().setTimeStrategy(gapB, { kind: "uniform" });
    expect(useEditorStore.getState().reconstructions[gapB]).toBeUndefined();
  });

  it("fileTiming patches in place and resets with the session", () => {
    expect(useEditorStore.getState().fileTiming).toEqual({
      startMs: null,
      totalDurationMs: null,
    });

    useEditorStore.getState().setFileTiming({ startMs: 1_714_547_200_000 });
    expect(useEditorStore.getState().fileTiming.startMs).toBe(1_714_547_200_000);
    expect(useEditorStore.getState().fileTiming.totalDurationMs).toBeNull();

    useEditorStore.getState().setFileTiming({ totalDurationMs: 2_700_000 });
    expect(useEditorStore.getState().fileTiming).toEqual({
      startMs: 1_714_547_200_000,
      totalDurationMs: 2_700_000,
    });

    useEditorStore.getState().reset();
    expect(useEditorStore.getState().fileTiming).toEqual({
      startMs: null,
      totalDurationMs: null,
    });
  });
});

describe("skip transitions", () => {
  it("skipping the active gap closes its editor but keeps the repair", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));

    useEditorStore.getState().toggleSkip(gapA);
    const state = useEditorStore.getState();
    expect(state.activeGapId).toBeNull();
    expect(state.skippedGapIds).toEqual([gapA]);
    expect(state.reconstructions[gapA].vertices).toHaveLength(1);

    // Unskipping restores the repair untouched.
    useEditorStore.getState().toggleSkip(gapA);
    expect(useEditorStore.getState().skippedGapIds).toEqual([]);
    expect(
      useEditorStore.getState().reconstructions[gapA].vertices,
    ).toHaveLength(1);
  });

  it("other gaps can be skipped without an editor", () => {
    useEditorStore.getState().toggleSkip(gapB);
    expect(useEditorStore.getState().skippedGapIds).toEqual([gapB]);
  });
});

describe("prune (re-detection hygiene)", () => {
  it("drops state for vanished gaps and closes the editor if active", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.toggleSkip(gapB);

    // Re-detection keeps gapA's boundaries but removes gapB.
    useEditorStore.getState().prune([gapA]);
    const state = useEditorStore.getState();
    expect(state.reconstructions[gapA]).toBeDefined();
    expect(state.reconstructions[gapB]).toBeUndefined();
    expect(state.skippedGapIds).toEqual([]);
    expect(state.activeGapId).toBe(gapA);

    // Now gapA vanishes too → editor closes, repair drops.
    useEditorStore.getState().prune([gapB]);
    const after = useEditorStore.getState();
    expect(after.activeGapId).toBeNull();
    expect(after.reconstructions[gapA]).toBeUndefined();
  });

  it("is a no-op when every gap survives", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    const before = useEditorStore.getState();
    useEditorStore.getState().prune([gapA, gapB]);
    expect(useEditorStore.getState()).toBe(before); // same reference
  });
});

describe("derived gap status", () => {
  it("priority: in-progress > skipped > reconstructed > new", () => {
    expect(
      deriveGapStatus({
        gapId: gapA,
        activeGapId: gapA,
        reconstruction: { vertices: [] } as never,
        skipped: true,
      }),
    ).toBe("in-progress");

    expect(
      deriveGapStatus({
        gapId: gapA,
        activeGapId: null,
        skipped: true,
        reconstruction: { vertices: [{ id: vertexId(1), lat: 1, lon: 2 }] } as never,
      }),
    ).toBe("skipped");

    expect(
      deriveGapStatus({
        gapId: gapA,
        activeGapId: null,
        skipped: false,
        reconstruction: { vertices: [{ id: vertexId(1), lat: 1, lon: 2 }] } as never,
      }),
    ).toBe("reconstructed");

    expect(
      deriveGapStatus({
        gapId: gapA,
        activeGapId: null,
        skipped: false,
        reconstruction: { vertices: [] } as never,
      }),
    ).toBe("new");
  });

  it("an open editor on an empty repair reports in-progress (via the store)", () => {
    useEditorStore.getState().openEditor(gapA);
    const state = useEditorStore.getState();
    expect(
      deriveGapStatus({
        gapId: gapA,
        activeGapId: state.activeGapId,
        reconstruction: activeReconstruction(state) ?? undefined,
        skipped: state.skippedGapIds.includes(gapA),
      }),
    ).toBe("in-progress");
  });
});

describe("immutability", () => {
  it("previous reconstruction snapshots are never mutated by later commands", () => {
    const store = useEditorStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    const firstSnapshot =
      useEditorStore.getState().reconstructions[gapA].vertices;
    const snapshotCopy = firstSnapshot.map((v) => ({ ...v }));

    useEditorStore.getState().addVertex(pos(3, 4));
    useEditorStore.getState().moveVertex(firstSnapshot[0].id, pos(9, 9));
    useEditorStore.getState().undo();

    expect(snapshotCopy).toEqual(firstSnapshot); // unchanged reference content
  });
});
