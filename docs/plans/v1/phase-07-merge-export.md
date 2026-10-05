# Phase 7 — Merge & Export

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 6](phase-06-elevation.md) · [Phase 8 →](phase-08-mobile-accessibility.md)

## Plan

- **Objective:** produce and download the repaired GPX with full provenance and zero mutation of original data.
- **Scope:** `features/reconstruction/merge.ts`; full `features/gpx/exportGpx.ts` (Mode A structure-preserving default, Mode B merged; `gpxr` provenance extensions; metadata repair note); export settings (mode, resample spacing, pretty-print); pre-export summary dialog (what will change, final stats); download util; re-import recognition of `gpxr` markers.
- **Tasks:** merge + tests; exporter + round-trip suite; export dialog; download; re-import path in parser.
- **Files/components:** `features/reconstruction/merge.ts`, `features/gpx/exportGpx.ts` (extended), `lib/utils/download.ts`, `components/gpx/ExportDialog.tsx`.
- **Dependencies:** Phases [4](phase-04-reconstruction-drawing.md)–[6](phase-06-elevation.md).
- **Tests:** unit round-trip property suite (both modes; provenance survives; **original-values-untouched invariant**); E2E full happy path (upload → draw → time → elevation(mocked) → export → download intercepted → re-parse → assertions); manual check: exported file loads in Strava/Garmin Connect.
- **Acceptance criteria:** exported file is valid GPX 1.1 (re-parse + external validator); original points byte-identical in values; reconstructed points carry extensions; re-upload of a repaired file preserves the original/reconstructed distinction.
- **Definition of done:** committed as `phase(7): merge and export`.
- **Non-goals:** batch/multi-file export, exporting waypoints/routes modifications, TCX/FIT formats.
