// @vitest-environment jsdom
/**
 * React Testing Library — the landing's two pages (Task 42) and the
 * loading state:
 *
 *   - SessionIdleView (view "tool"): one tool's detail page — hero,
 *     intake, the error-retry path (alert above the hero, zone still
 *     available), the three-step workflow teaching section, the fact
 *     strip, and the "All tools" way back;
 *   - SessionIdleView (view "home"): the tool cards — four doors with
 *     illustrations, the open intent, and the focus-return trip;
 *   - SessionLoadingView: a polite live region that announces the
 *     parsing state with the file name (the a11y fix of this pass).
 *
 * Pure presentation — props in, no store wiring needed.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionIdleView,
  SessionLoadingView,
} from "@/components/layout/session-views";
import type { SessionError } from "@/state/session-store";
import { useMergeStore } from "@/state/merge-store";
import type { LandingMode } from "@/state/ui-store";

afterEach(() => cleanup());

const error: SessionError = {
  title: "Not a GPX file",
  detail: "The root element was <rss>, not <gpx>.",
};

/** Default idle-view props (the repair tool page — the default door). */
const IDLE_PROPS = {
  error: null as SessionError | null,
  onFile: () => {},
  onOpenTool: (_mode: LandingMode) => {},
  onBackToCards: () => {},
  onCreateBegin: (_stats: { distanceM: number }) => {},
  onPlanBegin: () => {},
  createStats: null,
  paceUnit: "km" as const,
  onPaceUnitChange: (_unit: "km" | "mi") => {},
};

function renderIdle(
  overrides: Partial<Parameters<typeof SessionIdleView>[0]> = {},
) {
  const props = {
    ...IDLE_PROPS,
    mode: "repair" as const,
    view: "tool" as const,
    ...overrides,
  };
  return render(<SessionIdleView {...props} />);
}

describe("SessionIdleView — tool detail page", () => {
  it("renders the hero heading and the upload zone", () => {
    renderIdle();

    expect(
      screen.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    expect(screen.queryByTestId("session-error")).toBeNull();
  });


  it("Phase 12: offers the tool's sample when the intent is provided", () => {
    const onTrySample = vi.fn();
    renderIdle({ onTrySample, sampleLabel: "a sample ride" });

    const link = screen.getByTestId("try-sample");
    expect(link).toHaveTextContent(/sample ride/i);
    fireEvent.click(link);
    expect(onTrySample).toHaveBeenCalledTimes(1);
  });

  it("Phase 12: shows no sample link on tool pages without the intent", () => {
    renderIdle();
    expect(screen.queryByTestId("try-sample")).toBeNull();
  });

  it("surfaces a failed load above the hero, keeping the zone for retry", () => {
    renderIdle({ error });

    const alert = screen.getByTestId("session-error");
    expect(alert).toHaveTextContent("Not a GPX file");
    // The intake stays available — an error is a retry, not a dead end.
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();
  });

  it("teaches the three workflow steps under a 'How it works' heading", () => {
    renderIdle();

    expect(
      screen.getByRole("heading", { name: "How it works" }),
    ).toBeVisible();
    const steps = screen.getByTestId("workflow-steps");
    expect(steps).toHaveTextContent("Inspect");
    expect(steps).toHaveTextContent("Repair");
    expect(steps).toHaveTextContent("Honest by default");
    // Three list items — the pipeline is a list, not a suggestion.
    expect(steps.querySelectorAll("li")).toHaveLength(3);
  });

  it("hands the chosen file to the onFile intent", () => {
    const files: File[] = [];
    renderIdle({ onFile: (f) => files.push(f) });

    const file = new File(["<gpx/>"], "run.gpx", { type: "application/gpx+xml" });
    fireEvent.drop(screen.getByTestId("upload-zone"), {
      dataTransfer: { files: [file] },
    });

    expect(files).toEqual([file]);
  });

  it("carries the tool's fact strip: input, output, and best for", () => {
    renderIdle();

    const facts = screen.getByTestId("tool-facts");
    expect(facts).toHaveTextContent("Input");
    expect(facts).toHaveTextContent("Output");
    expect(facts).toHaveTextContent("Best for");
    // Concrete contract, not filler — the repair tool's facts.
    expect(facts).toHaveTextContent("Any GPX 1.0 or 1.1 activity file");
    expect(facts).toHaveTextContent("every reconstructed point marked");
  });

  it("offers the way back to the cards and dispatches the intent", () => {
    const backs: number[] = [];
    renderIdle({ onBackToCards: () => backs.push(1) });

    const back = screen.getByTestId("landing-back-to-cards");
    expect(back).toBeVisible();
    expect(back).toHaveTextContent("All tools");

    fireEvent.click(back);
    expect(backs).toHaveLength(1);
    // Controlled view — the parent decides what renders next.
    expect(
      screen.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();
  });

  it("focuses the hero heading on mount — the page-turn announcement", () => {
    renderIdle();

    const heading = screen.getByRole("heading", {
      name: "Repair incomplete GPS recordings",
    });
    expect(heading).toHaveFocus();
  });
});

describe("SessionIdleView — tool pages (Task 20 + 26 + 42)", () => {
  it("teaches the share-card workflow on the share tool page", () => {
    renderIdle({ mode: "share" });

    expect(
      screen.getByRole("heading", { name: "Create a share card from your GPX" }),
    ).toBeVisible();
    const steps = screen.getByTestId("workflow-steps");
    expect(steps).toHaveTextContent("Upload any GPX");
    expect(steps).toHaveTextContent("See the card");
    expect(steps).toHaveTextContent("Download as PNG");
    expect(steps.querySelectorAll("li")).toHaveLength(3);
    // The upload zone stays the one and only intake.
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    // The fact strip promises the transparent export.
    expect(screen.getByTestId("tool-facts")).toHaveTextContent(
      "1080×1920 transparent PNG",
    );
  });

  it("teaches the gap-recovery workflow on the recovery tool page", () => {
    renderIdle({ mode: "recovery" });

    expect(
      screen.getByRole("heading", { name: "Recover a missing GPS section" }),
    ).toBeVisible();
    const steps = screen.getByTestId("workflow-steps");
    expect(steps).toHaveTextContent("Detect the gap");
    expect(steps).toHaveTextContent("Draw the missing route");
    expect(steps).toHaveTextContent("Export the corrected file");
    expect(steps.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByTestId("upload-zone")).toBeVisible();
  });

  it("replaces the upload zone with the statistics form on the create tool page", () => {
    renderIdle({ mode: "create" });

    expect(
      screen.getByRole("heading", { name: "Create an activity from its stats" }),
    ).toBeVisible();
    const steps = screen.getByTestId("workflow-steps");
    expect(steps).toHaveTextContent("Enter your statistics");
    expect(steps).toHaveTextContent("Draw the route");
    expect(steps).toHaveTextContent("Export the GPX");
    expect(steps.querySelectorAll("li")).toHaveLength(3);
    // No file exists in this workflow — the statistics form is the intake.
    expect(screen.queryByTestId("upload-zone")).toBeNull();
    expect(screen.getByTestId("activity-stats-form")).toBeVisible();
  });

  it("teaches the merge workflow on the merge tool page (Task 43)", () => {
    // The intake self-wires to the merge store — start it clean.
    useMergeStore.getState().reset();
    renderIdle({ mode: "merge" });

    expect(
      screen.getByRole("heading", {
        name: "Combine GPX files into one route",
      }),
    ).toBeVisible();
    const steps = screen.getByTestId("workflow-steps");
    expect(steps).toHaveTextContent("Add your files");
    expect(steps).toHaveTextContent("Arrange the merge");
    expect(steps).toHaveTextContent("Download one GPX");
    expect(steps.querySelectorAll("li")).toHaveLength(3);
    // The multi-file intake replaces the single-file upload zone, and
    // its contract gate starts closed (nothing collected yet).
    expect(screen.queryByTestId("upload-zone")).toBeNull();
    expect(screen.getByTestId("merge-intake")).toBeVisible();
    expect(screen.getByTestId("merge-combine")).toBeDisabled();
    // The fact strip promises the single-track merge.
    expect(screen.getByTestId("tool-facts")).toHaveTextContent(
      "single track",
    );
    useMergeStore.getState().reset();
  });
});

describe("SessionIdleView — the tool cards home (Task 42)", () => {
  const CARD_MODES = [
    "repair",
    "share",
    "recovery",
    "create",
    "merge",
    "plan",
    "batch",
  ] as const;

  it("asks the opening question and offers all seven tools as tiles", () => {
    renderIdle({ view: "home" });

    expect(
      screen.getByRole("heading", { name: "What would you like to do?" }),
    ).toBeVisible();

    const grid = screen.getByTestId("landing-mode-toggle");
    const tiles = grid.querySelectorAll("button");
    expect(tiles).toHaveLength(7);
    for (const mode of CARD_MODES) {
      expect(screen.getByTestId(`landing-mode-${mode}`)).toBeVisible();
    }
    // The repair door carries its title (the tile is a button, the
    // title its accessible label).
    expect(screen.getByTestId("landing-mode-repair")).toHaveTextContent(
      "Repair a recording",
    );
    // Task 56: the compact-tile density — three columns from tablet up
    // (two rows instead of the old card grid's three)…
    expect(grid.className).toContain("md:grid-cols-[repeat(3");
    // …and one-line blurbs, because the tool page carries the full
    // teaching copy (the home only answers "which tool?").
    expect(screen.getByTestId("landing-mode-repair")).toHaveTextContent(
      "then draw the missing route yourself.",
    );
    expect(screen.getByTestId("landing-mode-plan")).not.toHaveTextContent(
      "A scratchpad: nothing is exported or shared",
    );
  });

  it("gives every tile an illustration with descriptive alt text", () => {
    renderIdle({ view: "home" });

    const grid = screen.getByTestId("landing-mode-toggle");
    const images = grid.querySelectorAll("img");
    expect(images).toHaveLength(7);
    for (const image of Array.from(images)) {
      expect(image.getAttribute("alt")).toBeTruthy();
      expect(image.getAttribute("src")).toMatch(/^\/cards\/\w+\.webp$/);
    }
    // Task 56: the plates stay, on the shorter 2:1 tile crop.
    const plates = grid.querySelectorAll("[class*='aspect-[2/1]']");
    expect(plates).toHaveLength(7);
  });

  it("dispatches the open intent when a tile is clicked", () => {
    const opened: string[] = [];
    renderIdle({ view: "home", onOpenTool: (mode) => opened.push(mode) });

    fireEvent.click(screen.getByTestId("landing-mode-recovery"));

    expect(opened).toEqual(["recovery"]);
    // Controlled view — the parent re-renders with view "tool".
    expect(screen.getByTestId("landing-mode-toggle")).toBeVisible();
  });

  it("returns focus to the tile that opened the tool page (the back trip)", () => {
    const opened: string[] = [];
    const backs: number[] = [];
    const view = render(
      <SessionIdleView
        {...IDLE_PROPS}
        mode="repair"
        view="home"
        onOpenTool={(mode) => opened.push(mode)}
        onBackToCards={() => backs.push(1)}
      />,
    );

    // Open the recovery card → the parent flips to the tool page.
    fireEvent.click(screen.getByTestId("landing-mode-recovery"));
    expect(opened).toEqual(["recovery"]);
    view.rerender(
      <SessionIdleView
        {...IDLE_PROPS}
        mode="recovery"
        view="tool"
        onOpenTool={(mode) => opened.push(mode)}
        onBackToCards={() => backs.push(1)}
      />,
    );
    // The page turn focused the new page's heading.
    expect(
      screen.getByRole("heading", { name: "Recover a missing GPS section" }),
    ).toHaveFocus();

    // Back to the cards → the recovery card receives focus.
    fireEvent.click(screen.getByTestId("landing-back-to-cards"));
    expect(backs).toHaveLength(1);
    view.rerender(
      <SessionIdleView
        {...IDLE_PROPS}
        mode="recovery"
        view="home"
        onOpenTool={(mode) => opened.push(mode)}
        onBackToCards={() => backs.push(1)}
      />,
    );
    expect(screen.getByTestId("landing-mode-recovery")).toHaveFocus();
  });
});

describe("SessionLoadingView", () => {
  it("politely announces the parsing state with the file name", () => {
    render(<SessionLoadingView fileName="morning-run.gpx" />);

    const status = screen.getByTestId("loading-state");
    // role="status" → polite live region: screen readers announce the
    // transition instead of staying silent through the parse.
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent("Parsing morning-run.gpx");
  });

  it("falls back to a generic label when the name is unknown", () => {
    render(<SessionLoadingView fileName={null} />);

    expect(screen.getByTestId("loading-state")).toHaveTextContent(
      "Parsing your file",
    );
  });
});
