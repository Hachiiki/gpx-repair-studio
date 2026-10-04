/**
 * Unit tests — the `set-line` command (§EE 17.3) and its store
 * integration: ONE undoable step that moves a line's geometry AND its
 * path style together, in both reconstruction editors' stores.
 *
 * The contract:
 *   - drawModel: apply/invert swap the snapshots; the cap is enforced;
 *     a no-op command is refused;
 *   - the stores: submitting a set-line syncs the ACTIVE chip style;
 *     undo/redo of a set-line keep the chips honest; the recovery
 *     store's new submitCommand action commits like the editor's.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  applyDrawCommand,
  emptyReconstruction,
  invertDrawCommand,
  MAX_VERTICES,
  setLineCommand,
  type LineSnapshot,
} from "@/features/reconstruction/drawModel";
import { useEditorStore } from "@/state/editor-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { gapId, vertexId } from "@/types/ids";
import type { DrawVertex, GapId } from "@/types/domain";

function vertices(count: number, latBase = 52.52): DrawVertex[] {
  return Array.from({ length: count }, (_, i) => ({
    id: vertexId(i + 1),
    lat: latBase + i * 1e-3,
    lon: 13.405 + i * 1e-3,
  }));
}

const SNAP_ID: GapId = gapId("t0s0:1" as never, "t0s0:9" as never);

describe("set-line command (drawModel)", () => {
  const base = emptyReconstruction(SNAP_ID);

  it("replaces vertices AND path style in one apply", () => {
    const withVertices = {
      ...base,
      vertices: vertices(3),
    };
    const next: LineSnapshot = {
      vertices: vertices(5, 52.6),
      pathStyle: "car",
    };
    const command = setLineCommand(withVertices, next)!;
    expect(command.kind).toBe("set-line");
    const applied = applyDrawCommand(withVertices, command);
    expect(applied.vertices).toHaveLength(5);
    expect(applied.pathStyle).toBe("car");
    expect(applied.geometryRevision).toBe(withVertices.geometryRevision + 1);
  });

  it("the exact inverse restores both vertices AND style", () => {
    const original = { ...base, vertices: vertices(3), pathStyle: "off" as const };
    const next: LineSnapshot = {
      vertices: vertices(5, 52.6),
      pathStyle: "car",
    };
    const command = setLineCommand(original, next)!;
    const applied = applyDrawCommand(original, command);
    const restored = applyDrawCommand(applied, invertDrawCommand(command));
    expect(restored.vertices).toEqual(original.vertices);
    expect(restored.pathStyle).toBe(original.pathStyle);
  });

  it("refuses an oversized result (the domain enforces the cap)", () => {
    const original = { ...base, vertices: vertices(2) };
    const command = setLineCommand(original, {
      vertices: vertices(MAX_VERTICES + 1),
      pathStyle: "car",
    });
    expect(command).toBeNull();
    // And the defensive apply guard refuses a hand-made one too.
    const forced = applyDrawCommand(original, {
      kind: "set-line",
      previous: { vertices: original.vertices },
      next: {
        vertices: vertices(MAX_VERTICES + 1),
        pathStyle: "car",
      },
    });
    expect(forced).toBe(original);
  });

  it("refuses a no-op (same vertices, same style)", () => {
    const original = { ...base, vertices: vertices(3), pathStyle: "car" as const };
    expect(
      setLineCommand(original, {
        vertices: original.vertices,
        pathStyle: "car",
      }),
    ).toBeNull();
  });

  it("a style-only change is a valid command (vertices equal, style differs)", () => {
    const original = { ...base, vertices: vertices(3) };
    const command = setLineCommand(original, {
      vertices: original.vertices,
      pathStyle: "foot",
    });
    expect(command).not.toBeNull();
    const applied = applyDrawCommand(original, command!);
    expect(applied.pathStyle).toBe("foot");
    expect(applied.vertices).toEqual(original.vertices);
    expect(applied.vertices).not.toBe(original.vertices);
  });
});

describe("editor store: set-line submit + undo/redo style sync", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it("submitting a set-line moves the active chip style with the line", () => {
    const store = useEditorStore.getState();
    store.openEditor(SNAP_ID);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useEditorStore.getState().addVertex({ lat: 52.527, lon: 13.414 });

    const state = useEditorStore.getState();
    const current = state.reconstructions[SNAP_ID]!;
    const command = setLineCommand(current, {
      vertices: vertices(5, 52.6),
      pathStyle: "car",
    })!;
    state.submitCommand(command);

    const after = useEditorStore.getState();
    expect(after.reconstructions[SNAP_ID].vertices).toHaveLength(5);
    expect(after.reconstructions[SNAP_ID].pathStyle).toBe("car");
    expect(after.pathStyle).toBe("car"); // the chip follows
    expect(after.history.undo).toHaveLength(3); // two adds + the snap
  });

  it("undo restores the vertices AND the chip shows the old style", () => {
    const store = useEditorStore.getState();
    store.openEditor(SNAP_ID);
    useEditorStore.getState().setPathStyle("off");
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });

    const state = useEditorStore.getState();
    const current = state.reconstructions[SNAP_ID]!;
    const command = setLineCommand(current, {
      vertices: vertices(4, 52.6),
      pathStyle: "car",
    })!;
    state.submitCommand(command);
    expect(useEditorStore.getState().pathStyle).toBe("car");

    useEditorStore.getState().undo();
    const undone = useEditorStore.getState();
    expect(undone.reconstructions[SNAP_ID].vertices).toHaveLength(1);
    expect(undone.reconstructions[SNAP_ID].pathStyle).toBe("off");
    expect(undone.pathStyle).toBe("off"); // the chip is honest again
  });

  it("redo re-applies the snap, style and all", () => {
    const store = useEditorStore.getState();
    store.openEditor(SNAP_ID);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    const state = useEditorStore.getState();
    state.submitCommand(
      setLineCommand(state.reconstructions[SNAP_ID]!, {
        vertices: vertices(4, 52.6),
        pathStyle: "foot",
      })!,
    );
    useEditorStore.getState().undo();
    useEditorStore.getState().redo();
    const redone = useEditorStore.getState();
    expect(redone.reconstructions[SNAP_ID].pathStyle).toBe("foot");
    expect(redone.pathStyle).toBe("foot");
  });
});

describe("recovery store: the submitCommand twin", () => {
  beforeEach(() => {
    useRecoveryStore.getState().reset();
  });

  it("commits a set-line for the active gap with the style sync", () => {
    const store = useRecoveryStore.getState();
    store.openEditor(SNAP_ID);
    // A straight pre-snap line (the per-segment contract: the chip only
    // styles the NEXT segment — the placed one is "off").
    useRecoveryStore.getState().setPathStyle("off");
    useRecoveryStore.getState().addVertex({ lat: 52.52, lon: 13.405 });

    const state = useRecoveryStore.getState();
    const current = state.reconstructions[SNAP_ID]!;
    const command = setLineCommand(current, {
      vertices: vertices(3, 52.6),
      pathStyle: "car",
    })!;
    state.submitCommand(command);

    const after = useRecoveryStore.getState();
    expect(after.reconstructions[SNAP_ID].vertices).toHaveLength(3);
    expect(after.reconstructions[SNAP_ID].pathStyle).toBe("car");
    expect(after.pathStyle).toBe("car");

    useRecoveryStore.getState().undo();
    const undone = useRecoveryStore.getState();
    expect(undone.reconstructions[SNAP_ID].vertices).toHaveLength(1);
    expect(undone.pathStyle).toBe("off"); // undefined style reads as straight
  });
});
