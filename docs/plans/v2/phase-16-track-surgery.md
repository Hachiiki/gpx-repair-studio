# Phase 16 — Track Surgery & Input Freedom (Task 61)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 15](phase-15-stats-dashboard.md) · [Phase 17 →](phase-17-road-snapping.md)

## Plan (v2 roadmap)

**Objective:** full control of geometry beyond drawing — and the
keyboard-only repair milestone.

- **16.1 Surgery ops** (on the [Phase 13](phase-13-deep-validation-presets.md) working-copy layer): split
  track at a selected point, delete an A–B range, reorder segments,
  duplicate a segment. All provenance-labeled; stats recompute.
- **16.2 Numeric coordinate entry:** per-vertex forms
  (lat/lng/elevation/time) to add, insert, and move vertices by
  typing, plus arrow-key nudge with a configurable step — **closes
  the v1-documented a11y limitation** (drawing required a pointing
  device). A complete reconstruction becomes possible keyboard-only.
- **16.3 Validation:** coordinate sanity checks (bounds, precision)
  on entry, with the same honest-error style as the rest of the app.

**Non-goals:** freehand mode, snapping (17), batch.
**Verification:** surgery unit tests (geometry + provenance),
**e2e: a full gap repair completed with zero pointer events**
(keyboard-only milestone), VLM on the vertex forms.

## Delivery record (Task 61)

**Story.** The working copy gained a surgery layer: split a segment at
a picked point, delete an A–B range, duplicate a segment, and
rearrange segments within their tracks — every operation previewed
with its own words, logged with a reason, and undone as one step. And
the keyboard-only milestone landed: points can be added, inserted,
moved, and nudged entirely by typing — a complete gap repair now runs
with zero pointer events, closing the v1-documented a11y limitation
("the canvas is the one mouse surface").

**What shipped.**

- **The surgery layer** (`features/validation/workingCopy.ts`, the
  [Phase 13](phase-13-deep-validation-presets.md) interpreter extended): three new entry kinds.
  `segment-split` cuts a segment after a point — the tail moves to a
  derived segment (`{id}~s{n}`) in the same track, points keep their
  original-parse-stable ids, extras partition with their points and
  re-anchor piece-locally. `segment-duplicate` inserts a copy right
  after its source with point ids REWRITTEN to `{derivedId}:{i}`, so a
  later fix can address a copied point without aliasing the source.
  `segment-order` permutes the list (within-track moves only — the
  track structure is never crossed). Derived ids come from ONE shared
  per-run counter in log order (`~s1`, `~d2`, `~s3`…): replaying the
  same log — apply, hydrate, undo — always derives the same ids.
  Range deletion reuses the whole existing vocabulary: N plain
  point-deletion entries with reason "range". A post-sweep applies
  intents whose ids only exist after structural entries (a fix planned
  on a split piece or a duplicated segment's copied point).
- **The planners** (`features/validation/surgery.ts`): pure
  `FixPlan`s over the working view — entries, guards (split at the
  last point refused, ranges normalize order, orders must be true
  permutations, duplicates need points), and the what-would-change
  lines. `FixPlan.kind` widened to include the four `SurgeryKind`s so
  the FixPreviewDialog serves surgery unchanged — the same
  preview → confirm → logged → undoable ritual as every fix.
- **The surgery card** (`components/gpx/surgery-card.tsx`, the tools
  column between the deep-validation card and the draw editor): four
  operation chips; split and range select their points BOTH ways — a
  map pick (a new controller pick mode "point": one click on any
  recorded point, the classic 16 px rule, sequential picks for the
  range's A–B with same-segment enforcement) or typed point numbers
  with a live resolution line and a Jump button. Duplicate lists the
  working segments with per-row intents. Reorder drafts with
  within-track Up/Down buttons (no dragging — keyboard-native), then
  applies as ONE order edit. Picks and edits live in
  `use-surgery.ts`: entering a pick closes the draw editor (the
  startPickMode pattern), the editor's span picks cancel an armed
  surgery pick (one pick mode at a time).
- **Numeric entry** (`components/reconstruction/vertex-entry-list.tsx`
  in the draw panel, shared by the repair AND recovery studios): an
  add-by-coordinates form (always offered under the cap), per-vertex
  editable lat/lng inputs committing on Enter/blur, insert-after with
  a geodesic-midpoint prefill, and a focusable nudge handle per row —
  Arrow keys move the point by a configurable step (1/10/100 m,
  persisted in the ui-store; meters→degrees via the local
  approximation, longitude scaled by cos φ), Shift = ×10. A whole
  nudge run is ONE undo step (`drawModel.commitCommand` gained
  `{coalesce}` — a move onto a same-vertex move at the undo-stack top
  merges, keeping the run's start as `from`); typed commits never
  coalesce. The row inputs use the render-derived override pattern
  (external moves refresh the fields; no syncing effect).
- **16.3 validation** (`features/reconstruction/coordEntry.ts`):
  decimal-degrees grammar (DMS and scientific notation refused with
  the expectation named), bounds (|lat| ≤ 90, |lon| ≤ 180 — the error
  names the bound), >7 decimals rounded with a disclosed note (~1 cm,
  the export precision), and the nudge bounds predicate so a long
  arrow-key run can never walk a point off the world.
- **Honesty surfaces**: WorkingMeta gains split/copy/reorder counts —
  the stats "Modified:" note, the export dialog, the GPX metadata
  note, and every non-GPX exporter's provenance summary (KML,
  GeoJSON, CSV) itemize the surgery; the deleted-points sentence
  rewords to "(by fixes or manual range deletions)". Persistence
  stays schema v2: `isWorkingEdit` learns the new entry kinds and
  reasons; an older build rejects a record carrying them (the
  documented "discard, never guess" downgrade rule). AppShell's point
  resolver falls back to the working view so derived ids (a copy's
  rewritten `{derived}:{i}`) resolve for jump lists and previews.

**Verification (all green).** Surgery unit goldens: geometry + ids +
provenance (split pieces, split-of-split chains, duplicate id rewrites,
copied-point deletions/overrides/sorts through the post-sweep, order
permutations with unmentioned-ids tolerance, determinism — the same
log twice is JSON-identical, undo-by-log-slice, `workingMetaOf` mirror).
Planner guards and summaries; coordEntry grammar/bounds/rounding/
nudge math; coalescing invariants (runs merge, chains break on a
different vertex or a non-move, typed commits never merge); store
nudge (bounds refusal, one-undo runs); session-record round-trips for
every new entry kind + malformed rejections; component suites for the
card (chips, validation gating, pick fills incl. the cross-segment
refusal, reorder boundaries, preview-only-on-Confirm) and the vertex
forms (add/insert/move/Escape/nudge/step/cap). 1603 unit (+69). E2E
`phase16-surgery.spec.ts` (7): the card, split preview→confirm→undo,
range deletion→stats label→undo, duplicate in the export bytes
(coordinates twice + the note), reorder in list AND export bytes, the
map pick, and **the keyboard-only milestone — a full gap repair with
zero pointer events** (upload → editor → two points typed → nudge →
typed edit → commit → export, bytes verified). Full regression: the
151-test baseline re-run in chunks, all green (the keyboard spec's
Tab budget raised 60→120 — the surgery card and vertex forms added
legitimate keyboard stops; 2 session-recovery load flakes re-verified
standalone, the documented pattern). Typecheck + eslint clean; static
export PASS. Live QA `scripts/phase16-live-qa.mjs`: 22/22 in both
themes + mobile, zero console/page errors. VLM on the vertex forms and
the surgery card/preview: two claims CONFIRMED by measurement and
FIXED (the "Step" label gained its "Nudge" context; the insert form
is now indented + signal-accented, 12 px delta measured — it read as
identical to the append form); the rest DISPROVEN by the probe
(`scripts/phase16-vlm-probe.mjs`): the "truncated longitude" claim
measured 0 of 4 inputs clipping at full 7-decimal values, the chips
share one class expression (the active state is the pressed section —
the wrap was misread as demotion), and the preview footer is
right-aligned in code (the [Phase 13](phase-13-deep-validation-presets.md) dialog, unchanged).

**Decisions & deviations.** (1) The plan's "(lat/lng/elevation/time)"
per-vertex forms narrowed to lat/lng: `DrawVertex` carries no
per-vertex ele/time (elevation = per-gap DEM samples, time = per-gap
strategy — both already have their own keyboard-driven forms), and
nothing downstream would consume a per-vertex value; recorded as the
honest narrowing rather than inventing dead model structure. (2) Range
deletion = N point-deletion entries rather than a new kind — the
entire existing vocabulary (apply, persistence, export, undo) serves
it, and the log's reason keeps the trail. (3) The reorder draft is
invalidated by a rows-signature mismatch (any working edit underneath)
but never by the user's own draft moves — the signature is captured
at draft start. (4) Derived-id deletions/overrides/sorts apply in a
post-sweep rather than inline replay: log order guarantees structural
creators precede their derived intents, and the sweep is
order-independent and O(∑|entries|). (5) True geometry-replacing
resample stays deferred ([§GG](phase-13-deep-validation-presets.md)) — the surgery layer it needs now exists.
(6) No new runtime dependencies.
