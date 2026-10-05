# Plan Library

Every phase of GPX Repair Studio — planned, delivered, or proposed — lives in this folder as its own markdown file: the plan, the delivery record, and the verification story. The product's constitution (overview, requirements, architecture, strategies) stays in the [master plan](../MASTER_PLAN.md).

Each file carries breadcrumbs (its version overview · this library · the master plan); phase files chain prev/next across version boundaries, so the whole history reads cover to cover.

## Status at a glance

| Version | Phases | Status | Entry point |
|---|---|---|---|
| v1 — the repair workbench | 0–11 + ten additions | **SHIPPED** — tag `v1` | [v1 overview](v1/overview.md) |
| v2 — the workbench expansion | 12–22 | **SHIPPED** — tag `v2` | [v2 overview](v2/overview.md) |
| v3 — the library that means something | 23–33 | **PROPOSED** — not started | [v3 overview](v3/overview.md) |
| Strava interop research | — | research record grounding v3 | [strava-interop-research.md](v3/strava-interop-research.md) |

## v1 — phases

| # | Phase | Status |
|---|---|---|
| 0 | [Foundation & Tooling Baseline](v1/phase-00-foundation-tooling.md) | DONE |
| 1 | [GPX Domain Core (no UI)](v1/phase-01-gpx-domain-core.md) | DONE |
| 2 | [Upload & Inspection UI](v1/phase-02-upload-inspection.md) | DONE |
| 3 | [Map Display](v1/phase-03-map-display.md) | DONE |
| 4 | [Reconstruction Editor: Drawing](v1/phase-04-reconstruction-drawing.md) | DONE |
| 5 | [Time & Pace Reconstruction](v1/phase-05-time-pace-reconstruction.md) | DONE |
| 6 | [Elevation](v1/phase-06-elevation.md) | DONE |
| 7 | [Merge & Export](v1/phase-07-merge-export.md) | DONE |
| 8 | [Mobile & Accessibility Hardening](v1/phase-08-mobile-accessibility.md) | DONE |
| 9 | [Performance & Large Files](v1/phase-09-performance-large-files.md) | DONE |
| 10 | [Session Recovery (gated)](v1/phase-10-session-recovery.md) | DONE |
| 11 | [Polish, Docs & Release Prep](v1/phase-11-polish-docs-release.md) | DONE |

## v1 — user-requested additions

| Task(s) | Addition | Status |
|---|---|---|
| 20 | [The Share Card](v1/additions/share-card.md) | DONE |
| 26 | [The Gap Recovery Section](v1/additions/gap-recovery.md) | DONE |
| 42 | [The Landing Tool Cards](v1/additions/landing-tool-cards.md) | DONE |
| 43 | [The Merge Section](v1/additions/merge-section.md) | DONE |
| 44–47 | [Pointer Modes & Path Styles](v1/additions/pointer-modes-path-styles.md) | DONE |
| 48 | [The Pen System — Curve Is a Pen](v1/additions/pen-system.md) | DONE |
| 49 | [The Editor Reveal](v1/additions/editor-reveal.md) | DONE |
| 50 | [The Plan-a-Route Section](v1/additions/plan-a-route.md) | DONE |
| 52 | [The Mode-Honest Editor](v1/additions/mode-honest-editor.md) | DONE |
| 55–56 | [Home Redesign — Compact Tiles](v1/additions/home-redesign.md) | DONE |

## v2 — phases

| # | Phase | Status |
|---|---|---|
| 12 | [Quick Wins & Theming](v2/phase-12-quick-wins-theming.md) | DONE |
| 13 | [Deep Validation & Repair Presets](v2/phase-13-deep-validation-presets.md) | DONE |
| 14 | [Formats: In & Out](v2/phase-14-formats-in-out.md) | DONE |
| 15 | [Stats Dashboard](v2/phase-15-stats-dashboard.md) | DONE |
| 16 | [Track Surgery & Input Freedom](v2/phase-16-track-surgery.md) | DONE |
| 17 | [Road Snapping, Opt-In](v2/phase-17-road-snapping.md) | DONE |
| 18 | [Batch & Portable Sessions](v2/phase-18-batch-portable-sessions.md) | DONE |
| 19 | [Compare, Summaries & Guided Flows](v2/phase-19-compare-summaries.md) | DONE |
| 20 | [Command Palette & Shortcuts](v2/phase-20-command-palette.md) | DONE |
| 21 | [Internationalization](v2/phase-21-internationalization.md) | DONE |
| 22 | [Offline PWA & Persistent Caches](v2/phase-22-offline-pwa.md) | DONE |

## v3 — phases (proposed)

| # | Phase | Status |
|---|---|---|
| 23 | [Fitness Zones & Metrics](v3/phase-23-fitness-zones-metrics.md) | PROPOSED |
| 24 | [Activity Library, Records & Trends](v3/phase-24-activity-library-records.md) | PROPOSED |
| 25 | [Heatmap & Personal Segments](v3/phase-25-heatmap-personal-segments.md) | PROPOSED |
| 26 | [Photo Geotagging](v3/phase-26-photo-geotagging.md) | PROPOSED |
| 27 | [Cue Sheets & Turn-by-Turn](v3/phase-27-cue-sheets.md) | PROPOSED |
| 28 | [Waypoints & Routes Authoring](v3/phase-28-waypoints-routes-authoring.md) | PROPOSED |
| 29 | [True Resample & Simplify](v3/phase-29-resample-simplify.md) | PROPOSED |
| 30 | [TCX & FIT Export](v3/phase-30-tcx-fit-export.md) | PROPOSED |
| 31 | [Locales & RTL](v3/phase-31-locales-rtl.md) | PROPOSED |
| 32 | [Repair Forensics](v3/phase-32-repair-forensics.md) | PROPOSED |
| 33 | [Strava Preview & Upload Guard](v3/phase-33-strava-preview-upload-guard.md) | PROPOSED |

## Where the old MASTER_PLAN sections went

Historical worklog entries and source-code comments cite the master plan by section letter; this map resolves every citation:

| Old section | New home |
|---|---|
| §0 Repository inspection findings | [v1/overview.md](v1/overview.md) |
| §P Development phases (incl. conventions, deferred backlog, closing note) | [v1/overview.md](v1/overview.md) + the twelve [v1 phase files](v1/overview.md#phases) |
| §O (the second §O — share card), §R, §S, §T, §U, §V, §W, §X | [plans/v1/additions/](v1/overview.md#user-requested-additions-v1-era) |
| §Y, §Z, §BB, §CC — phase 8–11 delivery records | merged into [phase-08](v1/phase-08-mobile-accessibility.md), [phase-09](v1/phase-09-performance-large-files.md), [phase-10](v1/phase-10-session-recovery.md), [phase-11](v1/phase-11-polish-docs-release.md) |
| §AA Mode-honest editor, §DD Home redesign | [plans/v1/additions/](v1/overview.md#user-requested-additions-v1-era) |
| §EE V2 roadmap (incl. per-phase blocks + v2 release) | [v2/overview.md](v2/overview.md) + the eleven [v2 phase files](v2/overview.md#phases) |
| §FF–§PP — v2 phase delivery records | the [v2 phase files](v2/overview.md#phases) |
| §QQ V3 roadmap (incl. release, candidates, non-goals) | [v3/overview.md](v3/overview.md) + the eleven [v3 phase files](v3/overview.md#phases) |
| §RR Strava interop research | [v3/strava-interop-research.md](v3/strava-interop-research.md) |

The first §O — Technical Risks — stays in the master plan as [Section O](../MASTER_PLAN.md#o-technical-risks). (`download/MASTER_PLAN.md` is a frozen copy of the original v1-era planning snapshot, kept as a historical deliverable.)
