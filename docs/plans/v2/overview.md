# v2 — The Workbench Expansion (Phases 12–22)

> **Status: SHIPPED** — tag `v2` · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

After v1 shipped (tag `v1`, Task 56), the user asked for **all** of
the proposed expansion — 18 capabilities across four goals: more
freedom to use, more power, more usefulness, and a better experience
for every kind of user. They are organized below into eleven
dependency-ordered phases, Tasks 57–67. Task numbering continues
from 56; phase numbering continues from 11.

**Ordering rationale:**

- Dark mode rides the existing CSS token system and lands **early**
  ([Phase 12](phase-12-quick-wins-theming.md)) so every later surface is built and QA'd against both
  themes instead of retrofitted at the end.
- Validation (13) precedes presets (presets are bundles of detectors
  + fixes) and precedes surgery (16) — both reuse the
  provenance-labeled working-copy layer that 13 introduces.
- Formats (14) precede batch (18): batch multiplies per-file
  capability, so per-file capability must exist first.
- Stats (15) precede the PDF summary (19): the report consumes the
  stats engine.
- Road snapping (17) is deliberately isolated — the only phase that
  ever sends geometry off-device — and is fenced behind explicit
  per-session consent.
- i18n (21) lands late so final strings are extracted once; PWA
  (22) lands last so the offline precache ships a stabilized asset
  set.

**Goal → phase map:**

| Goal | Phases |
|---|---|
| Freedom / free to use | 14 (formats), 18 (batch + portable sessions), 22 (offline PWA) |
| Power | 13 (validation), 15 (stats), 16 (surgery), 17 (snapping), 22 (elevation cache) |
| Usefulness | 12 (sample files), 13 (report + presets), 19 (compare + PDF summary) |
| Experience for all | 12 (dark mode), 16 (numeric entry / a11y), 19 (guided flows), 20 (palette), 21 (i18n) |

**Conventions (unchanged from v1):** every phase ends in a working,
committed state `phase(N): …`; typecheck + eslint + vitest +
Playwright green before commit; VLM QA on new/changed surfaces;
worklog + this plan updated per phase; original data immutable; all
modifications provenance-labeled; static export — no server, no
accounts, no telemetry ([Phase 17](phase-17-road-snapping.md)'s consented router call is the sole
exception, re-consented every session).

## Phases

| # | Phase | Status |
|---|---|---|
| 12 | [Quick Wins & Theming](phase-12-quick-wins-theming.md) | DONE |
| 13 | [Deep Validation & Repair Presets](phase-13-deep-validation-presets.md) | DONE |
| 14 | [Formats: In & Out](phase-14-formats-in-out.md) | DONE |
| 15 | [Stats Dashboard](phase-15-stats-dashboard.md) | DONE |
| 16 | [Track Surgery & Input Freedom](phase-16-track-surgery.md) | DONE |
| 17 | [Road Snapping, Opt-In](phase-17-road-snapping.md) | DONE |
| 18 | [Batch & Portable Sessions](phase-18-batch-portable-sessions.md) | DONE |
| 19 | [Compare, Summaries & Guided Flows](phase-19-compare-summaries.md) | DONE |
| 20 | [Command Palette & Shortcuts](phase-20-command-palette.md) | DONE |
| 21 | [Internationalization](phase-21-internationalization.md) | DONE |
| 22 | [Offline PWA & Persistent Caches](phase-22-offline-pwa.md) | DONE |

## v2 release

After [Phase 22](phase-22-offline-pwa.md): full regression (typecheck, eslint, unit, Playwright,
static export), a VLM sweep across both themes and all locales,
README refresh, worklog closeout — **tag `v2`**, push.
