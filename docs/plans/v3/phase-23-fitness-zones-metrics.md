# Phase 23 — Fitness Zones & Metrics (Task 68)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 22](../v2/phase-22-offline-pwa.md) · [Phase 24 →](phase-24-activity-library-records.md)

## Proposal (v3 roadmap)

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
