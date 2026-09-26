/**
 * Unit tests — the recovery store (state/recovery-store.ts, Task 26).
 *
 * The Gap Recovery section's isolated state machine: session lifecycle
 * (load → parsed / fail → reset), the editor slice over detected gaps
 * (open → draw → undo/redo → close → skip → prune), and — the section's
 * defining contract — ISOLATION from the repair studio's stores: no
 * recovery action may ever touch `useSessionStore` or `useEditorStore`,
 * and vice versa.
 *
 * Runs against the real zustand stores outside React (plain node
 * environment), mirroring tests/editor-store.test.ts.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  activeRecoveryReconstruction,
  useRecoveryStore,
} from "@/state/recovery-store";
import { useEditorStore } from "@/state/editor-store";
import { useSessionStore } from "@/state/session-store";
import type { GapId } from "@/types/domain";
import { pointId, segmentId } from "@/types/ids";

const gapA = "gap/t0s0:0/t0s0:4" as GapId;
const gapB = "gap/t0s0:4/t0s0:8" as GapId;

const pos = (lat: number, lon: number) => ({ lat, lon });

beforeEach(() => {
  useRecoveryStore.getState().reset();
  useEditorStore.getState().reset();
  useSessionStore.getState().reset();
});

describe("session lifecycle", () => {
  it("beginLoad → loading with the file name, error cleared", () => {
    useRecoveryStore.getState().fail({ title: "t", detail: "d" });
    useRecoveryStore.getState().beginLoad("run.gpx");

    const state = useRecoveryStore.getState();
    expect(state.status).toBe("loading");
    expect(state.fileName).toBe("run.gpx");
    expect(state.error).toBeNull();
  });

  it("fail keeps the name, drops data and gaps", () => {
    useRecoveryStore.getState().beginLoad("run.gpx");
    useRecoveryStore.getState().fail({ title: "Bad file", detail: "nope" });

    const state = useRecoveryStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toEqual({ title: "Bad file", detail: "nope" });
    expect(state.data).toBeNull();
    expect(state.gaps).toEqual([]);
  });

  it("reset returns to the pristine idle state", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.toggleSkip(gapB);
    store.selectGap(gapB);
    useRecoveryStore.getState().reset();

    const state = useRecoveryStore.getState();
    expect(state.status).toBe("idle");
    expect(state.activeGapId).toBeNull();
    expect(state.reconstructions).toEqual({});
    expect(state.skippedGapIds).toEqual([]);
    expect(state.selectedGapId).toBeNull();
    expect(state.vertexSeq).toBe(0);
    expect(state.snapEnabled).toBe(true);
  });
});

describe("editor slice over detected gaps", () => {
  it("openEditor creates an empty reconstruction, enables draw mode, unskips", () => {
    useRecoveryStore.getState().toggleSkip(gapA);
    useRecoveryStore.getState().openEditor(gapA);

    const state = useRecoveryStore.getState();
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
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(52.52, 13.405));
    expect(useRecoveryStore.getState().history.undo).toHaveLength(1);

    useRecoveryStore.getState().closeEditor();
    const state = useRecoveryStore.getState();
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
    expect(state.history.undo).toHaveLength(0);
    expect(state.reconstructions[gapA].vertices).toHaveLength(1);
  });

  it("addVertex → undo → redo → clear round trip", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);

    store.addVertex(pos(52.52, 13.405));
    store.addVertex(pos(52.53, 13.42));
    expect(useRecoveryStore.getState().reconstructions[gapA].vertices).toHaveLength(2);

    useRecoveryStore.getState().undo();
    expect(useRecoveryStore.getState().reconstructions[gapA].vertices).toHaveLength(1);

    useRecoveryStore.getState().redo();
    expect(useRecoveryStore.getState().reconstructions[gapA].vertices).toHaveLength(2);

    useRecoveryStore.getState().clearVertices();
    expect(useRecoveryStore.getState().reconstructions[gapA].vertices).toHaveLength(0);
    // add, add, (undo, redo — history-neutral), clear = 3 undoables.
    expect(useRecoveryStore.getState().history.undo).toHaveLength(3);
  });

  it("vertex ids are allocated monotonically and never reused", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.deleteVertex(
      useRecoveryStore.getState().reconstructions[gapA].vertices[0].id,
    );
    store.addVertex(pos(3, 4));

    const vertices = useRecoveryStore.getState().reconstructions[gapA].vertices;
    expect(vertices.map((v) => v.id)).toEqual(["v2"]);
    expect(useRecoveryStore.getState().vertexSeq).toBe(2);
  });

  it("toggleSkip on the active gap closes its editor", () => {
    useRecoveryStore.getState().openEditor(gapA);
    useRecoveryStore.getState().toggleSkip(gapA);

    const state = useRecoveryStore.getState();
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
    expect(state.skippedGapIds).toContain(gapA);
    // The reconstruction is kept — unskipping brings it back.
    expect(state.reconstructions[gapA].vertices).toEqual([]);
  });

  it("prune drops vanished sections and closes their editors", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.toggleSkip(gapB);

    useRecoveryStore.getState().prune([gapA]);

    const state = useRecoveryStore.getState();
    expect(state.reconstructions[gapA]).toBeDefined();
    expect(state.skippedGapIds).toEqual([]);
    // gapA survives; nothing else does.
    expect(Object.keys(state.reconstructions)).toEqual([gapA]);
  });

  it("settings (spacing, time strategy) are not undoable", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    const before = useRecoveryStore.getState().history.undo.length;

    useRecoveryStore.getState().setResampleSpacing(gapA, 25);
    useRecoveryStore.getState().setTimeStrategy(gapA, {
      kind: "manual-duration",
      durationMs: 60_000,
    });

    expect(useRecoveryStore.getState().history.undo.length).toBe(before);
    expect(useRecoveryStore.getState().reconstructions[gapA].resampleSpacingM).toBe(25);
    expect(useRecoveryStore.getState().reconstructions[gapA].timeStrategy).toEqual({
      kind: "manual-duration",
      durationMs: 60_000,
    });
  });

  it("activeRecoveryReconstruction resolves the active gap only", () => {
    useRecoveryStore.getState().openEditor(gapA);
    expect(activeRecoveryReconstruction(useRecoveryStore.getState())?.gapId).toBe(gapA);
    useRecoveryStore.getState().closeEditor();
    expect(activeRecoveryReconstruction(useRecoveryStore.getState())).toBeNull();
  });
});

describe("isolation from the repair studio (the section contract)", () => {
  it("recovery session state never touches the repair session store", () => {
    useRecoveryStore.getState().beginLoad("recovery-run.gpx");

    const repair = useSessionStore.getState();
    expect(repair.status).toBe("idle");
    expect(repair.fileName).toBeNull();
  });

  it("recovery repairs never touch the repair editor store", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));
    store.selectGap(gapA);

    const repairEditor = useEditorStore.getState();
    expect(repairEditor.activeGapId).toBeNull();
    expect(repairEditor.reconstructions).toEqual({});
    expect(useSessionStore.getState().status).toBe("idle");
  });

  it("repair studio state never leaks into the recovery store", () => {
    useEditorStore.getState().openEditor(gapA);
    useEditorStore.getState().addVertex(pos(9, 9));

    const recovery = useRecoveryStore.getState();
    expect(recovery.activeGapId).toBeNull();
    expect(recovery.reconstructions).toEqual({});
  });
});

describe("user-drawn unmeasured sections (Task 28)", () => {
  const SEG = segmentId(0, 0);
  const p1 = pointId(SEG, 1);
  const p2 = pointId(SEG, 2);
  const insertId = "gap/t0s0:1/t0s0:2" as GapId;
  const extendEndId = "gap/t0s0:5/end" as GapId;
  const extendStartId = "gap/start/t0s0:0" as GapId;

  it("startPickMode replaces any open editor; cancelPickMode leaves without a span", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(gapA);
    store.addVertex(pos(1, 2));

    store.startPickMode("anchor");
    let state = useRecoveryStore.getState();
    expect(state.pickMode).toBe("anchor");
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
    // The abandoned reconstruction is kept (closeEditor semantics).
    expect(state.reconstructions[gapA].vertices).toHaveLength(1);

    store.cancelPickMode();
    state = useRecoveryStore.getState();
    expect(state.pickMode).toBeNull();
    expect(state.manualSpans).toEqual([]);
  });

  it("addInsertSpan creates the insert span with the pace-estimated default", () => {
    useRecoveryStore.getState().addInsertSpan(p1, p2);

    const state = useRecoveryStore.getState();
    expect(state.pickMode).toBeNull();
    expect(state.activeGapId).toBe(insertId);
    expect(state.drawMode).toBe(true);
    expect(state.manualSpans).toEqual([
      { id: insertId, kind: "insert", beforePointId: p1, afterPointId: p2 },
    ]);
    // The unmeasured-section contract: the app calculates the time.
    expect(state.reconstructions[insertId].timeStrategy).toEqual({
      kind: "pace-estimated",
    });
  });

  it("addExtendSpan creates open extensions with the pace-estimated default", () => {
    useRecoveryStore.getState().addExtendSpan(pointId(SEG, 5), "after");
    useRecoveryStore.getState().addExtendSpan(pointId(SEG, 0), "before");

    const state = useRecoveryStore.getState();
    expect(state.manualSpans).toEqual([
      { id: extendEndId, kind: "extend", anchorPointId: pointId(SEG, 5), side: "after" },
      { id: extendStartId, kind: "extend", anchorPointId: pointId(SEG, 0), side: "before" },
    ]);
    expect(state.reconstructions[extendEndId].timeStrategy).toEqual({
      kind: "pace-estimated",
    });
    expect(state.reconstructions[extendStartId].timeStrategy).toEqual({
      kind: "pace-estimated",
    });
  });

  it("addManualSpan (a picked pair) keeps the window-derived default", () => {
    useRecoveryStore.getState().addManualSpan(p1, p2);

    const state = useRecoveryStore.getState();
    expect(state.manualSpans).toEqual([
      { id: insertId, kind: "replace", beforePointId: p1, afterPointId: p2 },
    ]);
    // A replace span's boundaries bound a recorded stretch — the window
    // IS the time in the file.
    expect(state.reconstructions[insertId].timeStrategy).toEqual({
      kind: "distance-proportional",
    });
  });

  it("span creation is idempotent per id — repair state is reopened, not reset", () => {
    useRecoveryStore.getState().addInsertSpan(p1, p2);
    useRecoveryStore.getState().addVertex(pos(52.52, 13.405));
    useRecoveryStore.getState().setTimeStrategy(insertId, {
      kind: "manual-duration",
      durationMs: 90_000,
    });
    useRecoveryStore.getState().closeEditor();

    useRecoveryStore.getState().addInsertSpan(p1, p2);

    const state = useRecoveryStore.getState();
    expect(state.manualSpans).toHaveLength(1);
    expect(state.reconstructions[insertId].vertices).toHaveLength(1);
    expect(state.reconstructions[insertId].timeStrategy).toEqual({
      kind: "manual-duration",
      durationMs: 90_000,
    });
  });

  it("removeManualSpan drops the span, its repair state, and closes its editor", () => {
    const store = useRecoveryStore.getState();
    store.addInsertSpan(p1, p2);
    store.addVertex(pos(1, 2));

    useRecoveryStore.getState().removeManualSpan(insertId);

    const state = useRecoveryStore.getState();
    expect(state.manualSpans).toEqual([]);
    expect(state.reconstructions[insertId]).toBeUndefined();
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
  });

  it("setParsed wipes drawn spans with the rest of the repair state", () => {
    const store = useRecoveryStore.getState();
    store.addInsertSpan(p1, p2);
    store.addVertex(pos(1, 2));
    store.startPickMode("pair");

    store.setParsed("next.gpx", {} as never, []);

    const state = useRecoveryStore.getState();
    expect(state.manualSpans).toEqual([]);
    expect(state.pickMode).toBeNull();
    expect(state.reconstructions).toEqual({});
  });

  it("prune keeps user-drawn spans when the caller includes their ids", () => {
    // The draw hook passes detected + manual ids as the known set — a
    // drawn section survives threshold changes that stop detecting.
    const store = useRecoveryStore.getState();
    store.addInsertSpan(p1, p2);
    store.addVertex(pos(1, 2));

    useRecoveryStore.getState().prune([insertId]);

    const state = useRecoveryStore.getState();
    expect(state.manualSpans).toHaveLength(1);
    expect(state.reconstructions[insertId].vertices).toHaveLength(1);
  });

  it("fileTiming carries the recorded-speed slot for the pace estimate", () => {
    expect(useRecoveryStore.getState().fileTiming).toEqual({
      startMs: null,
      totalDurationMs: null,
      recordedSpeedMps: null,
    });

    useRecoveryStore.getState().setFileTiming({ recordedSpeedMps: 3.2 });
    expect(useRecoveryStore.getState().fileTiming.recordedSpeedMps).toBe(3.2);
  });
});
