// @vitest-environment jsdom
/**
 * React Testing Library — the finished-on-export banner (Task 75).
 *
 * The contract:
 *   - no finished mark, no banner;
 *   - the three exits render and dispatch their intents (the binding's
 *     save/fresh/home/dismiss are the only logic — pure presentation);
 *   - merge carries no shelf session, so its banner offers the two
 *     exits only;
 *   - Save opens the inline name row (prefilled with the suggestion)
 *     and hands the confirmed name to the binding;
 *   - a saved state collapses the Save button to its label.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionFinishedBanner } from "@/components/shared/session-finished-banner";
import type { SessionFinishBinding } from "@/hooks/use-session-finish";

function binding(
  overrides: Partial<SessionFinishBinding> = {},
): SessionFinishBinding {
  return {
    finishedAt: Date.UTC(2026, 9, 1, 7, 30),
    saveState: "idle",
    suggestedName: "morning-run.gpx",
    canSave: true,
    save: vi.fn().mockResolvedValue(undefined),
    fresh: vi.fn(),
    home: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("SessionFinishedBanner", () => {
  it("renders nothing while the session is unfinished", () => {
    const { container } = render(
      <SessionFinishedBanner finish={binding({ finishedAt: null })} />,
    );
    expect(screen.queryByTestId("session-finished-banner")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("offers the three exits and dispatches their intents", () => {
    const finish = binding();
    render(<SessionFinishedBanner finish={finish} />);
    expect(screen.getByTestId("session-finished-banner")).toBeVisible();
    fireEvent.click(screen.getByTestId("session-finished-fresh"));
    expect(finish.fresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("session-finished-home"));
    expect(finish.home).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("session-finished-dismiss"));
    expect(finish.dismiss).toHaveBeenCalledTimes(1);
  });

  it("hides Save when the section cannot be shelved (merge)", () => {
    render(<SessionFinishedBanner finish={binding({ canSave: false })} />);
    expect(screen.queryByTestId("session-finished-save")).toBeNull();
    expect(screen.getByTestId("session-finished-fresh")).toBeVisible();
    expect(screen.getByTestId("session-finished-home")).toBeVisible();
  });

  it("saves under the (prefilled) name through the inline row", () => {
    const finish = binding();
    render(<SessionFinishedBanner finish={finish} />);
    fireEvent.click(screen.getByTestId("session-finished-save"));
    const input = screen.getByTestId("session-finished-name");
    expect(input).toHaveValue("morning-run.gpx");
    fireEvent.change(input, { target: { value: "Wednesday tempo" } });
    fireEvent.click(screen.getByTestId("session-finished-save-confirm"));
    expect(finish.save).toHaveBeenCalledWith("Wednesday tempo");
  });

  it("collapses the Save button once saved", () => {
    render(<SessionFinishedBanner finish={binding({ saveState: "saved" })} />);
    expect(screen.getByTestId("session-finished-save")).toBeDisabled();
    expect(screen.queryByTestId("session-finished-name")).toBeNull();
  });
});
