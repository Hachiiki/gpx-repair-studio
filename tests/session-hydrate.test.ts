/**
 * Unit tests — the four stores' `hydrate` actions (Phase 10 — session
 * recovery): what a restore adopts, and what it deliberately does not.
 *
 *   - repair/recovery: reconstructions, skip marks, manual spans, file
 *     timing, and road legs land verbatim; the vertex allocator re-arms;
 *     no editor is open and history is empty (the undo stack spans one
 *     editor session by design);
 *   - create: stats + route + settings land, the phase reopens, the
 *     chips adopt the route's style, and the session token bumps;
 *   - plan: the route and the goal time land, the studio reopens in
 *     draw mode;
 *   - a full store round-trip: hydrate(capture(state)) is identity for
 *     every field the record carries.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/state/editor-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useCreateStore } from "@/state/create-store";
import { usePlanStore } from "@/state/plan-store";
import {
  captureFileSession,
  hydrateFileSession,
  readSessionRecord,
  type FileSessionHydration,
  type StoredFileSession,
} from "@/lib/storage/session-record";
import { emptyReconstruction } from "@/features/reconstruction/drawModel";
import { CREATE_ROUTE_ID } from "@/features/create/track";
import { PLAN_ROUTE_ID } from "@/features/plan/estimate";
import { DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";
import { gapId, pointId, segmentId, vertexId } from "@/types/ids";

const SEG = segmentId(0, 0);
const GAP = gapId(pointId(SEG, 3), pointId(SEG, 4));

function hydrationPayload(): FileSessionHydration {
  const recon = {
    ...emptyReconstruction(GAP),
    vertices: [
      { id: vertexId(4), lat: 52.52, lon: 13.405 },
      { id: vertexId(9), lat: 52.521, lon: 13.406 },
    ],
    pathStyle: "car" as const,
    geometryRevision: 3,
    timeStrategy: { kind: "uniform" as const },
  };
  return {
    reconstructions: { [GAP]: recon },
    skippedGapIds: [gapId(pointId(SEG, 8), pointId(SEG, 9))],
    manualSpans: [
      {
        id: gapId(pointId(SEG, 10), pointId(SEG, 20)),
        kind: "replace" as const,
        beforePointId: pointId(SEG, 10),
        afterPointId: pointId(SEG, 20),
      },
    ],
    fileTiming: { startMs: 1_700_000_000_000, totalDurationMs: 1_800_000 },
    roadLegs: {
      [GAP]: [
        {
          a: { lat: 52.52, lon: 13.405 },
          b: { lat: 52.521, lon: 13.406 },
          coordinates: [
            [13.405, 52.52],
            [13.406, 52.521],
          ],
          routeDistanceM: 150,
        },
      ],
    },
    vertexSeq: 9,
  };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useRecoveryStore.getState().reset();
  useCreateStore.getState().reset();
  usePlanStore.getState().reset();
});

describe("editor store hydrate (repair)", () => {
  it("adopts the work verbatim with no editor open and history empty", () => {
    useEditorStore.getState().hydrate(hydrationPayload());
    const state = useEditorStore.getState();
    expect(state.reconstructions[GAP].vertices).toHaveLength(2);
    expect(state.reconstructions[GAP].pathStyle).toBe("car");
    expect(state.reconstructions[GAP].timeStrategy).toEqual({ kind: "uniform" });
    expect(state.skippedGapIds).toHaveLength(1);
    expect(state.manualSpans).toHaveLength(1);
    expect(state.fileTiming.startMs).toBe(1_700_000_000_000);
    expect(state.roadLegs[GAP]).toHaveLength(1);
    expect(state.vertexSeq).toBe(9);
    expect(state.activeGapId).toBeNull();
    expect(state.history.undo).toHaveLength(0);
    expect(state.history.redo).toHaveLength(0);
  });

  it("keeps editing after a hydrate: new vertex ids never collide", () => {
    useEditorStore.getState().hydrate(hydrationPayload());
    useEditorStore.getState().openEditor(GAP);
    useEditorStore.getState().addVertex({ lat: 52.53, lon: 13.41 });
    const vertices = useEditorStore.getState().reconstructions[GAP].vertices;
    expect(vertices).toHaveLength(3);
    expect(vertices[vertices.length - 1].id).toBe("v10");
  });
});

describe("recovery store hydrate", () => {
  it("adopts the work into its own editor slice", () => {
    useRecoveryStore.getState().hydrate(hydrationPayload());
    const state = useRecoveryStore.getState();
    expect(state.reconstructions[GAP].vertices).toHaveLength(2);
    expect(state.manualSpans).toHaveLength(1);
    expect(state.roadLegs[GAP]).toHaveLength(1);
    expect(state.vertexSeq).toBe(9);
    expect(state.activeGapId).toBeNull();
  });
});

describe("create store hydrate", () => {
  it("reopens the studio with stats, route, and settings", () => {
    const before = useCreateStore.getState().sessionSeq;
    useCreateStore.getState().hydrate({
      stats: { distanceM: 5_000, durationMs: 1_500_000, paceMsPerKm: 300_000, startMs: 0 },
      reconstruction: {
        ...emptyReconstruction(CREATE_ROUTE_ID),
        vertices: [
          { id: vertexId(1), lat: 52.52, lon: 13.405 },
          { id: vertexId(2), lat: 52.53, lon: 13.41 },
        ],
        pathStyle: "foot",
      },
      roadLegs: [],
      spacingM: 25,
      matchDistance: true,
      phase: "draw",
      vertexSeq: 2,
    });
    const state = useCreateStore.getState();
    expect(state.phase).toBe("draw");
    expect(state.pointerMode).toBe("draw");
    expect(state.stats?.distanceM).toBe(5_000);
    expect(state.reconstruction.vertices).toHaveLength(2);
    expect(state.spacingM).toBe(25);
    expect(state.matchDistance).toBe(true);
    // The chips adopt the route's style; the token bumps.
    expect(state.pathStyle).toBe("foot");
    expect(state.sessionSeq).toBe(before + 1);
  });
});

describe("plan store hydrate", () => {
  it("reopens the studio with the route and goal time", () => {
    usePlanStore.getState().hydrate({
      plannedTimeMs: 2_700_000,
      reconstruction: {
        ...emptyReconstruction(PLAN_ROUTE_ID),
        vertices: [{ id: vertexId(1), lat: 52.52, lon: 13.405 }],
        pathStyle: "off",
      },
      roadLegs: [],
      vertexSeq: 1,
    });
    const state = usePlanStore.getState();
    expect(state.phase).toBe("studio");
    expect(state.pointerMode).toBe("draw");
    expect(state.plannedTimeMs).toBe(2_700_000);
    expect(state.reconstruction.vertices).toHaveLength(1);
    expect(state.pathStyle).toBe("off");
  });
});

describe("store round-trip through the record", () => {
  it("hydrate(read(capture(state))) is identity for the recorded fields", () => {
    const payload = hydrationPayload();
    useEditorStore.getState().hydrate(payload);
    const record = captureFileSession(
      {
        section: "repair",
        fileName: "run.gpx",
        gapThresholds: { ...DEFAULT_GAP_THRESHOLDS },
        reconstructions: useEditorStore.getState().reconstructions,
        skippedGapIds: useEditorStore.getState().skippedGapIds,
        manualSpans: useEditorStore.getState().manualSpans,
        fileTiming: useEditorStore.getState().fileTiming,
        roadLegs: useEditorStore.getState().roadLegs,
      },
      1,
    );
    useEditorStore.getState().reset();
    const read = readSessionRecord(record);
    expect(read?.kind).toBe("file");
    useEditorStore.getState().hydrate(hydrateFileSession(read as StoredFileSession));
    const state = useEditorStore.getState();
    expect(state.reconstructions[GAP].vertices).toEqual(
      payload.reconstructions[GAP].vertices,
    );
    expect(state.reconstructions[GAP].timeStrategy).toEqual(
      payload.reconstructions[GAP].timeStrategy,
    );
    expect(state.skippedGapIds).toEqual(payload.skippedGapIds);
    expect(state.manualSpans).toEqual(payload.manualSpans);
    expect(state.fileTiming).toEqual(payload.fileTiming);
    expect(state.roadLegs).toEqual(payload.roadLegs);
    expect(state.vertexSeq).toBe(payload.vertexSeq);
  });
});
