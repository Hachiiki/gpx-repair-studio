# Phase 24 — Activity Library, Records & Trends (Task 69)

> **Status: DONE — shipped.** Delivered on explicit user instruction ("do phase 24") · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 23](phase-23-fitness-zones-metrics.md) · [Phase 25 →](phase-25-heatmap-personal-segments.md)

## Proposal (v3 roadmap)

**Objective:** the sessions shelf grows into the local training
library — the history view a training platform would give you,
computed on-device.

- **24.1 Library view.** A card per saved session (distance, moving
  time, pace, gain, avg hr when present), sort and filter,
  multi-select bulk delete and portable export.
- **24.2 Personal records.** Farthest, longest, most gain, and
  best efforts over the Strava benchmark ladder (400 m, 1 k,
  1/2 mi, 1 mi, 2 mi, 5 k, 10 k, 15 k, 10 mi, 20 k, HM, 30 k,
  marathon, 50 k) where a recorded track covers the distance
  (interpolated markers flagged); elapsed-time semantics — the
  clock does not stop, matching Strava's documented rule — and the
  top three lifetime efforts per distance. Efforts over
  reconstructed stretches are excluded, stated as a rule, not a
  footnote.
- **24.3 Trends.** Weekly/monthly volume charts; the
  fitness-fatigue line once enough history exists — the Banister
  1975 impulse-response model as Coggan applied it (fitness on the
  long timescale, fatigue short, form the difference), public
  science, cited in place — honest minimum counts, plain-language
  framing, explicitly not training advice.
- **24.4 Privacy.** Derived indexes live beside the sessions in
  IndexedDB, disclosed in the privacy pane, clearable with the
  shelf.
- **24.5 Race-time predictions (opt-in).** Riegel's classic
  exponent model (t₂ = t₁·(d₂/d₁)^1.06) over the Phase 24 best
  efforts — the honest local alternative to Strava's cloud ML
  predictions: no cohort, no upload, the formula shown, the
  caveats stated (it knows nothing about terrain or training
  history, and says so).

**Non-goals:** cloud sync, share links, sport auto-classification.
**Verification:** record goldens (including the
reconstructed-exclusion rule), trend math vectors, e2e over a
seeded library, VLM on library and trends.

## Delivery record (Task 69)

**Shipped.** Everything the proposal lists, on the recorded-data
honesty rules:

- **24.1 Library view** (the sessions manager, grown): the shelf rows
  became library cards — distance, moving time, pace, gain, avg HR
  (the merge-walk populations, not a second opinion) with the
  activity date and the drawn-in-repair disclosure — plus text
  filter, five sort modes, per-card checkboxes with a select-all, the
  bulk bar (multi-select delete with its confirm, the
  `.gpxrepair-library.json` bundle download), and the whole-library
  CSV export. The import door accepts BOTH portable documents by
  their format marker (single session or bundle). Planned routes
  (create/plan sections) stay on the shelf labeled *planned route —
  not a recording* and never join records or trends.
- **24.2 Personal records** (`features/library/records.ts`): best
  efforts over the fourteen-distance Strava ladder in ELAPSED time —
  the clock does not stop (a recorded GPS gap counts), windows never
  span track boundaries, reversed or untimed stretches are never
  guessed, and RECONSTRUCTED STRETCHES ARE EXCLUDED (a fast drawn-in
  shortcut never wins; stated as a rule in the tab's copy). Both
  boundary markers interpolate by distance and are flagged (≈) when
  they move. The optimum is EXACT: elapsed time is piecewise-linear
  along the route, so its minimum sits at a breakpoint — two monotone
  two-pointer sweeps (end-snapped, start-snapped) enumerate exactly
  those candidates, cross-checked against a 6000-position fine sweep
  on seeded random tracks. Lifetime records: farthest, longest, most
  gain read RECORDED-ONLY numbers (a reconstructed distance never
  wins farthest); top three per distance, ties to the earlier
  activity; untimed sessions count toward distance records but never
  time records, and are counted + disclosed.
- **24.3 Trends** (`features/library/trends.ts`): ISO-week (Monday)
  and calendar-month volume over LOCAL days (a training diary is a
  local artifact), undated sessions counted out, never bucketed at
  their save time. The fitness-fatigue line is the Banister
  impulse-response model as Coggan applied it — daily load = moving
  time, CTL τ=42 d, ATL τ=7 d, form the difference, the standard
  TrainingPeaks update `v += (load − v)·(1 − e^(−1/τ))`, hand-computed
  goldens — GATED by honest minimum counts (21-day span AND 8
  sessions; below them the tab shows the counts and the reason, never
  a confident curve over three rides), with the "volume model, not
  training advice" framing in place. Both charts carry the elevation
  profile's full discipline: focusable SVG, Arrow/Home/End/Escape
  cursor, pointer-nearest-bucket, polite live region, and a ≤24-bucket
  textual twin of the SAME series.
- **24.4 Privacy**: derived indexes live in a NEW `library` object
  store of the SAME `gpx-repair-studio.sessions` database (DB v3,
  created on demand), keyed by the session id — deleting a session
  cascades to its index, clearing the shelf clears them all, and the
  privacy pane discloses the store by name with the derived-only
  promise (pinned by the info-content test).
- **24.5 Race-time predictions** (opt-in): Riegel's
  t₂ = t₁·(d₂/d₁)^1.06 over the Phase 24 best efforts — seed picker
  (defaults to the longest covered distance), the ladder projection,
  the formula rendered in place, and the caveats stated ("a curve,
  not a coach: knows nothing about terrain, weather, or how you
  trained"). Off until asked, every time.

**The one-derivation rule.** Every index comes from
`indexFromFileRecord` — parse the stored bytes through the REAL
pipeline (`runParsePipeline`), rebuild the working copy + committed
repairs (the same join use-gpx-export performs, minus live elevation
samples a record never carried), `mergeRepairs`, then ONE walk
(`indexSession`) that produces the card numbers, the recorded-only
record numbers (legs touching reconstructed points are excluded from
both recorded distance and recorded gain), the §L-1-gated elevation
totals, the time-weighted average HR, and the efforts input. A
session saved today and a session backfilled from a pre-Phase-24
shelf re-derive through the SAME path, so the library's numbers can
never disagree with a restored session's dashboard. The backfill is
lazy by design — it runs when the library surfaces open (never at
app load), one row at a time, each result persisted in the `library`
store so it is paid once; a row whose bytes no longer parse marks
itself "failed" with a plain sentence and never blocks the rest.

**Verification.** 2045 unit tests (+82: the ladder constants, the
exact-optimum two-pointer against a fine-sweep cross-check, the gap/
reconstruction/untimed/reversed/multi-track honesty rules, the
interpolated-marker flags, top-3 ranking and recorded-only records,
the Riegel goldens, ISO-week/month bucketing on local days, the EMA
chain and decay asymmetry, the minimum-count gate, the index goldens
(card vs recorded numbers through a real repaired merge, the §L-1
coverage gate, avg-HR weighting over the real TCX pipeline), the
record→merge rebuild (pristine, repaired, and drifted-skip), the
index shape ceiling, the `library` store CRUD + delete cascade +
clear-with-shelf, the CSV shape and empty-field honesty, the bundle
round-trip and format routing, and the component suites for all
three tabs). 210 e2e (+3: the seeded shelf through the NEW bundle
import with cards/filter/sort/bulk/CSV, the records tab incl. Riegel
opt-in + the rules disclosure, the trends tab incl. the keyboard
readout, the twin, and the gated line; axe zero-critical on every
tab). Full 41-spec regression re-run in four chunks after the
delivery. Typecheck + eslint clean; static export + PWA build PASS.
VLM: six critiques (both themes, all surfaces) — every claim
measured by `scripts/phase24-vlm-measure.mjs`: the one real defect
(the window line read "Last 1 Weekly" — a count/noun mismatch) fixed
with singular/plural-aware copy and re-verified to read "The most
recent week, at most 24 shown."; the axis labels sit fully inside
the viewBox (28.0 ≥ 0 left, 579.7 ≤ 600 right — the "clipped Apr 29"
claim disproven); the ladder's session cells widened per the
truncation note.
