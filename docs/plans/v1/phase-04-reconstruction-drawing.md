# Phase 4 — Reconstruction Editor: Drawing

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 3](phase-03-map-display.md) · [Phase 5 →](phase-05-time-pace-reconstruction.md)

## Plan

- **Objective:** the user can draw and edit the missing route for a selected gap with full undo/redo — the heart of the product.
- **Scope:** `features/reconstruction/drawModel.ts` (pure ops + command stack), `resample.ts`; `state/editorStore.ts`; `useDrawEditor`; map draw-interaction layer (vertex mode, anchor snapping, optional snap-to-original-points, rubber band, handles for move/insert/delete); live distance badge; distinct reconstruction rendering; `DrawEditorPanel` + `UndoRedoBar`; gap status transitions; straight-line warning.
- **Tasks:** pure draw model + tests first; controller draw session; editor UI; live stats via `features/statistics/distance.ts`.
- **Files/components:** `features/reconstruction/{drawModel,resample}.ts`, `state/editorStore.ts`, `hooks/useDrawEditor.ts`, `components/reconstruction/*`, map layer additions in `lib/map/`.
- **Dependencies:** [Phase 3](phase-03-map-display.md).
- **Tests:** unit (command stack invariants, resample math); RTL (editor state machine); E2E synthetic-pointer drawing (desktop + mobile viewport) → dashed route connects anchors exactly; undo/redo/clear work; immutability test (original store unchanged).
- **Acceptance criteria:** draw → edit → undo → redo → clear all functional; distance updates live; reconstruction visibly distinct; anchors always connected; vertex hard-cap enforced.
- **Definition of done:** committed as `phase(4): reconstruction drawing editor`.
- **Non-goals:** timestamps/pace for reconstructions, elevation, export, freehand mode, gesture hardening ([Phase 8](phase-08-mobile-accessibility.md)).
