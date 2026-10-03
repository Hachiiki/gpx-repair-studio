// @vitest-environment jsdom
/**
 * Unit tests — SurgeryCard (Phase 16): the manual geometry surface.
 *
 * Verified behaviors (§EE 16.1):
 *   - the four operation chips switch sections;
 *   - the split form validates its point number (range, last-point
 *     refusal) and shows the live resolution line;
 *   - Split/Delete/Duplicate/Reorder all open the preview dialog and
 *     ONLY Confirm applies (the Phase 13 ritual);
 *   - a completed map pick fills the matching form (the render-time
 *     adjustment pattern — same point re-picked re-triggers);
 *   - a range-to pick landing in another segment is refused with the
 *     honest error;
 *   - the reorder draft moves within tracks only (boundary buttons
 *     disable), and an Apply confirms through the preview;
 *   - the rows changing underneath invalidates the draft.
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SurgeryCard } from "@/components/gpx/surgery-card";
import type {
  SurgeryBinding,
  SurgeryPick,
  SurgeryPickSlot,
} from "@/hooks/use-surgery";
import type { SegmentRow } from "@/hooks/use-gpx-session";
import type { FixPlan, PointRef, SegmentId } from "@/types/domain";

afterEach(() => cleanup());

const SEG = "t0s0" as SegmentId;
const SEG2 = "t0s1" as SegmentId;

function row(
  segmentId: string,
  pointCount: number,
  trackIndex = 0,
): SegmentRow {
  return {
    segmentId: segmentId as SegmentId,
    trackIndex,
    trackName: `Track ${trackIndex + 1}`,
    pointCount,
    flaggedPoints: 0,
    distanceM: pointCount * 111,
    excludedLegs: 0,
    firstTimeMs: 1_700_000_000_000,
    lastTimeMs: 1_700_000_060_000,
  };
}

const ROWS: SegmentRow[] = [row(SEG, 6), row(SEG2, 3), row("t1s0", 2, 1)];

const jumpToPoint = vi.fn();
const resolvePoint = vi.fn(() => null);

function makePlan(label: string): FixPlan {
  return {
    kind: "split-segment",
    label,
    entries: [
      { kind: "segment-split", segmentId: SEG, atPointId: `${SEG}:1` as never },
    ],
    points: [{ segmentId: SEG, pointId: `${SEG}:1` as never }],
    summary: ["A line of what would change."],
  };
}

function binding(
  overrides: Partial<SurgeryBinding> = {},
): SurgeryBinding {
  return {
    pickMode: null,
    beginPick: vi.fn(),
    cancelPick: vi.fn(),
    lastPick: null,
    pointAt: vi.fn(
      (segmentId: string, n: number) =>
        n >= 1 && n <= (ROWS.find((r) => r.segmentId === segmentId)?.pointCount ?? 0)
          ? { pointId: `${segmentId}:${n - 1}`, lat: 52.52, lon: 13.405 }
          : null,
    ),
    locate: vi.fn((pointId: string) => {
      const colon = pointId.lastIndexOf(":");
      const segmentId = pointId.slice(0, colon);
      const index = Number(pointId.slice(colon + 1));
      return Number.isInteger(index)
        ? { segmentId, number: index + 1 }
        : null;
    }),
    planSplit: vi.fn(() => makePlan("Split t0s0 after point #2")),
    planRange: vi.fn(() => makePlan("Delete 2 points from t0s0")),
    planDuplicate: vi.fn(() => makePlan("Duplicate t0s0 (6 points)")),
    planOrder: vi.fn(() => makePlan("Reorder segments (1 move)")),
    applyPlan: vi.fn(),
    ...overrides,
  };
}

function pick(slot: SurgeryPickSlot, seq: number, pointId: string): SurgeryPick {
  return { slot, pointId, seq };
}

describe("SurgeryCard — the section chips", () => {
  it("renders all four operations and switches between them", () => {
    render(
      <SurgeryCard
        surgery={binding()}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    for (const id of ["split", "range", "duplicate", "reorder"]) {
      expect(screen.getByTestId(`surgery-tab-${id}`)).toBeVisible();
    }
    expect(screen.getByTestId("surgery-split-form")).toBeVisible();

    fireEvent.click(screen.getByTestId("surgery-tab-duplicate"));
    expect(screen.getByTestId("surgery-duplicate-list")).toBeVisible();
    expect(screen.queryByTestId("surgery-split-form")).toBeNull();
  });
});

describe("SurgeryCard — the split form", () => {
  it("validates the point number and shows the live resolution", () => {
    render(
      <SurgeryCard
        surgery={binding()}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    const number = screen.getByTestId("surgery-split-number");
    const apply = screen.getByTestId("surgery-split-apply");

    expect(apply).toBeDisabled();
    fireEvent.change(number, { target: { value: "6" } });
    expect(screen.getByTestId("surgery-split-error")).toHaveTextContent(
      /last/i,
    );
    expect(apply).toBeDisabled();

    fireEvent.change(number, { target: { value: "2" } });
    expect(screen.queryByTestId("surgery-split-error")).toBeNull();
    expect(screen.getByTestId("surgery-split-resolution")).toBeVisible();
    expect(apply).toBeEnabled();
  });

  it("opens the preview and only Confirm applies", () => {
    const surgery = binding();
    render(
      <SurgeryCard
        surgery={surgery}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    fireEvent.change(screen.getByTestId("surgery-split-number"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("surgery-split-apply"));

    expect(screen.getByTestId("fix-preview-dialog")).toBeVisible();
    expect(surgery.applyPlan).not.toHaveBeenCalled();
    expect(surgery.planSplit).toHaveBeenCalledWith(SEG, 2);

    fireEvent.click(screen.getByTestId("fix-preview-cancel"));
    expect(surgery.applyPlan).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fix-preview-dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("surgery-split-apply"));
    fireEvent.click(screen.getByTestId("fix-preview-confirm"));
    expect(surgery.applyPlan).toHaveBeenCalledTimes(1);
  });

  it("the pick banner shows while a slot is armed and pick buttons arm it", () => {
    const { rerender } = render(
      <SurgeryCard
        surgery={binding({ pickMode: "split" })}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    expect(screen.getByTestId("surgery-pick-status")).toBeVisible();
    expect(screen.getByTestId("surgery-split-pick")).toBeDisabled();

    const fresh = binding();
    rerender(
      <SurgeryCard
        surgery={fresh}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    fireEvent.click(screen.getByTestId("surgery-split-pick"));
    expect(fresh.beginPick).toHaveBeenCalledWith("split");
  });
});

describe("SurgeryCard — map picks fill the forms", () => {
  it("a split pick fills the segment and point number", () => {
    const surgery = binding();
    const { rerender } = render(
      <SurgeryCard
        surgery={surgery}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    rerender(
      <SurgeryCard
        surgery={binding({ lastPick: pick("split", 1, `${SEG}:4`) })}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    expect(screen.getByTestId("surgery-split-number")).toHaveValue("5");
    expect(screen.getByTestId("surgery-split-resolution")).toBeVisible();
  });

  it("a range pair fills both numbers; a cross-segment end pick is refused", () => {
    const { rerender } = render(
      <SurgeryCard
        surgery={binding()}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    fireEvent.click(screen.getByTestId("surgery-tab-range"));

    rerender(
      <SurgeryCard
        surgery={binding({ lastPick: pick("range-from", 1, `${SEG}:1`) })}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    expect(screen.getByTestId("surgery-range-from")).toHaveValue("2");

    rerender(
      <SurgeryCard
        surgery={binding({ lastPick: pick("range-to", 2, `${SEG}:3`) })}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    expect(screen.getByTestId("surgery-range-to")).toHaveValue("4");

    rerender(
      <SurgeryCard
        surgery={binding({ lastPick: pick("range-to", 3, `${SEG2}:0`) })}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    expect(screen.getByTestId("surgery-pick-error")).toBeVisible();
    expect(screen.getByTestId("surgery-pick-error")).toHaveTextContent(
      /same segment/i,
    );
  });
});

describe("SurgeryCard — the range form", () => {
  it("requires both numbers and plans through the preview", () => {
    const surgery = binding();
    render(
      <SurgeryCard
        surgery={surgery}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    fireEvent.click(screen.getByTestId("surgery-tab-range"));
    expect(screen.getByTestId("surgery-range-apply")).toBeDisabled();

    fireEvent.change(screen.getByTestId("surgery-range-from"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByTestId("surgery-range-to"), {
      target: { value: "4" },
    });
    expect(screen.getByTestId("surgery-range-apply")).toBeEnabled();

    fireEvent.click(screen.getByTestId("surgery-range-apply"));
    fireEvent.click(screen.getByTestId("fix-preview-confirm"));
    expect(surgery.planRange).toHaveBeenCalledWith(SEG, 2, 4);
    expect(surgery.applyPlan).toHaveBeenCalledTimes(1);
  });
});

describe("SurgeryCard — duplicate", () => {
  it("lists the working segments with per-row duplicate intents", () => {
    const surgery = binding();
    render(
      <SurgeryCard
        surgery={surgery}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    fireEvent.click(screen.getByTestId("surgery-tab-duplicate"));
    const buttons = screen.getAllByTestId("surgery-duplicate-row");
    expect(buttons).toHaveLength(3);

    fireEvent.click(screen.getByTestId(`surgery-duplicate-button-${SEG2}`));
    fireEvent.click(screen.getByTestId("fix-preview-confirm"));
    expect(surgery.planDuplicate).toHaveBeenCalledWith(SEG2);
    expect(surgery.applyPlan).toHaveBeenCalledTimes(1);
  });
});

describe("SurgeryCard — reorder", () => {
  it("moves segments within tracks only and applies through the preview", () => {
    const surgery = binding();
    render(
      <SurgeryCard
        surgery={surgery}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    fireEvent.click(screen.getByTestId("surgery-tab-reorder"));
    fireEvent.click(screen.getByTestId("surgery-reorder-start"));

    // t0s0 (row 1) moves down within its track → the draft is now
    // [t0s1, t0s0, t1s0]. t0s1 sits at the top (up disabled by
    // position); t0s0's further DOWN would cross into t1s0's track —
    // the within-track rule disables it.
    fireEvent.click(screen.getByTestId(`surgery-reorder-down-${SEG}`));
    expect(
      screen.getByTestId(`surgery-reorder-up-${SEG2}`),
    ).toBeDisabled();
    expect(screen.getByTestId(`surgery-reorder-down-${SEG}`)).toBeDisabled();
    // t1s0 can never move: both neighbors (if any) belong to track 0.
    expect(screen.getByTestId(`surgery-reorder-up-t1s0`)).toBeDisabled();

    fireEvent.click(screen.getByTestId("surgery-reorder-apply"));
    fireEvent.click(screen.getByTestId("fix-preview-confirm"));
    expect(surgery.planOrder).toHaveBeenCalledWith([SEG2, SEG, "t1s0"]);
    expect(surgery.applyPlan).toHaveBeenCalledTimes(1);
  });

  it("rows changing underneath (an undo) drops the draft", () => {
    const { rerender } = render(
      <SurgeryCard
        surgery={binding()}
        rows={ROWS}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    fireEvent.click(screen.getByTestId("surgery-tab-reorder"));
    fireEvent.click(screen.getByTestId("surgery-reorder-start"));

    // The same ids but different counts — a range deletion happened.
    const changed = [row(SEG, 4), row(SEG2, 3), row("t1s0", 2, 1)];
    rerender(
      <SurgeryCard
        surgery={binding()}
        rows={changed}
        onJumpToPoint={jumpToPoint}
        resolvePoint={resolvePoint}
      />,
    );
    expect(screen.getByTestId("surgery-reorder-start")).toBeVisible();
  });
});
