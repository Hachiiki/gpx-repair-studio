# Phase 0 — Foundation & Tooling Baseline

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← v1 overview](overview.md) · [Phase 1 →](phase-01-gpx-domain-core.md)

## Plan

- **Objective:** a clean, guarded scaffold with CI-quality tooling and zero product features.
- **Scope:** generate the environment scaffold (Next.js 16 + TS strict + Tailwind 4 + shadcn/ui); **tailor at generation time** (advance notice per Git-safety rule): remove/disable Prisma layer, demo API routes, and DB wiring — this app is deliberately serverless; add Vitest, Playwright, ESLint import-boundary rules ([Section F](../../MASTER_PLAN.md#f-project-structure)); path aliases; `docs/MASTER_PLAN.md` committed; verify `output: 'export'` build works (or document blocker + fall back to standard build while keeping the no-server-routes invariant).
- **Tasks:** scaffold; prune; install `vitest`, `@playwright/test`; configure boundaries; sample unit test + sample E2E (opens page, asserts shell renders); commit.
- **Files/components:** scaffold tree + `vitest.config.ts`, `playwright.config.ts`, `.eslintrc` boundary rules, `e2e/smoke.spec.ts`, `docs/MASTER_PLAN.md`.
- **Dependencies:** none (first phase).
- **Tests:** smoke unit + smoke E2E pass in CI-equivalent local run.
- **Acceptance criteria:** `build`, `lint`, `test` all green; app shell renders; no `maplibre-gl`/`zustand` installed yet (added when first needed); static export verified or blocker documented.
- **Definition of done:** committed as `phase(0): foundation and tooling baseline`; plan doc in repo.
- **Non-goals:** any GPX/map/UI feature; CI service setup (local runs suffice); theming work beyond scaffold defaults.
