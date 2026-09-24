// @vitest-environment jsdom
/**
 * Unit tests — ManualRepairsCard (draw-anywhere UI): the always-available
 * repair entry point.
 *
 * Verified behaviors:
 *   - the empty state offers "New repair span" (repairing is never gated
 *     on detection);
 *   - pick mode swaps the button for "Cancel picking" and shows the
 *     click-two-points instructions;
 *   - rows render anchors + status + actions, hide ids that are currently
 *     detected (the detected-gaps list owns those), and dispatch the
 *     open-editor / remove-span intents;
 *   - the GapList empty state cross-links into manual repairing.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GapList } from "@/components/reconstruction/gap-list";
import { ManualRepairsCard } from "@/components/reconstruction/manual-repairs-card";
import type { GapRow } from "@/hooks/use-gpx-session";
import type { GapId, PointId, SegmentId } from "@/types/domain";

afterEach(() => cleanup());

const SEG = "t0s0" as SegmentId;

function manualRow(
  id: string,
  before: string,
  after: string,
  beforeLat = 14.6321,
  afterLat = 14.6348,
): GapRow {
  return {
    id: id as GapId,
    kind: "manual",
    severity: "info",
    status: "new",
    impliedDistanceM: 240.5,
    before: {
      pointId: before as PointId,
      segmentId: SEG,
      lat: beforeLat,
      lon: 121.0321,
    },
    after: {
      pointId: after as PointId,
      segmentId: SEG,
      lat: afterLat,
      lon: 121.0355,
    },
  };
}

const ROW_A = manualRow("gap/t0s0:10/t0s0:40", "t0s0:10", "t0s0:40");
const ROW_B = manualRow(
  "gap/t0s0:60/t0s0:80",
  "t0s0:60",
  "t0s0:80",
  14.6402,
  14.6429,
);

function renderCard(
  overrides: Partial<Parameters<typeof ManualRepairsCard>[0]> = {},
) {
  const props = {
    rows: [ROW_A, ROW_B],
    detectedGapIds: [] as readonly string[],
    pickMode: false,
    onBeginPick: vi.fn(),
    onCancelPick: vi.fn(),
    onOpenEditor: vi.fn(),
    onRemoveSpan: vi.fn(),
    statusById: {} as Record<string, never>,
    ...overrides,
  };
  render(<ManualRepairsCard {...props} />);
  return props;
}

describe("ManualRepairsCard — the always-available entry point", () => {
  it("empty state explains the purpose and offers the pick action", () => {
    renderCard({ rows: [] });
    const card = screen.getByTestId("manual-repairs-card");
    expect(card).toHaveTextContent("No manual repairs yet");
    expect(card).toHaveTextContent("even when no gap was detected");
    expect(screen.getByTestId("begin-pick-button")).toBeVisible();
  });

  it("begin-pick dispatches the intent", () => {
    const props = renderCard({ rows: [] });
    fireEvent.click(screen.getByTestId("begin-pick-button"));
    expect(props.onBeginPick).toHaveBeenCalledTimes(1);
  });

  it("pick mode swaps to cancel + shows instructions", () => {
    const props = renderCard({ pickMode: true });
    expect(screen.queryByTestId("begin-pick-button")).toBeNull();
    expect(screen.getByTestId("cancel-pick-button")).toBeVisible();
    expect(screen.getByTestId("pick-instructions")).toHaveTextContent(
      "Click two points on the recorded route",
    );
    fireEvent.click(screen.getByTestId("cancel-pick-button"));
    expect(props.onCancelPick).toHaveBeenCalledTimes(1);
  });
});

describe("ManualRepairsCard — rows", () => {
  it("renders anchor points, span distance, and the status join", () => {
    renderCard({ statusById: { [ROW_A.id]: "reconstructed" } as never });
    const rows = screen.getAllByTestId("manual-repair-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Manual repair");
    expect(rows[0]).toHaveTextContent("Reconstructed");
    expect(rows[0]).toHaveTextContent("241 m span");
    expect(rows[0]).toHaveTextContent("From");
    expect(rows[0]).toHaveTextContent("To");
    expect(rows[0]).toHaveTextContent("Edit route");
    expect(rows[1]).toHaveTextContent("Draw route"); // status "new"
  });

  it("hides rows whose id is currently detected (that list owns them)", () => {
    renderCard({ detectedGapIds: [ROW_A.id] });
    const rows = screen.getAllByTestId("manual-repair-row");
    expect(rows).toHaveLength(1);
    // ROW_B's coordinates, not ROW_A's.
    expect(rows[0]).toHaveTextContent("14.64020");
    expect(rows[0]).not.toHaveTextContent("14.63210");
  });

  it("dispatches open-editor and remove-span intents per row", () => {
    const props = renderCard();
    fireEvent.click(screen.getAllByTestId("open-editor-button-manual")[0]);
    expect(props.onOpenEditor).toHaveBeenCalledWith(ROW_A.id);
    fireEvent.click(screen.getAllByTestId("remove-manual-span-button")[1]);
    expect(props.onRemoveSpan).toHaveBeenCalledWith(ROW_B.id);
  });
});

describe("GapList — empty state cross-link", () => {
  it("offers manual repairing when nothing is detected", () => {
    const onBeginPick = vi.fn();
    render(
      <GapList
        rows={[]}
        thresholds={{
          timeGapMs: 120_000,
          speedAnomalyKmh: 25,
          speedDtGuardMs: 10_000,
        }}
        onThresholdsChange={() => {}}
        onThresholdsReset={() => {}}
        selectedGapId={null}
        onSelectGap={() => {}}
        onBeginPick={onBeginPick}
      />,
    );
    const button = screen.getByTestId("empty-list-begin-pick");
    expect(button).toHaveTextContent("Draw a repair manually");
    fireEvent.click(button);
    expect(onBeginPick).toHaveBeenCalledTimes(1);
  });
});
