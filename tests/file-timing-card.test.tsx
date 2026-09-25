// @vitest-environment jsdom
/**
 * React Testing Library — the file-level "no timing data" card
 * (§J-1 Case 3, Phase 5): start-time entry, total-duration
 * blur-commit, invalid-input non-commit, and the store-reset sync
 * (a new file clears the inputs).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTimingCard } from "@/components/reconstruction/file-timing-card";

afterEach(() => cleanup());

function setup(overrides: Partial<Parameters<typeof FileTimingCard>[0]> = {}) {
  const setFileTiming = vi.fn();
  render(
    <FileTimingCard
      fileTiming={{ startMs: null, totalDurationMs: null }}
      setFileTiming={setFileTiming}
      {...overrides}
    />,
  );
  return setFileTiming;
}

describe("FileTimingCard", () => {
  it("renders the card with both entries optional", () => {
    setup();
    expect(screen.getByTestId("file-timing-card")).toBeVisible();
    expect(screen.getByTestId("file-start-input")).toHaveValue("");
    expect(screen.getByTestId("file-total-hours")).toHaveValue(0);
    expect(screen.getByText(/no total duration entered/i)).toBeVisible();
  });

  it("entering a start time commits it as epoch ms", () => {
    const setFileTiming = setup();
    // datetime-local values are local time; the card stores what Date
    // parses (display is local everywhere — durations are tz-agnostic).
    fireEvent.change(screen.getByTestId("file-start-input"), {
      target: { value: "2024-05-01T07:00" },
    });
    expect(setFileTiming).toHaveBeenCalledWith({
      startMs: new Date("2024-05-01T07:00").getTime(),
    });
  });

  it("clearing the start commits null", () => {
    const setFileTiming = setup();
    fireEvent.change(screen.getByTestId("file-start-input"), {
      target: { value: "2024-05-01T07:00" },
    });
    setFileTiming.mockClear();
    fireEvent.change(screen.getByTestId("file-start-input"), {
      target: { value: "" },
    });
    expect(setFileTiming).toHaveBeenCalledWith({ startMs: null });
  });

  it("commits the total duration on blur (not per keystroke)", () => {
    const setFileTiming = setup();

    fireEvent.change(screen.getByTestId("file-total-hours"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("file-total-minutes"), {
      target: { value: "30" },
    });
    // Typing alone never commits.
    expect(setFileTiming).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByTestId("file-total-minutes"));
    expect(setFileTiming).toHaveBeenCalledWith({
      totalDurationMs: 90 * 60_000,
    });
  });

  it("invalid duration input never commits", () => {
    const setFileTiming = setup();
    fireEvent.change(screen.getByTestId("file-total-minutes"), {
      target: { value: "-5" },
    });
    fireEvent.blur(screen.getByTestId("file-total-minutes"));
    expect(setFileTiming).not.toHaveBeenCalled();
  });

  it("syncs its inputs when the store resets (new file)", () => {
    const setFileTiming = vi.fn();
    const { rerender } = render(
      <FileTimingCard
        fileTiming={{ startMs: Date.UTC(2024, 4, 1, 7, 0), totalDurationMs: 45 * 60_000 }}
        setFileTiming={setFileTiming}
      />,
    );
    // Prefilled from the store: 45 min → 0 h / 45 m / 0 s.
    expect(screen.getByTestId("file-total-minutes")).toHaveValue(45);

    // A store reset (new file) clears the entries on the next render —
    // the render-adjust sync, without any effect.
    rerender(
      <FileTimingCard
        fileTiming={{ startMs: null, totalDurationMs: null }}
        setFileTiming={setFileTiming}
      />,
    );
    expect(screen.getByTestId("file-start-input")).toHaveValue("");
    expect(screen.getByTestId("file-total-minutes")).toHaveValue(0);
  });
});
