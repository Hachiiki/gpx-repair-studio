# Phase 27 — Cue Sheets & Turn-by-Turn (Task 72)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 26](phase-26-photo-geotagging.md) · [Phase 28 →](phase-28-waypoints-routes-authoring.md)

## Proposal (v3 roadmap)

**Objective:** the plan tool's route becomes a printable sheet of
instructions — the [§EE](../v2/overview.md) non-goal deferred at [Phase 15](../v2/phase-15-stats-dashboard.md), buildable
now.

- **27.1 Instructions.** Bearing-change detection with distance
  thresholds; street names on road-followed legs (the routers
  return them and the app discards them today — Phase 27 preserves
  them on the leg); "Turn left onto X", "Continue", "Arrive", in
  every shipped locale's words.
- **27.2 The sheet.** Numbered rows — cumulative distance,
  instruction, elevation at the turn, a notes column — with print
  CSS like the stats sheet and a text/CSV export.
- **27.3 Elevation-aware ETA.** Per-waypoint ETA from a goal time
  or a pace, with grade-adjusted slowdown on climbs — a simple,
  disclosed model, not a physiology engine.

**Non-goals:** voice output, live navigation, geocoding.
**Verification:** instruction goldens (bearing thresholds
exact-at-limit), street-name preservation round-trips, print e2e
plus a PDF snapshot, VLM on the sheet.
