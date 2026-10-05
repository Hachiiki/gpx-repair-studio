# Phase 1 — GPX Domain Core (no UI)

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 0](phase-00-foundation-tooling.md) · [Phase 2 →](phase-02-upload-inspection.md)

## Plan

- **Objective:** parse, validate, gap-detect, and re-emit GPX as pure, fully-tested TypeScript.
- **Scope:** `types/domain.ts`; `lib/geo/geodesy.ts` (+ bbox); `features/gpx/{parse,validate,detectGaps,exportGpx}.ts` — export limited to **identity round-trip** (re-emit originals verbatim; provenance-extension schema defined but unused); fixture corpus + generators.
- **Tasks:** implement geodesy + golden tests; parser + fixtures; validator; gap detector; identity exporter; round-trip test harness.
- **Files/components:** as listed under Scope (all under `src/types`, `src/lib/geo`, `src/features/gpx`).
- **Dependencies:** [Phase 0](phase-00-foundation-tooling.md).
- **Tests:** full unit suite per [Section N-1](../../MASTER_PLAN.md#n-1-unit-tests-vitest--domain-modules-the-bulk-of-the-suite) (geodesy goldens, parser corpus, gap detection, identity round-trip + original-untouched invariant).
- **Acceptance criteria:** every fixture produces the expected typed model or typed error; identity export re-parses to an identical model; ≥ 90% line coverage on these modules.
- **Definition of done:** committed as `phase(1): gpx domain core`; module docs (header comments) in place.
- **Non-goals:** any React/UI, map, drawing, timestamps distribution, elevation, merge logic, provenance-aware export.
