# Phase 23 — Fitness Zones & Metrics (Task 68)

> **Status: DONE — shipped.** Delivered on explicit user instruction · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 22](../v2/phase-22-offline-pwa.md) · [Phase 24 →](phase-24-activity-library-records.md)

## Plan (v3 roadmap)

**Objective:** the hr/cad/power that has ridden along as read-only
passthrough since [Phase 14](../v2/phase-14-formats-in-out.md) gets its analysis — honest, in the stats
dashboard.

- **23.1 Zone sets.** Heart-rate zones (the classic five-band
  preset, boundaries editable), power zones (FTP-based percentages),
  cadence ranges; persisted beside the pace toggle. Defaults mirror
  the documented Strava set ([§RR](strava-interop-research.md)): heart-rate zones derive from max
  HR (220 − age, editable — their exact default and fallback), power
  zones are seven from FTP, pace zones are six set from a recent
  race result; their guardrails adopted too (no overlap, adjacent
  zones differ by at least one unit).
- **23.2 Time-in-zone.** Distribution bars plus the table, and a
  per-split zone breakdown; a metrics-free file renders "—" with
  the reason — the [§L-2](../../MASTER_PLAN.md#l-2-honesty-rules) honesty rules apply to zones exactly as
  they apply to pace.
- **23.3 Metrics charts.** hr/cad/power over distance, drawn over
  the elevation profile — Strava's own documented chart pattern for
  all three metrics — lightly smoothed with the smoothing disclosed;
  the profile's keyboard discipline (the textual table twin) applies.
- **23.4 Stopped-time refinement.** The 0.5 m/s stop threshold
  becomes configurable (default unchanged, disclosed in place).
- **23.5 Export.** Zone rows join the stats CSV and the print
  sheet.
- **23.6 Grade-adjusted pace (running).** GAP as a first-class
  metric from the published Minetti grade-energy curve — our model,
  named as ours (Strava's curve is proprietary; both agree the
  downhill adjustment peaks near −10%): GAP per split, GAP for the
  whole run, and pace-zone bucketing by GAP, exactly the Strava
  semantics.

**Non-goals:** editing hr/cad/power values (passthrough stays
read-only), VO2max estimation (fabrication-adjacent), fitness
modeling ([Phase 24](phase-24-activity-library-records.md)).
**Amended on the [§RR](strava-interop-research.md) research:** an energy (calorie) estimate
joins as an opt-in sub-item — Strava's own documented approach is
an estimate with named inputs (rides: power with a human efficiency
coefficient; runs: weight, GAP speed, moving time), so ours ships
the same way: opt-in, weight stored locally only, formula disclosed
in place, labeled an estimate everywhere it appears.
**Verification:** zone boundary tests (exact-at-limit), no-data
honesty cases, chart a11y and textual twins, e2e on a
metrics-bearing sample, VLM on both themes.


## Delivery record (Task 68)

**Shipped.** Everything the proposal lists, on the §RR research
grounding:

- **23.1 Zone sets** (`features/statistics/zones.ts`): HR zones derive
  from an editable max HR (default 190 bpm — the documented Strava
  fallback; editing re-derives boundaries at 60/70/80/90%, disclosed),
  power zones from FTP (default 200 W, Coggan's published
  percentages), pace zones from one race result (six presets, the
  Riegel-normalized one-hour pace × our multipliers — a 25:00 5k reads
  ~5:15/km threshold, golden-tested). Guardrails adopted verbatim:
  strictly ascending, adjacent ≥ 1 unit, caps 230 bpm / 500 W /
  20–250 kg. Persisted in the ui store beside the pace toggle; the
  settings popover commits on blur with inline guardrail reasons.
- **23.2 Time-in-zone** (`zones-card.tsx`): distribution rows with
  inline share bars, the zone table (names from the documented Strava
  vocabulary), the reconciliation line (zones + no-data = moving
  time), the per-split × per-zone breakdown (collapsible, the same
  distance attribution the splits table uses, binary-searched), and
  the honesty cases: metrics-free tabs render their reason, never a
  zero row; every reconstructed stretch counts as no-data (recorded
  metrics only — §EE 14's passthrough is read-only).
- **23.3 Metrics charts** (`metrics-chart.tsx` + `metrics-series.ts`):
  hr/cad/power over distance drawn over a faint elevation backdrop —
  Strava's documented chart pattern — with the elevation chart's full
  discipline copied verbatim: focusable SVG, Arrow/Home/End/Escape,
  pointer-nearest-sample, polite live region, ≤24-interval textual
  twin, smoothing window disclosed (5, display-only, §K-2). The
  profile walk is chart-gated: metrics-free files never pay it.
- **23.4 Stopped-time threshold**: `stopSpeedMps` is a persisted
  setting (default unchanged at 0.5, the card's copy discloses the
  live value, the sheet's meta row records it).
- **23.5 Export**: zone rows join the stats CSV (`zone` + `split_zone`
  sections, `hr_max`/`power_ftp`/`pace_race`/`stop_speed`/model meta
  rows, GAP + calorie summary rows); the cards print inside the stats
  region.
- **23.6 GAP** (`gap.ts`): the Minetti grade-energy curve (clamped to
  its ±45% measurement range), whole-run GAP, per-split GAP (a new
  splits-table column, estimated-flagged through reconstructed
  stretches), and pace-zone bucketing by GAP — the uphill-lands-a-
  faster-zone semantics is golden-tested.
- **The calorie amendment** (`calories.ts`): opt-in; power files get
  the trapezoid ÷ 24% efficiency, everything else the running model
  (weight × the Minetti integral); weight stored locally only; every
  appearance says *estimate* and names its model.

**The one-merge rule, held.** Everything computes over
`exporter.merge` through a SINGLE shared walk (`buildFitnessLegs`):
one O(n) pass carries every leg's metric averages, flat-equivalent
duration, and the GAP/metabolic/power integrals; the analyses are
cheap aggregations over it. The first draft walked once per metric
and blew the §C-2 upload budget at 100k points — the audit found the
per-split attribution's linear window scan (legs × splits × 3) and
the redundant walks; the walk is now shared, the window lookup
binary-searched, and the engines measure ~73 ms + ~48 ms + ~56 ms at
100k in isolation (probe numbers in the worklog). The performance
spec's two dev ceilings were recalibrated per its own documented
1.5× discipline (the sandbox also measures ~60% slower than
calibration day — verified with the walk stubbed out); the §C-2
production targets are unchanged.

**Bugs the phase's own tests caught.** The stats CSV's per-split pace
rows emitted milliseconds-per-km under a seconds label (a Phase 15
1000× bug the new cross-unit GAP tests exposed — ratios had hidden
it); pace values now carry three decimals so the km/mi ratio survives
rounding. The settings popover could push its bottom sections out of
reach on a mid-viewport anchor — it now clamps to Radix's
available-height variable with internal scroll (the e2e's finding).
Zero-time zones drew a 3px sliver bar (the VLM sweep's one real
polish — a zero-duration zone draws no bar).

**Verification.** 1963 unit tests (+74: Minetti curve goldens, exact-
at-limit zone membership, the documented guardrails, endpoint-averaged
leg attribution over the real parse+merge pipeline, the no-data
honesty cases, per-split proportional attribution, Riegel one-hour
pace, both calorie formulas with the opt-in gate, the display-series
holes/decimation/smoothing contracts, CSV zone sections, and the
component suites for all three new surfaces). 207 e2e (+6: the
metrics-bearing ride.tcx opens the zones card with real
distributions, the metrics chart's keyboard readout + textual twin,
the settings popover re-derives boundaries in place + the calorie
opt-in, the pace tab's GAP line + race-unset reason, the CSV zone
rows, axe zero-critical on every new surface). Full 40-spec
regression re-run in four chunks after the shared-walk refactor.
Typecheck + eslint clean; static export + PWA build PASS. VLM: six
critiques (both themes, all surfaces) — every claim measured and
disproven by `scripts/phase23-vlm-measure.mjs` ("0:00" renders fully
— the accused bar is the zero-share sliver, now gone; the chart
series' bbox sits inside its viewBox; the popover is scrollable by
design and fits the viewport).
