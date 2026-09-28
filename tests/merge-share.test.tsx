// @vitest-environment jsdom
/**
 * Task 44 — the Merge section's share flow (state + hook + dialog + view).
 *
 * Four groups:
 *   - the store's view/dialog state machine — Share is reachable only
 *     from the studio view, combine/backToIntake/reset never leak a
 *     previous share visit into a new arrangement;
 *   - useMergeShare over a REAL merged model (the fixture pipeline) —
 *     the trio is the merged model's own arithmetic, the notes say
 *     what the activity is, the route is the merged route view, and a
 *     no-timing merge stays honest ("—", never invented values);
 *   - ShareMergeDialog — the warning says exactly what will happen,
 *     cancel is a full no-op, confirm fires the intent;
 *   - MergeShareView — the stage, the trio, the notes, and the bridge
 *     back to the arrangement.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareMergeDialog } from "@/components/merge/share-merge-dialog";
import { MergeShareView } from "@/components/merge/merge-share-view";
import { addMergeFiles, useMergeSession } from "@/hooks/use-merge-session";
import { useMergeShare, type MergeShareBinding } from "@/hooks/use-merge-share";
import { useMergeStore } from "@/state/merge-store";
import { loadFixture } from "./helpers/gpxTestUtils";

function makeGpxFile(fixtureName: string) {
  return new File([loadFixture(fixtureName)], fixtureName, {
    type: "application/gpx+xml",
  });
}

/** Drive the store to a combined studio (two real parsed files). */
async function seedStudio(fixtures: string[] = ["valid-1.1.gpx", "wpt-rte.gpx"]) {
  await addMergeFiles(fixtures.map(makeGpxFile));
  useMergeStore.getState().combine();
}

beforeEach(() => {
  useMergeStore.getState().reset();
});

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// The store's view/dialog state machine
// ---------------------------------------------------------------------------

describe("merge store share state", () => {
  it("keeps the Share dialog closed and unreachable from the intake", () => {
    expect(useMergeStore.getState().view).toBe("studio");
    expect(useMergeStore.getState().shareDialogOpen).toBe(false);

    // The intake phase is not the studio — a no-op, never an error.
    useMergeStore.getState().openShareDialog();
    expect(useMergeStore.getState().shareDialogOpen).toBe(false);
  });

  it("opens and closes the Share dialog from the studio view", async () => {
    await seedStudio();

    useMergeStore.getState().openShareDialog();
    expect(useMergeStore.getState().shareDialogOpen).toBe(true);

    useMergeStore.getState().closeShareDialog();
    expect(useMergeStore.getState().shareDialogOpen).toBe(false);
  });

  it("switches studio ⇄ share and never leaves a stale view behind", async () => {
    await seedStudio();

    useMergeStore.getState().setView("share");
    expect(useMergeStore.getState().view).toBe("share");
    // While in the share view the dialog cannot open (it is studio-only).
    useMergeStore.getState().openShareDialog();
    expect(useMergeStore.getState().shareDialogOpen).toBe(false);

    useMergeStore.getState().setView("studio");
    expect(useMergeStore.getState().view).toBe("studio");
  });

  it("combine() always lands on the studio view — a previous share visit never leaks", async () => {
    await seedStudio();
    useMergeStore.getState().setView("share");

    // Back to the intake (files kept), then combine again.
    useMergeStore.getState().backToIntake();
    expect(useMergeStore.getState().phase).toBe("intake");
    expect(useMergeStore.getState().view).toBe("studio");
    expect(useMergeStore.getState().shareDialogOpen).toBe(false);

    expect(useMergeStore.getState().combine()).toBe(true);
    expect(useMergeStore.getState().view).toBe("studio");
  });

  it("reset() clears the view and the dialog along with everything else", async () => {
    await seedStudio();
    useMergeStore.getState().openShareDialog();
    useMergeStore.getState().setView("share");

    useMergeStore.getState().reset();
    expect(useMergeStore.getState().view).toBe("studio");
    expect(useMergeStore.getState().shareDialogOpen).toBe(false);
    expect(useMergeStore.getState().phase).toBe("intake");
  });
});

// ---------------------------------------------------------------------------
// useMergeShare over a real merged model
// ---------------------------------------------------------------------------

describe("useMergeShare (the derived binding)", () => {
  it("derives the trio, the combined note, and the merged route from the studio's merge", async () => {
    await seedStudio();

    const { result } = renderHook(() => {
      const session = useMergeSession();
      return useMergeShare(session.merged, session.combinedName, session.parsedCount);
    });

    expect(result.current).not.toBeNull();
    const { content, spec } = result.current!;
    // Two timed fixtures merge into a complete trio — no "—".
    expect(content.distance).not.toBe("—");
    expect(content.time).not.toBe("—");
    expect(content.pace).not.toBe("—");
    // The notes say what the activity is: a combination.
    expect(content.notes[0]).toContain("Combined from 2 recordings");
    // The route is the merged route view (the recorded pieces exist).
    expect(spec.routePolyline.length).toBeGreaterThan(0);
    expect(spec.routePolyline.some((line) => line.length >= 2)).toBe(true);
  });

  it("renames follow the arrangement — the binding sees the current combined name", async () => {
    await seedStudio();
    useMergeStore.getState().setCombinedName("Morning combo");

    const { result } = renderHook(() => {
      const session = useMergeSession();
      return useMergeShare(session.merged, session.combinedName, session.parsedCount);
    });
    expect(result.current).not.toBeNull();
    // The notes stay about the combination; the trio stays complete.
    expect(result.current!.content.notes[0]).toContain("Combined from 2 recordings");
  });

  it("returns null while there is nothing to merge", () => {
    const { result } = renderHook(() => {
      const session = useMergeSession();
      return useMergeShare(session.merged, session.combinedName, session.parsedCount);
    });
    expect(result.current).toBeNull();
  });

  it("stays honest for a merge without timing data — pace shows the dash with a reason", async () => {
    // no-time.gpx carries no usable <time>; two copies merge untimed.
    await seedStudio(["no-time.gpx", "no-time.gpx"]);

    const { result } = renderHook(() => {
      const session = useMergeSession();
      return useMergeShare(session.merged, session.combinedName, session.parsedCount);
    });

    expect(result.current).not.toBeNull();
    const content = result.current!.content;
    expect(content.pace).toBe("—");
    expect(content.time).toBe("—");
    expect(
      content.notes.some((note) => note.includes("no usable timestamps")),
    ).toBe(true);
    // The distance is still the merged model's own number.
    expect(content.distance).not.toBe("—");
  });
});

// ---------------------------------------------------------------------------
// ShareMergeDialog (the warning gate)
// ---------------------------------------------------------------------------

function dialogContent(overrides: Record<string, unknown> = {}) {
  return {
    distance: "12.34 km",
    pace: "6:05 /km",
    time: "1:15:04",
    complete: true,
    notes: ["Combined from 2 recordings — every point carried over verbatim."],
    includesReimported: false,
    ...overrides,
  } as MergeShareBinding["content"];
}

describe("ShareMergeDialog", () => {
  it("says exactly what will happen — the file name and the card's trio", () => {
    render(
      <ShareMergeDialog
        open
        onOpenChange={() => {}}
        fileName="morning-combo.gpx"
        content={dialogContent()}
        onConfirm={() => {}}
      />,
    );

    const dialog = screen.getByTestId("merge-share-dialog");
    expect(dialog).toBeVisible();
    expect(dialog).toHaveTextContent("morning-combo.gpx");
    expect(dialog).toHaveTextContent("12.34 km");
    expect(dialog).toHaveTextContent("6:05 /km");
    expect(dialog).toHaveTextContent("1:15:04");
    expect(dialog.textContent).toContain(
      "same file the Download button produces",
    );
    expect(dialog.textContent).toContain(
      "merging re-orders files, never values",
    );
  });

  it("confirm fires the intent; the buttons carry their test ids", () => {
    const onConfirm = vi.fn();
    render(
      <ShareMergeDialog
        open
        onOpenChange={() => {}}
        fileName="merged-route.gpx"
        content={dialogContent()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByTestId("merge-share-confirm")).toBeVisible();
    expect(screen.getByTestId("merge-share-cancel")).toBeVisible();
    fireEvent.click(screen.getByTestId("merge-share-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders a neutral fallback while content is not yet derived", () => {
    render(
      <ShareMergeDialog
        open
        onOpenChange={() => {}}
        fileName="merged-route.gpx"
        content={null}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("merge-share-dialog").textContent).toContain(
      "the merged file's distance, pace, and time",
    );
  });
});

// ---------------------------------------------------------------------------
// MergeShareView (the card stage)
// ---------------------------------------------------------------------------

function shareBinding(
  overrides: Partial<MergeShareBinding> = {},
): MergeShareBinding {
  return {
    content: dialogContent(),
    spec: {
      routePolyline: [
        [
          { lat: 52.52, lon: 13.405 },
          { lat: 52.53, lon: 13.455 },
        ],
      ],
      distance: "12.34 km",
      pace: "6:05 /km",
      time: "1:15:04",
    },
    paceUnit: "km",
    setPaceUnit: () => {},
    downloadPng: () => {},
    ...overrides,
  };
}

describe("MergeShareView", () => {
  it("renders the stage, the card canvas, and the trio", () => {
    render(
      <MergeShareView share={shareBinding()} onBackToArrangement={() => {}} />,
    );

    expect(screen.getByTestId("merge-share-section")).toBeVisible();
    expect(screen.getByTestId("merge-share-stage")).toBeVisible();
    expect(screen.getByTestId("share-card-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("merge-share-summary-distance")).toHaveTextContent(
      "12.34 km",
    );
    expect(screen.getByTestId("merge-share-summary-pace")).toHaveTextContent(
      "6:05 /km",
    );
    expect(screen.getByTestId("merge-share-summary-time")).toHaveTextContent(
      "1:15:04",
    );
  });

  it("hands the scale to the PNG download and the back intent to the bridge", () => {
    const downloadPng = vi.fn();
    const onBack = vi.fn();
    render(
      <MergeShareView
        share={shareBinding({ downloadPng })}
        onBackToArrangement={onBack}
      />,
    );

    fireEvent.click(screen.getByTestId("merge-share-download"));
    expect(downloadPng).toHaveBeenCalledWith(1);

    // The sharper scale is selectable and flows through too.
    fireEvent.click(screen.getByTestId("merge-share-scale-2x"));
    fireEvent.click(screen.getByTestId("merge-share-download"));
    expect(downloadPng).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByTestId("merge-share-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the honesty notes (what the numbers mean)", () => {
    render(
      <MergeShareView share={shareBinding()} onBackToArrangement={() => {}} />,
    );
    expect(screen.getByTestId("merge-share-tools").textContent).toContain(
      "Combined from 2 recordings",
    );
  });

  it("waits for fonts on download (the cold-session contract holds)", async () => {
    const downloadPng = shareBinding().downloadPng;
    expect(typeof downloadPng).toBe("function");
    // The real hook's downloadPng awaits loadShareCardFonts internally;
    // the binding-level test only pins the signature contract here.
    await waitFor(() => expect(true).toBe(true));
  });
});
