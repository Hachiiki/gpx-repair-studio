/**
 * Task 43 — merge store tests (state/merge-store).
 *
 * The state machine of the Merge section: file collection (order IS the
 * array), per-file parse results, the ≥ 2 guard on `combine`, ordering
 * edits (move / sort-by-start-time), the combined name, and the reset
 * contract (fresh state, id sequence reuse).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  parsedMergeFiles,
  useMergeStore,
  type MergeFileEntry,
} from "@/state/merge-store";
import type { OriginalTrackData } from "@/types/domain";

/** A minimal stand-in model (the store never inspects it). */
function fakeModel(tag: string): OriginalTrackData {
  return {
    tracks: [],
    segments: [],
    waypoints: [],
    routes: [],
    rootExtras: [],
    fileMeta: {
      version: "1.1",
      raw: { version: "1.1", creator: "test" },
      metadataExtras: [],
    },
    issues: [],
    ...(tag ? {} : {}),
  } as unknown as OriginalTrackData;
}

function summary(firstTimeMs?: number) {
  return {
    fileName: "x.gpx",
    pointCount: 1,
    trackCount: 1,
    segmentCount: 1,
    waypointCount: 0,
    routeCount: 0,
    hasTimingData: firstTimeMs !== undefined,
    ...(firstTimeMs !== undefined ? { firstTimeMs, lastTimeMs: firstTimeMs } : {}),
  };
}

const store = () => useMergeStore.getState();

/** Drive a file to "parsed" through the public actions. */
function addParsedFile(fileName: string, firstTimeMs?: number): string {
  const [id] = store().beginFiles([fileName]);
  store().setParsed(id, {
    model: fakeModel(fileName),
    summary: summary(firstTimeMs),
    distanceM: 1000,
  });
  return id;
}

beforeEach(() => {
  useMergeStore.getState().reset();
});

describe("file collection", () => {
  it("beginFiles appends parsing placeholders in order and returns their ids", () => {
    const ids = store().beginFiles(["a.gpx", "b.gpx"]);
    expect(ids).toEqual(["f1", "f2"]);
    const files = useMergeStore.getState().files;
    expect(files.map((f) => [f.fileName, f.status])).toEqual([
      ["a.gpx", "parsing"],
      ["b.gpx", "parsing"],
    ]);
  });

  it("ids never collide, even for duplicate names across calls", () => {
    store().beginFiles(["same.gpx"]);
    const ids = store().beginFiles(["same.gpx", "same.gpx"]);
    expect(ids).toEqual(["f2", "f3"]);
    const all = useMergeStore.getState().files.map((f) => f.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("setParsed / setFileError update only their entry", () => {
    const [a, b] = store().beginFiles(["a.gpx", "b.gpx"]);
    const error = { title: "T", detail: "D" };
    store().setParsed(a, {
      model: fakeModel("a"),
      summary: summary(),
      distanceM: 5,
    });
    store().setFileError(b, error);
    const files = useMergeStore.getState().files;
    expect(files[0]).toMatchObject({ status: "parsed", distanceM: 5, error: null });
    expect(files[1]).toMatchObject({
      status: "error",
      model: null,
      summary: null,
      error,
    });
    expect(parsedMergeFiles(useMergeStore.getState())).toHaveLength(1);
  });

  it("removeFile drops any status and closes the gap", () => {
    const a = addParsedFile("a.gpx");
    const b = addParsedFile("b.gpx");
    store().removeFile(a);
    const files = useMergeStore.getState().files;
    expect(files.map((f) => f.id)).toEqual([b]);
    // ids are never reused: a third file gets f3.
    const [c] = store().beginFiles(["c.gpx"]);
    expect(c).toBe("f3");
  });
});

describe("ordering edits", () => {
  it("moveFile swaps one position, no-ops at the edges", () => {
    const a = addParsedFile("a.gpx");
    const b = addParsedFile("b.gpx");
    const c = addParsedFile("c.gpx");
    store().moveFile(c, -1);
    expect(useMergeStore.getState().files.map((f) => f.id)).toEqual([a, c, b]);
    store().moveFile(a, -1); // already first
    expect(useMergeStore.getState().files.map((f) => f.id)).toEqual([a, c, b]);
    store().moveFile(a, 1);
    expect(useMergeStore.getState().files.map((f) => f.id)).toEqual([c, a, b]);
    store().moveFile(b, 1); // already last
    expect(useMergeStore.getState().files.map((f) => f.id)).toEqual([c, a, b]);
  });

  it("sortByStartTime orders parsed files by first time; undated and errors keep relative order at the end", () => {
    const dated2 = addParsedFile("dated2.gpx", 2_000);
    const undated = addParsedFile("undated.gpx");
    const dated1 = addParsedFile("dated1.gpx", 1_000);
    const [bad] = store().beginFiles(["bad.gpx"]);
    store().setFileError(bad, { title: "T", detail: "D" });

    store().sortByStartTime();
    const names = useMergeStore
      .getState()
      .files.map((f: MergeFileEntry) => f.fileName);
    expect(names).toEqual([
      "dated1.gpx",
      "dated2.gpx",
      "undated.gpx",
      "bad.gpx",
    ]);
  });
});

describe("phase transitions", () => {
  it("combine requires two parsed files", () => {
    expect(store().combine()).toBe(false);
    addParsedFile("a.gpx");
    expect(store().combine()).toBe(false);
    addParsedFile("b.gpx");
    expect(store().combine()).toBe(true);
    expect(useMergeStore.getState().phase).toBe("studio");
  });

  it("combine is idempotent while already in the studio", () => {
    addParsedFile("a.gpx");
    addParsedFile("b.gpx");
    expect(store().combine()).toBe(true);
    expect(store().combine()).toBe(false);
  });

  it("backToIntake keeps the files (arrange → collect more)", () => {
    addParsedFile("a.gpx");
    addParsedFile("b.gpx");
    store().combine();
    store().backToIntake();
    const state = useMergeStore.getState();
    expect(state.phase).toBe("intake");
    expect(state.files).toHaveLength(2);
  });

  it("reset clears everything, including the id sequence", () => {
    addParsedFile("a.gpx");
    store().setCombinedName("Two rides");
    store().combine();
    store().reset();
    const state = useMergeStore.getState();
    expect(state.phase).toBe("intake");
    expect(state.files).toEqual([]);
    expect(state.combinedName).toBe("");
    expect(state.idSeq).toBe(1);
    const [id] = store().beginFiles(["again.gpx"]);
    expect(id).toBe("f1");
  });
});

describe("combined name", () => {
  it("setCombinedName edits the single editable string", () => {
    store().setCombinedName("Morning + evening");
    expect(useMergeStore.getState().combinedName).toBe("Morning + evening");
    store().setCombinedName("");
    expect(useMergeStore.getState().combinedName).toBe("");
  });
});
