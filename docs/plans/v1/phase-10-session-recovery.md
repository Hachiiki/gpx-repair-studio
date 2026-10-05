# Phase 10 — Session Recovery (gated: build only if justified) (Task 53)

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 9](phase-09-performance-large-files.md) · [Phase 11 →](phase-11-polish-docs-release.md)

## Plan

- **Objective:** crash/reload recovery for in-progress repairs, without violating local-first.
- **Scope (decision gate first):** confirm real user benefit (drawing a long route is minutes of work — likely yes, keep it small); IndexedDB autosave of `{ original file blob, reconstructions (vertices + settings), settings }`; restore prompt on load; "start over" + "clear stored data" controls; privacy panel documentation.
- **Tasks:** storage module + serialization round-trip tests; autosave scheduler (debounced on geometryRevision); restore/discard UX.
- **Files/components:** `lib/storage/sessionStore.ts` (IndexedDB wrapper), restore prompt component, privacy panel copy.
- **Dependencies:** [Phase 7](phase-07-merge-export.md).
- **Tests:** unit (round-trip, schema versioning/migration, quota errors); E2E (reload mid-repair → restore prompt → state intact; discard works; clear-data empties storage).
- **Acceptance criteria:** reload recovers everything; explicit discard and clear work; storage payload is only the small session record (never uploaded); app functions identically with storage disabled/blocked.
- **Definition of done:** committed as `phase(10): session recovery`.
- **Non-goals:** cross-device sync, accounts, cloud backup, multi-session history.

## Delivery record (Task 53)

**The objective.** A stray reload or closed tab no longer destroys
in-progress work: every drawing-bearing session autosaves to IndexedDB
and the landing page offers to restore it.

**The decision gate.** Passed, scoped deliberately: the four drawing
sessions (repair, recovery, create, plan) hold minutes of hand-drawn
work; **merge is excluded** — it carries no user-authored geometry
(re-picking files is seconds, not minutes) and a multi-blob record
would triple the storage surface for the weakest benefit. "Keep it
small" is honored by the payload, not by skipping surfaces.

**Storage** (`lib/storage/sessionStore.ts`): one database
(`gpx-repair-studio.sessions` v1) with TWO object stores — `state`
(one small record per section) and `files` (the original bytes, written
ONCE per session — geometry autosaves stay tens of KB even for a 24 MB
250k-point file). Single record per section, no history. Every
operation is guarded: no `indexedDB` (SSR), blocked private mode
(throwing getters included), quota errors, or corrupt rows degrade to
a silent no-op latch — the app functions identically with storage dead
(pinned by an e2e that neuters `indexedDB`). A 64 MB file guard keeps
unreasonable activities out. Deletes are issued only through a
"known record" tracker, so a visitor who never draws never gets an
empty database created at all.

**Records** (`lib/storage/session-record.ts`, pure): schema-v1
discriminated union — file sessions carry the repair work
(reconstructions with vertices + spacing + path style + time strategy,
skip marks, manual spans, file timing, gap thresholds, resolved road
legs), create adds the confirmed statistics + settings, plan adds the
goal time. Deliberately NOT recorded: undo/redo history (spans one
editor session by design), elevation fetch status (opt-in network
data, re-fetchable — a restored line restarts honestly at
"not-fetched"), transient aids (pointer mode, pen, snap), and views (a
view is not work). The path style is normalized (`undefined → "car"`)
because the stores never write the default — and a reloaded editor
adopts exactly that value anyway.

**Road-follow WYSIWYG.** Road legs ARE persisted (committed routed
lines render and distance from the side table — without them a
restored Roads line would draw straight until reopened), and the
restore seeds the shared router's cache from them
(`RoadFollowRouter.seedCache`), so an editor reopen finds cache hits
and issues ZERO new OSRM/Valhalla requests — the restored line is
byte-identical to the one the user saw (pinned by an e2e with a
request-counting mock).

**Autosave** (`hooks/use-session-recovery.ts`): per-section zustand
subscriptions (no React renders), an 800 ms debounce keyed on a cheap
signature (vertex counts + geometry revisions + settings + spans +
skips + timing + legs + thresholds + phase/stats), a `pagehide` /
visibility-hidden flush that runs the pending action exactly as the
timer would have. The work predicate keeps the prompt honest — a
repair record exists only once a vertex, manual span, skip mark, or
file-timing entry exists (a bare upload restores nothing worth a
prompt), and **undoing back to nothing deletes the record** so a
restore can never resurrect undone work. Records die at session
replacement (new upload → loading) and at reset ("Start over" lands
here through the store resets — one source of truth).

**Restore** reuses the real pipelines: file sections rebuild a `File`
from the stored blob and go through `loadGpxFile` / `loadRecoveryFile`
(worker parse, progress UI, announcements, the error surface), then
the stores' new `hydrate` actions adopt the work. Gap ids and point
ids are deterministic per document position, so re-detected gaps
re-adopt their reconstructions and manual spans survive; the
vertex-id allocator re-arms to the highest stored sequence so editing
continues without id collisions. A restored session re-persists
immediately (the beginLoad deleted the old record), so a SECOND reload
still finds it.

**The prompt** (`components/layout/restore-prompt.tsx`): renders on
the tool-cards page above the hero, exactly when storage holds
restorable work. One row per session (section kicker, file name or
route shape, drawn-work detail, "saved X ago") with Restore (the
session re-opens) and Discard (the record is deleted); the footer is
the [§M-3](../../MASTER_PLAN.md#m-3-user-facing-disclosure) disclosure in plain words — what is stored, that it never
leaves the device, and the "Clear all saved sessions" control. Since
[Phase 11](phase-11-polish-docs-release.md) the footer also carries the door into the full
"Privacy & Data" page (section CC).
