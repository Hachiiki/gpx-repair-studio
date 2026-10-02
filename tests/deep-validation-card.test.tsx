// @vitest-environment jsdom
/**
 * Unit tests — DeepValidationCard (Phase 13): the find→fix surface.
 *
 * Verified behaviors (§EE 13.3/13.4/13.5):
 *   - issues render grouped by severity with counts, kind labels, and
 *     the fix actions the detectors offer (missing-elevation: none);
 *   - the textual point list (the map's a11y equivalent) expands and
 *     lists point ids + coordinates, capping with "+N more";
 *   - Jump dispatches the jump intent with the issue's first point;
 *   - Fix opens the preview dialog (the plan's own summary lines), and
 *     only Confirm applies — Cancel leaves the log untouched;
 *   - presets open a compound preview and apply as multiple steps;
 *   - the change log lists applied fixes with reasons and timestamps,
 *     and Undo-last dispatches the undo intent;
 *   - the clean state says so.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeepValidationCard,
} from "@/components/gpx/deep-validation-card";
import type { DeepValidationBinding } from "@/hooks/use-deep-validation";
import type { DeepReport, FixKind, FixPlan, PresetId } from "@/types/domain";

afterEach(() => cleanup());

const SEG = "t0s0" as import("@/types/domain").SegmentId;

function pointRef(i: number) {
  return {
    segmentId: SEG,
    pointId: `${SEG}:${i}` as import("@/types/domain").PointId,
  };
}

function makeReport(issues: DeepReport["issues"]): DeepReport {
  return { issues, totalCount: issues.reduce((n, i) => n + i.count, 0) };
}

const SPIKE_ISSUE: DeepReport["issues"][number] = {
  kind: "speed-spike",
  severity: "error",
  count: 2,
  message: "2 legs imply a speed above 130 km/h — likely GPS teleports.",
  points: [pointRef(10), pointRef(11)],
};

const MISSING_ELE_ISSUE: DeepReport["issues"][number] = {
  kind: "missing-elevation",
  severity: "info",
  count: 1,
  message: "1 run of 5+ consecutive points carry no <ele>.",
  points: Array.from({ length: 14 }, (_, k) => pointRef(36 + k)),
};

function binding(
  overrides: Partial<DeepValidationBinding> = {},
): DeepValidationBinding {
  return {
    options: {
      speedSpikeKmh: 130,
      duplicateRadiusM: 1,
      duplicateWindow: 3,
      driftSpeedMps: 0.5,
      driftMinDurationMs: 30_000,
      driftRadiusM: 10,
      elevationStepM: 30,
      elevationZScore: 5,
      missingEleRunLength: 5,
    },
    setOptions: vi.fn(),
    edits: [],
    report: makeReport([SPIKE_ISSUE]),
    working: {
      deletedPointCount: 0,
      sortedSegmentIds: [],
      overriddenEleCount: 0,
      hasEdits: false,
    },
    fixesForIssue: (kind) =>
      kind === "speed-spike"
        ? ["remove-spikes"]
        : kind === "missing-elevation"
          ? []
          : [],
    planFix: vi.fn(
      (kind: FixKind): FixPlan | null =>
        kind === "remove-spikes"
          ? {
              kind,
              label: "Remove 2 speed spikes",
              entries: [
                { kind: "point-deletion", pointId: pointRef(10).pointId },
                { kind: "point-deletion", pointId: pointRef(11).pointId },
              ],
              points: [pointRef(10), pointRef(11)],
              summary: [
                "2 recorded points leave the working copy — the later point of each teleport leg.",
                "The surrounding recorded points stay byte-original; nothing is rewritten.",
              ],
            }
          : null,
    ),
    planPreset: vi.fn(
      (id: PresetId): FixPlan[] | null =>
        id === "spike-sweep"
          ? [
              {
                kind: "remove-spikes",
                label: "Remove 2 speed spikes",
                entries: [],
                points: [],
                summary: ["Spike summary line."],
              },
              {
                kind: "smooth-elevations",
                label: "Smooth 1 elevation",
                entries: [],
                points: [],
                summary: ["Elevation summary line."],
              },
            ]
          : null,
    ),
    presets: [
      {
        id: "drift-cleanup",
        name: "Drift cleanup",
        description: "d",
        fixes: ["remove-drift", "dedupe"],
      },
      {
        id: "dedupe-sort",
        name: "Dedupe & sort",
        description: "d",
        fixes: ["dedupe", "sort-by-time"],
      },
      {
        id: "resample-thin",
        name: "Resample (thin)",
        description: "d",
        fixes: ["thin"],
      },
      {
        id: "spike-sweep",
        name: "Spike & outlier sweep",
        description: "d",
        fixes: ["remove-spikes", "smooth-elevations"],
      },
    ],
    applyPlans: vi.fn(),
    undo: vi.fn(),
    ...overrides,
  };
}

const RESOLVER = (pointId: string) => ({
  pointId,
  segmentId: SEG,
  lat: 52.52,
  lon: 13.405,
  ele: 41,
  time: 1_714_560_000_000,
});

function renderCard(deep: DeepValidationBinding) {
  const onJumpToPoint = vi.fn();
  render(
    <DeepValidationCard
      deep={deep}
      onJumpToPoint={onJumpToPoint}
      resolvePoint={RESOLVER}
    />,
  );
  return { onJumpToPoint };
}

describe("DeepValidationCard — report rendering", () => {
  it("groups issues by severity (errors before notes) with counts", () => {
    renderCard(
      binding({
        report: makeReport([MISSING_ELE_ISSUE, SPIKE_ISSUE]),
      }),
    );
    const rows = screen.getAllByTestId("deep-issue-row");
    expect(rows[0]).toHaveAttribute("data-kind", "speed-spike");
    expect(rows[1]).toHaveAttribute("data-kind", "missing-elevation");
    expect(rows[0]).toHaveTextContent("×2");
  });

  it("offers the fix actions its issue kinds have (missing-elevation: none)", () => {
    renderCard(
      binding({ report: makeReport([SPIKE_ISSUE, MISSING_ELE_ISSUE]) }),
    );
    const rows = screen.getAllByTestId("deep-issue-row");
    expect(
      within(rows[0]).getByTestId("deep-issue-fix-remove-spikes"),
    ).toBeInTheDocument();
    expect(
      within(rows[1]).queryByTestId(/deep-issue-fix-/),
    ).not.toBeInTheDocument();
  });

  it("says so when the working copy is clean", () => {
    renderCard(binding({ report: makeReport([]) }));
    expect(screen.getByTestId("deep-validation-card")).toHaveTextContent(
      "No fixable recording damage found",
    );
  });
});

describe("DeepValidationCard — the textual list + jump", () => {
  it("expands the point list (ids + coordinates) and caps long lists", () => {
    renderCard(binding({ report: makeReport([MISSING_ELE_ISSUE]) }));
    const toggle = screen.getByTestId("deep-issue-list-toggle");
    expect(screen.queryByText(`${SEG}:36`)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText(`${SEG}:36`)).toBeInTheDocument();
    // 14 points, 12 listed.
    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
  });

  it("dispatches the jump intent with the issue's first point", () => {
    const { onJumpToPoint } = renderCard(binding());
    fireEvent.click(screen.getByTestId("deep-issue-jump"));
    expect(onJumpToPoint).toHaveBeenCalledWith(pointRef(10));
  });
});

describe("DeepValidationCard — preview gate", () => {
  it("opens the preview dialog and applies only on Confirm", () => {
    const deep = binding();
    renderCard(deep);
    fireEvent.click(screen.getByTestId("deep-issue-fix-remove-spikes"));
    const dialog = screen.getByTestId("fix-preview-dialog");
    expect(dialog).toHaveTextContent("2 recorded points leave");
    expect(deep.applyPlans).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("fix-preview-confirm"));
    expect(deep.applyPlans).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("fix-preview-dialog")).not.toBeInTheDocument();
  });

  it("Cancel closes without applying", () => {
    const deep = binding();
    renderCard(deep);
    fireEvent.click(screen.getByTestId("deep-issue-fix-remove-spikes"));
    fireEvent.click(screen.getByTestId("fix-preview-cancel"));
    expect(deep.applyPlans).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fix-preview-dialog")).not.toBeInTheDocument();
  });

  it("presets preview the whole chain and apply every step", () => {
    const deep = binding();
    renderCard(deep);
    fireEvent.click(screen.getByTestId("deep-preset-spike-sweep"));
    const dialog = screen.getByTestId("fix-preview-dialog");
    expect(screen.getAllByTestId("fix-preview-plan")).toHaveLength(2);
    expect(dialog).toHaveTextContent("Preset — Spike & outlier sweep");
    fireEvent.click(screen.getByTestId("fix-preview-confirm"));
    expect(deep.applyPlans).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deep.applyPlans).mock.calls[0][0]).toHaveLength(2);
  });
});

describe("DeepValidationCard — the change log", () => {
  it("lists applied fixes with reason + newest marker, and undoes the last", () => {
    const deep = binding({
      edits: [
        {
          id: "fix/1",
          label: "Remove 2 speed spikes",
          reason: "spike",
          appliedAt: 1_714_560_000_000,
          entries: [],
        },
        {
          id: "fix/2",
          label: "Collapse 14 drift points",
          reason: "drift",
          appliedAt: 1_714_560_010_000,
          entries: [],
        },
      ],
    });
    renderCard(deep);
    const rows = screen.getAllByTestId("deep-change-row");
    expect(rows).toHaveLength(2);
    // Newest first.
    expect(rows[0]).toHaveTextContent("Collapse 14 drift points");
    expect(rows[0]).toHaveTextContent("(newest)");
    expect(rows[0]).toHaveTextContent("drift collapse");
    fireEvent.click(screen.getByTestId("deep-undo-last"));
    expect(deep.undo).toHaveBeenCalledTimes(1);
  });

  it("hides the log when there are no edits", () => {
    renderCard(binding());
    expect(screen.queryByTestId("deep-change-log")).not.toBeInTheDocument();
  });
});
