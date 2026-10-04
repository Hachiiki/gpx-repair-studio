// @vitest-environment jsdom
/**
 * Unit tests — the compare surfaces (Phase 19, §EE 19.1): the
 * CompareCard's mode control + delta table, the side-by-side dialog's
 * panels, and the repair-summary card's blocks.
 *
 * The bindings arrive as plain fixture props (no stores) — the
 * components are pure presentation.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompareCard } from "@/components/compare/compare-card";
import { CompareSideBySideDialog } from "@/components/compare/compare-side-by-side";
import { RepairSummaryCard } from "@/components/compare/repair-summary-card";
import type { CompareBinding, CompareSideBySide } from "@/hooks/use-compare";
import type { CompareStats } from "@/features/compare/compareStats";
import type { RepairSummary } from "@/features/compare/repairSummary";

afterEach(cleanup);

const stats: CompareStats = {
  hasChanges: true,
  rows: [
    {
      id: "points",
      labelKey: "compare.stat.points",
      original: 100,
      after: 94,
      delta: -6,
      format: "count",
      provenance: "modified",
      note: "6 removed by fixes",
    },
    {
      id: "distance",
      labelKey: "compare.stat.distance",
      original: 10_000,
      after: 9_850,
      delta: -150,
      format: "distance",
      provenance: "modified",
      note: null,
    },
    {
      id: "moving-time",
      labelKey: "compare.stat.movingTime",
      original: 1_800_000,
      after: 1_800_000,
      delta: 0,
      format: "duration",
      provenance: "recorded",
      note: null,
    },
    {
      id: "gain",
      labelKey: "compare.stat.elevation",
      original: null,
      after: null,
      delta: null,
      format: "elevation",
      provenance: "estimated",
      note: "elevation coverage below 60% — not estimated",
    },
  ],
};

const summary: RepairSummary = {
  totalChanges: 7,
  rows: [
    {
      kind: "filtered",
      labelKey: "summary.row.filtered",
      count: 6,
      provenance: "modified",
      detailKey: "summary.detail.filtered",
    },
    {
      kind: "sorted",
      labelKey: "summary.row.sorted",
      count: 1,
      provenance: "estimated",
      detailKey: "summary.detail.sorted",
    },
  ],
  history: [{ label: { key: "fix.removeSpikes.label.many", params: { count: 3 } }, appliedAt: 1_700_000_000_000 }],
};

function binding(patch: Partial<CompareBinding> = {}): CompareBinding {
  return {
    mode: "off",
    setMode: vi.fn(),
    stats,
    changedSpans: [],
    sideBySide: null,
    summarySvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><polyline points="1,1 9,9"/></svg>',
    summary,
    printSummary: vi.fn(),
    hasChanges: true,
    ...patch,
  };
}

describe("CompareCard", () => {
  it("renders the delta table with all four rows and their flags", () => {
    render(<CompareCard compare={binding()} />);
    expect(screen.getByTestId("compare-card")).toBeInTheDocument();
    expect(screen.getByTestId("compare-row-points")).toHaveTextContent(
      "6 removed by fixes",
    );
    // Multiple rows can share a provenance word — the flags exist.
    expect(screen.getAllByTestId("compare-flag-modified").length).toBeGreaterThan(0);
    expect(screen.getByTestId("compare-flag-recorded")).toBeInTheDocument();
    expect(screen.getByTestId("compare-flag-estimated")).toBeInTheDocument();
    // The gain row renders "—" for unavailable numbers.
    expect(screen.getByTestId("compare-row-gain")).toHaveTextContent("—");
    expect(screen.getByTestId("compare-row-gain")).toHaveTextContent(
      "coverage below 60%",
    );
  });

  it("the mode control dispatches setMode", () => {
    const setMode = vi.fn();
    render(<CompareCard compare={binding({ setMode })} />);
    fireEvent.click(screen.getByTestId("compare-mode-overlay"));
    expect(setMode).toHaveBeenCalledWith("overlay");
    fireEvent.click(screen.getByTestId("compare-mode-side-by-side"));
    expect(setMode).toHaveBeenCalledWith("side-by-side");
    fireEvent.click(screen.getByTestId("compare-mode-off"));
    expect(setMode).toHaveBeenCalledWith("off");
  });

  it("shows the overlay note only in overlay mode", () => {
    const { rerender } = render(<CompareCard compare={binding()} />);
    expect(
      screen.queryByTestId("compare-overlay-note"),
    ).not.toBeInTheDocument();
    rerender(<CompareCard compare={binding({ mode: "overlay" })} />);
    expect(screen.getByTestId("compare-overlay-note")).toBeInTheDocument();
  });

  it("renders nothing without stats", () => {
    const { container } = render(
      <CompareCard compare={binding({ stats: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CompareSideBySideDialog", () => {
  const panels: CompareSideBySide = {
    originalSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><polyline points="1,1 2,2"/></svg>',
    afterSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><polyline points="1,1 2,2"/></svg>',
  };

  it("renders both panels and the legend while open", () => {
    render(
      <CompareSideBySideDialog open panels={panels} onClose={() => {}} />,
    );
    expect(screen.getByTestId("compare-side-by-side")).toBeInTheDocument();
    expect(screen.getByTestId("compare-panel-original")).toBeInTheDocument();
    expect(screen.getByTestId("compare-panel-after")).toBeInTheDocument();
    expect(
      screen.getByTestId("compare-panel-svg-original").firstChild,
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("compare-side-by-side-legend"),
    ).toBeInTheDocument();
  });

  it("renders the empty state without panels", () => {
    render(
      <CompareSideBySideDialog open panels={null} onClose={() => {}} />,
    );
    expect(
      screen.getByTestId("compare-side-by-side-empty"),
    ).toBeInTheDocument();
  });
});

describe("RepairSummaryCard", () => {
  it("renders the delta table, the provenance table, the history, and the snapshot", () => {
    render(<RepairSummaryCard compare={binding()} />);
    const card = screen.getByTestId("repair-summary-card");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("repair-summary-delta")).toBeInTheDocument();
    expect(screen.getByTestId("repair-summary-table")).toBeInTheDocument();
    expect(
      screen.getByTestId("repair-summary-row-filtered"),
    ).toHaveTextContent("6");
    expect(screen.getByTestId("repair-summary-history")).toHaveTextContent(
      "Remove 3 speed spikes",
    );
    const snapshot = screen.getByTestId("repair-summary-snapshot");
    expect(snapshot.firstChild).toBeInTheDocument();
    expect(screen.getByTestId("print-summary-button")).toBeInTheDocument();
  });

  it("prints through the binding's intent", () => {
    const printSummary = vi.fn();
    render(<RepairSummaryCard compare={binding({ printSummary })} />);
    fireEvent.click(screen.getByTestId("print-summary-button"));
    expect(printSummary).toHaveBeenCalledTimes(1);
  });

  it("the honest empty state when nothing was applied", () => {
    render(
      <RepairSummaryCard
        compare={binding({
          stats: { ...stats, hasChanges: false },
          summary: { ...summary, rows: [], history: [], totalChanges: 0 },
        })}
      />,
    );
    expect(screen.getByTestId("repair-summary-empty")).toBeInTheDocument();
    expect(
      screen.queryByTestId("repair-summary-table"),
    ).not.toBeInTheDocument();
    // The snapshot still renders.
    expect(screen.getByTestId("repair-summary-snapshot")).toBeInTheDocument();
  });
});
