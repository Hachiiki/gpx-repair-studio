# Phase 24 — Activity Library, Records & Trends (Task 69)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 23](phase-23-fitness-zones-metrics.md) · [Phase 25 →](phase-25-heatmap-personal-segments.md)

## Proposal (v3 roadmap)

**Objective:** the sessions shelf grows into the local training
library — the history view a training platform would give you,
computed on-device.

- **24.1 Library view.** A card per saved session (distance, moving
  time, pace, gain, avg hr when present), sort and filter,
  multi-select bulk delete and portable export.
- **24.2 Personal records.** Farthest, longest, most gain, and
  best efforts over the Strava benchmark ladder (400 m, 1 k,
  1/2 mi, 1 mi, 2 mi, 5 k, 10 k, 15 k, 10 mi, 20 k, HM, 30 k,
  marathon, 50 k) where a recorded track covers the distance
  (interpolated markers flagged); elapsed-time semantics — the
  clock does not stop, matching Strava's documented rule — and the
  top three lifetime efforts per distance. Efforts over
  reconstructed stretches are excluded, stated as a rule, not a
  footnote.
- **24.3 Trends.** Weekly/monthly volume charts; the
  fitness-fatigue line once enough history exists — the Banister
  1975 impulse-response model as Coggan applied it (fitness on the
  long timescale, fatigue short, form the difference), public
  science, cited in place — honest minimum counts, plain-language
  framing, explicitly not training advice.
- **24.4 Privacy.** Derived indexes live beside the sessions in
  IndexedDB, disclosed in the privacy pane, clearable with the
  shelf.
- **24.5 Race-time predictions (opt-in).** Riegel's classic
  exponent model (t₂ = t₁·(d₂/d₁)^1.06) over the Phase 24 best
  efforts — the honest local alternative to Strava's cloud ML
  predictions: no cohort, no upload, the formula shown, the
  caveats stated (it knows nothing about terrain or training
  history, and says so).

**Non-goals:** cloud sync, share links, sport auto-classification.
**Verification:** record goldens (including the
reconstructed-exclusion rule), trend math vectors, e2e over a
seeded library, VLM on library and trends.
