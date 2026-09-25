// @vitest-environment jsdom
/**
 * Unit tests — the export workflow UI (Phase 7): ExportCard (the
 * tools-panel entry) and ExportDialog (the pre-export summary).
 *
 * Verified behaviors:
 *   - the card renders the running summary (repairs, distance, skipped
 *     and open counts) and opens the dialog;
 *   - the dialog shows what will change — inserted repairs, the
 *     never-modified-originals promise, the gpxr marker note — and the
 *     final numbers;
 *   - honest caveats appear exactly when they apply (open editors,
 *     repairs without durations, discrepancies, the 1.0→1.1 upgrade,
 *     no-start-time files) and stay hidden otherwise;
 *   - the layout settings dispatch their intents; Download dispatches
 *     and closes;
 *   - the no-repair state says so (a structure-preserved copy).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportCard } from "@/components/gpx/export-card";
import { ExportDialog } from "@/components/gpx/export-dialog";
import type { ExportSummary } from "@/hooks/use-gpx-export";

afterEach(() => cleanup());

function summary(
  overrides: Partial<ExportSummary> = {},
): ExportSummary {
  return {
    repairCount: 2,
    insertedPoints: 34,
    addedDistanceM: 1240.5,
    openRepairCount: 0,
    skippedCount: 1,
    gapsWithoutDuration: 0,
    discrepancyCount: 0,
    hasTimingData: true,
    fileTiming: { startMs: null, totalDurationMs: null },
    willUpgradeTo11: false,
    reimportedPoints: 0,
    ...overrides,
  };
}

function renderDialog(
  props: Partial<Parameters<typeof ExportDialog>[0]> = {},
) {
  const onDownload = vi.fn();
  const onOpenChange = vi.fn();
  const onExportModeChange = vi.fn();
  const onPrettyPrintChange = vi.fn();
  render(
    <ExportDialog
      open
      onOpenChange={onOpenChange}
      summary={summary(props.summary)}
      exportMode={props.exportMode ?? "structure-preserving"}
      prettyPrint={props.prettyPrint ?? false}
      onExportModeChange={onExportModeChange}
      onPrettyPrintChange={onPrettyPrintChange}
      onDownload={onDownload}
    />,
  );
  return { onDownload, onOpenChange, onExportModeChange, onPrettyPrintChange };
}

describe("ExportCard", () => {
  function renderCard(
    overrides: Partial<ExportSummary> = {},
    download = vi.fn(() => "route.repaired.gpx"),
  ) {
    render(
      <ExportCard
        exporter={{
          ready: true,
          summary: summary(overrides),
          exportMode: "structure-preserving",
          prettyPrint: false,
          setExportMode: vi.fn(),
          setPrettyPrint: vi.fn(),
          download,
        }}
      />,
    );
  }

  it("renders the running summary and opens the dialog", () => {
    renderCard();
    const card = screen.getByTestId("export-card");
    expect(card).toHaveTextContent("Repairs to include");
    expect(card).toHaveTextContent("2");
    expect(card).toHaveTextContent("1.24 km");

    fireEvent.click(screen.getByTestId("open-export-button"));
    expect(screen.getByTestId("export-dialog")).toBeInTheDocument();
  });

  it("shows the no-repair state honestly", () => {
    renderCard({ repairCount: 0, insertedPoints: 0, addedDistanceM: 0 });
    const card = screen.getByTestId("export-card");
    expect(card).toHaveTextContent("Download the file as-is");
  });

  it("lists open editors and skipped gaps when present", () => {
    renderCard({ openRepairCount: 1, skippedCount: 3 });
    const card = screen.getByTestId("export-card");
    expect(card).toHaveTextContent("Open in editor (excluded)");
    expect(card).toHaveTextContent("Skipped gaps");
    expect(card).toHaveTextContent("3");
  });

  it("renders nothing without a summary (no file loaded)", () => {
    const { container } = render(
      <ExportCard
        exporter={{
          ready: false,
          summary: null,
          exportMode: "structure-preserving",
          prettyPrint: false,
          setExportMode: vi.fn(),
          setPrettyPrint: vi.fn(),
          download: vi.fn(),
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ExportDialog — what goes into the file", () => {
  it("shows inserted repairs, the originals promise, and the marker note", () => {
    renderDialog();
    const dialog = screen.getByTestId("export-dialog");
    expect(dialog).toHaveTextContent("2 repairs inserted");
    expect(dialog).toHaveTextContent("34 reconstructed points");
    expect(dialog).toHaveTextContent("1.24 km added");
    expect(dialog).toHaveTextContent("never modified");
    expect(dialog).toHaveTextContent("gpxr");
    expect(dialog).toHaveTextContent("provenance markers");
  });

  it("no repairs → the structure-preserved copy copy", () => {
    renderDialog({
      summary: summary({
        repairCount: 0,
        insertedPoints: 0,
        addedDistanceM: 0,
      }),
    });
    const dialog = screen.getByTestId("export-dialog");
    expect(dialog).toHaveTextContent("No committed repairs yet");
    expect(dialog).toHaveTextContent("structure-preserved copy");
    expect(dialog).not.toHaveTextContent("gpxr provenance markers");
  });

  it("mentions preserved markers from a previous repair (re-import)", () => {
    renderDialog({ summary: summary({ reimportedPoints: 12 }) });
    expect(screen.getByTestId("export-dialog")).toHaveTextContent(
      "12 points already marked",
    );
  });
});

describe("ExportDialog — honest caveats", () => {
  it("warns about open editors, missing durations, and discrepancies together", () => {
    renderDialog({
      summary: summary({
        openRepairCount: 1,
        gapsWithoutDuration: 2,
        discrepancyCount: 1,
      }),
    });
    const caveats = screen.getByTestId("export-caveats");
    expect(caveats).toHaveTextContent("1 repair is still open");
    expect(caveats).toHaveTextContent("2 repairs export without timestamps");
    expect(caveats).toHaveTextContent("1 manual duration disagrees");
  });

  it("discloses the GPX 1.0 → 1.1 upgrade", () => {
    renderDialog({ summary: summary({ willUpgradeTo11: true }) });
    expect(screen.getByTestId("export-caveats")).toHaveTextContent(
      "written as GPX 1.1",
    );
  });

  it("no-timing file without a start time: the no-timestamps note", () => {
    renderDialog({
      summary: summary({ hasTimingData: false, fileTiming: { startMs: null, totalDurationMs: 900_000 } }),
    });
    expect(screen.getByTestId("export-caveats")).toHaveTextContent(
      "without timestamps",
    );
  });

  it("no caveats → no caveat block", () => {
    renderDialog();
    expect(screen.queryByTestId("export-caveats")).not.toBeInTheDocument();
  });
});

describe("ExportDialog — settings + download", () => {
  it("switching the layout mode dispatches the intent", () => {
    const { onExportModeChange } = renderDialog();
    fireEvent.click(screen.getByTestId("export-mode-merged"));
    expect(onExportModeChange).toHaveBeenCalledWith("merged");
  });

  it("the pretty-print switch dispatches", () => {
    const { onPrettyPrintChange } = renderDialog();
    fireEvent.click(screen.getByTestId("export-pretty-print"));
    expect(onPrettyPrintChange).toHaveBeenCalled();
  });

  it("Download dispatches and closes the dialog", () => {
    const { onDownload, onOpenChange } = renderDialog();
    fireEvent.click(screen.getByTestId("export-download-button"));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Cancel closes without downloading", () => {
    const { onDownload, onOpenChange } = renderDialog();
    fireEvent.click(screen.getByTestId("export-cancel-button"));
    expect(onDownload).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
