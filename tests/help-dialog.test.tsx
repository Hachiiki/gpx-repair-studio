// @vitest-environment jsdom
/**
 * Phase 12 — the Shortcuts & help dialog + the theme toggle + the
 * footer's new doors. Focus return is the Dialog primitive's job
 * (pinned by its own tests); here we pin content, open/close intents,
 * and the toggle's pressed-state semantics.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpDialog } from "@/components/layout/help-dialog";
import { SHORTCUT_GROUPS } from "@/components/layout/help-content";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SiteFooter } from "@/components/layout/site-footer";
import { setThemePreference } from "@/state/theme-store";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  setThemePreference("system");
});

describe("HelpContent / SHORTCUT_GROUPS (the keyboard map contract)", () => {
  it("documents the shipped bindings: ?, Esc, D, M, P, C", () => {
    const all = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);
    for (const key of ["?", "Esc", "D", "M", "P", "C"]) {
      expect(
        all.some((shortcut) => shortcut.keys.includes(key)),
        `shortcut ${key} must stay documented (it is bound in the app)`,
      ).toBe(true);
    }
  });

  it("renders the groups and the where-everything-lives guide", () => {
    render(<HelpDialog open onClose={vi.fn()} />);
    expect(screen.getByTestId("help-dialog")).toBeInTheDocument();
    for (const group of SHORTCUT_GROUPS) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
    }
    expect(screen.getByText(/seven tool cards/i)).toBeInTheDocument();
  });
});

describe("HelpDialog", () => {
  it("renders nothing while closed", () => {
    render(<HelpDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId("help-dialog")).not.toBeInTheDocument();
  });

  it("signals close from its own affordances", () => {
    const onClose = vi.fn();
    render(<HelpDialog open onClose={onClose} />);
    // The Dialog primitive's close button (aria-label from the primitive).
    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("names the ? key as the way back in", () => {
    render(<HelpDialog open onClose={vi.fn()} />);
    expect(screen.getByText(/to reopen this/i)).toBeInTheDocument();
    expect(
      screen
        .getAllByText(/\?/)
        .some((node) => node.tagName === "KBD" || node.textContent === "?"),
    ).toBe(true);
  });
});

describe("ThemeToggle", () => {
  it("offers system, light, and dark with pressed-state semantics", () => {
    render(<ThemeToggle />);
    const system = screen.getByTestId("theme-toggle-system");
    const light = screen.getByTestId("theme-toggle-light");
    const dark = screen.getByTestId("theme-toggle-dark");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "role",
      "group",
    );
    expect(system).toHaveAttribute("aria-pressed", "true"); // default
    expect(light).toHaveAttribute("aria-pressed", "false");
    expect(dark).toHaveAttribute("aria-pressed", "false");
  });

  it("persists the choice and moves the pressed state", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId("theme-toggle-dark"));
    expect(window.localStorage.getItem("gpx-repair-studio.theme.v1")).toBe(
      "dark",
    );
    expect(screen.getByTestId("theme-toggle-dark")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("SiteFooter (Phase 12 doors)", () => {
  it("carries the theme toggle and the shortcuts & help door", () => {
    render(
        <SiteFooter
          onOpenInfo={vi.fn()}
          onOpenHelp={vi.fn()}
          routerConsent="unknown"
          routerHostsLabel="router.project-osrm.org"
          onOpenRouterConsent={vi.fn()}
        />,
      );
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("footer-help")).toBeInTheDocument();
  });

  it("dispatches the help intent", () => {
    const onOpenHelp = vi.fn();
    render(
        <SiteFooter
          onOpenInfo={vi.fn()}
          onOpenHelp={onOpenHelp}
          routerConsent="unknown"
          routerHostsLabel="router.project-osrm.org"
          onOpenRouterConsent={vi.fn()}
        />,
      );
    fireEvent.click(screen.getByTestId("footer-help"));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });
});
