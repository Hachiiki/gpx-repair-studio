/**
 * useCommands (Phase 20 — §EE 20.1/20.3) — the live binding between the
 * pure command registry and the app's actions.
 *
 * Owns nothing but the wiring: the registry says WHAT exists; this hook
 * says how each id RUNS right now (navigate the landing, set the theme,
 * open a dialog, route undo/redo to the editor whose session holds the
 * stage). The palette and the global shortcut layer both consume it —
 * one binding, two doors.
 *
 * The undo/redo routing (§EE 20.3's audit): Ctrl/Cmd+Z and
 * Ctrl/Cmd+Shift+Z / Ctrl+Y are the remaining major actions that had no
 * binding. They route to the ACTIVE editor store — repair, recovery,
 * create, or plan — and never fire while focus sits in a text field
 * (the shared contract: native undo in inputs always wins).
 *
 * Phase 20 — Command palette & shortcuts. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import {
  COMMAND_GROUP_LABELS,
  COMMANDS,
  cheatSheet,
  filterCommands,
  formatShortcut,
  matchesBinding,
  type CheatSheetGroup,
  type CommandContext,
  type CommandDef,
  type CommandGroupId,
  type ShortcutBinding,
} from "@/features/commands/registry";

/*
 * Component-facing facades (the ESLint boundary: components never
 * import feature internals — they reach the registry through this
 * hook module, the use-draw-editor re-export precedent).
 */

/**
 * The help dialog's keyboard map, generated from the registry — the
 * Phase 12 "only bindings that ship" contract, enforced by
 * construction.
 */
export function shortcutCheatSheet(): readonly CheatSheetGroup[] {
  return cheatSheet(COMMANDS);
}

/** The registry's fuzzy filter, for palette consumers. */
export function searchCommands(
  commands: readonly CommandDef[],
  query: string,
  context: CommandContext,
): readonly CommandDef[] {
  return filterCommands(commands, query, context);
}

/** The display form of a binding (keycap chips). */
export function displayShortcut(binding: ShortcutBinding): string {
  return formatShortcut(binding);
}

/** A command group's display label (the palette's group headings). */
export function commandGroupLabel(group: CommandGroupId): string {
  return COMMAND_GROUP_LABELS[group];
}

/** The registry's group vocabulary, for palette typing. */
export type { CommandGroupId } from "@/features/commands/registry";
import { setThemePreference } from "@/state/theme-store";
import { useUiStore } from "@/state/ui-store";
import { useEditorStore } from "@/state/editor-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useCreateStore } from "@/state/create-store";
import { usePlanStore } from "@/state/plan-store";
import type { ToolTourId } from "@/lib/storage/tour-flag";

/** What the shell supplies (the surfaces only it can open). */
export interface CommandApp {
  /** The tool whose session holds the stage; null on the landing. */
  section: CommandContext["section"];
  /** A drawing editor session is live. */
  editing: boolean;
  /** The named-sessions shelf holds at least one entry. */
  hasSavedSessions: boolean;
  /** Open the shortcuts & help dialog. */
  onOpenHelp: () => void;
  /** Open the About / Privacy dialog pane. */
  onOpenInfo: (pane: "about" | "privacy") => void;
  /** Start a tool's guided walkthrough. */
  onStartTour: (id: ToolTourId) => void;
  /** Open the sessions manager. */
  onOpenSessions: () => void;
}

/** One runnable command: the registry's definition + its live action. */
export interface BoundCommand {
  def: CommandDef;
  run: () => void;
}

/** The stores with a drawing editor, keyed by section. */
type EditorSection = "repair" | "recovery" | "create" | "plan";

const EDITOR_STORES = {
  repair: useEditorStore,
  recovery: useRecoveryStore,
  create: useCreateStore,
  plan: usePlanStore,
} as const;

function isEditorSection(
  section: CommandContext["section"],
): section is EditorSection {
  return (
    section === "repair" ||
    section === "recovery" ||
    section === "create" ||
    section === "plan"
  );
}

export function useCommands(app: CommandApp): {
  commands: readonly BoundCommand[];
  context: CommandContext;
  /** Run one command by id (no-op on an unknown id). */
  run: (id: string) => void;
  /**
   * The global shortcut layer: consume a keyboard event if it matches a
   * GLOBAL-scoped binding this hook owns (the editor undo/redo pair).
   * Returns true when consumed (the caller preventDefaults); text
   * fields always fall through to their native undo.
   */
  runShortcut: (event: KeyboardEvent) => boolean;
} {
  const context = useMemo<CommandContext>(
    () => ({
      section: app.section,
      landingToolPage: app.section === null && useUiStore.getState().landingView === "tool",
      editing: app.editing,
      hasSavedSessions: app.hasSavedSessions,
    }),
    [app.section, app.editing, app.hasSavedSessions],
  );

  const makeRunner = useCallback(
    (id: string): (() => void) | null => {
      const ui = () => useUiStore.getState();
      if (id === "go-home") return () => ui().closeLandingTool();
      if (id.startsWith("open-")) {
        const tool = id.slice("open-".length);
        const modes = [
          "repair",
          "share",
          "recovery",
          "create",
          "merge",
          "plan",
          "batch",
        ] as const;
        if ((modes as readonly string[]).includes(tool)) {
          return () => ui().openLandingTool(tool as (typeof modes)[number]);
        }
      }
      if (id === "open-sessions") return app.onOpenSessions;
      if (id === "open-help") return app.onOpenHelp;
      if (id === "open-about") return () => app.onOpenInfo("about");
      if (id === "open-privacy") return () => app.onOpenInfo("privacy");
      if (id.startsWith("replay-tour-")) {
        const tour = id.slice("replay-tour-".length) as ToolTourId;
        return () => app.onStartTour(tour);
      }
      if (id === "theme-system") return () => setThemePreference("system");
      if (id === "theme-light") return () => setThemePreference("light");
      if (id === "theme-dark") return () => setThemePreference("dark");

      // The editing family — routed to the active editor store.
      const section = app.section;
      if (!isEditorSection(section)) return null;
      const store = EDITOR_STORES[section];
      if (id === "editor-undo") return () => store.getState().undo();
      if (id === "editor-redo") return () => store.getState().redo();
      if (id === "editor-clear") return () => store.getState().clearVertices();
      if (id === "editor-draw-mode")
        return () => store.getState().setPointerMode("draw");
      if (id === "editor-move-mode")
        return () => store.getState().setPointerMode("move");
      if (id === "editor-pan-mode")
        return () => store.getState().setPointerMode("pan");
      if (id === "editor-pen-toggle")
        return () => {
          const live = store.getState();
          // The C key's own rule (user pass 52): the pen is a Draw-mode
          // concern — the palette honors the same contract.
          if (live.pointerMode === "draw") {
            live.setPenMode(live.pen === "curve" ? "default" : "curve");
          }
        };
      return null;
    },
    [app],
  );

  const commands = useMemo<BoundCommand[]>(
    () =>
      COMMANDS.flatMap((def) => {
        const run = makeRunner(def.id);
        return run ? [{ def, run }] : [];
      }),
    [makeRunner],
  );

  const run = useCallback(
    (id: string) => {
      commands.find((command) => command.def.id === id)?.run();
    },
    [commands],
  );

  const runShortcut = useCallback(
    (event: KeyboardEvent) => {
      // The shared text-field contract: native undo in inputs wins.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return false;
      }
      if (!app.editing) return false;
      const undo = COMMANDS.find((command) => command.id === "editor-undo");
      const redo = COMMANDS.find((command) => command.id === "editor-redo");
      if (undo?.shortcut && matchesBinding(event, undo.shortcut)) {
        run("editor-undo");
        return true;
      }
      if (redo) {
        if (
          (redo.shortcut && matchesBinding(event, redo.shortcut)) ||
          (redo.altShortcut && matchesBinding(event, redo.altShortcut))
        ) {
          run("editor-redo");
          return true;
        }
      }
      return false;
    },
    [app.editing, run],
  );

  return { commands, context, run, runShortcut };
}
