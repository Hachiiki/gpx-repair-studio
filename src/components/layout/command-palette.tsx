/**
 * CommandPalette (Phase 20 — §EE 20.2) — the Ctrl/Cmd+K palette over
 * the command registry.
 *
 * Built on cmdk (the shadcn Command primitive): full keyboard control
 * (arrows move, Enter runs, Esc closes), listbox semantics
 * (role=listbox / option / aria-selected), and Radix Dialog's focus
 * trap + focus return underneath. Fuzzy filtering is the registry's
 * own pure `filterCommands` (§EE 20.1 — one search implementation,
 * unit-tested; cmdk's shouldFilter is off). Recent sessions join the
 * static commands as their own group (§EE 20.2) — restoring through
 * the ONE restore path the sessions manager uses.
 *
 * Pure presentation: bound commands + session rows in, run/restore
 * intents out. The shell owns the open state and the Ctrl/Cmd+K
 * listener.
 *
 * Phase 20 — Command palette & shortcuts. Client-side component.
 */

"use client";

import { useMemo, useState } from "react";
import { CommandKeycap } from "@/components/layout/command-keycap";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  commandGroupLabel,
  displayShortcut,
  type BoundCommand,
  type CommandGroupId,
} from "@/hooks/use-commands";
import {
  savedSessionSectionLabel,
  type SavedSessionRow,
} from "@/hooks/use-saved-sessions";
import { formatDateTime } from "@/lib/utils/format";

/** One restorable shelf row as the palette renders it. */
export interface PaletteSessionRow {
  row: SavedSessionRow;
  /** Restore through the one restore path (the manager's openRow). */
  onRestore: (id: string) => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The registry's fuzzy filter, bound to the live context: `filter("")`
   * is the AVAILABLE command list in registry order (the grouped view),
   * `filter(query)` the relevance-ordered results. Availability (the
   * `when` predicates) applies to BOTH views through this one door.
   */
  filter: (query: string) => readonly BoundCommand[];
  /** Recent shelf rows (empty = the group hides). */
  sessions: readonly PaletteSessionRow[];
}

export function CommandPalette({
  open,
  onOpenChange,
  filter,
  sessions,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  // A fresh palette opens with a fresh search — adjusted during render
  // (React's "reset state when a prop changes" pattern; no effect).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && query !== "") setQuery("");
  }

  const searching = query.trim().length > 0;
  const filtered = useMemo(() => filter(query), [filter, query]);

  // With a query, the results are relevance-ordered — one flat group
  // keeps that order intact. Without one, group the AVAILABLE commands
  // (filter("") applies the availability predicates) by registry group.
  const grouped = useMemo(() => {
    if (searching) return null;
    const byGroup = new Map<CommandGroupId, BoundCommand[]>();
    for (const command of filter("")) {
      const list = byGroup.get(command.def.group) ?? [];
      list.push(command);
      byGroup.set(command.def.group, list);
    }
    return byGroup;
  }, [filter, searching]);

  const sessionMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q.length === 0 ? sessions : sessions.filter((entry) => entry.row.name.toLowerCase().includes(q));
    return rows.slice(0, 4);
  }, [sessions, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="command-palette"
        className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search every action in the app. Arrow keys move, Enter runs,
          Escape closes.
        </DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground"
          shouldFilter={false}
        >
          <CommandInput
            data-testid="command-palette-input"
            placeholder="Search commands…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            data-testid="command-palette-list"
            className="max-h-[min(52vh,380px)] border-t-[1.5px] border-ink/10"
          >
            <CommandEmpty data-testid="command-palette-empty">
              Nothing matches — try a tool name, “undo”, or “theme”.
            </CommandEmpty>

            {sessionMatches.length > 0 && (
              <CommandGroup heading="Recent sessions">
                {sessionMatches.map((entry) => (
                  <CommandItem
                    key={`session-${entry.row.id}`}
                    data-testid={`command-palette-session-${entry.row.id}`}
                    value={`session ${entry.row.name}`}
                    onSelect={() => {
                      onOpenChange(false);
                      entry.onRestore(entry.row.id);
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-semibold">
                        {entry.row.name}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {savedSessionSectionLabel(entry.row.section)} ·{" "}
                        {formatDateTime(entry.row.updatedAt)}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {grouped === null ? (
              <CommandGroup heading="Commands">
                {filtered.map((command) => (
                  <PaletteItem
                    key={command.def.id}
                    command={command}
                    onDone={() => onOpenChange(false)}
                  />
                ))}
              </CommandGroup>
            ) : (
              Array.from(grouped.entries()).map(([group, items]) => (
                <CommandGroup key={group} heading={commandGroupLabel(group)}>
                  {items.map((command) => (
                    <PaletteItem
                      key={command.def.id}
                      command={command}
                      onDone={() => onOpenChange(false)}
                    />
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
          <p
            className="flex items-center justify-between border-t-[1.5px] border-ink/10 px-3 py-2 text-[11px] text-muted-foreground"
            data-testid="command-palette-footer"
          >
            <span className="flex items-center gap-1">
              <CommandKeycap>↑</CommandKeycap>
              <CommandKeycap>↓</CommandKeycap> move ·{" "}
              <CommandKeycap>↵</CommandKeycap> run ·{" "}
              <CommandKeycap>Esc</CommandKeycap> close
            </span>
            <span className="flex items-center gap-0.5 font-mono">
              <CommandKeycap>Ctrl</CommandKeycap>
              <CommandKeycap>K</CommandKeycap>
            </span>
          </p>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteItem({
  command,
  onDone,
}: {
  command: BoundCommand;
  onDone: () => void;
}) {
  const bindings = [command.def.shortcut, command.def.altShortcut].filter(
    (binding): binding is NonNullable<typeof command.def.shortcut> =>
      Boolean(binding),
  );
  return (
    <CommandItem
      data-testid={`command-palette-item-${command.def.id}`}
      value={`${command.def.label} ${(command.def.keywords ?? []).join(" ")}`}
      onSelect={() => {
        onDone();
        command.run();
      }}
    >
      <span className="flex-1 truncate text-[13px]">{command.def.label}</span>
      {bindings.length > 0 ? (
        <span className="ml-3 flex shrink-0 items-center gap-1 font-mono">
          {bindings.map((binding) => (
            <CommandKeycap key={displayShortcut(binding)}>
              {displayShortcut(binding)}
            </CommandKeycap>
          ))}
        </span>
      ) : command.def.scope === "editor" ? (
        <span className="ml-3 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          editor
        </span>
      ) : null}
    </CommandItem>
  );
}
