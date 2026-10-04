# Phase 21 — Task 66-d: i18n extraction, merge + plan domains

Task ID: 66-d
Agent: general-purpose sub agent (Phase 21 extraction crew)
Task: Extract the merge and plan domains' UI copy into the typed
dictionaries (docs/i18n-extraction-pattern.md protocol; exemplar
upload-zone.tsx + en/zh repair.ts).

## What shipped

13 component files extracted (every user-visible string moved to
`t()`; classNames, testids, structure, and behavior untouched):

- `src/components/merge/merge-intake.tsx` — the multi-file drop zone,
  the privacy line, the "Try a sample pair" flow (Phase 12), the
  collected-file rows (points/segments/waypoints plural pairs as
  `merge.intake.fileSegment`/`fileSegments`, `fileWaypoint`/
  `fileWaypoints` with `{count}`), the Combine gate's two cap
  messages, and the join-order hint.
- `src/components/merge/merge-files-card.tsx` (arrangement) — title,
  intro, order/position aria labels, per-row aria labels (move
  up/down, show on map, remove — `{fileName}` params), "Add files",
  "Sort by start time", the no-timestamps suffix.
- `src/components/merge/merge-details-card.tsx` — combined-activity
  identity: title, intro, name label + placeholder + hint, and the
  four fact-row labels.
- `src/components/merge/merge-export-card.tsx` — download title,
  the intro sentence as a one/many plural pair
  (`merge.export.introOne`/`introMany`, `{points}` + `{count}`), the
  contract-gate reason, and the verbatim-carry honesty paragraph.
- `src/components/merge/merge-studio.tsx` — the composition root's
  WorkspaceLayout labels (section/tools/details/scroll cue), the map
  srNote (`{count}` recordings), the "Merged recording" file-name
  fallback, and the degenerate empty-details state.
- `src/components/merge/merge-share-view.tsx` — share view copy +
  the SCALE_OPTIONS module constant converted to the labelKey/
  detailKey pattern (`merge.shareView.scale1`… `scale2Detail`,
  values "1×"/"1080 × 1920" moved verbatim).
- `src/components/merge/share-merge-dialog.tsx` — the two-step
  warning decomposed at the bold-markup boundaries
  (step1Lead/step1Mid/step1Tail, step2Lead/step2Mid/step2Fallback/
  step2Tail), the honesty paragraph, confirm/cancel.
- `src/components/plan/plan-start-card.tsx` — the honest scratchpad
  contract (pace bullet split lead/bold/tail around the
  `<strong>no export and no share</strong>`), "Start planning".
- `src/components/plan/plan-guide-card.tsx` — LOCATE_NOTICES module
  constant dissolved into the component (denied/unavailable keys),
  the scratchpad contract (lead/bold/tail), locate/clear buttons +
  their conditional titles.
- `src/components/plan/plan-draw-panel.tsx` — PEN_CHOICES and
  PATH_STYLE_CHOICES converted to `getPenChoices(t)` /
  `getPathStyleChoices(t)` (TranslatorArg; labels + tooltips), the
  pen-inactive note as `{action}` param over pointerMoves/
  pointerPans, the road-follow status ternary chain, the §EE 17.2
  consent notice + enable button, the consent-on note split around
  the "turn it off" button, the vertex count + cap suffix
  ("{count} / {max} points" + " — limit reached"), the vertex-list
  note, and VertexRow's delete aria-label (useI18n added to the
  local row component).
- `src/components/plan/plan-estimates-card.tsx` — labels only, as
  instructed: the crow-flies comparison as three keys with
  `{straight}`/`{factor}`/`{distance}` params (VALUES stay in the
  locale-aware format helpers), goal-time h/m/s labels via a
  labelKey array + `goalTimePart` aria ("Goal time {part}"), the
  three pace hints, the "Planned" badge, the even-splits intro with
  a `{unit}` param over kilometer/mile keys, and the tail row
  ("last {distance}" / "ends at {time}").
- `src/components/plan/plan-studio.tsx` — the map srNote (leading
  space preserved byte-identically).
- `src/components/plan/plan-workspace.tsx` — section aria-label +
  tools-column label (useI18n without "use client" — same pattern
  as the already-extracted session-views.tsx).

## Dictionaries (owned; bodies filled, export names kept)

- `src/i18n/dicts/en/merge.ts` — 84 keys (`merge.*`, sub-namespaces
  intake / arrangement / details / export / studio / shareDialog /
  shareView), en values byte-identical.
- `src/i18n/dicts/zh-CN/merge.ts` — 84 keys, full parity.
- `src/i18n/dicts/en/plan.ts` — 78 keys (`plan.*`, sub-namespaces
  start / guide / draw / estimates / studio / workspace), en values
  byte-identical.
- `src/i18n/dicts/zh-CN/plan.ts` — 78 keys, full parity.

Key-parity verified mechanically (en ↔ zh ↔ every key referenced in
the 13 components; no unused keys, no missing keys). Special
characters preserved: em dash " — ", ellipsis "…", "×" in the detour
factor and PNG scale labels, "&" in "Statistics & file details" /
"Download GPX & open share card", and the leading space in
`plan.studio.srNote`.

## Testing

`ls tests/ | grep -iE "merge|plan"` → 9 files, ALL run, no other
tests touched, no full suite, no i18n-runtime gate, no global tsc:

    npx vitest run tests/merge-elevation.test.ts tests/merge-files.test.ts \
      tests/merge-share.test.tsx tests/merge-store.test.ts \
      tests/merge-ui.test.tsx tests/merge.test.ts \
      tests/plan-estimate.test.ts tests/plan-store.test.ts \
      tests/plan-ui.test.tsx

Result: **9 files, 130/130 tests PASS** (the jsdom
HTMLCanvasElement.getContext warnings in merge-share are
pre-existing noise). NO test files were modified — every copy
assertion (Add at least two track files / One more file /
rearrange everything on the next page / points · / no timestamps /
Files merged / Waypoints / carried over verbatim / needs at least
two files / same file the Download button produces / merging
re-orders files, never values / the merged file's distance, pace,
and time / no export and no share / no export, no share / Start
planning / permission was declined / 3 / 128 points / 5.23 km /
Switch to Move (M)… / Drag any point to adjust / drags your points
/ navigates the map / 2.5× / 6:13 /km / 9.6 km/h / Planned / 1 km /
230 m / draw a route on the map first / enter a time above) passes
unmodified because the en values are byte-identical.

ESLint run scoped to my 17 files: clean. merge-studio /
plan-studio / plan-workspace are not imported by any vitest file;
their edits are mechanical t() prop substitutions (all target props
are `string`), syntax-verified via the typescript-eslint parse.

## Left for the coordinator (NOT refactored, per protocol)

1. **Hook-produced display sentence** — `use-merge-share.ts:100`
   builds the share-card note
   "Combined from {N} recordings — every point carried over
   verbatim, in the order you set." and prepends it to
   `content.notes`. Rendered verbatim in merge-share-view's "What
   the numbers mean" card. Hook file is outside my 13-file scope →
   labelKey refactor candidate (the hook could emit a
   `merge.shareView.noteCombined` key + `{count}` param).
2. **features/share/cardContent.ts notes** — the honesty notes
   ("This file has no usable timestamps — …", "—") are domain-module
   sentences (pure, non-React). Same labelKey refactor family.
3. **Typed parse-error titles/details** — "Not a GPX file" /
   "Empty file" (+ details) are produced in
   `use-gpx-session.ts` / `use-merge-session.ts` and rendered in
   the merge intake/arrangement error rows (`file.error.title` —
   `file.error.detail`; only the " — " join punctuation lives in
   my JSX). Domain copy, not extracted.
4. **Split-row unit labels** — plan-estimates-card's whole-split
   rows compose `` `${split.unit} ${paceUnit}` `` ("1 km") from a
   number + the PaceUnit enum token; consistent with
   PaceUnitToggle's raw "km"/"mi" tokens (machine values). Left
   as-is.
5. **Reused cross-domain components** rendered by merge-studio /
   plan-studio (GpxSummaryCard, ValidationReport, StatsPanel,
   MapCanvas, ElevationControls, UndoRedoBar, ProvenanceBadge,
   PaceUnitToggle, ShareCardCanvas) belong to other agents'
   domains.

## Notes for the i18n gate

- The merge/plan dict skeletons were empty; bodies filled in one
  pass, `as const` kept on both en objects, `Record<string, string>`
  retained on both zh objects (tightening is the coordinator's
  completeness-gate step, as with zhRepair).
- No files outside the 13 components + 4 dictionaries were touched;
  nothing committed.
