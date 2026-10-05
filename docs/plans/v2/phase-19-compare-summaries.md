# Phase 19 — Compare, Summaries & Guided Flows (Task 64)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 18](phase-18-batch-portable-sessions.md) · [Phase 20 →](phase-20-command-palette.md)

## Plan (v2 roadmap)

**Objective:** trust in what changed, and deeper onboarding.

- **19.1 Before/after compare:** overlay mode (original as ghost
  track + working copy solid, changed segments highlighted in
  signal) and side-by-side mode; a stats delta table (distance,
  time, gain — original vs after, with estimated/modified flags).
- **19.2 Repair summary / print-PDF:** print stylesheet (no new
  dependency, static-export friendly): provenance table (estimated,
  filtered, snapped, sorted — every modification with counts),
  stats, and a static SVG snapshot of the track. Per-file and
  per-batch manifest variants.
- **19.3 Per-tool guided walkthroughs:** 3–5 step task-based tours
  per tool (extending the [Phase 11](../v1/phase-11-polish-docs-release.md) tour infra), using the [Phase 12](phase-12-quick-wins-theming.md)
  sample files as teaching payloads; dismissible, replayable from
  the help dialog.

**Non-goals:** video tutorials, account-based progress tracking.
**Verification:** compare-math unit tests, print-emulation e2e
(`media: print`), tour replay e2e, VLM on compare + summary.

## Delivery record (Task 64)

**The story.** Trust needs two things the app did not yet give: a way
to SEE what changed, and a way to take the record with you. Phase 19
closes both — plus the deeper onboarding the seven tools earned. The
Before/after card overlays the immutable original as a dashed ghost
under the working copy (the stretches the edit log touched, in
signal), lays the two track pictures side by side at one shared
scale, and counts the differences in a delta table whose numbers ARE
the statistics panel's numbers. The repair summary turns that into
paper: every modification kind with its count and its honest
disclosure, the applied-fix history, and a static SVG snapshot of the
track — one sheet per file, one table per batch. And every tool now
owns a 3–4 step task-based walkthrough, replayable from the help
dialog, whose first step can load the [Phase 12](phase-12-quick-wins-theming.md) teaching sample
through the same pipeline as an upload.

**What shipped.**

- *19.1 Before/after compare* (`features/compare/` +
  `hooks/use-compare.ts` + `components/compare/`): the pure
  `buildCompareStats` joins the original side (the SAME
  `originalDistanceStats` / `originalTimeStats` / identity-merge
  `buildElevationStats` the outcome side runs — never a second
  arithmetic) into four rows — points, distance, moving time, gain —
  each with a signed delta and a provenance word from the sanctioned
  vocabulary plus "Modified" (the plan's estimated/modified flags);
  unavailable inputs render "—" with their reason, never zero. The
  OVERLAY renders the original through the same `buildRouteView` the
  working copy uses (gap breaks agree) as `gpxr-ghost` (a dashed,
  theme-aware gray under the route) with the edit log's changed
  stretches as `gpxr-changed` (signal dashes) — pure
  `buildChangedSpans` resolves deletions/overrides to their
  neighborhoods (adjacent spans merge, kinds rank), sorts and
  structural entries to whole segments, and skips derived ids rather
  than guessing. The mode lives in `state/compare-store.ts` (a
  store, because the map binding needs the overlay before the draw /
  elevation bindings exist — AppShell builds it with the pure
  `buildCompareOverlay` at the top of the tree); a new file resets
  it. SIDE BY SIDE opens a dialog with two static SVG snapshots built
  against ONE shared bounds (identical viewBox — shapes truly
  comparable), re-constructions included, ghost under the after
  picture. The legend gains its two entries only while the overlay is
  on (the encoding contract stays honest about what is drawn).
- *19.2 Repair summary / print-PDF* (`features/compare/repairSummary.ts`
  + `trackSnapshot.ts` + `batchSummary.ts`): the provenance table
  counts every modification kind from the SAME working-meta
  vocabulary the GPX repair note and MANIFEST.txt use — filtered /
  estimated (smoothed) / sorted / structure (split, copy, reorder) /
  authored (reconstructions) / snapped (road-follow legs of committed
  repairs) / skipped gaps / re-imported markers — zero-count kinds
  omitted, each row carrying its disclosure, plus the applied-fix
  history in log order. The snapshot is a dependency-free SVG string
  builder (equirectangular with a cos(mid-lat) scale, simplify-capped,
  lines broken at damage AND gap boundaries exactly like the map's
  join — the unknown stretch is never drawn as recorded line, even in
  a thumbnail). Print is the [Phase 15](phase-15-stats-dashboard.md) flow's twin: `printing-summary`
  on body, a mutually-exclusive print-region rule in globals.css
  (each sheet hides the other regions — the stats sheet never bleeds
  into the summary sheet), the light-anchor palette re-pin, and a
  print-only masthead. The PER-BATCH variant
  (`components/compare/batch-summary-section.tsx` + the binding's
  pure `summary` join) prints one row per file — numbers, working-
  meta counts, preset, and a 168×84 thumbnail — with failed files
  listed honestly and the aggregate line up top.
- *19.3 Per-tool guided walkthroughs*
  (`components/layout/tool-tour.tsx` + `hooks/use-tool-tours.ts` +
  the tour-flag store's per-tool key): seven tours (repair, share
  card, recovery, create, merge, plan, batch), 3–4 steps each in the
  onboarding tour's voice, the copy a contract as everywhere else.
  A step may carry an ACTION that loads the tool's teaching sample —
  `makeSampleFile` through the SAME `loadFile` / `addMergeFiles` /
  `loadRecoveryFile` / batch-enqueue pipelines as an upload, shown
  only while the AppShell says it can run (a sample never replaces
  open work). The first visit to a tool offers the tour as a
  dismissible STRIP above the workspace — never a modal over
  someone's file; dismiss remembers exactly like finishing. Replay
  lives in the help dialog's new "Guided walkthroughs" section (one
  dialog at a time — help closes first). The e2e storageState seed
  marks every tool seen so the existing 174 specs never meet the
  banner; the tour specs opt out per-test like the onboarding spec.

**Verification.** Unit +71 (→ 1778): compare-math goldens (pristine
zero-deltas, deletion deltas with the modified flag, sorted-order
estimated flags, repair distance folding into the after side, the
null-honesty rules), changed-span derivation (neighborhood marking,
adjacency merging, kind ranking, whole-segment sorts, derived ids
skipped), the SVG builder (structure, determinism, layer order,
shared-bounds viewBox equality, gap-break honesty, damage skipping),
the provenance table (kinds, counts, disclosures, history order,
skipped-not-counted), the batch summary (rows, failed-file honesty,
aggregate reconciliation), the flag store (accumulate, corrupted-value
degradation, blocked-storage no-nag), the controller (offer follows
the tool, dismiss remembers, next/back/close, runAction advances),
and the components (delta table, mode control, dialog panels, summary
blocks, help list). E2E +10 (→ 184): phase19-compare 5/5 (the honest
pristine delta table; the overlay through the controller's test
bridge — layer ids, ghost/changed counts, the off toggle — plus the
legend entries and a real confirmed fix making the changed stretches
appear and the delta count them; side-by-side shared scale + Esc back
to off; print emulation with the stats region excluded while the
summary prints and afterprint cleanup; axe clean) and
phase19-tool-tours 5/5 (the help list starts tours one-dialog-at-a-
time, step navigation + flag writing + replay, the sample action
loading through the real pipeline, the offer's dismiss remembering, a
later visit staying quiet). The accessibility spec's workspace scans
gained `revealSettled` (the Task 53 rule) — the compare card made
the details column sit further below the fold, and a scrubbed
scroll-reveal reads as phantom low-contrast text under full-suite
memory pressure (verified against a HEAD worktree bisect: baseline
pass, flake only under load; the sanctioned fix applied to all four
workspace scans). Full regression re-run green. Live QA
(scripts/phase19-live-qa.mjs): both themes + mobile, 34/34 checks,
zero console/page errors — the ghost/changed counts through the live
map bridge (a `ghostPaint` observable added to it for the theme
assertion), the shared-scale viewBox equality, both print flows under
emulated media, and the mobile offer banner's fit. VLM
(scripts/qa/phase19/ + three probes): two critique passes over eight
screenshots; every measurable claim DISPROVEN by pixel/DOM
measurement (header/cell alignment identical to the pixel, panel
padding symmetric at 1px, sub-label contrast 7.57:1, the "orphaned
sentence" the manual-repairs card's complete intended copy); one
honest observation ACCEPTED — on a pristine file the ghost sits
exactly under the working copy, and the overlay note now says so
explicitly.

**Decisions & deviations.** (1) The compare overlay is OFF by default
and resets per file — the map shows the app's normal encoding until
the user asks for the ghost (the legend then says so). (2) Side-by-
side is static SVG, not two WebGL maps — one shared scale, printable,
cheap to open over the live workspace (a second map instance under
the sandbox's RAM ceiling was the rejected alternative). (3) The
delta table's after side reuses the outcome banner's arithmetic
(working-copy totals + the repair join) so the compare card, the
stats panel, and the export can never disagree. (4) The offer is a
strip, not a modal — a tour must never cover someone's open file.
(5) Tour actions only run when the tool has no data to lose; the
button hides otherwise (the copy stays truthful in both states).
(6) The repair summary prints the delta table, the provenance table,
and the snapshot in one region — the plan's "stats" wording is the
before/after numbers, not a second statistics sheet.
