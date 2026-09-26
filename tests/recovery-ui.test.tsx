// @vitest-environment jsdom
/**
 * React Testing Library — the Gap Recovery section's acceptance flow
 * (Task 26), end to end against the real domain pipeline:
 *
 *   - the header switcher moves between the repair studio and the Gap
 *     Recovery section, and each keeps its own session (isolation);
 *   - uploading an activity with a GPS tracking gap lists the missing
 *     section (interval anchors + elapsed) through the reused panels;
 *   - drawing (store-driven, as the map needs WebGL) and committing a
 *     route updates the completed-route preview: distance grows, the
 *     elapsed time stays marked unchanged, generated points counted;
 *   - the export card reflects the committed recovery;
 *   - nothing of this touches the repair studio's session.
 *
 * jsdom provides File/Blob.text and DOMParser, so the same XmlIo adapter
 * used in the browser runs here (no mocking of the domain). The map
 * settles into its textual fallback (no WebGL) — the slots and state
 * machine still prove themselves.
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { loadFixture } from "./helpers/gpxTestUtils";
import { useEditorStore } from "@/state/editor-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useSessionStore } from "@/state/session-store";
import { useUiStore } from "@/state/ui-store";

beforeEach(() => {
  act(() => {
    useSessionStore.getState().reset();
    useEditorStore.getState().reset();
    useRecoveryStore.getState().reset();
    useUiStore.getState().resetGapThresholds();
    useUiStore.setState({
      selectedGapId: null,
      activeSection: "repair",
      tileProvider: "openfreemap",
      paceUnit: "km",
    });
  });
  window.localStorage.clear();
});
afterEach(() => cleanup());

function gpxFile(fixtureName: string) {
  return new File([loadFixture(fixtureName)], fixtureName, {
    type: "application/gpx+xml",
  });
}

async function dropFile(fixtureName: string) {
  fireEvent.drop(screen.getByTestId("upload-zone"), {
    dataTransfer: { files: [gpxFile(fixtureName)] },
  });
}

/** The drawn detour for the missing section (mirrors the pipeline test). */
const DRAWN = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
];

describe("Gap Recovery section", () => {
  it("switches sections from the header; the recovery landing shows its workflow", async () => {
    render(<AppShell />);

    // The repair studio's landing is the default.
    expect(screen.getByTestId("landing-mode-toggle")).toBeVisible();

    fireEvent.click(screen.getByTestId("section-switch-recovery"));

    // The recovery landing: its own hero steps and its own upload zone.
    expect(await screen.findByTestId("recovery-workflow-steps")).toBeVisible();
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    expect(
      screen.getByTestId("recovery-workflow-steps"),
    ).toHaveTextContent("Detect the gap");
  });

  it("lists the missing GPS section with its interval and elapsed time", async () => {
    render(<AppShell />);
    fireEvent.click(screen.getByTestId("section-switch-recovery"));

    await dropFile("time-gap.gpx");

    // The guide card counts the detected section.
    const guide = await screen.findByTestId("recovery-guide-card");
    expect(guide).toHaveTextContent("1 found");
    expect(guide).toHaveTextContent("0 of 1 recovered");

    // The reused gap list shows the missing interval's evidence.
    const gapList = await screen.findByTestId("gap-list");
    expect(gapList).toHaveTextContent("Time gap");
    expect(gapList).toHaveTextContent("5:00 elapsed");
    expect(gapList).toHaveTextContent("52.52014, 13.40516");
    expect(gapList).toHaveTextContent("52.52019, 13.40523");

    // The header carries the recovery session's file name (the summary
    // card titles itself with it too — at least one is the header's).
    expect(screen.getAllByTitle("time-gap.gpx").length).toBeGreaterThanOrEqual(1);

    // The map panel mounts (textual fallback without WebGL).
    expect(screen.getByTestId("map-canvas")).toBeVisible();
    expect(await screen.findByTestId("map-fallback")).toBeVisible();
  });

  it("draws, commits, and previews the completed route with the elapsed time unchanged", async () => {
    render(<AppShell />);
    fireEvent.click(screen.getByTestId("section-switch-recovery"));
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gap-list");

    // Before committing: the preview explains nothing is applied yet.
    const preview = screen.getByTestId("recovery-preview-card");
    expect(preview).toHaveTextContent(
      "Draw a missing section to see the completed route here.",
    );

    // Open the editor for the detected section (the reused panel).
    fireEvent.click(screen.getByTestId("open-editor-button"));
    const editor = await screen.findByTestId("draw-editor-panel");
    expect(editor).toBeVisible();
    expect(editor).toHaveTextContent("Reconstruct route");
    expect(editor).toHaveTextContent("From");
    expect(editor).toHaveTextContent("To");

    // Draw the missing route (store-driven — the map needs WebGL).
    await act(async () => {
      const store = useRecoveryStore.getState();
      for (const point of DRAWN) store.addVertex(point);
      store.setResampleSpacing(
        useRecoveryStore.getState().activeGapId!,
        10,
      );
      store.closeEditor();
    });

    // The editor is gone; the section reads as recovered.
    await waitFor(() => {
      expect(screen.queryByTestId("draw-editor-panel")).toBeNull();
    });
    const guide = screen.getByTestId("recovery-guide-card");
    expect(guide).toHaveTextContent("1 of 1 recovered");

    // The completed-route preview: committed numbers, elapsed unchanged.
    await waitFor(() => {
      expect(screen.getByTestId("recovery-preview-stats")).toBeVisible();
    });
    const stats = screen.getByTestId("recovery-preview-stats");
    expect(stats).toHaveTextContent("5:00"); // missing time now covered
    expect(stats).toHaveTextContent("unchanged"); // elapsed-time lock
    expect(stats).toHaveTextContent("Points generated");
    expect(stats).toHaveTextContent("Estimated");

    // The export card reflects the committed recovery.
    const exportCard = screen.getByTestId("export-card");
    expect(exportCard).toHaveTextContent("Repairs to include");
    expect(exportCard).toHaveTextContent("1");
  });

  it("keeps the repair studio's session untouched (section isolation)", async () => {
    render(<AppShell />);

    // Load a file in the REPAIR studio first.
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gap-list");

    // Switch to recovery and load the same fixture there too.
    fireEvent.click(screen.getByTestId("section-switch-recovery"));
    await dropFile("time-gap.gpx");
    const recoveryList = await screen.findByTestId("gap-list");
    expect(recoveryList).toBeVisible();

    // Draw + commit a recovery repair.
    await act(async () => {
      const store = useRecoveryStore.getState();
      store.openEditor(
        useRecoveryStore.getState().gaps[0]!.id,
      );
      for (const point of DRAWN) store.addVertex(point);
      store.closeEditor();
    });
    await waitFor(() => {
      expect(screen.getByTestId("recovery-guide-card")).toHaveTextContent(
        "1 of 1 recovered",
      );
    });

    // Back in the repair studio: its own session is intact and its own
    // repairs untouched (0 committed there).
    fireEvent.click(screen.getByTestId("section-switch-repair"));
    const repairList = await screen.findByTestId("gap-list");
    expect(repairList).toBeVisible();
    expect(useRecoveryStore.getState().reconstructions).not.toEqual({});
    expect(Object.keys(useEditorStore.getState().reconstructions)).toEqual([]);

    // The recovery session survives the round trip.
    fireEvent.click(screen.getByTestId("section-switch-recovery"));
    expect(await screen.findByTestId("recovery-guide-card")).toHaveTextContent(
      "1 of 1 recovered",
    );
  });

  it("shows precise errors for unreadable files, with retry available", async () => {
    render(<AppShell />);
    fireEvent.click(screen.getByTestId("section-switch-recovery"));

    await dropFile("malformed.gpx");

    const error = await screen.findByTestId("session-error");
    expect(error).toHaveTextContent("Not well-formed XML");
    expect(screen.getByTestId("upload-zone")).toBeVisible();
  });
});
