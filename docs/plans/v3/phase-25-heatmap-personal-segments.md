# Phase 25 — Heatmap & Personal Segments (Task 70)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 24](phase-24-activity-library-records.md) · [Phase 26 →](phase-26-photo-geotagging.md)

## Proposal (v3 roadmap)

**Objective:** your own history on the map — where you have been,
and how fast you have covered the stretches you repeat.

- **25.1 Heatmap layer.** Density rendering of every library track,
  worker-computed, a map-toolbar toggle, theme-aware ramp; large
  libraries decimate the way the 250k profile taught.
- **25.2 Segments.** Define one by selecting a stretch of any track
  or drawing it; the matcher finds your efforts across the library
  and keeps a PR table with dates. Matching follows Strava's
  documented semantics ([§RR](strava-interop-research.md)): an effort is timed from the nearest
  recorded points crossing the segment's start and end, on elapsed
  time, with a drift tolerance — more points mean finer timing.
- **25.3 The honesty rule.** Segment efforts count recorded data
  only — a stretch repaired by drawing is flagged and never a PR
  ([Phase 24](phase-24-activity-library-records.md)'s rule, restated where it bites hardest).
- **25.4 The repair dividend, disclosed.** On Strava, a mid-segment
  data gap breaks matching (their documented "Gap Threshold") — the
  gap-repair tool restores segment eligibility, and the segment
  view says so: repaired tracks match again; drawn stretches still
  never set PRs here.

**Non-goals:** leaderboards, network matching, importing others'
segments.
**Verification:** matcher goldens (overlap, dedup, tolerance
boundaries), heatmap perf budget, e2e segment create → match → PR,
VLM on both themes.
