# Phase 2 — Upload & Inspection UI

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 1](phase-01-gpx-domain-core.md) · [Phase 3 →](phase-03-map-display.md)

## Plan

- **Objective:** a user can upload a GPX and see validation report, segments, detected gaps, and original-only statistics.
- **Scope:** `UploadZone` (drag/drop/picker), `useGpxSession` orchestration, `state/sessionStore` (Zustand installed here), app shell layout with panels (map area is a placeholder), `ValidationReport`, `SegmentList`, `GapList` (textual, with times/elapsed/coords), `GpxSummaryCard`, original-only `StatsPanel` (distance via geodesy, recorded time buckets), gap-threshold settings, error/empty states.
- **Tasks:** add `zustand`; build store + hook; build components; wire page composition (respecting the App.tsx rule); threshold settings persistence (in-memory + `localStorage` for *settings only* — small and non-sensitive).
- **Files/components:** `components/gpx/*`, `components/layout/*`, `hooks/useGpxSession.ts`, `state/sessionStore.ts`, `features/statistics/{distance,time}.ts`.
- **Dependencies:** [Phase 1](phase-01-gpx-domain-core.md) (domain core).
- **Tests:** RTL (upload/report/gap list/empty/error); unit (stats); E2E: upload fixture → gaps listed; invalid file → actionable error; 100k-point fixture loads without freeze (loose timing).
- **Acceptance criteria:** valid file shows summary + gaps; invalid file shows precise errors; no-timestamp file shows "no timing data" mode; settings changes re-run detection.
- **Definition of done:** committed as `phase(2): upload and inspection UI`.
- **Non-goals:** map rendering, any editing, elevation, export UI.
