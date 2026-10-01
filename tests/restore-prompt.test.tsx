// @vitest-environment jsdom
/**
 * React Testing Library — the session-recovery prompt
 * (components/layout/restore-prompt.tsx, Phase 10).
 *
 *   - renders NOTHING when no offers exist (the landing stays clean);
 *   - one row per offer: section kicker, label, detail, saved-ago;
 *   - Restore / Discard dispatch the controller's intents, one at a
 *     time (everything disables while a restore is in flight, and the
 *     in-flight row says Restoring…);
 *   - Clear all saved sessions dispatches the global clear;
 *   - the §M-3 disclosure names what is stored and that it never
 *     leaves the device.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestorePrompt } from "@/components/layout/restore-prompt";
import type {
  SessionOffer,
  SessionRecoveryController,
} from "@/hooks/use-session-recovery";

afterEach(() => cleanup());

function controller(
  overrides: Partial<SessionRecoveryController> & { offers?: SessionOffer[] } = {},
): SessionRecoveryController {
  return {
    offers: [],
    restoring: null,
    restore: vi.fn(),
    discard: vi.fn(),
    clearAll: vi.fn(),
    ...overrides,
  };
}

const REPAIR_OFFER: SessionOffer = {
  section: "repair",
  savedAt: Date.now() - 5 * 60_000,
  label: "morning-run.gpx",
  detail: "4 points drawn · 1 manual span",
};

const PLAN_OFFER: SessionOffer = {
  section: "plan",
  savedAt: Date.now() - 60 * 60_000,
  label: "Route plan",
  detail: "12 points drawn",
};

describe("empty state", () => {
  it("renders nothing without offers", () => {
    const { container } = render(<RestorePrompt recovery={controller()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("offer rows", () => {
  it("lists each offer with its section, label, detail, and saved-ago", () => {
    render(
      <RestorePrompt
        recovery={controller({ offers: [REPAIR_OFFER, PLAN_OFFER] })}
      />,
    );
    expect(screen.getByTestId("restore-prompt")).toBeVisible();
    expect(screen.getByTestId("restore-offer-repair")).toBeVisible();
    expect(screen.getByTestId("restore-offer-plan")).toBeVisible();
    expect(screen.getByTestId("restore-label-repair")).toHaveTextContent(
      "morning-run.gpx",
    );
    expect(screen.getByTestId("restore-offer-repair")).toHaveTextContent(
      "4 points drawn · 1 manual span",
    );
    expect(screen.getByTestId("restore-offer-repair")).toHaveTextContent(
      "saved 5 minutes ago",
    );
    expect(screen.getByTestId("restore-offer-plan")).toHaveTextContent(
      "saved 1 hour ago",
    );
  });

  it("carries the privacy disclosure", () => {
    render(<RestorePrompt recovery={controller({ offers: [REPAIR_OFFER] })} />);
    const prompt = screen.getByTestId("restore-prompt");
    expect(prompt).toHaveTextContent(/stay in this browser/i);
    expect(prompt).toHaveTextContent(/never uploaded/i);
  });
});

describe("intents", () => {
  it("Restore dispatches the section's restore intent", () => {
    const restore = vi.fn();
    render(
      <RestorePrompt
        recovery={controller({ offers: [REPAIR_OFFER], restore })}
      />,
    );
    fireEvent.click(screen.getByTestId("restore-accept-repair"));
    expect(restore).toHaveBeenCalledWith("repair");
  });

  it("Discard dispatches the section's discard intent", () => {
    const discard = vi.fn();
    render(
      <RestorePrompt
        recovery={controller({ offers: [REPAIR_OFFER], discard })}
      />,
    );
    fireEvent.click(screen.getByTestId("restore-discard-repair"));
    expect(discard).toHaveBeenCalledWith("repair");
  });

  it("Clear all dispatches the global clear intent", () => {
    const clearAll = vi.fn();
    render(
      <RestorePrompt
        recovery={controller({ offers: [REPAIR_OFFER], clearAll })}
      />,
    );
    fireEvent.click(screen.getByTestId("restore-clear-all"));
    expect(clearAll).toHaveBeenCalledTimes(1);
  });
});

describe("in-flight restore", () => {
  it("shows Restoring… on its row and disables every action", () => {
    render(
      <RestorePrompt
        recovery={controller({
          offers: [REPAIR_OFFER, PLAN_OFFER],
          restoring: "repair",
        })}
      />,
    );
    expect(screen.getByTestId("restore-accept-repair")).toHaveTextContent(
      "Restoring…",
    );
    for (const testid of [
      "restore-accept-repair",
      "restore-discard-repair",
      "restore-accept-plan",
      "restore-discard-plan",
      "restore-clear-all",
    ]) {
      expect(screen.getByTestId(testid)).toBeDisabled();
    }
  });
});
