/**
 * Unit tests — editor-store manual repair spans (draw-anywhere): the
 * state contract that makes repairing possible on ANY loaded activity,
 * detected or not.
 *
 * Verified behaviors:
 *   - addManualSpan creates the span, exits pick mode, opens the editor,
 *     and creates an empty reconstruction (the openEditor contract);
 *   - the same boundary twice is idempotent (one span, repair kept);
 *   - removeManualSpan drops the span with ALL of its repair state and
 *     closes its editor — but is a no-op for detected-gap ids;
 *   - pick mode replaces an open editor session;
 *   - prune keeps manual-span state when detection shrinks (the union the
 *     draw hook passes), and still drops vanished detected gaps;
 *   - reset wipes spans and pick mode with everything else.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/state/editor-store";
import { gapId } from "@/types/ids";
import type { PointId } from "@/types/domain";

const P1 = "t0s0:1" as PointId;
const P2 = "t0s0:2" as PointId;
const P3 = "t0s0:3" as PointId;
const DETECTED = gapId(P2, P3);

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("editor-store — addManualSpan", () => {
  it("creates the span, exits pick mode, and opens the editor", () => {
    useEditorStore.getState().startPickMode();
    useEditorStore.getState().addManualSpan(P1, P2);

    const state = useEditorStore.getState();
    expect(state.pickMode).toBe(false);
    expect(state.manualSpans).toHaveLength(1);
    expect(state.manualSpans[0]).toEqual({
      id: gapId(P1, P2),
      beforePointId: P1,
      afterPointId: P2,
    });
    expect(state.activeGapId).toBe(gapId(P1, P2));
    expect(state.drawMode).toBe(true);
    expect(state.reconstructions[gapId(P1, P2)]).toBeDefined();
    expect(state.reconstructions[gapId(P1, P2)].vertices).toEqual([]);
  });

  it("is idempotent per boundary — one span, repair state kept", () => {
    useEditorStore.getState().addManualSpan(P1, P2);
    // Draw one vertex through the real command path.
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    expect(useEditorStore.getState().reconstructions[gapId(P1, P2)].vertices).toHaveLength(1);

    // Re-pick the SAME boundary (e.g. from the card row after closing).
    useEditorStore.getState().closeEditor();
    useEditorStore.getState().addManualSpan(P1, P2);

    const state = useEditorStore.getState();
    expect(state.manualSpans).toHaveLength(1);
    expect(state.activeGapId).toBe(gapId(P1, P2));
    // The drawn vertex survived the reopen.
    expect(state.reconstructions[gapId(P1, P2)].vertices).toHaveLength(1);
  });

  it("ignores a degenerate pair of the same point", () => {
    useEditorStore.getState().addManualSpan(P1, P1);
    const state = useEditorStore.getState();
    expect(state.manualSpans).toEqual([]);
    expect(state.activeGapId).toBeNull();
  });
});

describe("editor-store — removeManualSpan", () => {
  it("drops the span with all repair state and closes its editor", () => {
    useEditorStore.getState().addManualSpan(P1, P2);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useEditorStore.getState().toggleSkip(gapId(P3, P2)); // unrelated skip mark

    useEditorStore.getState().removeManualSpan(gapId(P1, P2));

    const state = useEditorStore.getState();
    expect(state.manualSpans).toEqual([]);
    expect(state.reconstructions[gapId(P1, P2)]).toBeUndefined();
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
    // The unrelated skip mark survives.
    expect(state.skippedGapIds).toContainEqual(gapId(P3, P2));
  });

  it("drops a stale skip mark of the removed span", () => {
    useEditorStore.getState().addManualSpan(P1, P2);
    useEditorStore.getState().closeEditor();
    useEditorStore.getState().toggleSkip(gapId(P1, P2));

    useEditorStore.getState().removeManualSpan(gapId(P1, P2));

    expect(useEditorStore.getState().skippedGapIds).not.toContainEqual(
      gapId(P1, P2),
    );
  });

  it("is a no-op for a detected-gap id (no manual span exists)", () => {
    useEditorStore.getState().openEditor(DETECTED);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });

    useEditorStore.getState().removeManualSpan(DETECTED);

    const state = useEditorStore.getState();
    expect(state.activeGapId).toBe(DETECTED); // editor untouched
    expect(state.reconstructions[DETECTED].vertices).toHaveLength(1);
  });
});

describe("editor-store — pick mode", () => {
  it("startPickMode closes an open editor but keeps its reconstruction", () => {
    useEditorStore.getState().addManualSpan(P1, P2);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });

    useEditorStore.getState().startPickMode();

    const state = useEditorStore.getState();
    expect(state.pickMode).toBe(true);
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
    expect(state.reconstructions[gapId(P1, P2)].vertices).toHaveLength(1);
  });

  it("cancelPickMode leaves pick mode without side effects", () => {
    useEditorStore.getState().startPickMode();
    useEditorStore.getState().cancelPickMode();
    expect(useEditorStore.getState().pickMode).toBe(false);
    expect(useEditorStore.getState().manualSpans).toEqual([]);
  });
});

describe("editor-store — prune with manual spans (the union contract)", () => {
  it("keeps manual-span repairs when detection shrinks to nothing", () => {
    // A detected gap gets a repair…
    useEditorStore.getState().openEditor(DETECTED);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    // …and the user also repairs a clean stretch manually.
    useEditorStore.getState().addManualSpan(P1, P2);
    useEditorStore.getState().addVertex({ lat: 52.53, lon: 13.406 });

    // Thresholds change: detection now finds NOTHING — but the manual
    // span anchors its own repair (the draw hook passes the union).
    const manualId = gapId(P1, P2);
    useEditorStore.getState().prune([manualId]);

    const state = useEditorStore.getState();
    expect(state.reconstructions[manualId]).toBeDefined();
    expect(state.reconstructions[DETECTED]).toBeUndefined(); // vanished detected gap pruned
    expect(state.manualSpans).toHaveLength(1);
  });

  it("drops everything when neither detection nor spans remain", () => {
    useEditorStore.getState().addManualSpan(P1, P2);
    useEditorStore.getState().prune([]);
    const state = useEditorStore.getState();
    expect(state.manualSpans).toHaveLength(1); // spans themselves are not pruned…
    expect(state.reconstructions).toEqual({}); // …but their repairs are
    expect(state.activeGapId).toBeNull();
  });
});

describe("editor-store — reset clears manual-span state", () => {
  it("wipes spans, pick mode, and repairs together", () => {
    useEditorStore.getState().addManualSpan(P1, P2);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useEditorStore.getState().startPickMode();

    useEditorStore.getState().reset();

    const state = useEditorStore.getState();
    expect(state.manualSpans).toEqual([]);
    expect(state.pickMode).toBe(false);
    expect(state.reconstructions).toEqual({});
  });
});
