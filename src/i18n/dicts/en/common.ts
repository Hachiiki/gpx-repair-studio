/**
 * English dictionary — shared copy (Phase 21).
 *
 * Words and sentences used by MORE THAN ONE tool surface: the common
 * verbs on buttons, dialog scaffolding words, and the strings the
 * app's own chrome (footer, picker) needs. Tool-specific copy lives
 * in that tool's domain file; a key belongs here when two unrelated
 * domains would otherwise duplicate it.
 *
 * Values are the app's existing copy, moved verbatim — the en
 * dictionary is the CONTRACT (tests assert against it; zh-CN must
 * match its keys and params exactly).
 */

export const common = {
  /** Cancel — every dialog's escape. */
  "common.cancel": "Cancel",
  /** Close — dialogs and panels. */
  "common.close": "Close",
  /** Confirm — destructive or apply actions. */
  "common.confirm": "Confirm",
  /** Continue — a step forward that is not a commitment. */
  "common.continue": "Continue",
  /** Back — one step back. */
  "common.back": "Back",
  /** Remove — takes an item away (files, sessions). */
  "common.remove": "Remove",
  /** Retry — a failed load's second chance. */
  "common.retry": "Retry",
  /** Open — enter a tool or surface. */
  "common.open": "Open",
  /** Undo/Redo — the editing pair. */
  "common.undo": "Undo",
  "common.redo": "Redo",
  /** Points — the word for track points, plural-neutral with {count}. */
  "common.points": "{count} points",
  /** Loading — the parsing state word. */
  "common.loading": "Loading…",

  /** The scrollable table region's a11y name (ui/table.tsx). */
  "ui.dataTable": "Data table",

  /*
   * The locale picker (site footer) — §EE 21.2/21.3. The picker's
   * option labels are the locales' endonyms (types.ts LOCALE_OPTIONS,
   * never translated); these strings are the picker's own chrome.
   */
  "footer.language": "Language",
  /** Screen-reader label for the footer's language select. */
  "footer.languageA11y": "Choose the app language",
  /** Toast fired when the language changes. */
  "footer.languageChanged": "Language updated — applied everywhere.",
} as const;

export type CommonDict = typeof common;
