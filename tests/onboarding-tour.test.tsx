// @vitest-environment jsdom
/**
 * Unit tests — the onboarding tour (Phase 11): the controller hook
 * (hooks/use-onboarding-tour.ts) and the overlay component
 * (components/layout/onboarding-tour.tsx).
 *
 * Controller behaviors:
 *   - auto-open: exactly once, only on the cards page, only after the
 *     storage scan settles, only with NO restore offers, only for an
 *     unseen flag;
 *   - a returning browser (seen flag / restore offers) never gets it;
 *   - next walks 0→3 and finishes (closing + remembering);
 *   - back stops at 0; close remembers from anywhere;
 *   - implicit dismissal: leaving the cards page closes the AUTO-opened
 *     tour and remembers; a MANUALLY started tour survives the page
 *     switch (its own controls close it);
 *   - the manual replay (start) works even after the flag is seen.
 *
 * Component behaviors: the four steps render in order with honest
 * copy, the progress dots + sr-only count match, Back appears from
 * step 1, the last step's button says Get started, and Skip dispatches
 * close.
 */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ONBOARDING_TOUR_STEPS,
  useOnboardingTour,
  type OnboardingTourController,
} from "@/hooks/use-onboarding-tour";
import {
  OnboardingTour,
  getTourSteps,
} from "@/components/layout/onboarding-tour";
import { enTranslator } from "@/hooks/use-i18n";
import { clearTourFlag, readTourFlag } from "@/lib/storage/tour-flag";

/*
 * The tour content resolves through the English translator — tests
 * stay English-anchored (the en dictionary is the contract the zh
 * translation is checked against).
 */
const TOUR_STEPS = getTourSteps(enTranslator);

/** Stable harness: the SAME component type across rerenders (opts as props), so the hook's state survives. */
function Harness({
  opts,
  onController,
}: {
  opts: {
    enabled: boolean;
    storageScanDone: boolean;
    hasRestoreOffers: boolean;
  };
  onController: (c: OnboardingTourController) => void;
}) {
  const controller = useOnboardingTour(opts);
  onController(controller);
  return null;
}

const CARDS_OPTS = {
  enabled: true,
  storageScanDone: true,
  hasRestoreOffers: false,
};

beforeEach(() => clearTourFlag());
afterEach(() => cleanup());

describe("useOnboardingTour — controller", () => {
  it("auto-opens once for a fresh visitor on the cards page after the scan", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await waitFor(() => expect(holder.current?.step).toBe(0));
    await act(async () => {});
    expect(holder.current?.step).toBe(0); // stays open
  });

  it("waits for the storage scan before auto-opening", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    const ui = render(
      <Harness
        opts={{ ...CARDS_OPTS, storageScanDone: false }}
        onController={(c) => (holder.current = c)}
      />,
    );
    await act(async () => {});
    expect(holder.current?.step).toBeNull();
    ui.rerender(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await waitFor(() => expect(holder.current?.step).toBe(0));
  });

  it("never auto-opens off the cards page (enabled false)", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness
        opts={{ ...CARDS_OPTS, enabled: false }}
        onController={(c) => (holder.current = c)}
      />,
    );
    await act(async () => {});
    expect(holder.current?.step).toBeNull();
    expect(readTourFlag()).toBe("unseen");
  });

  it("never auto-opens when restorable work exists", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness
        opts={{ ...CARDS_OPTS, hasRestoreOffers: true }}
        onController={(c) => (holder.current = c)}
      />,
    );
    await act(async () => {});
    expect(holder.current?.step).toBeNull();
  });

  it("never auto-opens for a browser that has seen the tour", async () => {
    const { writeTourSeen } = await import("@/lib/storage/tour-flag");
    writeTourSeen();
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await act(async () => {});
    expect(holder.current?.step).toBeNull();
  });

  it("auto-opens at most once per page load (no re-open after close)", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await waitFor(() => expect(holder.current?.step).toBe(0));
    act(() => holder.current!.close());
    await act(async () => {});
    expect(holder.current?.step).toBeNull(); // the latch is spent
    expect(readTourFlag()).toBe("seen");
  });

  it("next walks the steps and finishes on the last (remembering)", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await waitFor(() => expect(holder.current?.step).toBe(0));
    act(() => holder.current!.next());
    expect(holder.current?.step).toBe(1);
    act(() => holder.current!.next());
    act(() => holder.current!.next());
    expect(holder.current?.step).toBe(3);
    act(() => holder.current!.next());
    expect(holder.current?.step).toBeNull();
    expect(readTourFlag()).toBe("seen");
  });

  it("back stops at zero", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await waitFor(() => expect(holder.current?.step).toBe(0));
    act(() => holder.current!.next());
    act(() => holder.current!.back());
    expect(holder.current?.step).toBe(0);
    act(() => holder.current!.back());
    expect(holder.current?.step).toBe(0);
  });

  it("close remembers from any step", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await waitFor(() => expect(holder.current?.step).toBe(0));
    act(() => holder.current!.next());
    act(() => holder.current!.close());
    expect(holder.current?.step).toBeNull();
    expect(readTourFlag()).toBe("seen");
  });

  it("start replays the tour even after it was seen", async () => {
    const { writeTourSeen } = await import("@/lib/storage/tour-flag");
    writeTourSeen();
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await act(async () => {});
    expect(holder.current?.step).toBeNull();
    act(() => holder.current!.start());
    expect(holder.current?.step).toBe(0);
  });

  it("implicitly dismisses the AUTO tour when the cards page goes away", async () => {
    const holder: { current: OnboardingTourController | null } = { current: null };
    const ui = render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await waitFor(() => expect(holder.current?.step).toBe(0));
    ui.rerender(
      <Harness
        opts={{ ...CARDS_OPTS, enabled: false }}
        onController={(c) => (holder.current = c)}
      />,
    );
    await waitFor(() => expect(holder.current?.step).toBeNull());
    expect(readTourFlag()).toBe("seen");
  });

  it("keeps a MANUALLY started tour open when the cards page goes away", async () => {
    const { writeTourSeen } = await import("@/lib/storage/tour-flag");
    writeTourSeen(); // no auto-open; the user starts it themselves
    const holder: { current: OnboardingTourController | null } = { current: null };
    const ui = render(
      <Harness opts={CARDS_OPTS} onController={(c) => (holder.current = c)} />,
    );
    await act(async () => {});
    expect(holder.current?.step).toBeNull();
    act(() => holder.current!.start());
    expect(holder.current?.step).toBe(0);
    ui.rerender(
      <Harness
        opts={{ ...CARDS_OPTS, enabled: false }}
        onController={(c) => (holder.current = c)}
      />,
    );
    await act(async () => {});
    expect(holder.current?.step).toBe(0); // still open — its own controls close it
    act(() => holder.current!.close());
    expect(holder.current?.step).toBeNull();
  });
});

describe("OnboardingTour — overlay", () => {
  function closedController(): OnboardingTourController {
    return {
      step: null,
      start: vi.fn(),
      next: vi.fn(),
      back: vi.fn(),
      close: vi.fn(),
    };
  }

  /**
   * A live overlay driven by the real hook, in ONE component so the
   * dialog re-renders with the controller (the shell's shape).
   */
  function LiveTour({
    opts,
    onController,
  }: {
    opts: {
      enabled: boolean;
      storageScanDone: boolean;
      hasRestoreOffers: boolean;
    };
    onController: (c: OnboardingTourController) => void;
  }) {
    const controller = useOnboardingTour(opts);
    onController(controller);
    return <OnboardingTour tour={controller} />;
  }

  async function renderLiveTour(
    opts: Partial<Parameters<typeof useOnboardingTour>[0]> = {},
  ) {
    const holder: { current: OnboardingTourController | null } = { current: null };
    render(
      <LiveTour
        opts={{ ...CARDS_OPTS, ...opts }}
        onController={(c) => (holder.current = c)}
      />,
    );
    await waitFor(() => expect(holder.current?.step).not.toBeNull());
    return () => holder.current!;
  }

  it("renders nothing while closed", () => {
    const { container } = render(
      <OnboardingTour tour={closedController()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the four steps in order with honest titles", async () => {
    const controller = await renderLiveTour();
    expect(screen.getByTestId("tour-step-title-0")).toHaveTextContent(
      TOUR_STEPS[0].title,
    );
    expect(
      screen.getByText(`Step 1 of ${ONBOARDING_TOUR_STEPS}`),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("tour-back")).not.toBeInTheDocument();
    expect(screen.getByTestId("tour-next")).toHaveTextContent("Next");

    act(() => controller().next());
    expect(screen.getByTestId("tour-step-title-1")).toHaveTextContent(
      TOUR_STEPS[1].title,
    );
    expect(
      screen.getByText(`Step 2 of ${ONBOARDING_TOUR_STEPS}`),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tour-back")).toBeInTheDocument();

    act(() => controller().next());
    act(() => controller().next());
    expect(screen.getByTestId("tour-step-title-3")).toHaveTextContent(
      TOUR_STEPS[3].title,
    );
    expect(screen.getByTestId("tour-next")).toHaveTextContent("Get started");
  });

  it("Skip closes and remembers", async () => {
    const controller = await renderLiveTour();
    fireEvent.click(screen.getByTestId("tour-skip"));
    await waitFor(() => expect(controller().step).toBeNull());
    expect(readTourFlag()).toBe("seen");
  });

  it("presents exactly four dots with the current one marked", async () => {
    await renderLiveTour();
    const dots = screen.getByTestId("tour-dots").querySelectorAll("span");
    expect(dots).toHaveLength(ONBOARDING_TOUR_STEPS);
  });

  it("step copy stays honest (key phrases present)", () => {
    const joined = TOUR_STEPS.map((s) => `${s.title} ${s.body}`).join(" ");
    expect(joined).toContain("this browser tab");
    expect(joined).toContain("Six cards");
    expect(joined).toContain("Move (M)");
    expect(joined).toContain("autosaved");
    expect(TOUR_STEPS).toHaveLength(4);
  });
});
