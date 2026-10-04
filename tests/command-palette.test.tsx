// @vitest-environment jsdom

/*
 * cmdk observes its list's size (jsdom ships no ResizeObserver — the
 * same stub the map components would need in this environment).
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver =
  globalThis.ResizeObserver ?? (ResizeObserverStub as never);
// jsdom ships no scrollIntoView either (cmdk centers the highlighted
// option); a no-op is all the palette needs here.
Element.prototype.scrollIntoView =
  Element.prototype.scrollIntoView ?? (() => undefined);
/**
 * CommandPalette (Phase 20 — §EE 20.2) — the component's contract.
 *
 *   - opens with the groups in registry order; a query switches to the
 *     flat relevance-ordered results and clears honestly to nothing;
 *   - Enter runs the highlighted command and closes; a session row
 *     restores through the one restore path;
 *   - the a11y surface: a dialog with a searchable input, listbox
 *     options with aria-selected, and the keycap hints;
 *   - a fresh open resets the search.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CommandPalette } from "@/components/layout/command-palette";
import { COMMANDS, filterCommands } from "@/features/commands/registry";
import { translatorFor } from "@/i18n/runtime";

const t = translatorFor("en");
import type { BoundCommand } from "@/hooks/use-commands";
import type { SavedSessionRow } from "@/hooks/use-saved-sessions";
import type { CommandContext } from "@/features/commands/registry";

const LANDING: CommandContext = {
  section: null,
  landingToolPage: false,
  editing: false,
  hasSavedSessions: true,
};

function makeCommands(context: CommandContext): BoundCommand[] {
  return COMMANDS.flatMap((def) => {
    if (def.palette === false) return [];
    if (def.when && !def.when(context)) return [];
    return [{ def, run: vi.fn() }];
  });
}

function makeFilter(context: CommandContext) {
  return (query: string) => {
    const ids = new Set(
      filterCommands(COMMANDS, query, context, t).map((def) => def.id),
    );
    return COMMANDS.filter((def) => ids.has(def.id)).map((def) => ({
      def,
      run: vi.fn(),
    })) as BoundCommand[];
  };
}

/*
 * Availability must gate the GROUPED (no-query) view too: a studio
 * context hides the landing-only navigate commands even before any
 * typing.
 */

const sessionRow = (id: string, name: string): SavedSessionRow =>
  ({
    id,
    name,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    section: "plan",
    record: {},
  }) as unknown as SavedSessionRow;

function renderPalette(
  props: Partial<Parameters<typeof CommandPalette>[0]> = {},
  context: CommandContext = LANDING,
) {
  const commands = makeCommands(context);
  const onRestore = vi.fn();
  const allProps = {
    open: true,
    onOpenChange: vi.fn(),
    filter: makeFilter(context),
    sessions: [
      { row: sessionRow("s1", "Morning sketch"), onRestore },
      { row: sessionRow("s2", "Ride repair"), onRestore },
    ],
    ...props,
  };
  const utils = render(<CommandPalette {...allProps} />);
  return { ...utils, onRestore, onOpenChange: allProps.onOpenChange };
}

afterEach(() => cleanup());

describe("CommandPalette", () => {
  it("opens with the groups in registry order and the session shelf", () => {
    renderPalette();
    const palette = screen.getByTestId("command-palette");
    expect(palette).toBeInTheDocument();
    // The seven tools' front doors, on the landing.
    expect(
      screen.getByTestId("command-palette-item-open-plan"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("command-palette-item-open-repair"),
    ).toBeInTheDocument();
    // The recent sessions group renders its rows.
    expect(
      screen.getByTestId("command-palette-session-s1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Morning sketch")).toBeInTheDocument();
    // The input carries the combobox semantics.
    expect(screen.getByTestId("command-palette-input")).toHaveAttribute(
      "type",
      "text",
    );
  });

  it("a query filters to relevance-ordered results; nonsense clears honestly", async () => {
    renderPalette();
    fireEvent.change(screen.getByTestId("command-palette-input"), {
      target: { value: "plan" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("command-palette-item-open-plan")).toBeVisible();
    });
    // The navigate group's other tools are filtered out of the results.
    expect(
      screen.queryByTestId("command-palette-item-open-merge"),
    ).not.toBeInTheDocument();
    // A session that does not match the query is hidden.
    expect(screen.queryByText("Ride repair")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("command-palette-input"), {
      target: { value: "zzzz" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("command-palette-empty")).toBeVisible();
    });
  });

  it("Enter runs the highlighted command and closes the palette", async () => {
    const { onOpenChange } = renderPalette();
    fireEvent.change(screen.getByTestId("command-palette-input"), {
      target: { value: "shortcuts" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("command-palette-item-open-help")).toBeVisible();
    });
    fireEvent.keyDown(screen.getByTestId("command-palette-input"), {
      key: "Enter",
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("selecting a session row restores through the one restore path", () => {
    const { onRestore, onOpenChange } = renderPalette();
    fireEvent.click(screen.getByTestId("command-palette-session-s2"));
    expect(onRestore).toHaveBeenCalledWith("s2");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the listbox options expose selection semantics", async () => {
    renderPalette();
    const list = screen.getByTestId("command-palette-list");
    expect(list).toHaveAttribute("role", "listbox");
    // cmdk marks the highlighted option aria-selected.
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(5);
    await waitFor(() => {
      const selected = screen
        .getAllByRole("option")
        .filter((option) => option.getAttribute("aria-selected") === "true");
      expect(selected.length).toBeGreaterThan(0);
    });
  });

  it("a fresh open resets the search", () => {
    const { rerender } = renderPalette();
    fireEvent.change(screen.getByTestId("command-palette-input"), {
      target: { value: "plan" },
    });
    expect(screen.getByTestId("command-palette-input")).toHaveValue("plan");
    // Close and reopen through the props (the shell's real flow).
    rerender(
      <CommandPalette
        open={false}
        onOpenChange={vi.fn()}
        filter={makeFilter(LANDING)}
        sessions={[]}
      />,
    );
    rerender(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        filter={makeFilter(LANDING)}
        sessions={[]}
      />,
    );
    expect(screen.getByTestId("command-palette-input")).toHaveValue("");
  });

  it("editing commands appear only when an editor session is live (grouped AND filtered views)", () => {
    const studioContext: CommandContext = {
      section: "plan",
      landingToolPage: false,
      editing: true,
      hasSavedSessions: false,
    };
    renderPalette({ sessions: [] }, studioContext);
    expect(screen.getByTestId("command-palette-item-editor-undo")).toBeVisible();
    // The landing-only navigate commands are gone — in the grouped
    // (no-query) view…
    expect(
      screen.queryByTestId("command-palette-item-open-plan"),
    ).not.toBeInTheDocument();
    // …and in the filtered (searching) view.
    fireEvent.change(screen.getByTestId("command-palette-input"), {
      target: { value: "plan" },
    });
    expect(
      screen.queryByTestId("command-palette-item-open-plan"),
    ).not.toBeInTheDocument();
  });
});
