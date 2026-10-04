/**
 * English dictionary — command registry (Phase 21).
 *
 * The Phase 20 command palette's labels, group headings, cheat-sheet
 * titles, and per-command search keywords. The registry itself
 * (features/commands/registry.ts) stores ONLY the keys; the palette,
 * the cheat sheet, and the help dialog resolve them at render time so
 * a locale switch re-renders the whole command surface in place.
 *
 * `*.kw` entries are space-separated SEARCH ALIASES (never rendered).
 */

export const commands = {
  /** The palette's group headings. */
  "cmd.group.navigate": "Go to",
  "cmd.group.sessions": "Sessions",
  "cmd.group.editing": "Editing",
  "cmd.group.view": "View",
  "cmd.group.help": "Help & tours",

  /** The seven tool doors. */
  "cmd.open-repair": "Repair a recording",
  "cmd.open-share": "Make a share card",
  "cmd.open-recovery": "Recover a GPS gap",
  "cmd.open-create": "Create from activity stats",
  "cmd.open-merge": "Merge recordings",
  "cmd.open-plan": "Plan a route",
  "cmd.open-batch": "Batch repair files",

  /** Navigation. */
  "cmd.go-home": "Back to the tool cards",
  "cmd.open-sessions": "Open saved sessions",

  /** The editing family (editor-scoped bindings). */
  "cmd.editor-undo": "Undo",
  "cmd.editor-redo": "Redo",
  "cmd.editor-clear": "Clear the drawn route",
  "cmd.editor-draw-mode": "Draw mode — click to place points",
  "cmd.editor-move-mode": "Move mode — drag any placed point",
  "cmd.editor-pan-mode": "Pan mode — normal map navigation",
  "cmd.editor-pen-toggle": "Toggle the Curve pen",

  /** View. */
  "cmd.theme-system": "Theme: follow the system",
  "cmd.theme-light": "Theme: light",
  "cmd.theme-dark": "Theme: dark",

  /** Help. */
  "cmd.open-help": "Shortcuts & help",
  "cmd.command-palette": "Open the command palette",
  "cmd.open-about": "About this app",
  "cmd.open-privacy": "Privacy & data",
  "cmd.replay-tour": "Replay the walkthrough: {name}",

  /** Cheat-sheet-only entries (bindings the primitives own natively). */
  "cmd.escape": "Close a dialog, or cancel the current pick / edit",
  "cmd.tab":
    "Move through the controls — the “Skip to content” link is first from the page top",

  /** The cheat sheet's group titles. */
  "cmd.cheat.everywhere": "Everywhere",
  "cmd.cheat.editors": "Drawing editors (Repair, Recovery, Create, Plan)",

  /** Search aliases (space-separated, lowercase). */
  "cmd.kw.go-home": "landing home start",
  "cmd.kw.open-sessions": "shelf restore manager",
  "cmd.kw.editor-undo": "revert step back",
  "cmd.kw.editor-redo": "restore step forward",
  "cmd.kw.editor-clear": "remove points delete all",
  "cmd.kw.editor-draw-mode": "pointer pencil",
  "cmd.kw.editor-move-mode": "pointer drag",
  "cmd.kw.editor-pan-mode": "pointer navigate",
  "cmd.kw.editor-pen-toggle": "freehand stroke pencil",
  "cmd.kw.theme-system": "dark light color",
  "cmd.kw.theme-light": "dark color",
  "cmd.kw.theme-dark": "light color",
  "cmd.kw.open-help": "keyboard cheat sheet keys",
  "cmd.kw.command-palette": "search actions commands",
  "cmd.kw.open-privacy": "offline local providers",
} as const;

export type CommandsDict = typeof commands;
