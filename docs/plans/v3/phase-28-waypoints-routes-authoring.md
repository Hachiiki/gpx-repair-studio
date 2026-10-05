# Phase 28 — Waypoints & Routes Authoring (Task 73)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 27](phase-27-cue-sheets.md) · [Phase 29 →](phase-29-resample-simplify.md)

## Proposal (v3 roadmap)

**Objective:** wpt and rte ride through today as preserved bytes —
v3 makes them first-class authored objects.

- **28.1 Waypoint authoring.** Create, edit, delete, and reorder in
  the repair working copy, merge, and plan; name, symbol, and
  description fields; a picker over the GPX 1.1 standard symbols.
- **28.2 Route objects.** `<rte>` graduates from verbatim snapshot
  to an editable route — the plan tool's natural timestamp-less
  export twin.
- **28.3 Export fidelity.** Authored wpt/rte in every format's
  writer; authored objects are user data, never marked
  reconstructed.

**Non-goals:** geocoding (network), proximity alarms.
**Verification:** authoring state machines, export round-trips per
format, surgery interplay (split and reorder against waypoints),
e2e and VLM.
