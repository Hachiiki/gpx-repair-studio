// @vitest-environment jsdom
/**
 * Unit tests — the onboarding tour flag (lib/storage/tour-flag.ts,
 * Phase 11): read/write/clear semantics against a real jsdom
 * localStorage, plus the guarded-browser behaviors (blocked storage
 * never throws, and SSR reads as unavailable).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TOUR_FLAG_STORAGE_KEY,
  clearTourFlag,
  readTourFlag,
  writeTourSeen,
} from "@/lib/storage/tour-flag";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("tour flag", () => {
  it("reads unseen on a fresh browser", () => {
    expect(readTourFlag()).toBe("unseen");
  });

  it("writeTourSeen then reads seen", () => {
    writeTourSeen();
    expect(window.localStorage.getItem(TOUR_FLAG_STORAGE_KEY)).toBe("seen");
    expect(readTourFlag()).toBe("seen");
  });

  it("clearTourFlag restores unseen", () => {
    writeTourSeen();
    clearTourFlag();
    expect(readTourFlag()).toBe("unseen");
    expect(window.localStorage.getItem(TOUR_FLAG_STORAGE_KEY)).toBeNull();
  });

  it("reads unavailable when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readTourFlag()).toBe("unavailable");
  });

  it("writeTourSeen never throws when storage is blocked", () => {
    const setter = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() => writeTourSeen()).not.toThrow();
    expect(setter).toHaveBeenCalled();
  });

  it("clearTourFlag never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearTourFlag()).not.toThrow();
  });

  it("reads unavailable without window (SSR shape)", () => {
    // Simulate the module-level guard: jsdom always has window, so
    // exercise the typeof branch by stubbing it away for one call.
    const original = globalThis.window;
    // @ts-expect-error -- deliberate SSR simulation
    globalThis.window = undefined;
    try {
      expect(readTourFlag()).toBe("unavailable");
    } finally {
      globalThis.window = original;
    }
  });
});
