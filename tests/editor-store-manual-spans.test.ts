/**
 * Unit tests — editor-store manual repair spans (draw-anywhere): the
 * state contract that makes repairing possible on ANY loaded activity,
 * detected or not. Covers all three span shapes: replace (two picked
 * points), insert (one anchor + derived next), extend (one anchor, open).
 *
 * Verified behaviors:
 *   - addManualSpan / addInsertSpan / addExtendSpan create the span, exit
 *     pick mode, open the editor, and create an empty reconstruction (the
 *     openEditor contract);
 *   - the same id twice is idempotent (one span, repair kept);
 *   - removeManualSpan drops the span with ALL of its repair state and
 *     closes its editor — but is a no-op for detected-gap ids;
 *   - pick mode replaces an open editor session;
 *   - prune keeps manual-span state when detection shrinks (the union the
 *     draw hook passes), and still drops vanished detected gaps;
 *   - reset wipes spans and pick mode with everything else.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/state/editor-store";
import { gapId, gapIdEnd, gapIdStart } from "@/types/ids";
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
    useEditorStore.getState().startPickMode("pair");
    useEditorStore.getState().addManualSpan(P1, P2);

    const state = useEditorStore.getState();
    expect(state.pickMode).toBeNull();
    expect(state.manualSpans).toHaveLength(1);
    expect(state.manualSpans[0]).toEqual({
      id: gapId(P1, P2),
      kind: "replace",
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

describe("editor-store — one-anchor spans (add missing route)", () => {
  it("addInsertSpan uses the SAME id scheme as a picked pair (dedupe)", () => {
    useEditorStore.getState().startPickMode("anchor");
    useEditorStore.getState().addInsertSpan(P1, P2);

    const state = useEditorStore.getState();
    expect(state.pickMode).toBeNull();
    expect(state.manualSpans).toHaveLength(1);
    expect(state.manualSpans[0]).toEqual({
      id: gapId(P1, P2),
      kind: "insert",
      beforePointId: P1,
      afterPointId: P2,
    });
    expect(state.activeGapId).toBe(gapId(P1, P2));
    expect(state.reconstructions[gapId(P1, P2)]).toBeDefined();
  });

  it("an insert over an existing replace span keeps the repair (idempotent id)", () => {
    useEditorStore.getState().addManualSpan(P1, P2);
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    useEditorStore.getState().closeEditor();

    useEditorStore.getState().addInsertSpan(P1, P2);

    const state = useEditorStore.getState();
    expect(state.manualSpans).toHaveLength(1); // still the replace span
    expect(state.reconstructions[gapId(P1, P2)].vertices).toHaveLength(1);
  });

  it("addExtendSpan creates an OPEN span at the route end (side after)", () => {
    useEditorStore.getState().startPickMode("anchor");
    useEditorStore.getState().addExtendSpan(P3, "after");

    const state = useEditorStore.getState();
    const id = gapIdEnd(P3);
    expect(state.pickMode).toBeNull();
    expect(state.manualSpans).toEqual([
      { id, kind: "extend", anchorPointId: P3, side: "after" },
    ]);
    expect(state.activeGapId).toBe(id);
    expect(state.drawMode).toBe(true);
    expect(state.reconstructions[id]).toBeDefined();
  });

  it("addExtendSpan at the route start uses the start id scheme", () => {
    useEditorStore.getState().addExtendSpan(P1, "before");
    const state = useEditorStore.getState();
    expect(state.manualSpans).toEqual([
      {
        id: gapIdStart(P1),
        kind: "extend",
        anchorPointId: P1,
        side: "before",
      },
    ]);
    expect(state.activeGapId).toBe(gapIdStart(P1));
  });

  it("removeManualSpan drops an extend span with all repair state", () => {
    useEditorStore.getState().addExtendSpan(P3, "after");
    useEditorStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
    const id = gapIdEnd(P3);

    useEditorStore.getState().removeManualSpan(id);

    const state = useEditorStore.getState();
    expect(state.manualSpans).toEqual([]);
    expect(state.reconstructions[id]).toBeUndefined();
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

    useEditorStore.getState().startPickMode("pair");

    const state = useEditorStore.getState();
    expect(state.pickMode).toBe("pair");
    expect(state.activeGapId).toBeNull();
    expect(state.drawMode).toBe(false);
    expect(state.reconstructions[gapId(P1, P2)].vertices).toHaveLength(1);
  });

  it("cancelPickMode leaves pick mode without side effects", () => {
    useEditorStore.getState().startPickMode("anchor");
    useEditorStore.getState().cancelPickMode();
    expect(useEditorStore.getState().pickMode).toBeNull();
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
    useEditorStore.getState().startPickMode("anchor");

    useEditorStore.getState().reset();

    const state = useEditorStore.getState();
    expect(state.manualSpans).toEqual([]);
    expect(state.pickMode).toBeNull();
    expect(state.reconstructions).toEqual({});
  });
});

describe("road-follow state (mode + resolved-leg side table)", () => {
  const LEG = {
    a: { lat: 52.52, lon: 13.405 },
    b: { lat: 52.527, lon: 13.414 },
    coordinates: [
      [13.405, 52.52],
      [13.409, 52.525],
      [13.414, 52.527],
    ] as [number, number][],
    routeDistanceM: 900,
  };

  it("defaults to car mode with an empty side table", () => {
    expect(useEditorStore.getState().roadFollow).toBe("car");
    expect(useEditorStore.getState().roadLegs).toEqual({});
  });

  it("setRoadFollow switches the mode (a transient aid, never undoable)", () => {
    useEditorStore.getState().setRoadFollow("foot");
    expect(useEditorStore.getState().roadFollow).toBe("foot");
    useEditorStore.getState().setRoadFollow("off");
    expect(useEditorStore.getState().roadFollow).toBe("off");
    useEditorStore.getState().setRoadFollow("car");
  });

  it("setRoadLegs replaces a gap's legs and no-ops on identical content", () => {
    useEditorStore.getState().setRoadLegs(DETECTED, [LEG]);
    expect(useEditorStore.getState().roadLegs[DETECTED]).toEqual([LEG]);
    const before = useEditorStore.getState();
    useEditorStore.getState().setRoadLegs(DETECTED, [LEG]);
    // Same leg references → the store object is returned unchanged.
    expect(useEditorStore.getState().roadLegs).toBe(before.roadLegs);
  });

  it("removeManualSpan drops the span's road legs with everything else", () => {
    useEditorStore.getState().addExtendSpan(P1, "after");
    const extendId = useEditorStore.getState().manualSpans[0].id;
    useEditorStore.getState().setRoadLegs(extendId, [LEG]);
    expect(useEditorStore.getState().roadLegs[extendId]).toHaveLength(1);
    useEditorStore.getState().removeManualSpan(extendId);
    expect(useEditorStore.getState().roadLegs[extendId]).toBeUndefined();
  });

  it("prune drops road legs of vanished gaps, keeps the rest", () => {
    useEditorStore.getState().addExtendSpan(P1, "after");
    const extendId = useEditorStore.getState().manualSpans[0].id;
    useEditorStore.getState().setRoadLegs(DETECTED, [LEG]);
    useEditorStore.getState().setRoadLegs(extendId, [LEG]);
    useEditorStore.getState().prune([extendId]); // detected gap vanished
    const legs = useEditorStore.getState().roadLegs;
    expect(legs[DETECTED]).toBeUndefined();
    expect(legs[extendId]).toHaveLength(1);
  });

  it("reset clears the side table and restores car mode", () => {
    useEditorStore.getState().setRoadFollow("off");
    useEditorStore.getState().setRoadLegs(DETECTED, [LEG]);
    useEditorStore.getState().reset();
    expect(useEditorStore.getState().roadFollow).toBe("car");
    expect(useEditorStore.getState().roadLegs).toEqual({});
  });
});
