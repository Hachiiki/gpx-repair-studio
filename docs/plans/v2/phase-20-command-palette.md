# Phase 20 — Command Palette & Shortcuts (Task 65)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 19](phase-19-compare-summaries.md) · [Phase 21 →](phase-21-internationalization.md)

## Plan (v2 roadmap)

**Objective:** power users fly; everyone else discovers.

- **20.1 Command registry:** every action (navigate, switch tool,
  run fix/preset, export, theme, tours) registered with id, label,
  shortcut, and availability context — a single source that also
  feeds the [Phase 12](phase-12-quick-wins-theming.md) help dialog.
- **20.2 Palette:** Ctrl/Cmd+K opens a fuzzy-searchable,
  keyboard-first palette over the registry, including recent
  sessions. Focus-trapped, listbox-semantics a11y.
- **20.3 Shortcut audit:** bind the remaining major actions without
  conflicts; all bindings visible in the cheat sheet.

**Non-goals:** user-defined macros, scripting console.
**Verification:** registry unit tests, palette a11y (axe + keyboard
nav), e2e open→search→run, VLM.

## Delivery record (Task 65)

Delivered per [§EE 20.1–20.3](#plan-v2-roadmap), plus the mode-switching fix the user
reported alongside (its own commit, `3029a12`).

**20.1 Command registry** — `src/features/commands/registry.ts`
(pure): every action the app ships as a `CommandDef` (id, label,
group, keywords, optional primary + equivalent shortcut, scope
`global` | `editor`, and a `when` availability predicate over a small
serializable context). The seven tools' front doors, the sessions
door, the editors' D/M/P/C accelerators (owned by the editor hooks;
recorded here), the undo/redo pair, the three theme preferences, the
help/about/privacy doors, and the seven tool-tour replays. Pure
helpers: `fuzzyScore` (subsequence with word-boundary + contiguity +
starts-with bonuses), `filterCommands` (availability + ranking),
`bindingId`/`formatShortcut`/`matchesBinding` (platform-agnostic
modifier: Ctrl OR Cmd), `findShortcutConflicts` (per scope — the
audit), and `cheatSheet` (the help dialog's keyboard map, generated).
Components reach the registry only through `useCommands` facades (the
ESLint feature boundary).

**20.2 Palette** — `components/layout/command-palette.tsx` on cmdk
(the shadcn Command primitive): Ctrl/Cmd+K opens it anywhere except
over another open dialog (the "?"-key discipline; the chord toggles
it closed), arrows/Enter/Esc drive it, Radix Dialog traps and returns
focus, cmdk provides the listbox semantics (axe-clean). Fuzzy
filtering is the registry's own `filterCommands` (one implementation,
unit-tested; cmdk's `shouldFilter` off) and — a real defect the live
QA caught — the GROUPED no-query view runs through the same filter,
so availability gates both views identically. Recent sessions join as
their own group (the four most recent shelf rows, restorable through
the manager's one restore path). `useCommands`
(`hooks/use-commands.ts`) binds ids to live actions: navigation via
the landing store, theme via the theme store, dialogs and tours via
shell callbacks, and the editing family ROUTED to the active editor
store (repair/recovery/create/plan).

**20.3 Shortcut audit** — the remaining major actions bound without
conflicts: Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z / Ctrl+Y (redo)
route to the active editor, never firing while focus sits in a text
field (native input undo always wins). The registry records every
binding (including the display-only Esc/Tab/Ctrl+K entries the
primitives own natively); `findShortcutConflicts` is unit-tested
against the shipped registry (clean) and against a seeded collision
(detected). The [Phase 12](phase-12-quick-wins-theming.md) help sheet is now GENERATED from the registry
(`cheatSheet` through the `useCommands` facade) — the "only bindings
that ship" contract enforced by construction; the hand-maintained
table and its Phase 20 migration note are gone.

**The mode-switching fix (commit `3029a12`, the user's report).** The
drawing mode (Roads / Footpaths / Straight) was a whole-LINE setting:
switching it re-resolved every placed segment's road legs under the
new profile, cleared them on Straight, and tore down the draw session.
The mode is now a property of each SEGMENT: `DrawVertex.legStyle`
(stamped at draw time; mid-list inserts inherit the split leg's style;
drags keep it), `RoadLeg.mode` (profile-tagged lookups — car and foot
legs for one pair coexist), `joinStyledChain` (the single per-segment
join every consumer runs), per-pair leg resolution in all four editor
hooks (a chip switch rebuilds nothing and never invalidates in-flight
legs), the closing segment following the LAST drawn mode, the whole-
line snap preview overriding styles while on screen, and a legacy
fallback that renders pre-fix sessions unchanged. The panels say it
out loud: "New points follow … Each segment keeps the style it was
drawn with — switch any time, nothing you placed redraws."

**Verification:** +47 unit (23 registry — integrity, audit, binding
identity/matching, fuzzy ranking, availability, the generated sheet;
7 palette component — groups, filter, run/restore, listbox semantics,
fresh-open reset, availability in both views; 17 mixed-mode segments
— the fix's own matrix) → 1825 total. +7 e2e (5 phase20: open/search/
navigate, the no-stack rule, the audited undo/redo pair + native text
undo, axe, save→Recent sessions→restore; 2 mode-switch preservation:
the plan editor's Road→Foot→Straight→Road geometry preservation and
the repair editor's closing-follows-last-mode) → 191 total, full
regression re-run in six chunks, all green. Static export PASS.
Live QA `scripts/phase20-live-qa.mjs` 22/22 (both themes + mobile,
zero console/page errors — and the grouped-view availability defect
above was ITS catch). VLM: three critiques (light palette, dark search
view, generated cheat sheet); every measurable claim DISPROVEN by
`scripts/phase20-vlm-measure.mjs` (the Redo chips align at center
delta 0, "Double-click" does not wrap (25.5 px = single-line), the
Scroll/Pinch gap is 4 px, the Everywhere rows sit at a uniform 31.5 px
rhythm).
