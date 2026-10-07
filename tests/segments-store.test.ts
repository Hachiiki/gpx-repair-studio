/**
 * Phase 25 storage tests — the DB v4 stores behind the heatmap and
 * the personal segments (lib/storage/sessionStore.ts): round-trips,
 * the derived-strips cascade (deleteSavedSession removes the strips
 * beside the index), the segments store's independent lifetime (user
 * data survives a session delete, cleared with the shelf), and the
 * record validators' "discard, never guess" ceiling.
 *
 * Same strategy as tests/session-storage.test.ts: an injected
 * in-memory backend exercises the public seam; the REAL IndexedDB
 * upgrade path (v3 → v4) is proven by the e2e suite.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __setSessionBackendForTests,
  clearAllSessionData,
  deleteSavedSession,
  deleteSegment,
  heatmapStripsKeys,
  listSegments,
  readHeatmapStrips,
  readSegment,
  saveSessionEntry,
  writeHeatmapStrips,
  writeSegment,
  type SessionStorageBackend,
} from "@/lib/storage/sessionStore";
import { readSegmentRow, segmentView, SEGMENT_SCHEMA_VERSION } from "@/features/segments/record";
import { readHeatmapStrips as validateStrips } from "@/features/heatmap/strips";

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

beforeEach(() => {
  __setSessionBackendForTests(memoryBackend());
});

afterEach(() => {
  __setSessionBackendForTests(null);
});

/** A valid stored segment row (the writer's shape). */
function segmentRow(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SEGMENT_SCHEMA_VERSION,
    id: "seg-1",
    name: "Morning climb",
    createdAt: 1_700_000_000_000,
    source: "stretch",
    start: { lat: -37.95, lon: 145.1 },
    end: { lat: -37.94, lon: 145.11 },
    lengthM: 1840,
    ...overrides,
  };
}

describe("the heatmap store (derived, cascade-deleted)", () => {
  it("round-trips strips keyed by session id", async () => {
    const strips = {
      schemaVersion: 1,
      lonLat: new Float64Array([145.1, -37.95, 145.11, -37.94]),
    };
    expect(await writeHeatmapStrips("s1", strips)).toBe(true);
    expect(await heatmapStripsKeys()).toEqual(["s1"]);
    expect(validateStrips(await readHeatmapStrips("s1"))).not.toBeNull();
    expect(await readHeatmapStrips("missing")).toBeNull();
  });

  it("deleteSavedSession cascades the strips beside the index", async () => {
    const id = await saveSessionEntry({
      name: "Ride",
      section: "repair",
      record: {},
    });
    expect(id).not.toBeNull();
    await writeHeatmapStrips(id!, { schemaVersion: 1, lonLat: new Float64Array(4) });
    expect(await heatmapStripsKeys()).toEqual([id!]);
    expect(await deleteSavedSession(id!)).toBe(true);
    expect(await heatmapStripsKeys()).toEqual([]);
  });

  it("clearAllSessionData empties the store", async () => {
    await writeHeatmapStrips("s1", { schemaVersion: 1, lonLat: new Float64Array(4) });
    await writeHeatmapStrips("s2", { schemaVersion: 1, lonLat: new Float64Array(4) });
    expect(await clearAllSessionData()).toBe(true);
    expect(await heatmapStripsKeys()).toEqual([]);
  });
});

describe("the segments store (user data, shelf-cleared)", () => {
  it("round-trips a segment through its validator", async () => {
    expect(await writeSegment(segmentRow())).toBe(true);
    const row = readSegmentRow(await readSegment("seg-1"));
    expect(row).not.toBeNull();
    expect(row!.name).toBe("Morning climb");
    expect(row!.lengthM).toBe(1840);
    const view = segmentView(row!);
    expect(view.efforts).toEqual([]);
    expect(view.pr).toBeNull();
  });

  it("round-trips the efforts block (the derived shadow)", async () => {
    await writeSegment(
      segmentRow({
        efforts: {
          fingerprint: "v1-abc-2",
          computedAt: 1_700_000_001_000,
          rows: [
            {
              sessionId: "s1",
              sessionName: "Ride",
              activityStartMs: 1_700_000_000_000,
              elapsedMs: 92_000,
              reconstructed: false,
            },
            {
              sessionId: "s2",
              sessionName: "Repaired ride",
              activityStartMs: null,
              elapsedMs: 45_000,
              reconstructed: true,
            },
          ],
        },
      }),
    );
    const view = segmentView(readSegmentRow(await readSegment("seg-1"))!);
    expect(view.efforts).toHaveLength(2);
    // Clean first, flagged after; the PR is the clean effort.
    expect(view.efforts[0]!.reconstructed).toBe(false);
    expect(view.pr!.elapsedMs).toBe(92_000);
  });

  it("a segment survives its source session's delete; the shelf clears it", async () => {
    const id = await saveSessionEntry({
      name: "Ride",
      section: "repair",
      record: {},
    });
    await writeSegment(segmentRow());
    expect(await deleteSavedSession(id!)).toBe(true);
    // User data: the segment is its own entity.
    expect(readSegmentRow(await readSegment("seg-1"))).not.toBeNull();
    expect(await deleteSegment("seg-1")).toBe(true);
    expect(await listSegments()).toEqual([]);
  });

  it("the validator discards drifted shapes whole", () => {
    expect(readSegmentRow(null)).toBeNull();
    expect(readSegmentRow({ schemaVersion: 2, id: "x", name: "y" })).toBeNull();
    expect(readSegmentRow(segmentRow({ id: "" }))).toBeNull();
    expect(readSegmentRow(segmentRow({ lengthM: 0 }))).toBeNull();
    expect(readSegmentRow(segmentRow({ source: "teleported" }))).toBeNull();
    expect(readSegmentRow(segmentRow({ start: { lat: 1 } }))).toBeNull();
    // A drifted efforts block poisons the row, never half-reads.
    expect(
      readSegmentRow(
        segmentRow({ efforts: { fingerprint: "x", computedAt: 1, rows: [{ elapsedMs: -1 }] } }),
      ),
    ).toBeNull();
  });

  it("clearAllSessionData empties the segments too", async () => {
    await writeSegment(segmentRow());
    expect(await clearAllSessionData()).toBe(true);
    expect(await listSegments()).toEqual([]);
  });
});
