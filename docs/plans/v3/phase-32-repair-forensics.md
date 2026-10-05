# Phase 32 — Repair Forensics (Task 77)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 31](phase-31-locales-rtl.md) · [Phase 33 →](phase-33-strava-preview-upload-guard.md)

## Proposal (v3 roadmap)

**Objective:** for the file the parser cannot save — see the bytes,
patch the break, salvage the complete parts.

- **32.1 Hex viewer.** A byte-level view with the parse error
  mapped to its offset wherever the error carries one; region
  selection.
- **32.2 Manual patch.** A constrained editor for the broken
  fragment (well-formedness checked on keystroke), applied through
  the real parse pipeline; patches disclose in export metadata like
  any fix.
- **32.3 Truncation salvage.** Recover every complete trkseg from a
  cut stream; count and disclose the dropped tail.
- **32.4 Archive intake.** .zip and .tar holding GPX/TCX/FIT,
  extracted locally (fflate is already aboard) into the batch
  queue.
- **32.5 Strava's rejection vocabulary.** The upload preflight
  ([Phase 33](phase-33-strava-preview-upload-guard.md)) names Strava's exact documented errors — "Corrupted
  time data" (future-dated timestamps), "Time information is
  missing" (time-less points), "Not an Activity" (course-shaped
  files), "Improperly formatted data" (strict-parse failures) — so
  the app tells you the rejection before Strava does; truncation
  salvage answers their "no way to recover the remainder".

**Non-goals:** guessing beyond the existing repair engine, binary
FIT forensics.
**Verification:** salvage goldens (synthetic truncations at every
structure level), patch round-trips, archive e2e, VLM on the hex
view.
