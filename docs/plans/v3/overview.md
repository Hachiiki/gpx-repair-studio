# v3 — The Library That Means Something (Phases 23–33)

> **Status: PROPOSED — not started.** Implementation begins only on explicit user instruction, phase by phase · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

Where v1 repaired a file and v2 became a workbench (formats in and
out, stats, surgery, snapping, batch, compare, the palette, two
languages, offline), v3 makes the library *mean something*. The app
already parses heart rate, cadence, and power on every TCX/FIT file
and keeps named sessions on the device — v3 turns that into zones,
records, trends, and heatmaps without a byte leaving the browser,
then deepens authoring (cue sheets, waypoints, routes), interchange
(TCX/FIT writing), and the last hard repair cases (forensics for
the file broken beyond parsing) — and, informed by the [§RR](strava-interop-research.md) Strava
interop research, it speaks Strava's language end to end: zone and
metric parity where the models are public, and a pre-upload preview
of what Strava will do with the file ([Phase 33](phase-33-strava-preview-upload-guard.md)).

The constitution carries through every phase unchanged: no accounts,
no cloud, no telemetry, no push, no background sync, and user files
never leave the device. Recorded data stays sacred — reconstructed
stretches are flagged, and where honesty matters they do not count
(a personal record set on a drawn-in gap is not a record).

Baselines entering v3: 1889 unit tests (134 files), 201 e2e, eslint
and tsc clean, static-exportability guarded, both themes, two
locales, offline PWA shipped (tag `v2` → `d3af7ef`). Conventions
carry over from [§EE](../v2/overview.md): each phase ends committed and green
(`phase(N): …`), the full QA ritual per delivery, no unrelated
refactors, future-phase features stay explicit non-goals.

Phase 23 raised the baseline to 1963 unit tests (139 files) and 207
e2e (40 specs); the performance spec's two dev-server ceilings were
recalibrated per its own 1.5× discipline (see the [Phase 23 delivery
record](phase-23-fitness-zones-metrics.md)).

Phase 24 raised the baseline to 2045 unit tests (146 files) and 210
Phase 25 raised the baseline to 2088 unit tests (149 files) and 213
e2e (42 specs, two pre-existing skips), and shipped the sessions DB's
v4 (heatmap strips + segments stores).
e2e (41 specs), and bumped the sessions database to v3 (the derived
`library` index store — see the [Phase 24 delivery
record](phase-24-activity-library-records.md)).

## Phases

| # | Phase | Status |
|---|---|---|
| 23 | [Fitness Zones & Metrics](phase-23-fitness-zones-metrics.md) | DONE |
| 24 | [Activity Library, Records & Trends](phase-24-activity-library-records.md) | DONE |
| 25 | [Heatmap & Personal Segments](phase-25-heatmap-personal-segments.md) | DONE |
| 26 | [Photo Geotagging](phase-26-photo-geotagging.md) | PROPOSED |
| 27 | [Cue Sheets & Turn-by-Turn](phase-27-cue-sheets.md) | PROPOSED |
| 28 | [Waypoints & Routes Authoring](phase-28-waypoints-routes-authoring.md) | PROPOSED |
| 29 | [True Resample & Simplify](phase-29-resample-simplify.md) | PROPOSED |
| 30 | [TCX & FIT Export](phase-30-tcx-fit-export.md) | PROPOSED |
| 31 | [Locales & RTL](phase-31-locales-rtl.md) | PROPOSED |
| 32 | [Repair Forensics](phase-32-repair-forensics.md) | PROPOSED |
| 33 | [Strava Preview & Upload Guard](phase-33-strava-preview-upload-guard.md) | PROPOSED |

## Research grounding

The [Strava interop research](strava-interop-research.md) (Task 68 follow-up) is the source behind the v3 amendments: Strava's documented zone defaults and guardrails ([Phase 23](phase-23-fitness-zones-metrics.md)), best-efforts semantics ([Phase 24](phase-24-activity-library-records.md)), segment matching and the thinning trade-off ([Phase 25](phase-25-heatmap-personal-segments.md), [Phase 29](phase-29-resample-simplify.md)), FIT device-info preservation ([Phase 30](phase-30-tcx-fit-export.md)), the rejection vocabulary ([Phase 32](phase-32-repair-forensics.md)), and the [Phase 33](phase-33-strava-preview-upload-guard.md) upload guard.

## v3 release

After [Phase 33](phase-33-strava-preview-upload-guard.md): full regression (typecheck, eslint, unit, Playwright,
static export), a VLM sweep across both themes and every locale
including RTL, README refresh, worklog closeout — **tag `v3`**,
push.

## Candidates, deliberately unscheduled

Recorded so they are not lost, scheduled by nobody: WASM parse
experiments (only behind a measured budget miss); a 3D terrain
flythrough (opt-in, cached, heavy); the user macro/scripting
console ([Phase 20](../v2/phase-20-command-palette.md)'s deferred non-goal — sandboxing is the whole
project); DTW track alignment for compare; the Terrarium elevation
provider (schema reserved since v1); XMP sidecar export for photos;
FIT/TCX Courses; OpenTopoData behind a server-side relay (likely
never — a relay breaks the promise the app is named for).

## Standing non-goals (permanent)

Accounts, cloud sync, telemetry or analytics of any kind, push
notifications, background sync, machine translation of user data,
and uploading user files anywhere, ever.

Per the v1 discipline: **implementation has not begun.** This
section is the proposed plan; execution starts only on explicit
user instruction, phase by phase.
