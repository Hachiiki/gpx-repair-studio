# Phase 33 — Strava Preview & Upload Guard (Task 78)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 32](phase-32-repair-forensics.md) · [v3 overview ↑](overview.md)

## Proposal (v3 roadmap)

**Objective:** the app doesn't just fix files — it tells you what
Strava will do with them, before you upload. Every rule below is
documented public behavior ([§RR](strava-interop-research.md)), not reverse-engineered
guesswork, and none of it contacts strava.com — the guard runs on
the same no-network constitution as everything else.

- **33.1 Upload preflight.** The 25 MB cap check; timestamps
  present, UTC, monotonic, no future-dated jumps (the exact class
  Strava's "Corrupted time data" rejects); time-less detection
  (their "Time information is missing"); course-shaped detection
  ("Not an Activity"); a strict-syntax lint standing in for their
  "Improperly formatted data". Each finding names the Strava error
  it would produce, in the user's locale.
- **33.2 The "what Strava will show" panel.** A preview beside the
  export: corrected-elevation estimate via the app's existing DEM
  provider as the local stand-in for their basemap, with gain
  counted under both documented sustained-climb thresholds (2 m
  barometric / 10 m corrected) beside the file's own gain;
  distance recomputed the way Strava does it when no distance
  stream exists (their connect-the-dots post-upload math, which
  the geodesy core already computes); moving time under their
  documented pause rules — pause events respected verbatim, no
  pauses → speed-threshold stop detection. Every number labeled an
  estimate with its rule named.
- **33.3 Honesty at export.** The panel states plainly that gpxr
  provenance markers do not survive upload (unknown extensions are
  ignored by their parser), so Strava will count reconstructed
  stretches toward distance, best efforts, and segment times —
  what our side marks, their side cannot see. The FIT route
  ([Phase 30.4](phase-30-tcx-fit-export.md)) is offered as the elevation-authoritative path.
- **33.4 The time-less intake.** A GPX without timestamps (another
  athlete's route download — Strava strips time from those by
  design — or a MapMyFitness export) opens in the create-from-stats
  flow: geometry imported as the drawing, timestamps synthesized
  under the create engine's provenance rules and marked as
  synthesized everywhere. The legitimate repair of "the file that
  cannot upload" — not a fabricator of activities never ridden.

**Non-goals:** uploading to Strava or any API contact (never —
strava.com joins the egress blocklist in tests), claiming to
match proprietary models number-for-number (estimates are labeled
estimates, the model named).
**Verification:** preflight goldens per rejection class,
panel-honesty unit tests (the estimate wording present in both
locales), the e2e privacy invariant extended to assert zero
strava.com requests, VLM on the panel in both themes.
