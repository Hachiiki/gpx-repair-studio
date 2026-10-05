# Phase 18 — Batch & Portable Sessions (Task 63)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 17](phase-17-road-snapping.md) · [Phase 19 →](phase-19-compare-summaries.md)

## Plan (v2 roadmap)

**Objective:** bulk power, and users keep full ownership of their
work.

- **18.1 Multi-file queue:** drop N files → a queue list with
  per-file status (parsed / issues found / fixed / exported) and
  aggregate stats.
- **18.2 Batch operations:** run a [Phase 13](phase-13-deep-validation-presets.md) preset across the queue
  with per-file previews before confirming; batch export as a ZIP
  (vetted client-side zipper — `fflate` or equivalent, static-export
  compatible) plus a manifest summary of what changed per file.
- **18.3 Portable session file:** serialize the full working state
  (originals + working-copy overrides + reconstruction + view) to a
  versioned `.gpxrepair.json`; open-from-file on the landing;
  export from the session. No accounts, ever — the file *is* the
  session.
- **18.4 Session manager:** named sessions in IndexedDB (extends
  [Phase 10](../v1/phase-10-session-recovery.md) recovery) — rename, delete, export, import.

**Non-goals:** cloud sync, accounts, cross-tab collaboration.
**Verification:** ZIP integrity tests, session round-trip fidelity
goldens, queue state-machine tests, e2e multi-file drop→preset→
export flow, VLM on the queue UI.

## Delivery record (Task 63)

**The story.** One file at a time is a tool; a folder of them is a
chore. And work trapped in one browser tab is work the user does not
fully own. Phase 18 closes both: a seventh tool — Batch cleanup —
queues up to fifty recordings, reports per file what the deep checks
find, runs one [Phase 13](phase-13-deep-validation-presets.md) preset across the whole queue (previewed per
file before anything moves), and exports one ZIP whose manifest states
exactly what changed in each file; and the sessions layer turns work
into a possession — named shelves in this browser, and a versioned
`.gpxrepair.json` document that carries the whole session (the
original bytes, every fix, every drawn repair, the view) anywhere.

**What shipped.**

- *18.1 The queue* (`state/batch-store.ts`, `hooks/use-batch-session.ts`,
  `components/batch/`): a 50-file ceiling with an honest refusal (the
  split returns, nothing silently dropped), sequential parsing through
  the real pipeline (one at a time — the [Phase 9](../v1/phase-09-performance-large-files.md) worker's contract),
  per-file statuses in the plan's own vocabulary (queued / reading /
  parsed / issues found / fixed / clean / failed), failed files keep
  their typed error and never block the rest, and the studio's
  aggregate line counts everything from derived views — never a second
  computation. No map by design: the batch is a table workflow; the
  repair studio stays the per-file surface.
- *18.2 Batch operations*: the [Phase 13](phase-13-deep-validation-presets.md) preset chips run across every
  parsed file through the SAME `planPreset` (shipped deep-check
  defaults — the recorded scope decision), each previewed per file in
  the FixPreviewDialog's plural twin ("nothing to do" stated plainly
  for no-op files) before one Confirm applies each file's chain as its
  own edit list (one undo step per fix, the working-copy rule). The
  ZIP (`features/batch/batchZip.ts` + fflate's sync `zipSync` —
  vetted, pure JS, static-export safe) carries one repaired GPX per
  file, exported through the SAME pipeline a single-file export runs,
  plus `MANIFEST.txt` whose per-file sentences reuse the working-meta
  counts the GPX repair note carries. Duplicate stems get " - 2"
  suffixes; unedited files export byte-identical to the identity
  export and the manifest says so.
- *18.3 Portable sessions* (`lib/storage/portable-session.ts`): the
  versioned document embeds the same `StoredSessionRecord` [Phase 10](../v1/phase-10-session-recovery.md)
  persists (one capture layer, two homes) plus the ORIGINAL bytes —
  XML as UTF-8 text, binary FIT as base64 through a pure codec (no
  btoa) — with a read-side version ceiling (discard, never guess).
  Export-from-the-session is one click in the sessions manager;
  open-from-file re-enters through the ONE restore path
  (`hooks/restore-session.ts` — the [Phase 10](../v1/phase-10-session-recovery.md) sequence extracted and
  shared, so an IndexedDB restore, a shelf open, and a file open are
  the same code).
- *18.4 The sessions manager* (`lib/storage/sessionStore.ts` DB v2's
  `saved` store, `hooks/use-saved-sessions.ts`,
  `components/shared/sessions-manager.tsx`): save the current work
  under a name (the SAME capture + WORK predicate the autosave uses —
  exported from use-session-recovery so the two can never disagree),
  list newest-first with rename / export / delete-confirm / open, and
  import a `.gpxrepair.json` onto the shelf. Named saves are explicit
  snapshots; the [Phase 10](../v1/phase-10-session-recovery.md) autosave stays the crash net — coexisting
  by design. The door is always in the header, plus the landing's
  "Continue a saved session" link.

**Verification.** Unit +34 (→ 1707): the queue state machine (cap
split, never-reused ids, status transitions, the edit log as undo
stack, the studio gate, reset), ZIP integrity (fflate round-trip
byte-identical, name suffixes, the manifest's counts agree with the
export's own note, the applied-preset line), portable goldens (record
verbatim + bytes byte-identical for text AND base64 sources, the
version ceiling, every typed error, RFC 4648 vectors), and the saved
store (CRUD, newest-first, drifted shapes skipped, the latched
failure contract). E2E phase18-batch.spec.ts 6/6: statuses → aggregate
→ preview → apply → undo → the downloaded ZIP unzipped and its
manifest asserted; the cap refusal; the portable round-trip (export →
reset → open → fix log + file name back); save/rename/delete; the
foreign-file refusal. Full regression re-run in chunks; the
landing-tile counts updated for the seventh door (smoke,
session-views, recovery-ui — three specs' six became seven). Live QA
(scripts/phase18-live-qa.mjs): both themes + mobile, 22/22 checks,
zero console/page errors. VLM (scripts/qa/phase18/ + two probes):
batch studio 7/10, manager 8/10, mobile 7/10 — every measurable claim
DISPROVEN by pixel/DOM measurement (chip offsets identical at 11px,
chip→name gaps identical at 8px, the error row keeps 13px padding
with scrollWidth == clientWidth, the dialog overlay covers the map at
z-50, no "compass button" exists in the mapless batch section — a
hallucination the pixel scan refuted); the header title's mobile
truncation is the app's existing design. Known observation recorded
for a future pass: the shared dialog close button's 16px hit target
(shadcn chrome, every dialog, not a Phase 18 surface).

**Decisions & deviations.** (1) Batch exports GPX only — the
full-fidelity format; KML/GeoJSON/CSV stay single-file features (the
manifest discloses per-file changes, and the settings honored are the
persisted mode/pretty chips exposed in the batch export card). (2) A
queue is not a session: batch has no named saves, no autosave record,
and no share view — the shelf is for repair / recovery / create /
plan (merge stays excluded by the [Phase 10](../v1/phase-10-session-recovery.md) gate). (3) The batch's
deep checks use the shipped defaults — tuning an individual file is
the repair studio's job (the preset card says so). (4) The portable
document embeds ORIGINAL BYTES, never a re-serialization — a reopened
session re-parses exactly what was uploaded. (5) Open-session-file
replaces the current session exactly like an upload does (the
manager's copy says so) — no merge-on-open, by design. (6) The
seventh landing tile centers on the desktop grid's third row (a
deliberate full stop under the six, `md:[&>li:last-child]:col-start-2`).
