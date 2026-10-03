/**
 * Unit tests — session records (lib/storage/session-record.ts, Phase 10).
 *
 * The pure capture/validate/hydrate contract:
 *   - round-trips: capture(state) → readSessionRecord(capture) → hydrate
 *     returns the user's work verbatim (vertices, settings, spans, skips,
 *     timing, road legs) for all four sections;
 *   - elevation status is DROPPED (opt-in network data — a restored line
 *     restarts honestly at "not-fetched");
 *   - the vertex-id allocator re-arms to the highest stored sequence;
 *   - validation: corrupt, foreign, and NEWER-schema records read back
 *     null (an app downgrade discards, never guesses);
 *   - describeSessionRecord: the prompt's label/detail lines.
 */

import { describe, expect, it } from "vitest";
import {
  captureCreateSession,
  captureFileSession,
  capturePlanSession,
  describeSessionRecord,
  hydrateCreateSession,
  hydrateFileSession,
  hydratePlanSession,
  readSessionRecord,
  rearmVertexSeq,
  SESSION_RECORD_SCHEMA_VERSION,
  type StoredCreateSession,
  type StoredFileSession,
  type StoredPlanSession,
} from "@/lib/storage/session-record";
import { DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";
import { emptyReconstruction } from "@/features/reconstruction/drawModel";
import { CREATE_ROUTE_ID } from "@/features/create/track";
import { PLAN_ROUTE_ID } from "@/features/plan/estimate";
import { gapId, pointId, segmentId, vertexId } from "@/types/ids";
import type {
  DrawVertex,
  ManualSpan,
  Reconstruction,
  RoadLeg,
} from "@/types/domain";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEG = segmentId(0, 0);
const GAP = gapId(pointId(SEG, 3), pointId(SEG, 4));

function vertices(count: number, startSeq = 1): DrawVertex[] {
  return Array.from({ length: count }, (_, index) => ({
    id: vertexId(startSeq + index),
    lat: 52.52 + index * 0.0001,
    lon: 13.405 + index * 0.0001,
  }));
}

function workedReconstruction(): Reconstruction {
  return {
    ...emptyReconstruction(GAP),
    vertices: vertices(4, 7), // ids v7..v10 — the re-arm must see them
    pathStyle: "car",
    resampleSpacingM: 30,
    geometryRevision: 5,
    timeStrategy: { kind: "manual-duration", durationMs: 240_000 },
    elevation: { status: "complete", provider: "open-meteo", fetchedAtRevision: 5 },
  };
}

function roadLeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): RoadLeg {
  return {
    a,
    b,
    coordinates: [
      [a.lon, a.lat],
      [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2],
      [b.lon, b.lat],
    ],
    routeDistanceM: 4321,
  };
}

const SPANS: ManualSpan[] = [
  { id: gapId(pointId(SEG, 10), pointId(SEG, 20)), kind: "replace", beforePointId: pointId(SEG, 10), afterPointId: pointId(SEG, 20) },
];

const BASE_FILE_STATE = {
  section: "repair" as const,
  fileName: "morning-run.gpx",
  gapThresholds: { ...DEFAULT_GAP_THRESHOLDS, timeGapMs: 90_000 },
  reconstructions: { [GAP]: workedReconstruction() },
  skippedGapIds: [gapId(pointId(SEG, 40), pointId(SEG, 41))],
  manualSpans: SPANS,
  fileTiming: { startMs: 1_700_000_000_000, totalDurationMs: 3_600_000 },
  roadLegs: {
    [GAP]: [
      roadLeg({ lat: 52.52, lon: 13.405 }, { lat: 52.521, lon: 13.406 }),
      roadLeg({ lat: 52.521, lon: 13.406 }, { lat: 52.522, lon: 13.407 }),
    ],
  },
  // Phase 13 — the working-copy fix log (one spike removal).
  workingEdits: [
    {
      id: "fix/1",
      label: "Remove 2 speed spikes",
      reason: "spike" as const,
      appliedAt: 1_700_000_001_000,
      entries: [
        { kind: "point-deletion" as const, pointId: pointId(SEG, 3) },
        { kind: "point-deletion" as const, pointId: pointId(SEG, 7) },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Round-trips
// ---------------------------------------------------------------------------

describe("file session round-trip (repair + recovery)", () => {
  for (const section of ["repair", "recovery"] as const) {
    it(`captures and hydrates ${section} work verbatim`, () => {
      const record = captureFileSession({ ...BASE_FILE_STATE, section }, 123);
      const read = readSessionRecord(record);
      expect(read).not.toBeNull();
      expect(read?.kind).toBe("file");
      expect(read?.section).toBe(section);

      const hydrated = hydrateFileSession(read as StoredFileSession);
      const original = BASE_FILE_STATE.reconstructions[GAP];
      const restored = hydrated.reconstructions[GAP];
      expect(restored.vertices).toEqual(original.vertices);
      expect(restored.pathStyle).toBe("car");
      expect(restored.resampleSpacingM).toBe(30);
      expect(restored.geometryRevision).toBe(5);
      expect(restored.timeStrategy).toEqual({
        kind: "manual-duration",
        durationMs: 240_000,
      });
      expect(hydrated.skippedGapIds).toEqual(BASE_FILE_STATE.skippedGapIds);
      expect(hydrated.manualSpans).toEqual(SPANS);
      expect(hydrated.fileTiming).toEqual(BASE_FILE_STATE.fileTiming);
      expect(hydrated.roadLegs[GAP]).toEqual(BASE_FILE_STATE.roadLegs[GAP]);
      // The allocator re-arms past the highest restored id (v10).
      expect(hydrated.vertexSeq).toBe(10);
    });
  }

  it("drops elevation status — a restored line restarts not-fetched", () => {
    const record = captureFileSession(BASE_FILE_STATE, 123);
    expect(record.reconstructions[GAP]).not.toHaveProperty("elevation");
    const hydrated = hydrateFileSession(record);
    expect(hydrated.reconstructions[GAP].elevation).toEqual({
      status: "not-fetched",
    });
  });

  it("omits empty road-leg tables and preserves populated ones", () => {
    const record = captureFileSession(
      { ...BASE_FILE_STATE, roadLegs: { [GAP]: [] } },
      123,
    );
    expect(record.roadLegs).toEqual({});
  });
});


describe("file session — surgery edits in the log (Phase 16)", () => {
  const SURGERY_LOG = [
    {
      id: "fix/2",
      label: "Split t0s0 after point #2",
      reason: "split" as const,
      appliedAt: 1_700_000_002_000,
      entries: [
        { kind: "segment-split" as const, segmentId: SEG, atPointId: pointId(SEG, 1) },
      ],
    },
    {
      id: "fix/3",
      label: "Duplicate t0s1 (12 points)",
      reason: "copy" as const,
      appliedAt: 1_700_000_003_000,
      entries: [{ kind: "segment-duplicate" as const, segmentId: segmentId(0, 1) }],
    },
    {
      id: "fix/4",
      label: "Reorder segments (2 move)",
      reason: "reorder" as const,
      appliedAt: 1_700_000_004_000,
      entries: [
        {
          kind: "segment-order" as const,
          order: [segmentId(0, 1), SEG],
        },
      ],
    },
    {
      id: "fix/5",
      label: "Delete 3 points from t0s0",
      reason: "range" as const,
      appliedAt: 1_700_000_005_000,
      entries: [
        { kind: "point-deletion" as const, pointId: pointId(SEG, 4) },
        { kind: "point-deletion" as const, pointId: pointId(SEG, 5) },
      ],
    },
  ];

  it("round-trips every surgery entry kind verbatim", () => {
    const record = captureFileSession(
      { ...BASE_FILE_STATE, workingEdits: [...BASE_FILE_STATE.workingEdits, ...SURGERY_LOG] },
      321,
    );
    const read = readSessionRecord(record);
    expect(read).not.toBeNull();
    expect(read?.kind).toBe("file");
    if (read?.kind !== "file") return;
    expect(read.workingEdits).toHaveLength(5);
    expect(read.workingEdits[1].entries[0]).toEqual({
      kind: "segment-split",
      segmentId: SEG,
      atPointId: pointId(SEG, 1),
    });
    expect(read.workingEdits[2].reason).toBe("copy");
    expect(read.workingEdits[3].entries[0]).toEqual({
      kind: "segment-order",
      order: [segmentId(0, 1), SEG],
    });
  });

  it("a malformed surgery entry rejects the whole record (discard, never guess)", () => {
    const bad = {
      ...captureFileSession(BASE_FILE_STATE, 1),
      workingEdits: [
        {
          id: "fix/9",
          label: "bad",
          reason: "split",
          appliedAt: 1,
          entries: [{ kind: "segment-split", segmentId: SEG /* atPointId missing */ }],
        },
      ],
    };
    expect(readSessionRecord(bad)).toBeNull();
  });

  it("an empty order array and unknown reasons are rejected", () => {
    const emptyOrder = {
      ...captureFileSession(BASE_FILE_STATE, 1),
      workingEdits: [
        {
          id: "fix/9",
          label: "bad",
          reason: "reorder",
          appliedAt: 1,
          entries: [{ kind: "segment-order", order: [] }],
        },
      ],
    };
    expect(readSessionRecord(emptyOrder)).toBeNull();

    const badReason = {
      ...captureFileSession(BASE_FILE_STATE, 1),
      workingEdits: [
        {
          id: "fix/9",
          label: "bad",
          reason: "teleport",
          appliedAt: 1,
          entries: [{ kind: "point-deletion", pointId: pointId(SEG, 1) }],
        },
      ],
    };
    expect(readSessionRecord(badReason)).toBeNull();
  });
});

describe("create session round-trip", () => {
  it("captures and hydrates stats, route, and settings", () => {
    const record = captureCreateSession(
      {
        stats: { distanceM: 10_000, durationMs: 2_700_000, paceMsPerKm: 270_000, startMs: 1_700_000_000_000 },
        reconstruction: {
          ...workedReconstruction(),
          gapId: CREATE_ROUTE_ID,
        },
        roadLegs: [roadLeg({ lat: 52.52, lon: 13.405 }, { lat: 52.53, lon: 13.41 })],
        spacingM: 25,
        matchDistance: true,
        phase: "review",
      },
      456,
    );
    const read = readSessionRecord(record);
    expect(read?.kind).toBe("create");
    const hydrated = hydrateCreateSession(read as StoredCreateSession);
    expect(hydrated.stats.distanceM).toBe(10_000);
    expect(hydrated.reconstruction.vertices).toHaveLength(4);
    expect(hydrated.reconstruction.gapId).toBe(CREATE_ROUTE_ID);
    expect(hydrated.spacingM).toBe(25);
    expect(hydrated.matchDistance).toBe(true);
    expect(hydrated.phase).toBe("review");
    expect(hydrated.roadLegs).toHaveLength(1);
    expect(hydrated.vertexSeq).toBe(10);
  });
});

describe("plan session round-trip", () => {
  it("captures and hydrates the route and the goal time", () => {
    const record = capturePlanSession(
      {
        plannedTimeMs: 2_700_000,
        reconstruction: { ...workedReconstruction(), gapId: PLAN_ROUTE_ID },
        roadLegs: [],
      },
      789,
    );
    const read = readSessionRecord(record);
    expect(read?.kind).toBe("plan");
    const hydrated = hydratePlanSession(read as StoredPlanSession);
    expect(hydrated.plannedTimeMs).toBe(2_700_000);
    expect(hydrated.reconstruction.vertices).toHaveLength(4);
    expect(hydrated.reconstruction.elevation).toEqual({ status: "not-fetched" });
  });

  it("keeps a null goal time null", () => {
    const record = capturePlanSession(
      {
        plannedTimeMs: null,
        reconstruction: { ...emptyReconstruction(PLAN_ROUTE_ID), vertices: vertices(2) },
        roadLegs: [],
      },
      1,
    );
    expect(
      hydratePlanSession(readSessionRecord(record) as StoredPlanSession)
        .plannedTimeMs,
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Validation + migration
// ---------------------------------------------------------------------------

describe("readSessionRecord validation", () => {
  it("rejects non-objects, wrong versions, and unknown kinds", () => {
    expect(readSessionRecord(null)).toBeNull();
    expect(readSessionRecord("repair")).toBeNull();
    expect(readSessionRecord(42)).toBeNull();
    expect(readSessionRecord({ schemaVersion: 2, kind: "file" })).toBeNull();
    expect(readSessionRecord({ schemaVersion: 1, kind: "mystery" })).toBeNull();
    expect(
      readSessionRecord({ schemaVersion: SESSION_RECORD_SCHEMA_VERSION + 1, kind: "file", section: "repair" }),
    ).toBeNull();
  });

  it("rejects a file record with malformed vertices", () => {
    const record = captureFileSession(BASE_FILE_STATE, 1);
    const broken = {
      ...record,
      reconstructions: {
        [GAP]: { ...record.reconstructions[GAP], vertices: [{ id: "x", lat: 999, lon: 0 }] },
      },
    };
    expect(readSessionRecord(broken)).toBeNull();
  });

  it("rejects a create record with non-numeric stats", () => {
    const record = captureCreateSession(
      {
        stats: { distanceM: 1, durationMs: 1, paceMsPerKm: 1, startMs: 1 },
        reconstruction: { ...emptyReconstruction(CREATE_ROUTE_ID), vertices: vertices(2) },
        roadLegs: [],
        spacingM: 25,
        matchDistance: false,
        phase: "draw",
      },
      1,
    );
    expect(readSessionRecord({ ...record, stats: { ...record.stats, distanceM: "far" } })).toBeNull();
  });

  it("rejects a manual-duration strategy without a positive duration", () => {
    const record = captureFileSession(BASE_FILE_STATE, 1);
    const broken = {
      ...record,
      reconstructions: {
        [GAP]: {
          ...record.reconstructions[GAP],
          timeStrategy: { kind: "manual-duration", durationMs: 0 },
        },
      },
    };
    expect(readSessionRecord(broken)).toBeNull();
  });

  it("rejects road legs with non-finite coordinates", () => {
    const record = captureFileSession(BASE_FILE_STATE, 1);
    const broken = {
      ...record,
      roadLegs: { [GAP]: [{ a: { lat: NaN, lon: 0 }, b: { lat: 1, lon: 1 }, coordinates: [[0, 0]], routeDistanceM: 1 }] },
    };
    expect(readSessionRecord(broken)).toBeNull();
  });

  it("ignores an unknown section key entirely (merge is not a record)", () => {
    const record = captureFileSession(BASE_FILE_STATE, 1);
    expect(readSessionRecord({ ...record, section: "merge" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Vertex allocator + prompt description
// ---------------------------------------------------------------------------

describe("rearmVertexSeq", () => {
  it("uses the highest v{N} sequence across all reconstructions", () => {
    expect(rearmVertexSeq([
      { vertices: vertices(3, 1) },  // v1..v3
      { vertices: vertices(2, 90) }, // v90..v91
    ])).toBe(91);
  });

  it("floors by vertex count so foreign ids cannot force collisions", () => {
    expect(
      rearmVertexSeq([
        { vertices: [{ id: "odd-id" as DrawVertex["id"], lat: 1, lon: 1 }] },
      ]),
    ).toBe(1);
    expect(rearmVertexSeq([{ vertices: [] }])).toBe(0);
  });
});

describe("describeSessionRecord", () => {
  it("labels a file session with its name and drawn work", () => {
    const described = describeSessionRecord(captureFileSession(BASE_FILE_STATE, 1));
    expect(described.label).toBe("morning-run.gpx");
    expect(described.detail).toContain("4 points drawn");
    expect(described.detail).toContain("1 manual span");
    expect(described.detail).toContain("1 skipped gap");
  });

  it("labels create with the entered distance and plan with its shape", () => {
    const create = describeSessionRecord(
      captureCreateSession(
        {
          stats: { distanceM: 10_000, durationMs: 1, paceMsPerKm: 1, startMs: 1 },
          reconstruction: { ...emptyReconstruction(CREATE_ROUTE_ID), vertices: vertices(3) },
          roadLegs: [],
          spacingM: 25,
          matchDistance: false,
          phase: "draw",
        },
        1,
      ),
    );
    expect(create.label).toBe("Activity from stats");
    expect(create.detail).toContain("3 points drawn");
    expect(create.detail).toContain("10.0 km entered");

    const plan = describeSessionRecord(
      capturePlanSession(
        {
          plannedTimeMs: null,
          reconstruction: { ...emptyReconstruction(PLAN_ROUTE_ID), vertices: vertices(6) },
          roadLegs: [],
        },
        1,
      ),
    );
    expect(plan.label).toBe("Route plan");
    expect(plan.detail).toBe("6 points drawn");
  });
});
