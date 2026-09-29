// @vitest-environment jsdom
/**
 * React Testing Library — WorkspaceToolsColumn (Phase 8).
 *
 *   - desktop (matchMedia ≥1024 true, or absent — the jsdom/SSR
 *     fallback): the classic sticky aside, no sheet;
 *   - mobile: the bottom sheet — the content container carries the
 *     SAME testid/label the aside used (the Task-49 reveal effect and
 *     the e2e contract keep working), the grab bar toggles with an
 *     honest aria-expanded, a ≥28 px drag toggles without the
 *     trailing click double-firing;
 *   - `defaultExpanded` studios (create/plan) start open;
 *   - the Task-49 reveal event expands the sheet;
 *   - the sheet hides when its section leaves the viewport.
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOOLS_REVEAL_EVENT,
  WorkspaceToolsColumn,
} from "@/components/layout/workspace-tools-column";

function mockMediaQuery(matches: boolean) {
  return vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

let matchMediaMock: ReturnType<typeof mockMediaQuery>;

beforeEach(() => {
  matchMediaMock = mockMediaQuery(false);
  vi.stubGlobal("matchMedia", matchMediaMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderColumn(props?: { defaultExpanded?: boolean }) {
  return render(
    <section aria-label="workspace">
      <WorkspaceToolsColumn
        testid="tools-panel"
        label="Repair tools"
        {...props}
      >
        <div data-testid="tool-card">A tool card</div>
      </WorkspaceToolsColumn>
    </section>,
  );
}

describe("WorkspaceToolsColumn — desktop", () => {
  it("renders the sticky aside with the column testid and label", () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    renderColumn();
    const aside = screen.getByTestId("tools-panel");
    expect(aside.tagName).toBe("ASIDE");
    expect(aside).toHaveAttribute("aria-label", "Repair tools");
    expect(screen.getByTestId("tool-card")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-tools-sheet")).toBeNull();
  });

  it("falls back to the desktop aside when matchMedia is unavailable", () => {
    vi.unstubAllGlobals();
    renderColumn();
    expect(screen.getByTestId("tools-panel").tagName).toBe("ASIDE");
  });
});

describe("WorkspaceToolsColumn — mobile sheet", () => {
  it("renders the sheet and the content container carries the column testid", () => {
    renderColumn();
    expect(screen.queryByText("A tool card")).toBeInTheDocument();
    const sheet = screen.getByTestId("mobile-tools-sheet");
    expect(sheet).toBeInTheDocument();
    // The scroll container keeps the aside's contract.
    const content = screen.getByTestId("tools-panel");
    expect(content).toHaveAttribute("role", "region");
    expect(content).toHaveAttribute("aria-label", "Repair tools");
    // The bar is the toggle with an honest state.
    const bar = screen.getByTestId("mobile-tools-toggle");
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(bar).toHaveTextContent("Repair tools");
  });

  it("toggles expanded on bar clicks (and back)", () => {
    renderColumn();
    const bar = screen.getByTestId("mobile-tools-toggle");
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "false");
  });

  it("starts expanded for defaultExpanded studios", () => {
    renderColumn({ defaultExpanded: true });
    expect(screen.getByTestId("mobile-tools-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("a drag past the threshold toggles once — no trailing-click double fire", () => {
    renderColumn();
    const bar = screen.getByTestId("mobile-tools-toggle");
    fireEvent.pointerDown(bar, { clientY: 300, pointerType: "touch" });
    fireEvent.pointerMove(bar, { clientY: 260, pointerType: "touch" }); // -40px
    fireEvent.pointerUp(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    // The browser follows the drag with a click on the bar button —
    // consumed by the drag, not a second toggle.
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    // A later plain click still toggles.
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "false");
  });

  it("a small drag does not toggle; the release click does", () => {
    renderColumn();
    const bar = screen.getByTestId("mobile-tools-toggle");
    fireEvent.pointerDown(bar, { clientY: 300, pointerType: "touch" });
    fireEvent.pointerMove(bar, { clientY: 292, pointerType: "touch" }); // 8px
    fireEvent.pointerUp(bar);
    expect(bar).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
  });

  it("expands on the Task-49 reveal event", () => {
    renderColumn();
    fireEvent(window, new CustomEvent(TOOLS_REVEAL_EVENT));
    expect(screen.getByTestId("mobile-tools-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("hides while its section is off screen and returns with it", () => {
    const observers: {
      callback: IntersectionObserverCallback;
      observe: (el: Element) => void;
    }[] = [];
    class IO {
      constructor(callback: IntersectionObserverCallback) {
        observers.push({
          callback,
          observe: vi.fn(),
        });
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal("IntersectionObserver", IO);

    renderColumn();
    const sheet = screen.getByTestId("mobile-tools-sheet");
    expect(sheet).not.toHaveAttribute("hidden");

    // Scroll into the details section: the map section leaves view.
    const [observer] = observers;
    act_ratios(observer.callback, [{ intersectionRatio: 0 }]);
    expect(sheet).toHaveAttribute("hidden");

    // Scrolling back re-shows it (still collapsed or expanded — the
    // user's last choice survives).
    act_ratios(observer.callback, [{ intersectionRatio: 0.8 }]);
    expect(sheet).not.toHaveAttribute("hidden");
  });
});

function act_ratios(
  callback: IntersectionObserverCallback,
  entries: { intersectionRatio: number }[],
) {
  act(() => {
    callback(
      entries as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
  });
}
