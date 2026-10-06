// @vitest-environment jsdom
/**
 * The session index — Phase 24.1/24.4 goldens: the one-pass walk's
 * card numbers, the recorded-only record numbers (reconstructed
 * stretches never count), the §L-1 elevation-coverage gate, the
 * record→merge rebuild (`indexFromFileRecord` — the one derivation
 * path every index takes), the read-side shape ceiling, and the
 * `library` store's CRUD + delete cascade.
 *
 * Equator-line geometry throughout (tests/splits.test.ts convention):
 * hand-computed goldens derive from the leg length measured once.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  indexSession,
  indexFromFileRecord,
  mergeFromFileRecord,
  readSessionIndex,
  LIBRARY_INDEX_SCHEMA_VERSION,
} from "@/features/library/index-session";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";
import {
  clearAllSessionData,
  deleteSavedSession,
  listLibraryIndexes,
  readLibraryIndex,
  saveSessionEntry,
  writeLibraryIndex,
  __setSessionBackendForTests,
  type SessionStorageBackend,
} from "@/lib/storage/sessionStore";
import type { StoredFileSession } from "@/lib/storage/session-record";
import { vertexId } from "@/types/ids";
import type { GapId, PointId } from "@/types/domain";
import type { MergeResult } from "@/features/reconstruction/merge";
import { parseXml } from "./helpers/gpxTestUtils";
import { metricsMerge } from "./helpers/metricsTestUtils";

const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};
const P = (i: number): PointId => `t0s0:${i}` as PointId;

/** Equator positions with ~300 m legs. */
const LON_STEP_DEG = (300 / 6_378_137) * (180 / Math.PI);
const lonAt = (steps: number) => -0.02 + steps * LON_STEP_DEG;
const legM = (): number =>
  geodesicDistanceMeters(
    { lat: 0, lon: lonAt(0) },
    { lat: 0, lon: lonAt(1) },
  );

/**
 * N equator points with time/ele/hr, one track per `tracks` chunk.
 * `untimed` drops `<time>`; `noEle` drops `<ele>`; `gapAt` adds a 300 s
 * hole into ONE leg (for records); `hrAt` varies hr per point.
 */
function lineXml(
  count: number,
  opts: {
    dt?: number;
    ele?: number;
    untimed?: number[];
    noEle?: number[];
    gapAt?: number;
    hrAt?: (i: number) => number | undefined;
    tracks?: number[];
  } = {},
): string {
  const {
    dt = 10,
    ele = 100,
    untimed = [],
    noEle = [],
    gapAt = -1,
    hrAt,
    tracks = [count],
  } = opts;
  const trks: string[] = [];
  let index = 0;
  let hourOffset = 0;
  for (const size of tracks) {
    const pts: string[] = [];
    for (let i = 0; i < size; i += 1, index += 1) {
      const seconds =
        index * dt + (index > gapAt && gapAt >= 0 ? 300 : 0) + hourOffset;
      const children: string[] = [];
      if (!noEle.includes(index)) children.push(`<ele>${ele + index * 2}</ele>`);
      if (!untimed.includes(index)) {
        children.push(
          `<time>2024-05-01T${String(7 + Math.floor(seconds / 3600)).padStart(2, "0")}:${String(
            Math.floor((seconds % 3600) / 60),
          ).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}Z</time>`,
        );
      }
      const hr = hrAt?.(index);
      if (hr !== undefined) {
        children.push(
          `<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`,
        );
      }
      pts.push(
        `<trkpt lat="0" lon="${lonAt(index).toFixed(12)}">${children.join("")}</trkpt>`,
      );
    }
    hourOffset += 3600;
    trks.push(`<trk><name>T</name><trkseg>${pts.join("")}</trkseg></trk>`);
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `${trks.join("\n")}\n</gpx>\n`
  );
}

const plainMerge = (xml: string): MergeResult =>
  mergeRepairs(parseXml(xml), [], TIMED);

/** A stored file-record stand-in around a parsed document. */
function fileRecord(
  data: ReturnType<typeof parseXml>,
  extra: Partial<StoredFileSession> = {},
): StoredFileSession {
  return {
    schemaVersion: 2,
    kind: "file",
    section: "repair",
    savedAt: 1,
    fileName: "line.gpx",
    gapThresholds: { ...DEFAULT_GAP_THRESHOLDS },
    reconstructions: {},
    skippedGapIds: [],
    manualSpans: [],
    fileTiming: { startMs: null, totalDurationMs: null },
    roadLegs: {},
    workingEdits: [],
    ...extra,
  };
}

describe("indexSession — the card numbers", () => {
  const L = legM();

  it("distance, moving time, and pace inputs over the merged route", () => {
    const index = indexSession(plainMerge(lineXml(6)), {
      timeGapMs: DEFAULT_GAP_THRESHOLDS.timeGapMs,
    })!;
    expect(index.distanceM).toBeCloseTo(5 * L, 3);
    expect(index.movingTimeMs).toBe(50_000);
    expect(index.hasTimingData).toBe(true);
    expect(index.trackCount).toBe(1);
    expect(index.reconstructedDistanceM).toBe(0);
  });

  it("average heart rate is time-weighted over hr legs", () => {
    // Metrics ride TCX/FIT only (§EE 14 — GPX carries none): the real
    // TCX pipeline, hr 100 on points 0..2 and 140 on 3..5, 10 s legs.
    const merge = metricsMerge([
      { lat: 0, lon: 0, time: 0, hr: 100 },
      { lat: 0, lon: 0.0001, time: 10_000, hr: 100 },
      { lat: 0, lon: 0.0002, time: 20_000, hr: 100 },
      { lat: 0, lon: 0.0003, time: 30_000, hr: 140 },
      { lat: 0, lon: 0.0004, time: 40_000, hr: 140 },
      { lat: 0, lon: 0.0005, time: 50_000, hr: 140 },
    ]);
    const index = indexSession(merge, { timeGapMs: 120_000 })!;
    // legs: (0,1)=100, (1,2)=100, (2,3)=120, (3,4)=140, (4,5)=140
    expect(index.avgHrBpm).toBeCloseTo((100 + 100 + 120 + 140 + 140) / 5, 6);
    expect(index.hasHrData).toBe(true);
    expect(index.hasCadData).toBe(false);
  });

  it("an hr-free track reports null average (never zero)", () => {
    const index = indexSession(plainMerge(lineXml(4)), {
      timeGapMs: 120_000,
    })!;
    expect(index.avgHrBpm).toBeNull();
    expect(index.hasHrData).toBe(false);
  });

  it("hysteresis gain with the 2 m deadband (ele +2 per point)", () => {
    const index = indexSession(plainMerge(lineXml(6)), {
      timeGapMs: 120_000,
    })!;
    // ele 100,102,…,110: every +2 step commits → gain 10.
    expect(index.gainM).toBeCloseTo(10, 6);
    expect(index.elevationCoverage).toBe(1);
  });

  it("gain is withheld below the §L-1 coverage floor", () => {
    // Half the points lack ele → coverage 0.5 < 0.6.
    const index = indexSession(
      plainMerge(lineXml(6, { noEle: [1, 3, 5] })),
      { timeGapMs: 120_000 },
    )!;
    expect(index.elevationCoverage).toBeCloseTo(0.5, 6);
    expect(index.gainM).toBeNull();
    expect(index.recordedGainM).toBeNull();
  });

  it("untimed files still measure distance but not time", () => {
    const index = indexSession(
      plainMerge(lineXml(5, { untimed: [0, 1, 2, 3, 4] })),
      { timeGapMs: 120_000 },
    )!;
    expect(index.distanceM).toBeCloseTo(4 * L, 3);
    expect(index.movingTimeMs).toBe(0);
    expect(index.hasTimingData).toBe(false);
    expect(index.activityStartMs).toBeNull();
    expect(index.efforts).toHaveLength(0);
  });

  it("the activity date is the first RECORDED timestamp", () => {
    const index = indexSession(plainMerge(lineXml(4)), {
      timeGapMs: 120_000,
    })!;
    expect(index.activityStartMs).toBe(Date.parse("2024-05-01T07:00:00Z"));
  });
});

describe("indexSession — the record numbers (recorded-only)", () => {
  const L = legM();

  it("reconstructed distance moves the card number, never the record", () => {
    // A time gap at leg 3→4 filled by a drawn path: the card counts
    // the drawn legs, the record numbers do not.
    const data = parseXml(lineXml(8, { gapAt: 3 }));
    const merge = mergeRepairs(
      data,
      [
        {
          gapId: `gap/${P(3)}/${P(4)}` as GapId,
          beforePointId: P(3),
          afterPointId: P(4),
          vertices: [
            { id: vertexId(1), lat: 0.001, lon: lonAt(3.5) },
            { id: vertexId(2), lat: 0.002, lon: lonAt(3.6) },
          ],
          resampleSpacingM: "off",
          timeStrategy: { kind: "manual-duration", durationMs: 60_000 },
          roadLegs: [],
        },
      ],
      TIMED,
    );
    const index = indexSession(merge, { timeGapMs: 120_000 })!;

    // Card: the whole merged route (recorded + drawn legs).
    expect(index.distanceM).toBeGreaterThan(7 * L);
    expect(index.reconstructedDistanceM).toBeGreaterThan(0);
    // Record: the six recorded legs only — the gap leg (3,4) was
    // replaced by the drawn stretch, so it is not recorded either.
    expect(index.recordedDistanceM).toBeCloseTo(6 * L, 3);
    // Card moving time: the six recorded legs (60 s) plus the two
    // drawn legs that fit inside the 60 s manual duration (20 s each).
    // The last drawn leg lands 270 s before point 4's RECORDED time —
    // recorded timestamps are sacred, so that leg is a gap leg:
    // distance counts, time does not.
    expect(index.movingTimeMs).toBe(100_000);
    expect(index.recordedMovingTimeMs).toBe(60_000);
    // The recorded gain excludes the drawn elevation (reconstructed
    // points carry none here) — hysteresis continues across the hole.
    expect(index.recordedGainM).not.toBeNull();
  });

  it("efforts ride along from the same merge (24.2)", () => {
    const index = indexSession(plainMerge(lineXml(8)), {
      timeGapMs: 120_000,
    })!;
    expect(index.efforts.map((e) => e.distanceM)).toContain(400);
    expect(index.efforts.map((e) => e.distanceM)).toContain(1000);
  });
});

describe("indexFromFileRecord — the one derivation path", () => {
  const L = legM();

  it("re-derives the merge from a stored record's repairs", () => {
    // A time gap at leg 3→4, repaired in the stored record with a
    // drawn path: the index must include the repair (the same merge
    // the dashboard showed at save time, minus the live elevation
    // samples a record never carried).
    const data = parseXml(lineXml(8, { gapAt: 3 }));
    const record = fileRecord(data, {
      reconstructions: {
        [`gap/${P(3)}/${P(4)}`]: {
          gapId: `gap/${P(3)}/${P(4)}`,
          vertices: [
            { id: vertexId(1), lat: 0.001, lon: lonAt(3.5) },
            { id: vertexId(2), lat: 0.002, lon: lonAt(3.6) },
          ],
          resampleSpacingM: "off",
          geometryRevision: 1,
          timeStrategy: { kind: "manual-duration", durationMs: 60_000 },
        },
      },
      roadLegs: {},
    });
    const merge = mergeFromFileRecord(data, record);
    expect(merge.reconstructedDistanceM).toBeGreaterThan(0);

    const index = indexFromFileRecord(data, record)!;
    expect(index.distanceM).toBeGreaterThan(7 * L);
    expect(index.recordedDistanceM).toBeCloseTo(6 * L, 3);
    expect(index.reconstructedDistanceM).toBeGreaterThan(0);
  });

  it("a pristine record indexes like a plain merge", () => {
    const data = parseXml(lineXml(6));
    const record = fileRecord(data);
    const index = indexFromFileRecord(data, record)!;
    expect(index.distanceM).toBeCloseTo(5 * L, 3);
    expect(index.movingTimeMs).toBe(50_000);
    expect(index.efforts.map((e) => e.distanceM)).toContain(400);
  });

  it("a reconstruction whose gap no longer detects is skipped, not guessed", () => {
    const data = parseXml(lineXml(6)); // no time gap at all
    const record = fileRecord(data, {
      reconstructions: {
        "gap/does/not-exist": {
          gapId: "gap/does/not-exist",
          vertices: [{ id: vertexId(1), lat: 0.001, lon: lonAt(2.5) }],
          resampleSpacingM: "off",
          geometryRevision: 1,
          timeStrategy: { kind: "distance-proportional" },
        },
      },
    });
    const index = indexFromFileRecord(data, record)!;
    expect(index.reconstructedDistanceM).toBe(0);
    expect(index.distanceM).toBeCloseTo(5 * L, 3);
  });
});

describe("readSessionIndex — the shape ceiling", () => {
  const valid = (): Record<string, unknown> => ({
    schemaVersion: LIBRARY_INDEX_SCHEMA_VERSION,
    hasTimingData: true,
    hasHrData: false,
    hasCadData: false,
    hasPowerData: false,
    activityStartMs: 1_714_543_200_000,
    distanceM: 1000,
    movingTimeMs: 60_000,
    gainM: 12,
    avgHrBpm: null,
    elevationCoverage: 1,
    recordedDistanceM: 900,
    recordedMovingTimeMs: 55_000,
    recordedGainM: 10,
    reconstructedDistanceM: 100,
    trackCount: 1,
    efforts: [
      { distanceM: 400, timeMs: 90_000, startInterpolated: true, endInterpolated: false },
    ],
  });

  it("round-trips a well-formed index", () => {
    const index = readSessionIndex(valid());
    expect(index).not.toBeNull();
    expect(index!.efforts).toHaveLength(1);
    expect(index!.efforts[0]!.startInterpolated).toBe(true);
  });

  it("discards a newer schema version, never partially reads it", () => {
    const newer = { ...valid(), schemaVersion: LIBRARY_INDEX_SCHEMA_VERSION + 1 };
    expect(readSessionIndex(newer)).toBeNull();
  });

  it("discards drifted shapes field by field", () => {
    expect(readSessionIndex({ ...valid(), distanceM: "far" })).toBeNull();
    expect(readSessionIndex({ ...valid(), efforts: "fast" })).toBeNull();
    expect(
      readSessionIndex({
        ...valid(),
        efforts: [{ distanceM: 0, timeMs: 1, startInterpolated: false, endInterpolated: false }],
      }),
    ).toBeNull();
    expect(readSessionIndex(null)).toBeNull();
    expect(readSessionIndex("x")).toBeNull();
  });
});

describe("the `library` store (Phase 24 §24.4)", () => {
  /** The in-memory backend (the storage tests' faithful stand-in). */
  function memoryBackend(): SessionStorageBackend {
    const stores = new Map<string, Map<string, unknown>>();
    const store = (name: string) => {
      let map = stores.get(name);
      if (!map) {
        map = new Map();
        stores.set(name, map);
      }
      return map;
    };
    return {
      async get(name, key) {
        return store(name).get(key) ?? null;
      },
      async put(name, key, value) {
        store(name).set(key, value);
      },
      async delete(name, key) {
        store(name).delete(key);
      },
      async keys(name) {
        return [...store(name).keys()];
      },
      async clear(name) {
        store(name).clear();
      },
    };
  }

  const index = indexSession(plainMerge(lineXml(4)), {
    timeGapMs: 120_000,
  })!;

  beforeEach(() => {
    __setSessionBackendForTests(memoryBackend());
  });
  afterEach(() => {
    __setSessionBackendForTests(null);
    vi.restoreAllMocks();
  });

  it("writes, lists, and reads back the same index", async () => {
    expect(await writeLibraryIndex("s1", index)).toBe(true);
    expect(await writeLibraryIndex("s2", index)).toBe(true);
    const listed = await listLibraryIndexes();
    expect(listed.size).toBe(2);
    expect(readSessionIndex(listed.get("s1"))).not.toBeNull();
    expect(await readLibraryIndex("s1")).not.toBeNull();
  });

  it("deleting a saved session deletes its derived index (the cascade)", async () => {
    const id = await saveSessionEntry({
      name: "Sunday ride",
      section: "repair",
      record: { schemaVersion: 2, kind: "file", section: "repair", savedAt: 1 },
    });
    await writeLibraryIndex(id!, index);
    expect((await listLibraryIndexes()).size).toBe(1);
    expect(await deleteSavedSession(id!)).toBe(true);
    expect((await listLibraryIndexes()).size).toBe(0);
  });

  it("clearing the shelf clears the derived indexes with it", async () => {
    await writeLibraryIndex("a", index);
    await saveSessionEntry({
      name: "x",
      section: "repair",
      record: { schemaVersion: 2, kind: "file", section: "repair", savedAt: 1 },
    });
    expect(await clearAllSessionData()).toBe(true);
    expect((await listLibraryIndexes()).size).toBe(0);
  });
});
