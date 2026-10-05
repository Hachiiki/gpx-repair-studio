# Phase 26 — Photo Geotagging (Task 71)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [v3 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 25](phase-25-heatmap-personal-segments.md) · [Phase 27 →](phase-27-cue-sheets.md)

## Proposal (v3 roadmap)

**Objective:** the photos taken on the activity, pinned to where
you were — EXIF written back on-device, never uploaded anywhere.

- **26.1 Matching.** EXIF DateTimeOriginal against track time, an
  offset-calibration control (camera clocks drift — a live match
  preview with a nudge slider), explicit timezone handling with the
  offset matrix documented.
- **26.2 Write-back.** GPS IFD injection into JPEG bytes locally;
  pins previewed on the map; Save As by default, in-place edits
  only through the File System Access API with an explicit choice.
- **26.3 Honesty.** HEIC/RAW refused with the reason stated;
  timestamp-less photos listed as unmatched; the footer says
  photos never leave the device.
- **26.4 Batch.** Many photos, one pass, a ZIP out with a manifest —
  the [Phase 18](../v2/phase-18-batch-portable-sessions.md) pattern applied to images.

**Non-goals:** face or scene AI, XMP sidecars (candidate), video.
**Verification:** EXIF round-trip property tests (bytes in, tagged
bytes out, originals untouched by default), timezone matrix units,
e2e with synthetic JPEGs, VLM on the match preview.
