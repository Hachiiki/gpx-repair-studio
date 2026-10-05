# Phase 30 — TCX & FIT Export (Task 75)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 29](phase-29-resample-simplify.md) · [Phase 31 →](phase-31-locales-rtl.md)

## Proposal (v3 roadmap)

**Objective:** the export dialog stops being one-way — TCX and FIT
join GPX, KML, GeoJSON, and CSV out.

- **30.1 TCX writer.** Activity with laps (auto-lap per kilometer
  or per segment), hr/cad on the trackpoints; the round-trip proof
  is the shipped TCX parser re-reading the writer's output.
- **30.2 FIT writer.** A hand-rolled minimal encoder (file_id,
  activity, record, lap, session messages — no SDK dependency);
  the round-trip proof is the shipped FIT reader; gpxr provenance
  survives where the format allows and the export dialog says
  where it cannot.
- **30.3 Surface.** The export matrix and the batch ZIP gain the
  two formats; the README's format table updated.
- **30.4 Device-info preservation (the elevation authority).** FIT
  export carries the original file's device identity when intake
  was FIT — under Strava's documented rule ([§RR](strava-interop-research.md)), a recognized
  barometric device's file elevation is used as recorded, while a
  file without device identity (every GPX) gets its elevation
  discarded and recomputed from their basemap. Preserving device
  info keeps the repaired elevation authoritative; when absent,
  the export dialog says plainly that Strava will recompute it.

**Non-goals:** FIT Courses, TCX Courses (candidates).
**Verification:** writer-reader round-trip properties per format,
golden bytes for one canonical file, e2e export and re-import, VLM
on the updated dialog.
