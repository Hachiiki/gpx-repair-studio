# v1 — The Repair Workbench (Phases 0–11)

> **Status: SHIPPED** — tag `v1` · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

v1 took the repository from a greenfield scaffold to the complete repair tool: upload and inspect, draw the missing route, estimate time, pace, and elevation, merge, and export — hardened for touch, screen readers, 100k-point files, and crashes. Ten user-requested additions landed along the way (below).

## Repository inspection findings (pre-planning)

Inspection performed before planning (as instructed):

- `/home/z/my-project` is a **greenfield git repository**: branch `main`, a single `Initial commit`, clean working tree. `.gitignore` covers `skills/` and `node_modules/`.
- **No application code exists yet.** No `package.json`, no framework config, no source files. Directories present: `download/` (deliverables), `upload/` (empty), `skills/` (tooling, git-ignored).
- Toolchain available: Node v24.21.0, npm 11.19.0, bun 1.3.14.
- The environment's standard fullstack scaffold (to be generated at [Phase 0](phase-00-foundation-tooling.md)) produces: **Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS 4 + shadcn/ui (Radix) + Prisma + z-ai-web-dev-sdk**.

**Implications for this plan:**

1. "Existing technology" = the scaffold stack. It fits this product well: a single-page, client-heavy tool where every interactive surface is a client component and the server's only job is serving the static bundle.
2. Because the product is deliberately serverless ([Section M](../../MASTER_PLAN.md#m-privacy-strategy)), [Phase 0](phase-00-foundation-tooling.md) must **tailor the scaffold at generation time**: Prisma/DB layer, demo API routes, and any server-processing scaffolding are removed/disabled *before* the first feature commit. Doing this at t=0 is scaffold tailoring, not a refactor of working code (this is the advance explanation required by the project's Git-safety rule).
3. Planned new runtime dependencies (each justified in [Section E](../../MASTER_PLAN.md#e-technology-decisions)): `maplibre-gl`, `zustand`. Everything else uses native browser APIs (File, DOMParser, XMLSerializer, IndexedDB, Web Worker) or existing scaffold dependencies.
4. Git baseline: one commit per phase ([Phase 0](phase-00-foundation-tooling.md) commit includes this plan). No unrelated refactors during phases.

## Phase conventions

Conventions for every phase: each ends in a working, committed state (`phase(N): …`); `lint + typecheck + unit` green before commit; E2E additions included where noted; no unrelated refactors; future-phase features are explicitly non-goals.

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | [Foundation & Tooling Baseline](phase-00-foundation-tooling.md) | DONE |
| 1 | [GPX Domain Core (no UI)](phase-01-gpx-domain-core.md) | DONE |
| 2 | [Upload & Inspection UI](phase-02-upload-inspection.md) | DONE |
| 3 | [Map Display](phase-03-map-display.md) | DONE |
| 4 | [Reconstruction Editor: Drawing](phase-04-reconstruction-drawing.md) | DONE |
| 5 | [Time & Pace Reconstruction](phase-05-time-pace-reconstruction.md) | DONE |
| 6 | [Elevation](phase-06-elevation.md) | DONE |
| 7 | [Merge & Export](phase-07-merge-export.md) | DONE |
| 8 | [Mobile & Accessibility Hardening](phase-08-mobile-accessibility.md) | DONE |
| 9 | [Performance & Large Files](phase-09-performance-large-files.md) | DONE |
| 10 | [Session Recovery (gated)](phase-10-session-recovery.md) | DONE |
| 11 | [Polish, Docs & Release Prep](phase-11-polish-docs-release.md) | DONE |

## User-requested additions (v1 era)

| Task(s) | Addition | Status |
|---|---|---|
| 20 | [The Share Card](additions/share-card.md) | DONE |
| 26 | [The Gap Recovery Section](additions/gap-recovery.md) | DONE |
| 42 | [The Landing Tool Cards](additions/landing-tool-cards.md) | DONE |
| 43 | [The Merge Section](additions/merge-section.md) | DONE |
| 44–47 | [Pointer Modes & Path Styles](additions/pointer-modes-path-styles.md) | DONE |
| 48 | [The Pen System — Curve Is a Pen](additions/pen-system.md) | DONE |
| 49 | [The Editor Reveal](additions/editor-reveal.md) | DONE |
| 50 | [The Plan-a-Route Section](additions/plan-a-route.md) | DONE |
| 52 | [The Mode-Honest Editor](additions/mode-honest-editor.md) | DONE |
| 55–56 | [Home Redesign — Compact Tiles](additions/home-redesign.md) | DONE |

## Deferred backlog (explicit v1 non-goals — each requires a new requirement + plan revision)

- **Road-following / routing-assisted drawing** via an external routing engine (OSRM/Valhalla/GraphHopper) — powerful UX but sends waypoints to a third party; would need explicit opt-in, provider choice, and a privacy disclosure redesign.
- Freehand drawing mode (press-drag with on-the-fly simplification).
- Terrarium tile-based elevation provider (privacy-max fallback — schema already reserved).
- Numeric coordinate/vertex entry fallback for full keyboard-only geometry editing.
- GPS noise filtering / smoothing of *original* tracks; pause detection refinement.
- Multi-activity batch repair; TCX/FIT import/export; PWA offline packaging; i18n.

Most of this backlog was later consumed by v2: formats, batch, i18n, and the offline PWA shipped as [Phase 14](../v2/phase-14-formats-in-out.md), [Phase 18](../v2/phase-18-batch-portable-sessions.md), [Phase 21](../v2/phase-21-internationalization.md), and [Phase 22](../v2/phase-22-offline-pwa.md); road-following landed as [Phase 17](../v2/phase-17-road-snapping.md); the numeric coordinate entry as [Phase 16](../v2/phase-16-track-surgery.md). The rest stays unscheduled — see the [v3 candidates](../v3/overview.md#candidates-deliberately-unscheduled).

## v1 closing note (historical)

Per instruction, implementation has **not** begun. No [Phase 1](phase-01-gpx-domain-core.md) work has been performed; no application code exists in the repository. This plan is the complete planning-stage deliverable. Execution starts only on explicit user instruction.
