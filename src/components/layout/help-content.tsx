/**
 * HelpContent (Phase 12) — the shortcuts cheat sheet + tool guide.
 *
 * Phase 20: the keyboard map is now GENERATED from the command
 * registry (features/commands/registry.ts) — the single source the
 * palette also renders from. The contract stays the Phase 12 one:
 * every entry must exist in the shipped bindings; adding a binding to
 * the registry is now the only way it appears here (removing one
 * removes it everywhere at once).
 *
 * Pure data + presentation; no behavior of its own.
 */

"use client";

import { useId } from "react";
import { getToolTours } from "@/components/layout/tool-tour";
import { shortcutCheatSheet } from "@/hooks/use-commands";
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
import type { ToolTourId } from "@/lib/storage/tour-flag";
import { TOOL_TOUR_IDS } from "@/lib/storage/tour-flag";

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

/**
 * The keyboard map, generated from the registry (global bindings,
 * then the editors' own group), plus the map-gesture rows the
 * registry deliberately does not own (they are pointer actions, not
 * commands).
 *
 * The registry's own copy — group titles, keycap chips, command
 * descriptions — flows through verbatim (the coordinator's domain);
 * only this file's own sentences are translated here.
 */
export function getShortcutGroups(t: TranslatorArg): readonly ShortcutGroup[] {
  return [
    ...shortcutCheatSheet(t).map((group) => ({
      title: group.title,
      ...(group.entries.some((entry) => entry.editorOnly)
        ? {
            note: t("help.keyboard.fieldNote"),
          }
        : {}),
      shortcuts: group.entries.map((entry) => ({
        keys: entry.keys,
        description: entry.description,
      })),
    })),
    {
      title: t("help.map.title"),
      shortcuts: [
        {
          keys: [t("help.map.gestureScroll"), t("help.map.gesturePinch")],
          description: t("help.map.zoom"),
        },
        {
          keys: [t("help.map.gestureDrag")],
          description: t("help.map.pan"),
        },
        {
          keys: [t("help.map.gestureDoubleClick")],
          description: t("help.map.zoomStep"),
        },
      ],
    },
  ];
}

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

export interface HelpContentProps {
  /**
   * Phase 19 — replay a tool's guided walkthrough (the shell's tour
   * controller). Absent renders the list without buttons (tests).
   */
  onStartTour?: (id: ToolTourId) => void;
}

/** The whole cheat sheet + the tool guide (the dialog's body). */
export function HelpContent({ onStartTour }: HelpContentProps) {
  const { t } = useI18n();
  const shortcutGroups = getShortcutGroups(t);
  const listId = useId();
  const toursId = useId();
  return (
    <div className="grid gap-6" data-testid="help-content">
      <div className="grid gap-5">
        {shortcutGroups.map((group) => (
          <ShortcutGroupBlock key={group.title} group={group} />
        ))}
      </div>

      <section
        aria-labelledby={toursId}
        className="border-t-[1.5px] border-ink/15 pt-4"
      >
        <h3
          id={toursId}
          className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade"
        >
          {t("help.tours.title")}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {t("help.tours.blurb")}
        </p>
        <ul className="mt-2.5 grid gap-1.5" data-testid="help-tour-list">
          {TOOL_TOUR_IDS.map((id) => {
            const tour = getToolTours(t)[id];
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-3 border-b border-ink/[0.07] pb-1.5 text-[13.5px]"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{tour.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                    {tour.blurb}
                  </span>
                </span>
                {onStartTour !== undefined && (
                  <button
                    type="button"
                    data-testid={`help-tour-${id}`}
                    onClick={() => onStartTour(id)}
                    className="shrink-0 rounded-[6px] border-[1.25px] border-ink/30 px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-signal hover:bg-signal/[0.08] focus-visible:outline-2"
                  >
                    {t("help.tours.start")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby={listId} className="border-t-[1.5px] border-ink/15 pt-4">
        <h3 id={listId} className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
          {t("help.where.title")}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {t("help.where.body")}
        </p>
      </section>
    </div>
  );
}
