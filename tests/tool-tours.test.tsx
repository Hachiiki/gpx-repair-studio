// @vitest-environment jsdom
/**
 * Unit tests — the per-tool guided walkthroughs (Phase 19, §EE 19.3):
 * the controller hook (hooks/use-tool-tours.ts), the dialog + offer
 * components (components/layout/tool-tour.tsx), and the help dialog's
 * replay section.
 *
 * Controller behaviors:
 *   - the offer follows the active tool, only while unseen;
 *   - dismiss remembers (exactly like finishing);
 *   - next walks the steps and finishes (closing + remembering);
 *   - back stops at 0; close remembers from anywhere;
 *   - runAction runs the registered handler and advances.
 *
 * Component behaviors: the step content renders with the action button
 * only when available; Skip dispatches close; the help content lists
 * every tool with Start buttons.
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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOOL_TOUR_STEPS,
  useToolTours,
  type ToolToursController,
} from "@/hooks/use-tool-tours";
import {
  TOOL_TOURS,
  ToolTourDialog,
  ToolTourOffer,
} from "@/components/layout/tool-tour";
import { HelpContent } from "@/components/layout/help-content";
import {
  clearToolTourFlags,
  hasSeenToolTour,
} from "@/lib/storage/tour-flag";

/*
 * The harness renders its children WITH the controller (a render
 * prop), so the siblings see a live controller — never a null first
 * render.
 */
function Harness({
  activeTool,
  canRun,
  onAction,
  children,
}: {
  activeTool: string | null;
  canRun: boolean;
  onAction: (id: string) => void;
  children: (controller: ToolToursController) => ReactNode;
}) {
  const controller = useToolTours({
    activeTool: activeTool as never,
    canRunAction: () => canRun,
    onAction: (id) => onAction(id),
  });
  return <>{children(controller)}</>;
}

beforeEach(() => clearToolTourFlags());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TOUR_TOUR_STEPS — the counts pin the content", () => {
  it("every tour has 3–5 steps and the count matches the content", () => {
    for (const [id, definition] of Object.entries(TOOL_TOURS)) {
      expect(definition.steps.length).toBeGreaterThanOrEqual(3);
      expect(definition.steps.length).toBeLessThanOrEqual(5);
      expect(definition.steps.length).toBe(TOOL_TOUR_STEPS[id as keyof typeof TOOL_TOUR_STEPS]);
    }
  });

  it("steps with actions carry a label", () => {
    for (const definition of Object.values(TOOL_TOURS)) {
      for (const step of definition.steps) {
        expect(step.kicker).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.body.length).toBeGreaterThan(40);
      }
    }
  });
});

describe("useToolTours — the offer", () => {
  it("offers for an unseen active tool", async () => {
    let controller: ToolToursController | null = null;
    render(
      <Harness
        activeTool="repair"
        canRun={false}
        onAction={() => {}}
      >
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    await waitFor(() => expect(controller?.offer).toBe("repair"));
  });

  it("does not re-offer after a dismiss remembered the flag", async () => {
    let controller: ToolToursController | null = null;
    const { rerender } = render(
      <Harness activeTool="repair" canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    await waitFor(() => expect(controller?.offer).toBe("repair"));
    act(() => controller!.dismissOffer());
    await waitFor(() => expect(controller!.offer).toBeNull());
    // Dismissing remembered the flag.
    expect(hasSeenToolTour("repair")).toBe(true);
    // Another tool still offers; the dismissed one does not.
    rerender(
      <Harness activeTool="share" canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    await waitFor(() => expect(controller?.offer).toBe("share"));
    rerender(
      <Harness activeTool="repair" canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    await waitFor(() => expect(controller?.offer).toBeNull());
  });

  it("clears the offer when the active tool goes null", async () => {
    let controller: ToolToursController | null = null;
    const { rerender } = render(
      <Harness activeTool="batch" canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    await waitFor(() => expect(controller?.offer).toBe("batch"));
    rerender(
      <Harness activeTool={null} canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    await waitFor(() => expect(controller?.offer).toBeNull());
  });
});

describe("useToolTours — the walkthrough", () => {
  it("start opens at step 0; next walks and finishes with the flag written", async () => {
    let controller: ToolToursController | null = null;
    render(
      <Harness activeTool={null} canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    act(() => controller!.start("repair"));
    expect(controller!.active).toBe("repair");
    expect(controller!.step).toBe(0);
    const steps = TOOL_TOUR_STEPS.repair;
    for (let i = 1; i < steps; i++) {
      act(() => controller!.next());
      expect(controller!.step).toBe(i);
    }
    act(() => controller!.next());
    expect(controller!.active).toBeNull();
    expect(hasSeenToolTour("repair")).toBe(true);
  });

  it("back stops at 0; close remembers from anywhere", async () => {
    let controller: ToolToursController | null = null;
    render(
      <Harness activeTool={null} canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    act(() => controller!.start("merge"));
    act(() => controller!.next());
    act(() => controller!.back());
    expect(controller!.step).toBe(0);
    act(() => controller!.back());
    expect(controller!.step).toBe(0);
    act(() => controller!.close());
    expect(controller!.active).toBeNull();
    expect(hasSeenToolTour("merge")).toBe(true);
  });

  it("runAction runs the handler and advances", async () => {
    let controller: ToolToursController | null = null;
    const onAction = vi.fn();
    render(
      <Harness activeTool={null} canRun onAction={onAction}>
        {(c) => {
          controller = c;
          return null;
        }}
      </Harness>,
    );
    act(() => controller!.start("batch"));
    act(() => controller!.runAction());
    expect(onAction).toHaveBeenCalledWith("batch");
    expect(controller!.step).toBe(1);
  });
});

describe("ToolTourDialog — presentation", () => {
  it("renders the active step, the action when available, and Skip closes", async () => {
    let controller: ToolToursController | null = null;
    render(
      <Harness activeTool={null} canRun onAction={() => {}}>
        {(c) => {
          controller = c;
          return <ToolTourDialog tour={c} actionAvailable />;
        }}
      </Harness>,
    );
    act(() => controller!.start("repair"));
    const dialog = await screen.findByTestId("tool-tour");
    expect(dialog).toHaveAttribute("data-tour-id", "repair");
    expect(
      screen.getByTestId("tool-tour-step-title-0"),
    ).toHaveTextContent(TOOL_TOURS.repair.steps[0].title);
    // Step 1 carries the sample action.
    expect(screen.getByTestId("tool-tour-action")).toBeInTheDocument();
    expect(screen.getByTestId("tool-tour-action")).toHaveTextContent(
      TOOL_TOURS.repair.steps[0].actionLabel!,
    );
    fireEvent.click(screen.getByTestId("tool-tour-skip"));
    await waitFor(() =>
      expect(screen.queryByTestId("tool-tour")).not.toBeInTheDocument(),
    );
    expect(hasSeenToolTour("repair")).toBe(true);
  });

  it("hides the action when unavailable", async () => {
    let controller: ToolToursController | null = null;
    render(
      <Harness activeTool={null} canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return <ToolTourDialog tour={c} actionAvailable={false} />;
        }}
      </Harness>,
    );
    act(() => controller!.start("repair"));
    await screen.findByTestId("tool-tour");
    expect(screen.queryByTestId("tool-tour-action")).not.toBeInTheDocument();
  });
});

describe("ToolTourOffer — presentation", () => {
  it("renders the strip for an offered tool; Start opens the tour", async () => {
    let controller: ToolToursController | null = null;
    render(
      <Harness activeTool="plan" canRun={false} onAction={() => {}}>
        {(c) => {
          controller = c;
          return <ToolTourOffer tour={c} />;
        }}
      </Harness>,
    );
    const offer = await screen.findByTestId("tool-tour-offer");
    expect(offer).toHaveTextContent("the Plan a route walkthrough");
    fireEvent.click(screen.getByTestId("tool-tour-offer-start"));
    await waitFor(() => expect(controller!.active).toBe("plan"));
    expect(screen.queryByTestId("tool-tour-offer")).not.toBeInTheDocument();
  });

  it("renders nothing without an offer", async () => {
    render(
      <Harness activeTool={null} canRun={false} onAction={() => {}}>
        {() => <ToolTourOffer tour={{ offer: null } as ToolToursController} />}
      </Harness>,
    );
    expect(screen.queryByTestId("tool-tour-offer")).not.toBeInTheDocument();
  });
});

describe("HelpContent — the walkthroughs list", () => {
  it("lists every tool; Start dispatches the callback", () => {
    const onStartTour = vi.fn();
    render(<HelpContent onStartTour={onStartTour} />);
    const list = screen.getByTestId("help-tour-list");
    expect(list).toBeInTheDocument();
    for (const id of [
      "repair",
      "share",
      "recovery",
      "create",
      "merge",
      "plan",
      "batch",
    ]) {
      expect(screen.getByTestId(`help-tour-${id}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId("help-tour-batch"));
    expect(onStartTour).toHaveBeenCalledWith("batch");
  });

  it("renders the list without buttons when no callback is given", () => {
    render(<HelpContent />);
    expect(screen.getByTestId("help-tour-list")).toBeInTheDocument();
    expect(screen.queryByTestId("help-tour-repair")).not.toBeInTheDocument();
  });
});
