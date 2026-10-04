/**
 * Command registry (Phase 20 — docs/MASTER_PLAN.md §EE 20.1) — the
 * single source of truth for every action and keyboard binding in the
 * app.
 *
 * The registry is PURE DATA + PURE FUNCTIONS:
 *   - each `CommandDef` records what an action IS (id, label, group,
 *     shortcut, scope, availability) — never HOW to run it;
 *   - `useCommands` (the hook layer) binds ids to live actions;
 *   - the command palette renders the registry through that binding;
 *   - the help dialog's cheat sheet is GENERATED from here (the Phase 12
 *     contract "only bindings that ship" is now enforced by
 *     construction — one source, no hand-maintained table).
 *
 * Scopes: "global" bindings work anywhere (the palette, the theme,
 * help); "editor" bindings are active while a drawing editor session
 * holds the stage (the D/M/P/C accelerators the four editor hooks own,
 * plus the undo/redo pair this phase binds globally). Shortcut
 * conflicts are checked PER SCOPE — "D" means Draw in an editor and
 * nothing else anywhere.
 *
 * Phase 20 — Command palette & shortcuts. Pure TypeScript: no React,
 * no DOM, no stores.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The palette's command groups, in display order. */
export type CommandGroupId =
  | "navigate"
  | "sessions"
  | "editing"
  | "view"
  | "help";

/**
 * Phase 21: groups carry DICTIONARY KEYS, not labels — the palette
 * resolves them at render time (a locale switch re-renders the
 * headings in place).
 */
export const COMMAND_GROUP_LABEL_KEYS: Readonly<
  Record<CommandGroupId, string>
> = {
  navigate: "cmd.group.navigate",
  sessions: "cmd.group.sessions",
  editing: "cmd.group.editing",
  view: "cmd.group.view",
  help: "cmd.group.help",
};

/** Where a shortcut is active. */
export type CommandScope = "global" | "editor";

/**
 * One keyboard binding. `ctrl` covers BOTH Ctrl (non-Mac) and Cmd
 * (Mac) — the palette and the global listeners bind the pair as one
 * (the platform's own convention: a browser-page Ctrl+K and Cmd+K are
 * the same command).
 */
export interface ShortcutBinding {
  /** The physical key, lowercase ("k", "z", "?", "d"). */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * The availability context — a small, serializable snapshot of "where
 * the user is", so `when` predicates stay pure and testable.
 */
export interface CommandContext {
  /**
   * The tool whose session currently holds the stage (null on the
   * landing — the cards home or a tool page).
   */
  section:
    | "repair"
    | "recovery"
    | "create"
    | "merge"
    | "plan"
    | "batch"
    | null;
  /** The landing is showing a tool's detail page (not the cards). */
  landingToolPage: boolean;
  /** A drawing editor session is live (an editor / draw phase). */
  editing: boolean;
  /** The named-sessions shelf holds at least one entry. */
  hasSavedSessions: boolean;
}

/** One registered command. */
export interface CommandDef {
  id: string;
  /** The dictionary key this command's label lives under (Phase 21). */
  labelKey: string;
  group: CommandGroupId;
  /**
   * Search-only aliases (the fuzzy match runs over label + keywords).
   * English aliases ship here; translated aliases live under the
   * `cmd.kw.<id>` dictionary keys and merge into the search text.
   */
  keywords?: readonly string[];
  /** The primary keyboard binding, if one ships. */
  shortcut?: ShortcutBinding;
  /** A second equivalent binding (Ctrl+Shift+Z / Ctrl+Y style). */
  altShortcut?: ShortcutBinding;
  /** Where the shortcut is active (defaults to "global"). */
  scope?: CommandScope;
  /** Availability; absent = always available. */
  when?: (ctx: CommandContext) => boolean;
  /**
   * Surfaces in the palette (default true). `false` marks cheat-sheet
   * entries for bindings the primitives own natively (Esc, Tab) —
   * documented, not runnable.
   */
  palette?: boolean;
  /**
   * Phase 21 — replay-tour commands carry the tool's label key as the
   * {name} param of their own label ("Replay the walkthrough: {name}").
   */
  replayTool?: string;
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const LANDING_MODES = {
  repair: "cmd.open-repair",
  share: "cmd.open-share",
  recovery: "cmd.open-recovery",
  create: "cmd.open-create",
  merge: "cmd.open-merge",
  plan: "cmd.open-plan",
  batch: "cmd.open-batch",
} as const;

type LandingTool = keyof typeof LANDING_MODES;

/**
 * The seven tools' front doors. Navigate commands are landing-only —
 * the cards are the only door (Task 26/42); with a session on stage,
 * leaving is the section's own "Start over", never a palette jump.
 */
const TOOL_COMMANDS: readonly CommandDef[] = (
  Object.keys(LANDING_MODES) as readonly LandingTool[]
).map(
  (tool): CommandDef => ({
    id: `open-${tool}`,
    labelKey: LANDING_MODES[tool],
    group: "navigate",
    keywords: ["tool", "open", "go", tool],
    when: (ctx: CommandContext) => ctx.section === null,
  }),
);

/**
 * The app's command registry — every shipped action and binding. The
 * editor accelerators (D/M/P/C) are OWNED by the four editor hooks
 * (their text-field guards live there); the registry records them so
 * the cheat sheet and the palette can show and run them.
 */
export const COMMANDS: readonly CommandDef[] = [
  ...TOOL_COMMANDS,
  {
    id: "go-home",
    labelKey: "cmd.go-home",
    group: "navigate",
    keywords: ["landing", "home", "start"],
    when: (ctx) => ctx.landingToolPage,
  },

  {
    id: "open-sessions",
    labelKey: "cmd.open-sessions",
    group: "sessions",
    keywords: ["shelf", "restore", "manager"],
  },

  {
    id: "editor-undo",
    labelKey: "cmd.editor-undo",
    group: "editing",
    keywords: ["revert", "step back"],
    shortcut: { key: "z", ctrl: true },
    scope: "editor",
    when: (ctx) => ctx.editing,
  },
  {
    id: "editor-redo",
    labelKey: "cmd.editor-redo",
    group: "editing",
    keywords: ["restore", "step forward"],
    shortcut: { key: "z", ctrl: true, shift: true },
    altShortcut: { key: "y", ctrl: true },
    scope: "editor",
    when: (ctx) => ctx.editing,
  },
  {
    id: "editor-clear",
    labelKey: "cmd.editor-clear",
    group: "editing",
    keywords: ["remove", "points", "delete all"],
    scope: "editor",
    when: (ctx) => ctx.editing,
  },
  {
    id: "editor-draw-mode",
    labelKey: "cmd.editor-draw-mode",
    group: "editing",
    keywords: ["pointer", "pencil"],
    shortcut: { key: "d" },
    scope: "editor",
    when: (ctx) => ctx.editing,
  },
  {
    id: "editor-move-mode",
    labelKey: "cmd.editor-move-mode",
    group: "editing",
    keywords: ["pointer", "drag"],
    shortcut: { key: "m" },
    scope: "editor",
    when: (ctx) => ctx.editing,
  },
  {
    id: "editor-pan-mode",
    labelKey: "cmd.editor-pan-mode",
    group: "editing",
    keywords: ["pointer", "navigate"],
    shortcut: { key: "p" },
    scope: "editor",
    when: (ctx) => ctx.editing,
  },
  {
    id: "editor-pen-toggle",
    labelKey: "cmd.editor-pen-toggle",
    group: "editing",
    keywords: ["freehand", "stroke", "pencil"],
    shortcut: { key: "c" },
    scope: "editor",
    when: (ctx) => ctx.editing,
  },

  {
    id: "theme-system",
    labelKey: "cmd.theme-system",
    group: "view",
    keywords: ["dark", "light", "color"],
  },
  {
    id: "theme-light",
    labelKey: "cmd.theme-light",
    group: "view",
    keywords: ["dark", "color"],
  },
  {
    id: "theme-dark",
    labelKey: "cmd.theme-dark",
    group: "view",
    keywords: ["light", "color"],
  },

  {
    id: "open-help",
    labelKey: "cmd.open-help",
    group: "help",
    keywords: ["keyboard", "cheat sheet", "keys"],
    shortcut: { key: "?" },
  },
  {
    id: "command-palette",
    labelKey: "cmd.command-palette",
    group: "help",
    keywords: ["search", "actions", "commands"],
    // Cheat-sheet-only: the shell's own listener owns the chord (the
    // palette opening itself from the palette would be a no-op joke).
    shortcut: { key: "k", ctrl: true },
    palette: false,
  },
  {
    id: "open-about",
    labelKey: "cmd.open-about",
    group: "help",
  },
  {
    id: "open-privacy",
    labelKey: "cmd.open-privacy",
    group: "help",
    keywords: ["offline", "local", "providers"],
  },
  ...(Object.keys(LANDING_MODES) as readonly LandingTool[]).map(
    (tool): CommandDef => ({
      id: `replay-tour-${tool}`,
      // The replay labels interpolate the tool's own localized label.
      labelKey: "cmd.replay-tour",
      group: "help",
      keywords: ["tour", "guide", "tutorial", tool],
      // The tool label rides along as a param (see commandLabel).
      replayTool: LANDING_MODES[tool],
    }),
  ),

  /*
   * Cheat-sheet-only entries: bindings the primitives own natively.
   * Registered so the sheet stays generated from this single source,
   * never runnable from the palette.
   */
  {
    id: "escape",
    labelKey: "cmd.escape",
    group: "help",
    // Display-only bindings (the primitives own them natively): the
    // key strings carry their conventional display forms.
    shortcut: { key: "Esc" },
    palette: false,
  },
  {
    id: "tab",
    labelKey: "cmd.tab",
    group: "help",
    shortcut: { key: "Tab" },
    palette: false,
  },
];

// ---------------------------------------------------------------------------
// Binding identity, formatting, matching (pure)
// ---------------------------------------------------------------------------

/** The normalized identity of a binding (conflict detection's key). */
export function bindingId(binding: ShortcutBinding): string {
  return [
    binding.ctrl ? "mod" : "",
    binding.alt ? "alt" : "",
    binding.shift ? "shift" : "",
    binding.key.toLowerCase(),
  ]
    .filter(Boolean)
    .join("+");
}

/** The user-facing form: "Ctrl K", "Ctrl Shift Z", "?", "D". */
export function formatShortcut(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  parts.push(
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
  );
  return parts.join(" ");
}

/**
 * Does a keyboard event match a binding? The modifier is platform
 * agnostic: Ctrl (non-Mac) OR Cmd (Mac) count as the binding's `ctrl`.
 */
export function matchesBinding(
  event: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  },
  binding: ShortcutBinding,
): boolean {
  const mod = event.ctrlKey || event.metaKey;
  if (binding.ctrl === true && !mod) return false;
  if (binding.ctrl !== true && mod) return false;
  if ((binding.shift ?? false) !== event.shiftKey) return false;
  if ((binding.alt ?? false) !== event.altKey) return false;
  return event.key.toLowerCase() === binding.key.toLowerCase();
}

/**
 * The shortcut audit (§EE 20.3): two commands in the SAME scope may not
 * share a binding. Returns every collision (empty = clean).
 */
export function findShortcutConflicts(
  commands: readonly CommandDef[],
): { binding: string; ids: string[] }[] {
  const byScope = new Map<string, Map<string, string[]>>();
  for (const command of commands) {
    const scope = command.scope ?? "global";
    const bindings = [command.shortcut, command.altShortcut].filter(
      (b): b is ShortcutBinding => b !== undefined,
    );
    if (bindings.length === 0) continue;
    let scopeMap = byScope.get(scope);
    if (!scopeMap) {
      scopeMap = new Map();
      byScope.set(scope, scopeMap);
    }
    for (const binding of bindings) {
      const id = bindingId(binding);
      const ids = scopeMap.get(id) ?? [];
      ids.push(command.id);
      scopeMap.set(id, ids);
    }
  }
  const conflicts: { binding: string; ids: string[] }[] = [];
  for (const scopeMap of byScope.values()) {
    for (const [binding, ids] of scopeMap) {
      if (ids.length > 1) conflicts.push({ binding, ids });
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Fuzzy search (pure)
// ---------------------------------------------------------------------------

/**
 * Subsequence fuzzy score of `query` against `text` (case-folded).
 * Higher is better; `null` = no match. Bonuses: a word-boundary prefix
 * beats an interior hit, a contiguous run beats scattered letters.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 0;
  if (t.length === 0) return null;

  let score = 0;
  let qi = 0;
  let run = 0;
  let matchedFrom = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      run += 1;
      score += 1 + run; // contiguous letters keep paying more
      if (matchedFrom === -1) matchedFrom = ti;
      // Word-boundary prefix bonus: "pl" in "Plan a route".
      if (ti === 0 || /[\s/(—-]/.test(t[ti - 1] ?? "")) score += 3;
      qi += 1;
    } else {
      run = 0;
    }
  }
  if (qi < q.length) return null; // not every query letter matched
  // Earlier matches win ties (label starts-with beats contains).
  if (matchedFrom === 0) score += 4;
  return score;
}

/**
 * A minimal translator shape (pure) — the caller supplies t(); the
 * registry stays free of every framework dependency.
 */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** The command's display label in the caller's locale. */
export function commandLabel(t: TranslateFn, command: CommandDef): string {
  return command.replayTool !== undefined
    ? t(command.labelKey, { name: t(command.replayTool) })
    : t(command.labelKey);
}

/**
 * The searchable text of a command: the localized label + the shipped
 * English keywords + the localized aliases under `cmd.kw.<id>`
 * (missing alias keys contribute nothing — English-only commands
 * still search fine in every locale).
 */
export function searchText(t: TranslateFn, command: CommandDef): string {
  const localizedKeywords = t(`cmd.kw.${command.id}`);
  return [
    commandLabel(t, command),
    ...(command.keywords ?? []),
    ...(localizedKeywords === `cmd.kw.${command.id}` ? [] : localizedKeywords.split(/\s+/)),
  ].join(" ");
}

/**
 * The palette's result list for a query: available commands (context
 * permitting), fuzzy-filtered when a query is present — registry order
 * (grouped) when the query is empty, most relevant first otherwise.
 */
export function filterCommands(
  commands: readonly CommandDef[],
  query: string,
  context: CommandContext,
  t: TranslateFn,
): CommandDef[] {
  const available = commands.filter(
    (command) =>
      command.palette !== false && (!command.when || command.when(context)),
  );
  const q = query.trim();
  if (q.length === 0) return available;
  const scored: { command: CommandDef; score: number }[] = [];
  for (const command of available) {
    const score = fuzzyScore(q, searchText(t, command));
    if (score !== null) scored.push({ command, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      commandLabel(t, a.command).localeCompare(commandLabel(t, b.command)),
  );
  return scored.map((entry) => entry.command);
}

// ---------------------------------------------------------------------------
// The cheat sheet (pure) — the help dialog's keyboard map, generated
// ---------------------------------------------------------------------------

/** One cheat-sheet row. */
export interface CheatSheetEntry {
  keys: readonly string[];
  description: string;
  /** Editor-scoped bindings render in the editors' own group. */
  editorOnly: boolean;
}

/** One cheat-sheet group. */
export interface CheatSheetGroup {
  title: string;
  entries: readonly CheatSheetEntry[];
}

/**
 * The generated cheat sheet: every shipped binding, grouped the way the
 * Phase 12 sheet presented them (the same titles, the same contract —
 * only bindings that exist in the registry appear). Phase 21: the
 * caller's translator resolves every label and title.
 */
export function cheatSheet(
  commands: readonly CommandDef[],
  t: TranslateFn,
): CheatSheetGroup[] {
  const globalEntries: CheatSheetEntry[] = [];
  const editorEntries: CheatSheetEntry[] = [];
  for (const command of commands) {
    const bindings = [command.shortcut, command.altShortcut].filter(
      (b): b is ShortcutBinding => b !== undefined,
    );
    if (bindings.length === 0) continue;
    const entry: CheatSheetEntry = {
      keys: bindings.map(formatShortcut),
      description: commandLabel(t, command),
      editorOnly: (command.scope ?? "global") === "editor",
    };
    if (entry.editorOnly) {
      editorEntries.push(entry);
    } else {
      globalEntries.push(entry);
    }
  }
  const groups: CheatSheetGroup[] = [
    { title: t("cmd.cheat.everywhere"), entries: globalEntries },
  ];
  if (editorEntries.length > 0) {
    groups.push({ title: t("cmd.cheat.editors"), entries: editorEntries });
  }
  return groups;
}
