# Phase 3 — Map Display

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 2](phase-02-upload-inspection.md) · [Phase 4 →](phase-04-reconstruction-drawing.md)

## Plan

- **Objective:** the recorded route and its gaps are visualized on an interactive MapLibre map.
- **Scope:** `lib/map/mapController.ts` (+ layers/styles), `useMapController` binding, `MapCanvas` component, per-segment route styling, gap highlight + boundary markers, fit-bounds (activity + per-gap), tile provider config (OpenFreeMap default, OSM raster option, blank test style), attribution, legend, responsive layout, graceful offline degradation.
- **Tasks:** add `maplibre-gl`; controller wrapper; React binding; GapList ↔ map selection sync; offline overlay state.
- **Files/components:** `lib/map/*`, `components/map/*`, `hooks/useMapController.ts`.
- **Dependencies:** [Phase 2](phase-02-upload-inspection.md) (session state with parsed data).
- **Tests:** E2E asserts route/gap layers via controller state (no pixel diff); mobile viewport layout; offline test (tiles blocked → overlay + app functional).
- **Acceptance criteria:** route visible with distinct gap styling and markers; selecting a gap focuses map; pan/zoom smooth on 50k-point fixture; attribution visible.
- **Definition of done:** committed as `phase(3): map display`.
- **Non-goals:** drawing, reconstruction rendering, elevation profile.
