# Phase 9 — Performance & Large Files (Task 51)

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 8](phase-08-mobile-accessibility.md) · [Phase 10 →](phase-10-session-recovery.md)

## Plan

- **Objective:** meet the C-2 performance budgets on large/edge-case files.
- **Scope:** parse Web Worker (threshold-triggered, progress UI); zoom-dependent render decimation; memory profiling on 250k-point synthetic files; loading/progress states; perf-budget E2E suite.
- **Tasks:** worker extraction of parse+validate (domain purity from [Phase 1](phase-01-gpx-domain-core.md) makes this a low-risk move); decimation layer; budget tests; profiling fixes.
- **Files/components:** `workers/parseWorker.ts`, `lib/map/decimate.ts`, progress UI in `components/layout/`.
- **Dependencies:** [Phase 7](phase-07-merge-export.md).
- **Tests:** perf-budget E2E (100k-point fixture: parse < 2 s, no > 200 ms main-thread block, export < 1 s); 250k stress smoke (loads, no crash).
- **Acceptance criteria:** budgets pass in test runs; no functional regressions (full suite green).
- **Definition of done:** committed as `phase(9): performance and large files`.
- **Non-goals:** virtualized lists, IndexedDB caching, WASM experiments.

## Delivery record (Task 51)

*Phase 9 of [§P](overview.md) / [§C-2](../../MASTER_PLAN.md#c-2-performance-budgets-enforced-by-tests-in-phase-9). The parse pipeline left the main thread; the
map renders decimated by zoom; the budgets are now measured, not
aspirational.*

### The worker parse (`workers/parseWorker.ts`, `lib/gpx/worker-xml.ts`, `lib/gpx/parse-client.ts`)

- **The XmlIo seam paid out.** Workers have no DOMParser; instead of
  vendoring a DOM, `worker-xml.ts` is a compact namespace-aware
  tokenizer + minimal tree implementing exactly the DOM surface
  `parseGpx` touches (documentElement, getElementsByTagNameNS,
  localName, getAttribute, children, textContent, serialize).
  Malformed input throws — `parseGpx` already maps a throwing io to
  the typed malformed-xml error, the undeclared-prefix recovery
  included.
- **Correctness gate:** the corpus-equivalence suite — every committed
  fixture parsed through BOTH ios must produce structurally equal
  outcomes AND byte-equal identity exports (`tests/worker-xml.test.ts`,
  398 tests; `tests/parse-client.test.ts`, 234).
- **Streaming:** the validated model returns in ≤8,192-point chunks
  (`PARSE_CHUNK_POINTS`) — each structured clone lands in the tens of
  ms, never near the 200 ms budget; progress messages drive the
  loading bench's determinate bar (phase label + %, `role="status"`
  polite-live). Threshold: 1 MB of text (`PARSE_WORKER_THRESHOLD_BYTES`)
  routes to the worker; below it the inline path is byte-identical to
  the pre-Phase-9 behavior every existing spec pins. Infrastructure
  failure (worker blocked, crash, 120 s timeout) degrades gracefully
  to the inline pipeline with one console warning — correct output,
  blocking parse, never a dead app.

### Zoom decimation (`lib/map/decimate.ts`)

- Render-only: statistics, badges, export, and gap detection keep the
  full-resolution model; only the GeoJSON handed to the route source
  is sampled. The stride keeps consecutive kept points ≥2 px apart at
  the current zoom (maplibre 512 px tiles), quantized DOWN to powers
  of two so a gesture only re-decimates on band crossings. Endpoints
  are pinned; below 30,000 total coordinates (or stride 1) the input
  references pass through untouched — normal files never pay a copy.
  A floor keeps ≥512 rendered points so an overview stays a
  recognizable track. Wired in `mapController#applyRoute` + a
  `zoomend` re-apply; reconstructions, drafts, and gap geometry are
  never decimated.

### Measuring honestly (`e2e/performance.spec.ts`)

- Four measurement rules, each earned by a false failure in this
  sandbox: (1) `trace: "off"` for this file — Playwright's
  retain-on-failure tracing added ~1.4 s to a timed window that
  streams 100k points; (2) an untimed warm-up test compiles the dev
  route + worker chunk before anything is timed; (3) the
  parse-pipeline window is [upload mark, last worker progress
  message arrival) — captured race-free by a Worker spy installed
  before navigation — because the result handler (assembly + first
  render + setData) is a separate 400–800 ms task that [§C-2](../../MASTER_PLAN.md#c-2-performance-budgets-enforced-by-tests-in-phase-9)'s
  "parse + validate" rule does not govern; (4) the label observer
  attaches to `document`, never `documentElement` — init scripts run
  before `<html>` exists, and observing null throws silently-empty
  logs.
- Budgets, production ([§C-2](../../MASTER_PLAN.md#c-2-performance-budgets-enforced-by-tests-in-phase-9) verbatim) → dev ceiling (measured, warm):
  50k workspace 2 s → 3.5 s (measured 2.36 s); 100k workspace ~4 s →
  5 s (measured 3.3 s); 100k export 1 s → 2 s (measured 1.25 s);
  parse-pipeline worst block ≤200 ms — measured 55–78 ms (the chunk
  clones), asserted unchanged. The 100k suite also pins the phases
  (parse → validate → gaps → transfer, ending transfer @ 100%) and
  the user-facing label ("Preparing view" last).
- 250k profile (`scripts/task51-mem-profile.mjs`): heap flat at
  257 MB across parse → render → export; DOM 371 → 465 nodes (no
  per-point DOM); upload → workspace 6.9 s; export 2.06 s / 24 MB
  round-trip; the e2e gate (loads, no crash, heap < 2 GB, DOM <
  5k) green.
- Fixes earned by the verification pass: the spec's fixtures were
  missing the injected time gap the decimation test reads (two
  features); one draw-editor assertion (Task 44-era) was an unawaited
  locator `expect` that slower sandboxes cut off at finalization.
- Baseline after Phase 9: 1176 unit + 104 e2e, typecheck + eslint
  clean, isolated static-export build PASS (worker chunks shipped).
