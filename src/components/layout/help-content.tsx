/**
 * HelpContent (Phase 12) — the shortcuts cheat sheet + tool guide.
 *
 * The keyboard map is a CONTRACT, not documentation: every entry must
 * exist in the shipped bindings (the draw editors' D/M/P/C handlers,
 * the pick sessions' Esc, the gap-threshold Enter commit, and this
 * dialog's own "?" listener in AppShell). When Phase 20's command
 * registry lands, this table should be generated from that single
 * source instead of maintained by hand (noted here so the migration
 * is not forgotten).
 *
 * Pure data + presentation; no behavior of its own.
 */

"use client";

import { useId } from "react";

/** One shortcut: the keys that trigger it and what it does. */
export interface ShortcutEntry {
  keys: readonly string[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  note?: string;
  shortcuts: readonly ShortcutEntry[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Everywhere",
    shortcuts: [
      { keys: ["?"], description: "Open this shortcuts & help dialog" },
      {
        keys: ["Esc"],
        description: "Close a dialog, or cancel the current pick / edit",
      },
      {
        keys: ["Tab"],
        description:
          "Move through the controls — the “Skip to content” link is first from the page top",
      },
    ],
  },
  {
    title: "Drawing editors (Repair, Recovery, Create, Plan)",
    shortcuts: [
      { keys: ["D"], description: "Draw mode — click to place points" },
      {
        keys: ["M"],
        description: "Move mode — drag any placed point to adjust it",
      },
      { keys: ["P"], description: "Pan mode — normal map navigation" },
      {
        keys: ["C"],
        description: "Toggle the Curve pen (while in Draw mode) — draw freehand",
      },
    ],
    note: "The letter keys do nothing while you are typing in a field.",
  },
  {
    title: "Map",
    shortcuts: [
      { keys: ["Scroll", "Pinch"], description: "Zoom in and out" },
      { keys: ["Drag"], description: "Pan the map (Pan mode in the editors)" },
      { keys: ["Double-click"], description: "Zoom in one step" },
    ],
  },
];

/** The kbd chip — mono, keycap-bordered, one per key. */
function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded-[5px] border-[1.5px] border-ink bg-card px-1.5 py-0.5 font-mono text-[12px] font-semibold shadow-[0_1.5px_0_0_var(--ink)]">
      {children}
    </kbd>
  );
}

/** One group: heading + a definition-style rows of keys → description. */
function ShortcutGroupBlock({ group }: { group: ShortcutGroup }) {
  return (
    <section>
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
        {group.title}
      </h3>
      {group.note && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {group.note}
        </p>
      )}
      <ul className="mt-2 grid gap-1.5">
        {group.shortcuts.map((shortcut) => (
          <li
            key={shortcut.description}
            className="flex items-baseline gap-3 text-[13.5px]"
          >
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              {shortcut.keys.map((key) => (
                <KeyCap key={key}>{key}</KeyCap>
              ))}
            </span>
            <span className="text-muted-foreground">{shortcut.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The whole cheat sheet + the tool guide (the dialog's body). */
export function HelpContent() {
  const listId = useId();
  return (
    <div className="grid gap-6" data-testid="help-content">
      <div className="grid gap-5">
        {SHORTCUT_GROUPS.map((group) => (
          <ShortcutGroupBlock key={group.title} group={group} />
        ))}
      </div>

      <section aria-labelledby={listId} className="border-t-[1.5px] border-ink/15 pt-4">
        <h3 id={listId} className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
          Where everything lives
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          The home page is seven tool cards — Repair, Share card, Gap recovery,
          Create from stats, Merge, Plan a route, and Batch cleanup. Opening a
          card shows how that tool works and its upload or start controls;
          “All tools” returns to the cards. New here? The “Take the tour” link
          on the home page replays the walkthrough anytime. Your saved
          sessions live behind the header's “Sessions” button (also the
          “Continue a saved session” link on the home page) — that dialog
          saves, reopens, renames, exports, and imports session files
          (.gpxrepair.json).
        </p>
      </section>
    </div>
  );
}
