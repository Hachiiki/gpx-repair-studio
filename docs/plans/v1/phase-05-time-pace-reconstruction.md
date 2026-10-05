# Phase 5 — Time & Pace Reconstruction

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 4](phase-04-reconstruction-drawing.md) · [Phase 6 →](phase-06-elevation.md)

## Plan

- **Objective:** estimated timestamps and pace for reconstructions; fallbacks for missing/unreliable time data.
- **Scope:** `features/reconstruction/timestamps.ts` (case matrix); `TimeStrategyControls`, `ManualDurationDialog`, file-level "no timing data" mode (start time + total duration entry); stats integration — full provenance-badged stats table (original / reconstructed-estimated / total-mixed); pace formatting; discrepancy flag (Case 4).
- **Tasks:** strategy functions + tests; UI controls; stats wiring; honesty-rule rendering ("—" + reason).
- **Files/components:** `features/reconstruction/timestamps.ts`, `features/statistics/pace.ts`, `components/reconstruction/TimeStrategyControls.tsx`, `components/statistics/*` extensions.
- **Dependencies:** [Phase 4](phase-04-reconstruction-drawing.md).
- **Tests:** unit (all case-matrix rows, edge durations); RTL (strategy switch updates stats + labels; no-time file prompts for duration); E2E: gap with timestamps → estimated pace shown and badged; file without timestamps → manual flow works.
- **Acceptance criteria:** every estimated value visibly labeled with method; unsupported stats show "—" + reason; manual duration only affects gap interior.
- **Definition of done:** committed as `phase(5): time and pace reconstruction`.
- **Non-goals:** elevation, export, shifting original timestamps.
