# Phase 15 — Stats Dashboard (Task 60)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 14](phase-14-formats-in-out.md) · [Phase 16 →](phase-16-track-surgery.md)

## Plan (v2 roadmap)

**Objective:** from fixer to workbench — users get more out of
every file.

- **15.1 Splits engine:** km/mi configurable; per-split distance,
  time, avg pace, elevation gain; splits crossing reconstructed
  segments flagged estimated (honesty rule).
- **15.2 Elevation profile:** hand-rolled SVG (no new dependency,
  static-export safe), original vs reconstructed shading, hover
  readout, and a keyboard-navigable table as the textual
  equivalent.
- **15.3 Pace & time-in-motion:** pace-over-distance chart,
  stopped-time detection summary.
- **15.4 Stats CSV export** + a print-friendly stats view ([Phase 19](phase-19-compare-summaries.md)
  builds the full repair summary on this).

**Non-goals:** hr/power analytics (data exists post-14 but analysis
is deferred), third-party sharing integrations.
**Verification:** split-math goldens against hand-computed tracks,
chart a11y (axe + keyboard), e2e open-stats→export-CSV, VLM.

## Delivery record (Task 60)

**Story.** The repair studio stopped being only a fixer: every loaded
file now reads back its own numbers. Every kilometer (or mile) of the
route arrives as a split — distance, time, average pace, elevation
gain — the moving/stopped split of the timeline answers "was I
actually moving?", the elevation profile gained shading, a pointer
readout, and a keyboard cursor, and the whole dashboard ships out as a
long-format CSV or a printed sheet. All of it computed on the working
copy plus committed repairs — the same merge the export writes — and
all of it provenance-labeled.

**What shipped.**

- **Splits engine** (`features/statistics/splits.ts`, pure): one
  continuous walk over the merge's tracks with cumulative distance
  crossing track boundaries (the buildElevationProfile precedent).
  Each leg attributes distance AND time to the splits it overlaps,
  proportionally — linear time-over-distance interpolation inside a
  leg, the documented honesty rule. The leg vocabulary mirrors
  time.ts: reversed / gap / untimed legs contribute distance but no
  time and are counted per split (a split's time is partial → flags).
  Provenance per split: recorded (pure) / estimated (only
  reconstructed or reimport-marked points) / mixed (both). Elevation
  gain per split runs the SAME hysteresis deadband CONTINUOUSLY across
  the route, attributed where the climb realizes — Σ splits = file
  total; estimated elevation contributions flag the split.
- **Stopped time** (`features/statistics/motion.ts`, pure): a stop leg
  is 0 < Δt ≤ timeGapMs AND implied speed < 0.5 m/s (the constant is
  disclosed in the card; gaps are NOT stops — the device stopped
  writing, not necessarily moving). Consecutive stop legs merge into
  events (start, distance marker, duration, estimated flag when
  reconstructed legs are involved). Wall / moving / stopped / in-
  motion bookkeeping returned with the gap/untimed/reversed
  reconciliation.
- **The cards** (`splits-card.tsx`, `time-in-motion-card.tsx`): the
  pace-over-distance bar chart (one bar per split, height ∝ average
  pace, recorded ink vs signal orange for estimated/mixed, dashed
  baseline ticks for no-time splits) + the splits table with flags;
  the In-motion / Stopped summary blocks, the breakdown table, and the
  collapsible stop list. The split unit follows the persisted pace
  toggle — no new setting.
- **Elevation profile upgrades** (`elevation-profile-chart.tsx`): area
  shading under the curve (recorded neutral tint, reconstructed signal
  tint), a pointer crosshair with a live readout, a keyboard cursor
  (Arrow/Home/End on the focusable SVG + polite live region), and the
  collapsible profile table — the display series bucketed into ≤24
  distance intervals, disclosed as smoothed.
- **The sheet** (`statsCsv.ts` + `use-stats-export.ts`): a long-format
  CSV — section,label,value,unit,provenance,note — with meta (source,
  generated-at, app, split length), summary (totals incl. the working
  + repair disclosures), per-split, and stop-event rows; the RFC 4180
  escaper is the export-csv.ts one, reused. Print adds
  `printing-stats` to body: everything outside the stats region hides,
  a print-only masthead appears (file, date, "all processing local"),
  the palette re-pins to the light anchors (a dark-mode user still
  prints ink on white), and cards never split across pages.
- **Bounded DOM on huge files** (the [§C-2](../../MASTER_PLAN.md#c-2-performance-budgets-enforced-by-tests-in-phase-9) regression the 250k stress
  test caught): the splits table pages in steps of 60 rows with a
  disclosed "Showing X of Y — the stats CSV carries every one" (the
  Total row always reconciles over ALL splits); the pace chart draws
  every split but drops per-bar hover titles above 120 bars (sub-pixel
  targets) with a caption saying so.

**Verification.** 1534 unit tests (+57: split-math goldens — the
hand-computed constant-speed track, boundary-crossing attribution, the
partial last split, provenance via a synthetic merge, the no-timing
file; motion goldens; CSV structure; the component suites incl. the
DOM-cap and dense-chart contracts; the ≤24-interval profile-table
contract at both ends). 151 e2e (regression re-run in chunks + 6 new:
splits reconcile with the total + holes disclosed + unit toggle, time
in motion reconciles, profile readout/table/shading, CSV bytes, print
emulation with a stubbed window.print + afterprint cleanup, AxeBuilder
zero-critical). Typecheck + eslint clean; static export PASS. Live QA
(scripts/phase15-live-qa.mjs): both themes + print + mobile, 33/33
checks, zero console/page errors. VLM (scripts/qa/phase15/ + the
measurement probe scripts/phase15-vlm-probe.mjs): light 7/10, dark
7/10, mobile 4/10, print 7/10 — TWO claims CONFIRMED and fixed (the
profile table's bucket formula produced 161 near-identical rows on a
6.5 km route — now ≤24 intervals, locked by tests; the hover hint
leaked into the print sheet — now screen-only), the rest disproven by
measurement (chart/table counts match; dark muted text measures
5.03:1; no document-level mobile overflow — the wide table scrolls
inside its card by design; the SVG prints).

**Decisions & deviations.** Splits and stopped-time run over
exporter.merge (working copy + committed repairs) — the single-merge
rule the elevation rows and profile already use, so stats, export,
profile, and splits can never disagree about populations; card copy
discloses "computed on the route as it would export". The stats-sheet
actions are optional props on the shared StatsPanel (the merge and
recovery studios see no buttons — no working-copy narrative to
disclose there). The stop threshold is a named constant, not a
setting: 0.5 m/s, the same sub-walking pace the drift detector uses,
disclosed in the card. [Phase 19](phase-19-compare-summaries.md)'s full repair summary builds on the
print path landed here.
