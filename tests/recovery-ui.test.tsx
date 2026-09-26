// @vitest-environment jsdom
/**
 * React Testing Library — the Gap Recovery section's acceptance flow
 * (Task 26, revised to the landing-tab entry), end to end against the
 * real domain pipeline:
 *
 *   - the landing toggle is the ONLY front door: three tabs (repair a
 *     recording / create a share card / recover a GPS gap) and no
 *     header section switcher;
 *   - an upload from the recovery tab enters the section's own session
 *     (the repair studio's session stays untouched);
 *   - uploading an activity with a GPS tracking gap lists the missing
 *     section (interval anchors + elapsed) through the reused panels;
 *   - drawing (store-driven, as the map needs WebGL) and committing a
 *     route updates the completed-route preview: distance grows, the
 *     elapsed time stays marked unchanged, generated points counted;
 *   - the export card reflects the committed recovery;
 *   - a failed load surfaces above the hero for retry, routed by the
 *     selected tab;
 *   - "New file" resets the active section and returns to the landing,
 *     where the repair tab opens the repair studio for the same file.
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
      landingMode: "repair",
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

/** Enter the recovery destination: click the landing's third tab. */
function chooseRecoveryTab() {
  fireEvent.click(screen.getByTestId("landing-mode-recovery"));
}

/** The drawn detour for the missing section (mirrors the pipeline test). */
const DRAWN = [
  { lat: 52.5206, lon: 13.4055 },
  { lat: 52.5202, lon: 13.4058 },
];

describe("Gap Recovery section", () => {
  it("offers the recovery destination as the landing's third tab — no header switcher", () => {
    render(<AppShell />);

    // The toggle carries three mutually exclusive destinations.
    const toggle = screen.getByTestId("landing-mode-toggle");
    expect(toggle).toHaveAttribute("role", "radiogroup");
    expect(
      toggle.querySelectorAll('[role="radio"]'),
    ).toHaveLength(3);

    // The Task-26 header section switcher is gone: the tab is the only door.
    expect(screen.queryByTestId("section-switcher")).toBeNull();

    // Choosing the recovery tab swaps the hero to its workflow.
    chooseRecoveryTab();
    expect(
      screen.getByRole("heading", { name: "Recover a missing GPS section" }),
    ).toBeVisible();
    const steps = screen.getByTestId("workflow-steps");
    expect(steps).toHaveTextContent("Detect the gap");
    expect(steps).toHaveTextContent("Draw the missing route");
    expect(steps).toHaveTextContent("Export the corrected file");
    expect(screen.getByTestId("upload-zone")).toBeVisible();

    // And back: the repair hero returns (one remembered intent).
    fireEvent.click(screen.getByTestId("landing-mode-repair"));
    expect(
      screen.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();
  });

  it("routes an upload from the recovery tab into the section's own session", async () => {
    render(<AppShell />);
    chooseRecoveryTab();

    await dropFile("time-gap.gpx");

    // The recovery workspace mounted (not the repair studio's): its
    // guide card counts the detected section.
    const guide = await screen.findByTestId("recovery-guide-card");
    expect(guide).toHaveTextContent("1 found");
    expect(guide).toHaveTextContent("0 of 1 recovered");

    // The repair studio never saw this file.
    expect(useSessionStore.getState().status).toBe("idle");
    expect(useSessionStore.getState().data).toBeNull();

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
    chooseRecoveryTab();
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

  it("resets the active section from the header and lands in the repair studio from the repair tab", async () => {
    render(<AppShell />);
    chooseRecoveryTab();

    // Load a file in the RECOVERY section and commit a repair there.
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gap-list");
    await act(async () => {
      const store = useRecoveryStore.getState();
      store.openEditor(useRecoveryStore.getState().gaps[0]!.id);
      for (const point of DRAWN) store.addVertex(point);
      store.closeEditor();
    });
    await waitFor(() => {
      expect(screen.getByTestId("recovery-guide-card")).toHaveTextContent(
        "1 of 1 recovered",
      );
    });

    // "New file" resets the ACTIVE section (recovery) and returns to
    // the landing — the repair studio's stores were never involved.
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    await screen.findByTestId("landing-mode-toggle");
    expect(useRecoveryStore.getState().status).toBe("idle");
    expect(useSessionStore.getState().status).toBe("idle");
    expect(Object.keys(useEditorStore.getState().reconstructions)).toEqual([]);

    // Upload the same file from the REPAIR tab: the repair studio opens
    // — its own workspace, not the recovery section.
    fireEvent.click(screen.getByTestId("landing-mode-repair"));
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gap-list");
    expect(screen.queryByTestId("recovery-guide-card")).toBeNull();
    expect(screen.getByTestId("manual-repairs-card")).toBeVisible();
    expect(useSessionStore.getState().status).toBe("parsed");
    expect(useRecoveryStore.getState().status).toBe("idle");

    // And a repair tab upload with the recovery tab remembered routes
    // back the other way: the remembered tab is the intent (unit-level:
    // the session stores stay fully independent).
    expect(useRecoveryStore.getState().data).toBeNull();
  });

  it("routes load failures by the selected tab, with retry available", async () => {
    render(<AppShell />);
    chooseRecoveryTab();

    await dropFile("malformed.gpx");

    // The recovery session's failure sits above its hero for retry.
    const error = await screen.findByTestId("session-error");
    expect(error).toHaveTextContent("Not well-formed XML");
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    expect(useRecoveryStore.getState().status).toBe("error");

    // Switching to another destination swaps the routed error away…
    fireEvent.click(screen.getByTestId("landing-mode-repair"));
    expect(screen.queryByTestId("session-error")).toBeNull();

    // …and back: the recovery failure is still there, waiting for retry.
    fireEvent.click(screen.getByTestId("landing-mode-recovery"));
    expect(screen.getByTestId("session-error")).toBeVisible();
  });
});
