// @vitest-environment jsdom
/**
 * React Testing Library — the Announcer + the announcements bus
 * (Phase 8).
 *
 *   - the bus: subscribe/unsubscribe, broken listeners don't block;
 *   - the region: announce() lands in the aria-live element, repeats
 *     re-announce (unique keyed content), and entries expire;
 *   - useRepairAnnouncements: gaps detected once per parsed model
 *     (threshold re-runs stay quiet), and status transitions to
 *     "reconstructed" speak the finish moment.
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Announcer } from "@/components/layout/announcer";
import {
  announce,
  subscribeAnnouncements,
} from "@/lib/announcements";
import { useRepairAnnouncements } from "@/hooks/use-repair-announcements";
import type { GapStatus } from "@/state/editor-store";
import type { OriginalTrackData } from "@/types/domain";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("announcements bus", () => {
  it("delivers messages to subscribers and stops after unsubscribe", () => {
    const heard: string[] = [];
    const unsubscribe = subscribeAnnouncements((m) => heard.push(m));
    announce("first");
    unsubscribe();
    announce("second");
    expect(heard).toEqual(["first"]);
  });

  it("a throwing subscriber never blocks the others", () => {
    const heard: string[] = [];
    subscribeAnnouncements(() => {
      throw new Error("broken subscriber");
    });
    const unsubscribe = subscribeAnnouncements((m) => heard.push(m));
    expect(() => announce("still delivered")).not.toThrow();
    expect(heard).toEqual(["still delivered"]);
    unsubscribe();
  });

  it("empty messages are dropped", () => {
    const heard: string[] = [];
    const unsubscribe = subscribeAnnouncements((m) => heard.push(m));
    announce("");
    expect(heard).toEqual([]);
    unsubscribe();
  });
});

describe("Announcer region", () => {
  it("is a polite live region that stays visually hidden until spoken to", () => {
    const { getByTestId } = render(<Announcer />);
    const region = getByTestId("announcer-region");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    // Empty on mount — silence is the default.
    expect(region).toHaveTextContent("");
  });

  it("speaks announce() calls and re-announces repeats", async () => {
    const { getByTestId } = render(<Announcer />);
    act(() => {
      announce("Point deleted");
    });
    expect(getByTestId("announcer-region")).toHaveTextContent(
      "Point deleted",
    );
    act(() => {
      announce("Point deleted");
    });
    // Same words, NEW content node (the keyed <p> changed) — the
    // utterance repeats instead of being swallowed.
    const region = getByTestId("announcer-region");
    expect(region).toHaveTextContent("Point deleted");
    expect(region.querySelectorAll("p")).toHaveLength(1);
  });

  it("expires entries after the TTL", async () => {
    vi.useFakeTimers();
    try {
      const { getByTestId } = render(<Announcer />);
      act(() => {
        announce("Export ready");
      });
      act(() => {
        vi.advanceTimersByTime(6_100);
      });
      expect(getByTestId("announcer-region")).toHaveTextContent("");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useRepairAnnouncements", () => {
  const data = { points: [] } as unknown as OriginalTrackData;

  function mount(input: {
    status?: "idle" | "loading" | "parsed" | "error";
    fileName?: string | null;
    data?: OriginalTrackData | null;
    gapCount?: number;
    statusById?: Record<string, GapStatus>;
  }) {
    return renderHook(
      (props: typeof input) =>
        useRepairAnnouncements({
          status: props.status ?? "parsed",
          fileName: props.fileName ?? "run.gpx",
          data: props.data ?? data,
          gapCount: props.gapCount ?? 1,
          statusById: props.statusById ?? {},
        }),
      { initialProps: input },
    );
  }

  it("announces the detected gap count once per parsed model", () => {
    const heard: string[] = [];
    const unsubscribe = subscribeAnnouncements((m) => heard.push(m));
    const model = { points: [] } as unknown as OriginalTrackData;
    const hook = mount({ data: model, gapCount: 2 });
    expect(heard).toEqual([
      "2 gaps detected in run.gpx — open one to draw its route.",
    ]);
    // Re-render with the SAME model (threshold re-run): quiet.
    hook.rerender({ data: model, gapCount: 3 });
    expect(heard).toHaveLength(1);
    // A NEW model (re-parse): speaks again, with the fresh count.
    hook.rerender({
      data: { points: [] } as unknown as OriginalTrackData,
      gapCount: 0,
    });
    expect(heard).toEqual([
      "2 gaps detected in run.gpx — open one to draw its route.",
      "run.gpx loaded — no gaps detected.",
    ]);
    unsubscribe();
  });

  it("speaks a gap BECOMING reconstructed, not the initial population", () => {
    const heard: string[] = [];
    const unsubscribe = subscribeAnnouncements((m) => heard.push(m));
    const hook = mount({
      statusById: { g1: "new", g2: "new" },
    });
    // The parse announcement landed; the INITIAL status population
    // (all "new") stays quiet.
    expect(heard).toEqual([
      "1 gap detected in run.gpx — open one to draw its route.",
    ]);
    // g1 finishes: in-progress -> reconstructed.
    hook.rerender({ statusById: { g1: "in-progress", g2: "new" } });
    expect(heard).toHaveLength(1);
    hook.rerender({ statusById: { g1: "reconstructed", g2: "new" } });
    expect(heard).toEqual([
      "1 gap detected in run.gpx — open one to draw its route.",
      "Gap reconstructed — 1 of 2 gaps repaired.",
    ]);
    // No transition, no utterance.
    hook.rerender({ statusById: { g1: "reconstructed", g2: "new" } });
    expect(heard).toHaveLength(2);
    unsubscribe();
  });

  it("batches several finishes into one utterance", () => {
    const heard: string[] = [];
    const unsubscribe = subscribeAnnouncements((m) => heard.push(m));
    const hook = mount({
      statusById: { g1: "in-progress", g2: "in-progress", g3: "new" },
    });
    heard.length = 0; // drop the parse utterance — statuses are the subject
    hook.rerender({
      statusById: { g1: "reconstructed", g2: "reconstructed", g3: "new" },
    });
    expect(heard).toEqual([
      "2 gaps reconstructed — 2 of 3 gaps repaired.",
    ]);
    unsubscribe();
  });

  it("waits for the parsed status before announcing gaps", async () => {
    const heard: string[] = [];
    const unsubscribe = subscribeAnnouncements((m) => heard.push(m));
    const hook = mount({ status: "loading" });
    expect(heard).toEqual([]);
    hook.rerender({ status: "parsed" });
    await waitFor(() => expect(heard).toHaveLength(1));
    unsubscribe();
  });
});
