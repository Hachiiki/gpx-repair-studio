// @vitest-environment jsdom
/**
 * React Testing Library — the Phase 2 acceptance flow, end to end against
 * the real domain pipeline (parse → validate → detect → view models):
 *
 *   - valid file shows summary, segments, validation report, gaps, stats
 *   - invalid files show precise, actionable errors
 *   - a no-timestamp file enters the "no timing data" mode
 *   - threshold settings changes re-run detection
 *
 * jsdom provides File/Blob.text and DOMParser, so the same XmlIo adapter
 * used in the browser runs here (no mocking of the domain).
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { loadFixture } from "./helpers/gpxTestUtils";
import { useEditorStore } from "@/state/editor-store";
import { useSessionStore } from "@/state/session-store";
import { useUiStore } from "@/state/ui-store";
import type { GapId } from "@/types/domain";

beforeEach(() => {
  act(() => {
    useSessionStore.getState().reset();
    useEditorStore.getState().reset();
    useUiStore.getState().resetGapThresholds();
    useUiStore.setState({
      selectedGapId: null,
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

describe("inspection flow", () => {
  it("shows summary, segments, gaps, and stats for a valid file with a gap", async () => {
    render(<AppShell />);

    await dropFile("time-gap.gpx");

    // Summary card with file identity and counts.
    const summary = await screen.findByTestId("gpx-summary");
    expect(summary).toHaveTextContent("time-gap.gpx");
    expect(summary).toHaveTextContent("GPX 1.1");
    expect(summary).toHaveTextContent("Paused Watch");
    expect(summary).toHaveTextContent("8"); // points

    // One detected gap: kind, elapsed, and boundary coordinates.
    const gapList = await screen.findByTestId("gap-list");
    expect(gapList).toHaveTextContent("Time gap");
    expect(gapList).toHaveTextContent("5:00 elapsed");
    expect(gapList).toHaveTextContent("52.52014, 13.40516"); // before point
    expect(gapList).toHaveTextContent("52.52019, 13.40523"); // after point

    // Original-only statistics with recorded provenance.
    const stats = screen.getByTestId("stats-panel");
    expect(stats).toHaveTextContent("0:18"); // recorded moving time
    expect(stats).toHaveTextContent("5:18"); // wall time
    expect(stats).toHaveTextContent("Recorded");
    expect(stats).not.toHaveTextContent("Estimated");

    // Structure panels.
    expect(screen.getByTestId("segment-list")).toHaveTextContent(
      "1 segment across 1 track",
    );
    expect(screen.getByTestId("validation-report")).toBeVisible();
    // The map panel mounts; without WebGL (jsdom) the controller settles
    // into the textual fallback, proving the slot and state machine work.
    expect(screen.getByTestId("map-canvas")).toBeVisible();
    expect(await screen.findByTestId("map-fallback")).toBeVisible();
  });

  it("shows a precise, actionable error for malformed XML", async () => {
    render(<AppShell />);
    await dropFile("malformed.gpx");

    const error = await screen.findByTestId("session-error");
    expect(error).toHaveTextContent("Not well-formed XML");
    expect(error).toHaveTextContent("malformed.gpx");
    // The upload zone stays available for an immediate retry.
    expect(screen.getByTestId("upload-zone")).toBeVisible();
  });

  it("shows a precise error for a non-GPX XML document", async () => {
    render(<AppShell />);
    await dropFile("not-gpx.gpx");

    const error = await screen.findByTestId("session-error");
    expect(error).toHaveTextContent("Not a GPX file");
  });

  it("shows an error for an unsupported GPX version", async () => {
    render(<AppShell />);
    await dropFile("bad-version.gpx");

    const error = await screen.findByTestId("session-error");
    expect(error).toHaveTextContent("Unsupported GPX version");
  });

  it("rejects an empty file with a clear message", async () => {
    render(<AppShell />);
    fireEvent.drop(screen.getByTestId("upload-zone"), {
      dataTransfer: { files: [new File([], "empty.gpx")] },
    });

    const error = await screen.findByTestId("session-error");
    expect(error).toHaveTextContent("Empty file");
  });

  it("enters the no-timing-data mode for a file without timestamps", async () => {
    render(<AppShell />);
    await dropFile("no-time.gpx");

    const summary = await screen.findByTestId("gpx-summary");
    expect(summary).toHaveTextContent("No timing data");

    const stats = screen.getByTestId("stats-panel");
    expect(screen.getByTestId("no-timing-data-badge")).toBeVisible();
    expect(screen.getByTestId("no-timing-note")).toBeVisible();

    // Time statistics render "—" instead of fabricated values; distance
    // (coordinate-only) is still reported.
    const rows = Array.from(stats.querySelectorAll("tbody tr"));
    const row = (label: string) =>
      rows.find((r) => r.textContent?.includes(label));
    expect(row("Recorded moving time")?.textContent).toContain("—");
    expect(row("Wall time")?.textContent).toContain("—");
    expect(row("Total distance")?.textContent).toMatch(/\d+ m/);
  });

  it("re-runs detection when the time-gap threshold changes", async () => {
    render(<AppShell />);
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gap-list");
    expect(screen.getAllByTestId("gap-row")).toHaveLength(1);

    // Raise the threshold to 300 s — the 5-minute pause is no longer
    // strictly greater, so the gap disappears. (The popover stays open
    // after the blur commit — users may adjust several fields.)
    fireEvent.click(screen.getByRole("button", { name: "Detection settings" }));
    const input = await screen.findByLabelText("Time gap threshold");
    fireEvent.change(input, { target: { value: "300" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(
        screen.getByText("No gaps detected with the current thresholds."),
      ).toBeVisible(),
    );

    // Lower it again in the still-open popover — the gap reappears.
    const inputAgain = screen.getByLabelText("Time gap threshold");
    fireEvent.change(inputAgain, { target: { value: "60" } });
    fireEvent.blur(inputAgain);

    await waitFor(() =>
      expect(screen.getAllByTestId("gap-row")).toHaveLength(1),
    );
  });

  it("resets to the upload state via the header action", async () => {
    render(<AppShell />);
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gpx-summary");

    fireEvent.click(screen.getByRole("button", { name: "New file" }));

    expect(screen.queryByTestId("gpx-summary")).toBeNull();
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();
  });

  it("discloses damaged segments in the segment list", async () => {
    render(<AppShell />);
    await dropFile("mixed-anomalies.gpx");

    const segments = await screen.findByTestId("segment-list");
    expect(segments).toHaveTextContent(/flagged/);
  });

  it("exposes a skip link that targets the main content landmark", () => {
    render(<AppShell />);

    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — time & pace reconstruction joins the statistics
// ---------------------------------------------------------------------------

describe("time & pace reconstruction (Phase 5)", () => {
  /** The time-gap fixture's single gap: points 3 → 4 (07:00:09 → 07:05:09). */
  const GAP_ID = "gap/t0s0:3/t0s0:4" as GapId;

  /**
   * Commit a repair through the REAL stores (the map is unavailable in
   * jsdom — the store is the authoritative writer anyway): open the
   * gap's editor, draw two vertices, close.
   */
  function commitRepair(vertices: [number, number][]) {
    act(() => {
      useEditorStore.getState().openEditor(GAP_ID);
    });
    for (const [lat, lon] of vertices) {
      act(() => {
        useEditorStore.getState().addVertex({ lat, lon });
      });
    }
    act(() => {
      useEditorStore.getState().closeEditor();
    });
  }

  it("a committed repair joins the stats with derived time and provenance labels", async () => {
    render(<AppShell />);
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gap-list");

    // While editing, the §J-1 controls are part of the editor panel.
    act(() => {
      useEditorStore.getState().openEditor(GAP_ID);
    });
    expect(
      await screen.findByTestId("time-strategy-controls"),
    ).toBeVisible();
    expect(screen.getByTestId("gap-duration")).toHaveTextContent("5:00");

    act(() => {
      useEditorStore.getState().addVertex({ lat: 52.5206, lon: 13.4055 });
      useEditorStore.getState().closeEditor();
    });

    const stats = await screen.findByTestId("stats-panel");
    // Distance splits with provenance.
    expect(stats).toHaveTextContent("Recorded distance");
    expect(stats).toHaveTextContent("Repaired distance");
    expect(stats).toHaveTextContent("Total with repairs");
    // The derived 5-minute gap span becomes the repair time.
    expect(stats).toHaveTextContent("Repair time");
    const rows = Array.from(stats.querySelectorAll("tbody tr"));
    const repairRow = rows.find((r) => r.textContent?.includes("Repair time"));
    expect(repairRow?.textContent).toContain("5:00");
    // Moving time incl. repairs = 0:18 recorded + 5:00 repair.
    const mixedRow = rows.find((r) =>
      r.textContent?.includes("Moving time incl. repairs"),
    );
    expect(mixedRow?.textContent).toContain("5:18");
    // §L-1 pace rows render with their provenance.
    expect(stats).toHaveTextContent("Pace (recorded)");
    expect(stats).toHaveTextContent("Pace (repairs)");
    expect(stats).toHaveTextContent("Overall pace");
    const paceCell = rows
      .find((r) => r.textContent?.includes("Pace (repairs)"))
      ?.textContent;
    expect(paceCell).toMatch(/\/km/);
    expect(paceCell).not.toContain("—");
  });

  it("the Case 4 override flags the disagreement in the stats footnote", async () => {
    render(<AppShell />);
    await dropFile("time-gap.gpx");
    await screen.findByTestId("gap-list");

    commitRepair([[52.5206, 13.4055]]);
    act(() => {
      useEditorStore
        .getState()
        .setTimeStrategy(GAP_ID, {
          kind: "manual-duration",
          durationMs: 12 * 60_000,
        });
    });

    const stats = await screen.findByTestId("stats-panel");
    expect(stats).toHaveTextContent("12:00"); // the manual value wins
    await waitFor(() =>
      expect(
        screen.getByTestId("duration-discrepancy-note"),
      ).toHaveTextContent(/disagree/i),
    );
  });

  it("a no-timing file prompts for durations and honors the manual total", async () => {
    render(<AppShell />);
    await dropFile("no-time.gpx");

    // The file-level mode appears; the overall pace prompts honestly.
    const card = await screen.findByTestId("file-timing-card");
    expect(card).toBeVisible();
    const stats = screen.getByTestId("stats-panel");
    expect(screen.getByTestId("pace-row-overall")).toHaveTextContent(
      /enter a total duration/i,
    );

    // Enter a 30-minute total (blur-commit).
    fireEvent.change(screen.getByTestId("file-total-minutes"), {
      target: { value: "30" },
    });
    fireEvent.blur(screen.getByTestId("file-total-minutes"));

    await waitFor(() =>
      expect(stats).toHaveTextContent("Total duration (entered)"),
    );
    const rows = Array.from(stats.querySelectorAll("tbody tr"));
    const enteredRow = rows.find((r) =>
      r.textContent?.includes("Total duration (entered)"),
    );
    expect(enteredRow?.textContent).toContain("30:00");
    // The overall pace computes from the entered total (mixed).
    await waitFor(() => {
      const overall = rows.find((r) =>
        r.textContent?.includes("Overall pace"),
      );
      expect(overall?.textContent).toMatch(/\d+:\d{2} \/km/);
    });

    // A committed repair without a duration keeps the honest "—".
    act(() => {
      useEditorStore.getState().addInsertSpan("t0s0:1" as never, "t0s0:2" as never);
      useEditorStore.getState().addVertex({ lat: 52.5202, lon: 13.4051 });
      useEditorStore.getState().closeEditor();
    });
    await waitFor(() =>
      expect(screen.getByTestId("repair-duration-note")).toHaveTextContent(
        /still needs a duration/i,
      ),
    );
    expect(screen.getByTestId("pace-row-repaired")).toHaveTextContent(
      /still needs a duration/i,
    );
  });
});
