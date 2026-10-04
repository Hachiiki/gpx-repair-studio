/**
 * Unit tests — the named saved sessions (lib/storage/sessionStore.ts's
 * `saved` store, Phase 18 §EE 18.4). The DB-v2 half of the shelf.
 *
 *   - saveSessionEntry writes and stamps ids/timestamps; the returned
 *     id reads back the same entry;
 *   - listSavedSessions orders newest-updated first and SKIPS entries
 *     whose shape drifted (never guesses them into place);
 *   - renameSavedSession patches the name + updatedAt only;
 *   - deleteSavedSession removes exactly one entry;
 *   - the failure contract: a throwing backend latches unavailable and
 *     every later call is a silent no-op (null / [] / false) — the
 *     Phase 10 rule, extended.
 *
 * The record itself is an opaque object to this layer (validation is
 * the orchestrator's job) — the tests use minimal stand-ins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setSessionBackendForTests,
  deleteSavedSession,
  isSessionStorageAvailable,
  listSavedSessions,
  readSavedSession,
  renameSavedSession,
  saveSessionEntry,
  type SessionStorageBackend,
} from "@/lib/storage/sessionStore";

/** The in-memory backend (the session-storage tests' faithful stand-in). */
function memoryBackend(): SessionStorageBackend & {
  stores: Map<string, Map<string, unknown>>;
} {
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
    stores,
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

/** A backend whose every operation fails — quota, blocked, private mode. */
function throwingBackend(): SessionStorageBackend {
  const failure = () => Promise.reject(new Error("blocked"));
  return {
    get: failure,
    put: failure,
    delete: failure,
    keys: failure,
    clear: failure,
  };
}

/** A minimal valid record stand-in (opaque to this layer). */
function recordStandIn(section: string): object {
  return { schemaVersion: 2, kind: "file", section, savedAt: 1 };
}

beforeEach(() => {
  __setSessionBackendForTests(memoryBackend());
});

afterEach(() => {
  __setSessionBackendForTests(null);
  vi.restoreAllMocks();
});

describe("saved sessions — the shelf CRUD", () => {
  it("saves with a generated id and reads back the same entry", async () => {
    const id = await saveSessionEntry({
      name: "Sunday ride",
      section: "repair",
      record: recordStandIn("repair"),
    });
    expect(id).not.toBeNull();

    const entry = await readSavedSession(id!);
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("Sunday ride");
    expect(entry!.section).toBe("repair");
    expect(entry!.record).toEqual(recordStandIn("repair"));
    expect(entry!.createdAt).toBeGreaterThan(0);
    expect(entry!.updatedAt).toBeGreaterThanOrEqual(entry!.createdAt);
    expect(entry!.view).toBeUndefined();
    expect(entry!.source).toBeUndefined();
  });

  it("carries the view and the source blob when given (repair sessions)", async () => {
    const blob = new Blob(["<gpx/>"]);
    const id = await saveSessionEntry({
      name: "With source",
      section: "recovery",
      record: recordStandIn("recovery"),
      view: "share",
      source: { name: "run.gpx", type: "application/gpx+xml", blob },
    });
    const entry = await readSavedSession(id!);
    expect(entry!.view).toBe("share");
    expect(entry!.source?.name).toBe("run.gpx");
    expect(entry!.source?.blob).toBe(blob);
  });

  it("lists newest-updated first and skips drifted shapes", async () => {
    const first = await saveSessionEntry({
      name: "first",
      section: "plan",
      record: recordStandIn("plan"),
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await saveSessionEntry({
      name: "second",
      section: "create",
      record: recordStandIn("create"),
    });

    let rows = await listSavedSessions();
    expect(rows.map((r) => r.id)).toEqual([second, first].map((x) => x!));

    // A rename bumps updatedAt → the renamed row leads.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await renameSavedSession(first!, "first (renamed)");
    rows = await listSavedSessions();
    expect(rows[0]!.name).toBe("first (renamed)");

    // A drifted entry (bad section) is skipped by the LIST and reads
    // back null — never guessed into place.
    const backend = memoryBackend();
    __setSessionBackendForTests(backend);
    await backend.put("saved", "drifted", {
      id: "drifted",
      name: "bad shape",
      section: "not-a-section",
      record: {},
      createdAt: 1,
      updatedAt: 99,
    });
    expect(await listSavedSessions()).toEqual([]);
    expect(await readSavedSession("drifted")).toBeNull();
  });

  it("renames only (the record + source stay untouched)", async () => {
    const blob = new Blob(["<gpx/>"]);
    const id = await saveSessionEntry({
      name: "before",
      section: "repair",
      record: recordStandIn("repair"),
      source: { name: "a.gpx", type: "application/gpx+xml", blob },
    });
    const done = await renameSavedSession(id!, "after");
    expect(done).toBe(true);
    const entry = await readSavedSession(id!);
    expect(entry!.name).toBe("after");
    expect(entry!.record).toEqual(recordStandIn("repair"));
    expect(entry!.source?.name).toBe("a.gpx");

    // Renaming a missing id fails quietly.
    expect(await renameSavedSession("missing", "x")).toBe(false);
    // Empty names are refused by the caller's contract — the layer
    // writes whatever it is given, so this documents the seam.
  });

  it("deletes exactly one entry", async () => {
    const a = await saveSessionEntry({
      name: "a",
      section: "plan",
      record: recordStandIn("plan"),
    });
    const b = await saveSessionEntry({
      name: "b",
      section: "plan",
      record: recordStandIn("plan"),
    });
    expect(await deleteSavedSession(a!)).toBe(true);
    expect(await readSavedSession(a!)).toBeNull();
    expect(await readSavedSession(b!)).not.toBeNull();
    // Deleting an absent id is IDEMPOTENT (IndexedDB's own semantics —
    // a no-op success, not a failure): the caller never needs to care.
    expect(await deleteSavedSession(a!)).toBe(true);
    expect(await readSavedSession(b!)).not.toBeNull();
  });

  it("reads back null for absent or foreign-shaped entries", async () => {
    expect(await readSavedSession("nope")).toBeNull();
  });
});

describe("saved sessions — the failure contract (Phase 10's rule)", () => {
  it("latches unavailable on a failing backend; later calls no-op silently", async () => {
    __setSessionBackendForTests(throwingBackend());
    expect(
      await saveSessionEntry({
        name: "x",
        section: "repair",
        record: recordStandIn("repair"),
      }),
    ).toBeNull();
    expect(await listSavedSessions()).toEqual([]);
    expect(await readSavedSession("any")).toBeNull();
    expect(await renameSavedSession("any", "n")).toBe(false);
    expect(await deleteSavedSession("any")).toBe(false);
    expect(isSessionStorageAvailable()).toBe(false);
  });
});
