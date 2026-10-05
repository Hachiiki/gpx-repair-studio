# Phase 13 — Deep Validation & Repair Presets (Task 58)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 12](phase-12-quick-wins-theming.md) · [Phase 14 →](phase-14-formats-in-out.md)

## Plan (v2 roadmap)

**Objective:** the app finds problems, not just fixes known gaps.

- **13.1 Detector suite** (pure TS, `src/domain/validation/`):
  speed spikes (default threshold 130 km/h, configurable), duplicate
  points (< 1 m within a window), non-monotonic timestamps,
  elevation outliers (step/z-score), stop-and-wander drift heuristic
  (sustained sub-0.5 m/s scatter flagged as likely GPS drift),
  missing-elevation runs.
- **13.2 Provenance extension — the working-copy layer:** original
  data stays immutable; every fix (deletion, reordering, smoothing)
  is an override entry with a reason and timestamp. Exports and
  stats recompute from the working copy and label affected
  distances as modified. This layer is the foundation Phases 16 and
  19 build on.
- **13.3 Report UI:** issues grouped by severity with counts,
  jump-to-map, and a full textual list (a11y rule: every map
  capability has a text equivalent).
- **13.4 One-click fixes:** remove spikes, dedupe, sort-by-time
  (marks the file estimated), smooth flagged elevations — each
  previewed, confirmed, undoable, and logged.
- **13.5 Presets:** named bundles ("Drift cleanup", "Dedupe & sort",
  "Resample") that run detector→fix chains with a what-would-change
  preview before applying. [Phase 18](phase-18-batch-portable-sessions.md) reuses these for batch.

**Non-goals:** auto-applying fixes without preview, batch, snapping.
**Verification:** detector goldens on synthetic defective files,
fix round-trip unit tests, preset integration tests, e2e full
find→preview→fix→export flow, VLM on the report UI.

## Delivery record (Task 58)

Delivered per [§EE 13.1–13.5](#plan-v2-roadmap). The app now *finds* problems, not just
fixes known gaps — and every fix rides a provenance-carrying working
copy that Phases 16 and 19 build on.

**13.1 Detectors** — `src/features/validation/deepValidate.ts` (the
plan's `src/domain/validation/` became `src/features/validation/` — the
codebase's established features/-for-logic convention; recorded here as
a documented deviation). Six checks, every threshold configurable and
session-scoped: speed spikes (130 km/h default — the teleport line the
25 km/h [Phase-1](../v1/phase-01-gpx-domain-core.md) validator will not cross), near-duplicates (<1 m within
a window), non-monotonic timestamps, elevation outliers (both-sided
step + robust MAD z-score), stop-and-wander drift (sub-0.5 m/s runs
that stay within 10 m for 30 s+, untimed legs assume the 1 s cadence),
and missing-elevation runs (report-only). Findings aggregate per kind
with their point refs — the report lists them, the map jumps to them.

**13.2 The working-copy layer** — `features/validation/workingCopy.ts`.
The original stays immutable ([§G](../../MASTER_PLAN.md#g-data-model)); `applyWorkingEdits(original, log)`
derives an `OriginalTrackData`-shaped view every consumer can read.
Identity rule: an empty log returns the original *object* (effect keys
stay quiet for pristine files). Entries: point-deletion (ids stay
original-parse-stable — never renumbered, so gap anchors and repairs
keep joining; deleted anchors the merge already skips honestly),
segment-sort (stable by time, untimed sink to the end — disclosed),
elevation-override (point's `ele` replaced, `workingEle` provenance,
raw capture untouched). Segment extras re-anchor O(n). The working view
feeds the map route, the share card, the statistics, the segment list,
and the export; gap detection and the parse report stay on the original
(the details-row ValidationReport remains the immutable file's report —
the tools-column card is the living working-copy check; the split is
copy-explained).

**13.3 Report UI** — `components/gpx/deep-validation-card.tsx` leads
the tools column: severity-grouped issues with counts, jump-to-map
(`MapBinding.focusPoint` — camera focus, no persistent selection), the
expandable textual point list ([§C-5](../../MASTER_PLAN.md#c-5-accessibility) a11y equivalent, capped at 12 with
"+N more"), per-issue fix actions, the preset chips, and the change log
(label, reason tag, timestamp, "newest" marker, Undo-last). The stats
panel gains the "Modified:" disclosure; the export dialog and summary
disclose the working-copy counts.

**13.4 One-click fixes** — `features/validation/fixes.ts` plans every
fix PURELY (`FixPlan`: entries + touched points + what-would-change
lines) before anything exists. `components/gpx/fix-preview-dialog.tsx`
renders the plan's own words + the affected-points list; Apply writes
one `WorkingEdit` per plan (one undo step); Cancel changes nothing.

**13.5 Presets** — chains computed against the cumulative-log state
(detector → fix → re-detect): Drift cleanup (drift → dedupe), Dedupe &
sort, Resample (thin) — the plan's "Resample" ships as minimum-spacing
decimation: kept points stay byte-original, nothing interpolated; true
geometry-replacing resample belongs to [Phase 16](phase-16-track-surgery.md)'s surgery layer — plus
Spike & outlier sweep. Satisfied steps skip honestly.

**Persistence** — session-record schema v2: file records gain
`workingEdits` (tolerant read; v1 defaults to the empty log; the id
allocator re-arms on hydrate). The autosave gathers the log; the
restore prompt's detail line counts fixes ("1 fix (2 points)").

**Export honesty** — any working edit upgrades GPX 1.0 → 1.1 with
creator + note; the metadata note itemizes every change ("2 damaged
points were removed; 1 segment was reordered by timestamp (order is
estimated); 1 elevation was smoothed"); smoothed elevations carry
`<gpxr:modified reason="elevation" eleMethod="interpolated"/>` (new
schema vocabulary, re-import round-trips it verbatim).

**Verification (all green)** — detector goldens on the committed
synthetic `deep-defects.gpx` (one instance of every damage type; gap
detection stays quiet on it by construction) + hand-built edges;
working-copy round-trips (identity, immutability, extras re-anchoring,
undo); fix round-trips (each finding clears after its fix); preset
integration; store lifecycle; export round-trips (bytes, note, markers,
1.0→1.1, re-parse keeps fixes); card component tests. 1392 unit
(+81). E2E `phase13-validation.spec.ts` (9): report
grouping/counts/textual-list, camera-jump (bridge-asserted), the full
find→preview→fix→log→undo flow, the preset chain, stats labeling, the
export's downloaded bytes, and the schema-v2 reload restore. Full
regression 131/131 re-run in 5 chunks. Static export PASS. Live QA in
both themes at 1440 + 390: zero console/page errors. VLM: complete-card
9/10 SHIP (dark), preview 9/10 (light), stats 9/10 (light), mobile 9/10
— two early "critical clipping / missing section" claims were DISPROVEN
by measurement (scroll probe: the issue list scrolls 1194 px in a
352 px viewport, every row interactable; the "missing" CHANGES section
was a sticky-column capture artifact — at a tall viewport the VLM
itself scored the complete card 9/10 and called the list boundary
"expected behavior for a scrollable list"; the mobile "N button" is the
illustration's compass badge, the Task 56 artifact again).

**Decisions & deviations** (this section): features/validation path;
Resample-as-decimation with true resampling deferred to [Phase 16](phase-16-track-surgery.md);
details-report vs working-report split; jump-to-map as camera focus
without selection state; thresholds session-scoped (not persisted
preferences); one undo step per confirmed plan (preset steps come off
individually).
