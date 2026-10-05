# Phase 29 — True Resample & Simplify (Task 74)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 28](phase-28-waypoints-routes-authoring.md) · [Phase 30 →](phase-30-tcx-fit-export.md)

## Proposal (v3 roadmap)

**Objective:** the twice-deferred upgrade from thinning to real
geometry work — as working-copy fixes with previews, like the rest
of the deep-validation set.

- **29.1 Simplify.** Douglas-Peucker with an epsilon in meters; the
  preview states point count and distance error percent; one undo
  step.
- **29.2 Resample.** True interpolation to a target spacing, with
  timestamps interpolated under the reconstruction engine's rules.
- **29.3 Preset refresh.** "Resample (thin)" gains a mode choice —
  thin, simplify, resample — and stays batch-safe.
- **29.4 The trade-off, disclosed.** Thinning trades point density
  for size, and Strava's own matching docs recommend MORE points
  for finer segment timing ([§RR](strava-interop-research.md)) — every thin/simplify preview
  states the point count and names what coarser timing costs on
  platforms that match nearest points.

**Non-goals:** touching the original (the working copy only, as
ever), lossless claims (the preview's error percent is the
honesty).
**Verification:** algorithm goldens against reference
implementations, error-bound tests, preview and undo e2e, batch
regression.
