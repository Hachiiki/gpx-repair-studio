# Phase 6 — Elevation

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 5](phase-05-time-pace-reconstruction.md) · [Phase 7 →](phase-07-merge-export.md)

## Plan

- **Objective:** opt-in elevation estimation for reconstructed points, with gain/loss and a provenance-clear profile chart.
- **Scope:** `features/elevation/{provider,openmeteo,cache,smoothing}.ts`; pre-fetch privacy disclosure (exact point count + destination); batch/throttle/retry; in-memory LRU; `ElevationProfileChart` (original solid vs reconstructed dashed, original elevation untouched); hysteresis-based gain/loss in stats; failure/retry/stale-revision states; attribution strings.
- **Tasks:** provider interface + Open-Meteo implementation (fetch injected for tests); cache; smoothing + hysteresis + tests; chart component; disclosure + status UI; stats wiring.
- **Files/components:** `features/elevation/*`, `components/statistics/ElevationProfileChart.tsx`, stats extensions, settings for provider.
- **Dependencies:** [Phase 4](phase-04-reconstruction-drawing.md) (reconstructed geometry); [Phase 5](phase-05-time-pace-reconstruction.md) not strictly required but expected order.
- **Tests:** unit (mocked fetch: success/429-backoff/partial/offline; hysteresis math; LRU behavior); E2E (mocked elevation API → profile renders with estimated styling; privacy allow-list test extended to include the elevation host; failed fetch → clear message, export still possible).
- **Acceptance criteria:** fetch → reconstructed points carry `Estimated` elevation, gain/loss stats appear badged "estimated"; only reconstructed-point coordinates requested (asserted by test); stale elevation flagged after geometry edits; offline behavior graceful.
- **Definition of done:** committed as `phase(6): elevation estimation`.
- **Non-goals:** Terrarium provider, persistent elevation cache, elevation editing, elevation for original points.
