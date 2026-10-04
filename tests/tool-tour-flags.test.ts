// @vitest-environment jsdom
/**
 * Tool-tour flag tests (Phase 19, §EE 19.3): the per-tool seen-flags'
 * read/write semantics against a real jsdom localStorage, plus the
 * guarded-browser behaviors (blocked storage never throws; unreadable
 * storage reads as seen for the auto-offer — the no-nag rule).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TOOL_TOUR_FLAGS_KEY,
  TOOL_TOUR_IDS,
  allToolToursSeen,
  clearToolTourFlags,
  hasSeenToolTour,
  writeToolTourSeen,
} from "@/lib/storage/tour-flag";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("tool tour flags", () => {
  it("a fresh browser has seen nothing", () => {
    for (const id of TOOL_TOUR_IDS) {
      expect(hasSeenToolTour(id)).toBe(false);
    }
  });

  it("writeToolTourSeen remembers exactly that tool", () => {
    writeToolTourSeen("repair");
    expect(hasSeenToolTour("repair")).toBe(true);
    expect(hasSeenToolTour("share")).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(TOOL_TOUR_FLAGS_KEY)!)).toEqual({
      repair: "seen",
    });
  });

  it("flags accumulate in one key", () => {
    writeToolTourSeen("repair");
    writeToolTourSeen("batch");
    const raw = JSON.parse(
      window.localStorage.getItem(TOOL_TOUR_FLAGS_KEY)!,
    );
    expect(Object.keys(raw).sort()).toEqual(["batch", "repair"]);
  });

  it("clearToolTourFlags forgets everything", () => {
    writeToolTourSeen("repair");
    clearToolTourFlags();
    expect(window.localStorage.getItem(TOOL_TOUR_FLAGS_KEY)).toBeNull();
    expect(hasSeenToolTour("repair")).toBe(false);
  });

  it("unreadable storage reads as seen (no nagging without memory)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(hasSeenToolTour("repair")).toBe(true);
  });

  it("a corrupted value degrades to unseen, never throws", () => {
    window.localStorage.setItem(TOOL_TOUR_FLAGS_KEY, "{not json");
    expect(hasSeenToolTour("repair")).toBe(false);
  });

  it("allToolToursSeen covers every tool (the e2e seed's shape)", () => {
    const all = allToolToursSeen();
    expect(Object.keys(all).sort()).toEqual([...TOOL_TOUR_IDS].sort());
    for (const value of Object.values(all)) {
      expect(value).toBe("seen");
    }
  });
});
