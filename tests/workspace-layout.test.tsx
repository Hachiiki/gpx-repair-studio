// @vitest-environment jsdom
/**
 * React Testing Library — the QoL workspace pieces:
 *
 *   - WorkspaceLayout: the two-section structure (map+tools, then
 *     details), its anchor ids, and the scroll-cue navigation;
 *   - HintTip: the delayed use-case tooltip wrapper (trigger passthrough,
 *     content hidden until opened);
 *   - RevealOnScroll: the CSS-only scroll-reveal wrapper.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { HintTip } from "@/components/shared/hint-tip";
import { RevealOnScroll } from "@/components/shared/reveal-on-scroll";

afterEach(() => cleanup());

describe("WorkspaceLayout", () => {
  function setup() {
    render(
      <WorkspaceLayout
        map={<div data-testid="slot-map" />}
        tools={<div data-testid="slot-tools" />}
        details={<div data-testid="slot-details" />}
      />,
    );
  }

  it("renders the repair section with map and sticky tools panel", () => {
    setup();
    const section = screen.getByTestId("repair-section");
    expect(section).toHaveAttribute("id", "repair");
    expect(screen.getByTestId("slot-map")).toBeInTheDocument();
    const tools = screen.getByTestId("tools-panel");
    expect(tools).toBeInTheDocument();
    expect(screen.getByTestId("slot-tools")).toBeInTheDocument();
  });

  it("renders the details section with a heading and slots", () => {
    setup();
    const section = screen.getByTestId("details-section");
    expect(section).toHaveAttribute("id", "details");
    expect(screen.getByTestId("slot-details")).toBeInTheDocument();
    expect(section).toHaveTextContent("Statistics");
  });

  it("links the scroll cue down to details and back up to the map", () => {
    setup();
    expect(screen.getByTestId("scroll-cue")).toHaveAttribute(
      "href",
      "#details",
    );
    expect(screen.getByTestId("back-to-map-link")).toHaveAttribute(
      "href",
      "#repair",
    );
  });
});

describe("HintTip", () => {
  it("renders the wrapped trigger; the use-case card starts closed", () => {
    render(
      <HintTip title="Draw mode" description="Click to add points." kbd="D">
        <button type="button" data-testid="hint-trigger">
          Draw
        </button>
      </HintTip>,
    );
    expect(screen.getByTestId("hint-trigger")).toBeInTheDocument();
    // Radix portals content only when open — nothing lingers in the DOM.
    expect(screen.queryByTestId("hint-tip")).toBeNull();
  });
});

describe("RevealOnScroll", () => {
  it("wraps children with the CSS reveal class (content always rendered)", () => {
    render(
      <RevealOnScroll>
        <p data-testid="reveal-child">Details</p>
      </RevealOnScroll>,
    );
    const wrapper = screen.getByTestId("reveal-on-scroll");
    expect(wrapper).toHaveClass("reveal-on-scroll");
    expect(screen.getByTestId("reveal-child")).toBeInTheDocument();
  });
});
