// @vitest-environment jsdom
/**
 * Phase 25 UI tests — the segments surfaces: the manager's Segments
 * tab (the effort table, the PR marking, the flagged honesty, the
 * rules disclosure, the authoring doors + delete/rematch intents),
 * the naming dialog, the map toolbar's heatmap toggle, the legend's
 * wash entry, and the segment draft chip on the canvas. Hand-built
 * bindings in, rendered output asserted — pure presentation.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibrarySegments } from "@/components/library/library-segments";
import { SegmentNameDialog } from "@/components/library/segment-name-dialog";
import { MapToolbar } from "@/components/map/map-toolbar";
import { MapLegend } from "@/components/map/map-legend";
import { USER_TILE_PROVIDER_OPTIONS } from "@/lib/map/styles";
import { segmentView, SEGMENT_SCHEMA_VERSION, type SegmentRow } from "@/features/segments/record";
import type { SegmentsBinding } from "@/hooks/use-segments";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function segmentRow(overrides: Partial<SegmentRow> = {}): SegmentRow {
  return {
    schemaVersion: SEGMENT_SCHEMA_VERSION,
    id: "seg-1",
    name: "River loop",
    createdAt: 1_700_000_000_000,
    source: "stretch",
    start: { lat: -37.95, lon: 145.1 },
    end: { lat: -37.93, lon: 145.12 },
    lengthM: 3_640,
    ...overrides,
  };
}

function makeSegments(overrides: Partial<SegmentsBinding> = {}): SegmentsBinding {
  return {
    segments: overrides.segments ?? [],
    matching: overrides.matching ?? false,
    matchDone: overrides.matchDone ?? 0,
    matchTotal: overrides.matchTotal ?? 0,
    draft: overrides.draft ?? null,
    canAuthor: overrides.canAuthor ?? true,
    driftToleranceM: 40,
    beginStretchPick: vi.fn(),
    beginDraw: vi.fn(),
    cancelDraft: vi.fn(),
    confirmDrawn: vi.fn(),
    saveDraft: vi.fn().mockResolvedValue(true),
    deleteSegment: vi.fn(),
    rematch: vi.fn(),
    ensureEfforts: vi.fn(),
    ...overrides,
  };
}

const PACE = "km" as const;

// ---------------------------------------------------------------------------
// The Segments tab
// ---------------------------------------------------------------------------

describe("the Segments tab", () => {
  it("renders the empty state and disables nothing that needs a track", () => {
    const binding = makeSegments({ canAuthor: false });
    render(<LibrarySegments segments={binding} paceUnit={PACE} onClose={() => {}} />);
    expect(screen.getByTestId("segments-empty")).toBeInTheDocument();
    expect(screen.getByTestId("segments-new-stretch")).toBeDisabled();
    expect(screen.getByTestId("segments-new-draw")).toBeDisabled();
    // The rules disclosure states the tolerance + the repair dividend.
    fireEvent.click(screen.getByText("How efforts are matched"));
    expect(screen.getByText(/within 40 m of an anchor/i)).toBeInTheDocument();
    expect(screen.getByText(/a data gap inside a segment breaks matching/i)).toBeInTheDocument();
    expect(screen.getByText(/never a personal record/i)).toBeInTheDocument();
  });

  it("renders a segment with its PR, flagged efforts, and the as-of line", () => {
    const row = segmentRow({
      efforts: {
        fingerprint: "v1-x-2",
        computedAt: 1_700_000_009_000,
        rows: [
          { sessionId: "s2", sessionName: "Windy day", activityStartMs: 1_700_000_100_000, elapsedMs: 421_000, reconstructed: false },
          { sessionId: "s1", sessionName: "First try", activityStartMs: 1_700_000_000_000, elapsedMs: 458_000, reconstructed: false },
          { sessionId: "s3", sessionName: "Repaired ride", activityStartMs: 1_700_000_200_000, elapsedMs: 301_000, reconstructed: true },
        ],
      },
    });
    const binding = makeSegments({ segments: [segmentView(row)] });
    render(<LibrarySegments segments={binding} paceUnit={PACE} onClose={() => {}} />);
    expect(screen.getAllByTestId("segment-row")).toHaveLength(1);
    expect(screen.getByTestId("segment-pr-seg-1").textContent).toMatch(/7:01/);

    // The row header (the delete button's label also mentions the name).
    fireEvent.click(
      screen.getAllByRole("button", { name: /River loop/i })[0]!,
    );
    const detail = screen.getByTestId("segment-detail");
    const efforts = within(detail).getAllByTestId("segment-effort");
    expect(efforts).toHaveLength(3);
    // Clean rows first (flagged last), the flag carried as data.
    expect(efforts[2!].getAttribute("data-flagged")).toBe("true");
    expect(efforts[0!].getAttribute("data-flagged")).toBe("false");
    // The flagged row says why.
    expect(within(efforts[2!]).getByText(/drawn-in repair/i)).toBeInTheDocument();
    expect(within(detail).getByText(/Re-run matching/i)).toBeInTheDocument();
  });

  it("flags a segment with only flagged efforts (no PR badge)", () => {
    const row = segmentRow({
      efforts: {
        fingerprint: "v1-x-1",
        computedAt: 1_700_000_009_000,
        rows: [
          { sessionId: "s3", sessionName: "Repaired ride", activityStartMs: null, elapsedMs: 301_000, reconstructed: true },
        ],
      },
    });
    render(
      <LibrarySegments
        segments={makeSegments({ segments: [segmentView(row)] })}
        paceUnit={PACE}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Only flagged efforts/i)).toBeInTheDocument();
  });

  it("the authoring doors close the dialog and arm the draft", () => {
    const onClose = vi.fn();
    const binding = makeSegments();
    render(<LibrarySegments segments={binding} paceUnit={PACE} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("segments-new-stretch"));
    expect(binding.beginStretchPick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("segments-new-draw"));
    expect(binding.beginDraw).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("delete asks, then deletes", () => {
    const binding = makeSegments({ segments: [segmentView(segmentRow())] });
    render(<LibrarySegments segments={binding} paceUnit={PACE} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete segment River loop/i }));
    expect(binding.deleteSegment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("segment-delete-confirm"));
    expect(binding.deleteSegment).toHaveBeenCalledWith("seg-1");
  });

  it("shows the match progress while a pass runs", () => {
    const binding = makeSegments({ matching: true, matchDone: 2, matchTotal: 5 });
    render(<LibrarySegments segments={binding} paceUnit={PACE} onClose={() => {}} />);
    expect(screen.getByTestId("segments-matching").textContent).toMatch(
      /2\/5/,
    );
    expect(binding.ensureEfforts).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The naming dialog
// ---------------------------------------------------------------------------

describe("the segment name dialog", () => {
  const namingDraft = {
    phase: "naming" as const,
    source: "stretch" as const,
    start: { lat: -37.95, lon: 145.1 },
    end: { lat: -37.93, lon: 145.12 },
    lengthM: 3_640,
  };

  it("renders nothing without a naming draft", () => {
    const { container } = render(
      <SegmentNameDialog segments={makeSegments()} paceUnit={PACE} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("saves the typed name, blocks empty ones", async () => {
    const binding = makeSegments({ draft: namingDraft });
    render(<SegmentNameDialog segments={binding} paceUnit={PACE} />);
    const input = screen.getByTestId("segment-name-input");
    expect(screen.getByTestId("segment-name-save")).toBeDisabled();
    fireEvent.change(input, { target: { value: "River loop" } });
    expect(screen.getByTestId("segment-name-save")).toBeEnabled();
    fireEvent.click(screen.getByTestId("segment-name-save"));
    await vi.waitFor(() =>
      expect(binding.saveDraft).toHaveBeenCalledWith("River loop"),
    );
  });

  it("discarding cancels the draft", () => {
    const binding = makeSegments({ draft: namingDraft });
    render(<SegmentNameDialog segments={binding} paceUnit={PACE} />);
    fireEvent.click(screen.getByRole("button", { name: /Discard/i }));
    expect(binding.cancelDraft).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The map chrome (toolbar toggle + legend entry)
// ---------------------------------------------------------------------------

describe("the map chrome", () => {
  it("the heatmap toggle reads pressed and fires the intent", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <MapToolbar
        provider="openfreemap"
        providers={USER_TILE_PROVIDER_OPTIONS}
        onProviderChange={() => {}}
        onFitActivity={() => {}}
        heatmapOn={false}
        onToggleHeatmap={onToggle}
      />,
    );
    const toggle = screen.getByTestId("map-heatmap-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(
      <MapToolbar
        provider="openfreemap"
        providers={USER_TILE_PROVIDER_OPTIONS}
        onProviderChange={() => {}}
        onFitActivity={() => {}}
        heatmapOn
        onToggleHeatmap={onToggle}
      />,
    );
    expect(screen.getByTestId("map-heatmap-toggle").getAttribute("aria-pressed")).toBe("true");
  });

  it("the toggle stays hidden without an intent (sections without a library)", () => {
    render(
      <MapToolbar
        provider="openfreemap"
        providers={USER_TILE_PROVIDER_OPTIONS}
        onProviderChange={() => {}}
        onFitActivity={() => {}}
      />,
    );
    expect(screen.queryByTestId("map-heatmap-toggle")).toBeNull();
  });

  it("the legend gains the wash entry only while on", () => {
    const { rerender } = render(<MapLegend heatmap={false} />);
    expect(screen.queryByTestId("map-legend-heatmap")).toBeNull();
    rerender(<MapLegend heatmap />);
    expect(screen.getByTestId("map-legend-heatmap")).toBeInTheDocument();
    expect(screen.getByTestId("map-legend-heatmap").textContent).toMatch(
      /saved tracks/i,
    );
  });
});
