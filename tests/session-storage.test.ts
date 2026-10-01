/**
 * Unit tests — the IndexedDB session storage wrapper
 * (lib/storage/sessionStore.ts, Phase 10).
 *
 * The wrapper's semantics are exercised against an injected in-memory
 * backend (the module's public seam), so the read/write/delete/clear
 * contract, the quota/blocking failure latch, and the "app functions
 * identically with storage dead" criterion are all provable without a
 * real database — the REAL IndexedDB path is proven by the e2e suite
 * (reload → prompt → restore).
 *
 *   - state + file records round-trip per section (one record each);
 *   - deleteSessionSection removes BOTH stores' rows;
 *   - clearAll empties everything (the "clear stored data" control);
 *   - a throwing backend (quota / blocked / private mode) latches
 *     `unavailable`: every operation degrades to a silent no-op and
 *     never throws to the caller;
 *   - oversized files are refused before any write;
 *   - readSessionFile rejects structurally invalid rows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setSessionBackendForTests,
  __forceSessionStorageUnavailableForTests,
  clearAllSessionData,
  deleteSessionSection,
  isSessionStorageAvailable,
  MAX_SESSION_FILE_BYTES,
  readSessionFile,
  readSessionState,
  storedSessionSections,
  writeSessionFile,
  writeSessionState,
  type SessionStorageBackend,
} from "@/lib/storage/sessionStore";

/** The in-memory backend (a faithful stand-in for the IDB seam). */
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
function throwingBackend(reason: string): SessionStorageBackend {
  const failure = () => Promise.reject(new Error(reason));
  return {
    get: failure,
    put: failure,
    delete: failure,
    keys: failure,
    clear: failure,
  };
}

beforeEach(() => {
  __setSessionBackendForTests(memoryBackend());
});

afterEach(() => {
  __setSessionBackendForTests(null);
  vi.restoreAllMocks();
});

describe("state records", () => {
  it("round-trips one record per section (last write wins)", async () => {
    expect(await writeSessionState("repair", { schemaVersion: 1, kind: "file" })).toBe(true);
    expect(await writeSessionState("repair", { schemaVersion: 1, kind: "file", savedAt: 2 })).toBe(true);
    const raw = await readSessionState("repair");
    expect(raw).toEqual({ schemaVersion: 1, kind: "file", savedAt: 2 });

    expect(await writeSessionState("plan", { schemaVersion: 1, kind: "plan" })).toBe(true);
    expect(await storedSessionSections()).toEqual(["repair", "plan"]);
  });

  it("reads null for unknown sections", async () => {
    expect(await readSessionState("create")).toBeNull();
    expect(await storedSessionSections()).toEqual([]);
  });

  it("deleteSessionSection removes the state row only for that section", async () => {
    await writeSessionState("repair", { a: 1 });
    await writeSessionState("create", { b: 2 });
    expect(await deleteSessionSection("repair")).toBe(true);
    expect(await readSessionState("repair")).toBeNull();
    expect(await readSessionState("create")).toEqual({ b: 2 });
  });
});

describe("file blobs", () => {
  it("round-trips a stored file (name, type, bytes)", async () => {
    const blob = new Blob(["<gpx></gpx>"], { type: "application/gpx+xml" });
    expect(
      await writeSessionFile("repair", { name: "run.gpx", type: "application/gpx+xml", blob }),
    ).toBe(true);
    const read = await readSessionFile("repair");
    expect(read?.name).toBe("run.gpx");
    expect(read?.type).toBe("application/gpx+xml");
    expect(await read?.blob.text()).toBe("<gpx></gpx>");
  });

  it("refuses files past the size guard without writing anything", async () => {
    const tooBig = {
      name: "huge.gpx",
      type: "application/gpx+xml",
      blob: { size: MAX_SESSION_FILE_BYTES + 1 } as Blob,
    };
    expect(await writeSessionFile("repair", tooBig)).toBe(false);
    expect(await readSessionFile("repair")).toBeNull();
  });

  it("returns null for structurally invalid rows", async () => {
    const backend = memoryBackend();
    __setSessionBackendForTests(backend);
    // A legitimate write first materializes the store map; then the rows
    // are replaced with structurally invalid payloads.
    await writeSessionFile("repair", {
      name: "ok.gpx",
      type: "application/gpx+xml",
      blob: new Blob(["x"]),
    });
    backend.stores.get("files")!.set("repair", { name: 42, type: "x", blob: new Blob() });
    backend.stores.get("files")!.set("plan", null);
    expect(await readSessionFile("repair")).toBeNull();
    expect(await readSessionFile("plan")).toBeNull();
  });

  it("deleteSessionSection removes the file row too", async () => {
    await writeSessionFile("recovery", {
      name: "r.gpx",
      type: "application/gpx+xml",
      blob: new Blob(["x"]),
    });
    await writeSessionState("recovery", { a: 1 });
    await deleteSessionSection("recovery");
    expect(await readSessionFile("recovery")).toBeNull();
    expect(await readSessionState("recovery")).toBeNull();
  });
});

describe("clearAllSessionData (the clear-stored-data control)", () => {
  it("empties both object stores entirely", async () => {
    await writeSessionState("repair", { a: 1 });
    await writeSessionState("plan", { b: 2 });
    await writeSessionFile("create", { name: "c", type: "t", blob: new Blob(["y"]) });
    expect(await clearAllSessionData()).toBe(true);
    expect(await storedSessionSections()).toEqual([]);
    expect(await readSessionState("repair")).toBeNull();
    expect(await readSessionFile("create")).toBeNull();
  });
});

describe("failure contract (quota / blocked / private mode)", () => {
  it("latches unavailable on the first failure and never throws", async () => {
    __setSessionBackendForTests(throwingBackend("QuotaExceededError"));
    // The console.warn is by design (one line, dev-friendly) — silence it
    // here so the suite stays readable.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isSessionStorageAvailable()).toBe(true);
    await expect(writeSessionState("repair", { a: 1 })).resolves.toBe(false);
    expect(isSessionStorageAvailable()).toBe(false);
    // Everything after degrades to silent no-ops.
    await expect(writeSessionState("repair", { a: 1 })).resolves.toBe(false);
    await expect(readSessionState("repair")).resolves.toBeNull();
    await expect(deleteSessionSection("repair")).resolves.toBe(false);
    await expect(clearAllSessionData()).resolves.toBe(false);
    await expect(storedSessionSections()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reads/writes are no-ops when storage was never available", async () => {
    __forceSessionStorageUnavailableForTests();
    await expect(readSessionState("plan")).resolves.toBeNull();
    await expect(writeSessionState("plan", { a: 1 })).resolves.toBe(false);
    expect(isSessionStorageAvailable()).toBe(false);
  });

  it("a failed read does not destroy previously written records", async () => {
    const backend = memoryBackend();
    __setSessionBackendForTests(backend);
    await writeSessionState("plan", { schemaVersion: 1 });
    // Simulate a transient failure on the NEXT operation only.
    const failing = {
      ...backend,
      get: () => Promise.reject(new Error("transient")),
    };
    __setSessionBackendForTests(failing as SessionStorageBackend);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(readSessionState("plan")).resolves.toBeNull();
    // The latch is closed for this page load — but the bytes survived.
    expect(backend.stores.get("state")!.get("plan")).toEqual({ schemaVersion: 1 });
  });
});
