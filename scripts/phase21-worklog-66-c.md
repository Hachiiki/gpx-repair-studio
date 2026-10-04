# Phase 21 — Task 66-c: i18n extraction, recovery + create domains

Task ID: 66-c
Agent: general-purpose sub agent (Phase 21 extraction crew)
Task: Extract the recovery and create domains' UI copy into the typed
dictionaries (docs/i18n-extraction-pattern.md protocol; exemplar
upload-zone.tsx + en/zh repair.ts).

## What shipped

14 component files extracted (every user-visible string moved to
`t()`; classNames, testids, structure, and behavior untouched) plus
the four owned dictionary bodies filled:

- `src/components/recovery/recovery-guide-card.tsx` — the wizard
  strip's title, the five status sentences, the three steps with
  their count chips (`recovery.guide.step.found` "{count} found",
  `.recovered` "{recovered} of {detected} recovered", `.drawn`
  "{count} drawn"), and the preview anchor.
- `src/components/recovery/recovery-preview-card.tsx` — the
  completed-route preview: title, the two PLURAL PAIRS the protocol
  requires (`desc.recoveredOne/Many` "{count} of {total} missing
  section(s) recovered…", `desc.drawnOne/Many` "{count} unmeasured
  section(s) drawn…"), the empty state, all five Row labels + hints,
  the needs-duration tooltip, the "unchanged" lock badge, and the two
  honesty paragraphs.
- `src/components/recovery/recovery-studio.tsx` — the recovery-voiced
  `copy` prop override for the reused ManualRepairsCard (all nine
  strings → `recovery.manual.*`, passed as translated VALUES — the
  reconstruction-domain card keeps rendering plain strings).
- `src/components/recovery/recovery-workspace.tsx` — landmark
  aria-labels, tools-column label, scroll cue, section heading +
  blurb, back link.
- `src/components/create/activity-stats-form.tsx` — the Step 1 form:
  heading + form aria-label, blurb, "Use example numbers", "Units"
  row, all field labels/hints/aria-labels, the submit button, and the
  no-file line.
- `src/components/create/consistency-note.tsx` — the time ≈ distance
  × pace cross-check verdicts: `create.consistency.rounding` and
  `.mismatch` ({implied}/{entered} durations).
- `src/components/create/create-guide-card.tsx` — the LOCATE_NOTICE
  module constant dissolved into `locateNoticeFor(t, status)`
  (denied/unavailable keys; locating is the button's own state),
  title/blurb, the recorded-stats recap (labels bold-split, values
  from format.ts), both draw-instruction paragraphs
  (lead/bold "Find my position"/tail), locate button + notices, the
  road-following privacy note, back-to-stats.
- `src/components/create/create-share-view.tsx` — share-view copy +
  SCALE_OPTIONS converted to the labelKey/detailKey pattern
  (`create.shareView.scale1`… `scale2Detail`, "1×"/"1080 × 1920"
  verbatim) — the same shape task 66-d used for the twin
  merge-share-view, so the two surfaces stay consistent.
- `src/components/create/create-studio.tsx` — the map srNote. The
  original prop value carried a SIGNIFICANT leading space
  (`" No recorded route — …"`); rendered bytes preserved via
  `` srNote={` ${t("create.studio.srNote")}`} `` — the space lives in
  JSX, not the dictionary.
- `src/components/create/create-workspace.tsx` — section aria-label +
  tools-column label.
- `src/components/create/reconcile-distance-dialog.tsx` — the
  finish-time warning, decomposed at the bold-markup boundaries:
  title, watchRecorded/butDrawn/difference ("— {percent}%
  {direction}." with `shorter`/`longer` direction words),
  bodyLead/drawnDistance/bodyMid/bodyTail(+WithPace with {pace}
  {unit}), the extreme hint, and both distance-basis actions with
  {distance} params.
- `src/components/create/route-draw-panel.tsx` — the three module
  copy constants converted to translator-fed resolvers
  (`getSpacingChoices(t, unitWord)`, `getPenChoices(t)`,
  `getPathStyleChoices(t)`; original design-rationale doc comments
  preserved), VertexRow's delete aria-label ({index}), the
  Longer/Shorter live comparison as full-sentence pairs
  (`compareLonger`/`compareShorter`, {recorded}/{difference}), pen +
  path-style group labels/hints, road-follow status quartet, the
  §EE 17.2 consent notice (lead/bold "turn it off"/tail), vertex
  counter ("{count} / {max} points" + " — limit reached"), spacing
  label/tooltip/options, drawn-points note, finish button + titles.
- `src/components/create/route-review-card.tsx` — title/blurb, the
  reconciliation trio labels, the match-distance choice
  (matchA11y/matchTitle/matchBody with {recorded}/{scale}/{drawn}),
  the extreme warning, the matches status, the summary heading + six
  row labels + "Reconstructed manually — {count} points", the
  timestamps/elevation honesty notes ({provider}), export/downloaded
  ({file})/edit actions.
- `src/components/create/share-create-dialog.tsx` — the header Share
  gate: title/blurb, step 1 decomposed at the bold boundaries
  (step1Title / literal "— " / bold fileName / step1Tail with the
  {elevation} suffix key — the semibold file name kept), step 2
  (step2Title/step2Lead + the bold trio / trioFallback / step2Tail),
  the footer honesty note, confirm/cancel.

### Key counts (en = zh, param parity verified mechanically)

- `src/i18n/dicts/en/recovery.ts` / `zh-CN/recovery.ts` — 48 keys:
  guide 12, preview 20, manual 9, workspace 7.
- `src/i18n/dicts/en/create.ts` / `zh-CN/create.ts` — 153 keys:
  statsForm 19, consistency 2, guide 15, drawPanel 45, review 25,
  reconcile 14, shareView 18, studio 1, workspace 2, shareDialog 12.
- zh translations follow the glossary verbatim (缺口/路线/轨迹/段/
  海拔/配速/总耗时/找回/重建/估算/导出/分享卡片/曲线笔/道路吸附…),
  {param} names and braces identical, full-width punctuation inside
  Chinese sentences, " — " kept half-width.

### Design decisions

- UNIT WORDS RIDE `i18n/units`, NOT the dictionaries (protocol:
  "never hand-translate numbers/units"). The form's distance suffix
  ("km"/"mi"), the pace suffixes in create-guide-card /
  route-review-card / reconcile-distance-dialog ("6:14 /km"), and the
  spacing option's unit ("Every 10 m") all read
  `UNIT_WORDS[locale]` (km/mi/perKm/perMi/m — the same table
  format.ts uses), so en renders byte-identical and zh renders
  公里/英里//公里//米 in lockstep with the formatted numbers. The
  PaceUnitToggle itself (shared/) is another agent's — untouched.
- Numerals and glyphs left in place (protocol "numbers" clause): form
  placeholders ("5.23", "6", "14"…), "—" placeholders, "+"/"−" signs,
  "·", "→", "▲ ▼".
- `getSpacingChoices`/`getPenChoices`/`getPathStyleChoices` are
  module-level but translator-fed (the getX(t) pattern); nothing
  outside route-draw-panel imported the old constants, so no exports
  needed and no tests needed updating.

## Domain-produced labels left for the coordinator (labelKey refactor)

Per the protocol's "t() source of truth" rule I STOPPED at these
instead of refactoring; they are NOT in my dictionaries:

1. `features/create/stats.ts` — `validateStatsEntry`'s per-field error
   sentences, rendered by my FieldError in activity-stats-form:
   "Enter the distance your watch recorded.", "Distance must be
   greater than zero.", "Enter your average pace — minutes and
   seconds.", "Pace must be greater than zero.", "Enter the total
   time your watch recorded.", "Total time must be greater than
   zero.", "Total time must be under 100 hours.", "Set when the
   activity started — platforms use it to place the activity."
   (create-stats.test.ts + create-ui.test.tsx assert them).
2. `hooks/use-create-share.ts` — `CreateShareContent.notes` (rendered
   verbatim by my create-share-view "What the numbers mean" card):
   "Route reconstructed by hand from the statistics your watch
   recorded.", "Distance is your watch's number — the drawn shape was
   scaled uniformly to it." / "Distance is the route you drew.",
   "Time is the total you entered; pace is time divided by that
   distance.", "The exported file carries estimated elevation from
   {provider} — the card shows distance, pace, and time only."
   (create-ui.test.tsx asserts two of them).
3. Same hook builds its pace string as
   `` `${formatPaceMs(paceMs)} /${paceUnit}` `` — a hand-built
   "/km" suffix where format.ts/UNIT_WORDS already own the
   locale-aware form; worth aligning in the hooks pass.

## Tests

Matched set (`ls tests/ | grep -iE "recover|create"`) run ONLY, per
protocol — no full suite, no i18n-runtime gate, no global tsc:

- tests/create-ui.test.tsx (31), tests/create-stats.test.ts (12),
  tests/create-store.test.ts (17), tests/create-track.test.ts (17),
  tests/create-gpx.test.ts (10), tests/create-elevation.test.ts (7),
  tests/recovery-ui.test.tsx (6), tests/recovery-store.test.ts (23),
  tests/recovery-pipeline.test.ts (8).
- RESULT: 9 files, 131/131 passed (run three times during the work;
  final run after the last edit). The en rendered text is unchanged —
  every copy assertion ("Shorter than your recorded 5.23 km",
  "Switch to Move (M) to drag a point", "drags your points",
  "6:14 /km", "14% shorter", "1 of 1 recovered", "unchanged",
  "including the estimated elevation", …) passes against the
  dictionary values.
- NO test file was modified by this task. (tests/session-views.test
  .tsx and tests/upload-zone.test.tsx show as modified in the tree —
  those are the coordinator's pre-existing Phase-21 changes, present
  before this task started and untouched here.)

## Scope discipline

Edited ONLY the 14 owned component files + the 4 owned dictionary
files. Shared index files, runtime, hooks, layout, shared/*
components: untouched. Nothing committed.
