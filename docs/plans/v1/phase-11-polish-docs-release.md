# Phase 11 — Polish, Docs & Release Prep (Task 54)

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 10](phase-10-session-recovery.md) · [Phase 12 →](../v2/phase-12-quick-wins-theming.md)

## Plan

- **Objective:** release-ready v1.
- **Scope:** empty/error/edge-state polish; help/onboarding tour (first-run: 4-step overlay); "Privacy & Data" page (exact egress table, offline behavior, provider switching, storage disclosure); About/attribution (Open-Meteo/Copernicus, OpenFreeMap/OSM, MapLibre); README (dev setup, architecture summary, test guide); final full-suite regression + manual QA matrix sign-off.
- **Tasks:** polish pass; docs pages; regression run; manual matrix.
- **Files/components:** help components, privacy/about pages, README, final test updates.
- **Dependencies:** all prior phases.
- **Tests:** full regression (unit + RTL + E2E all green); manual QA matrix signed off in the phase notes.
- **Acceptance criteria:** every prior phase's acceptance criteria still hold; docs complete; no known P1/P2 defects.
- **Definition of done:** committed as `phase(11): polish, docs, release prep`; v1 tagged.
- **Non-goals:** new features of any kind.

## Delivery record (Task 54)

The v1 closeout: the onboarding tour, the full [§M-3](../../MASTER_PLAN.md#m-3-user-facing-disclosure) disclosure
("Privacy & Data"), the About/attribution page, the README, and the
release pass over every surface. No new features — the phase's
non-goal, honored.

**The onboarding tour** (`components/layout/onboarding-tour.tsx` +
`hooks/use-onboarding-tour.ts` + `lib/storage/tour-flag.ts`): a
4-step first-run overlay on the tool cards (the local-first promise,
the six tools, the pen system, the honest-numbers + autosave
guarantees). One guarded localStorage key (`tour.v1`, plain "seen")
remembers it; a browser whose storage cannot remember never sees the
auto-open at all (the nag-guard). Auto-open rules: the cards page
showing, the [Phase 10](phase-10-session-recovery.md) storage scan settled, NO restore offers (a
returning user is not new — the prompt wins), flag unseen — armed at
most once per page load. Every exit (Finish, Skip, Esc, implicit
dismissal on leaving the cards page) writes the flag; a MANUALLY
replayed tour ("New here? Take the tour" link under the hero)
survives a page switch and closes only by its own controls. Built on
the Dialog primitive (focus trap, Esc, focus return) with per-step
heading focus for screen readers.

**Privacy & Data + About** (`components/layout/info-content.tsx` +
`info-dialog.tsx`): one dialog, two panes, a real tablist (arrow keys
walk it, aria-controls wired). The privacy pane is [§M-3](../../MASTER_PLAN.md#m-3-user-facing-disclosure) in full: the
**egress table updated for the shipped pens** — three rows (tiles:
OpenFreeMap/OSM; road-follow: OSRM/Valhalla, endpoints only;
elevation: Open-Meteo, opt-in) where [§M-2](../../MASTER_PLAN.md#m-2-leaves-the-browser--complete-list)'s original two-row table
predated Tasks 44–50 — plus what works offline, how to switch every
provider, and the storage disclosure (both localStorage keys named,
the IndexedDB sessions, every clear path). The About pane carries the
attribution (MapLibre, OpenFreeMap/OSM, OSRM/Valhalla,
Open-Meteo/Copernicus, the self-hosted type) and the version line.
**Copy is pinned to the code by tests**: the hosts named in the table
are asserted against the real constants (`lib/map/styles.ts`,
`features/elevation/openmeteo.ts`, the routing URLs), the row count
is pinned at three, and the version matches package.json — a
provider change that forgets the page fails the suite.

**Doors**: the footer (every app state — `site-footer.tsx`, the
local-first line + About + Privacy & data links), the restore
prompt's "More about privacy and data", and the tour's first step.
The old footer's one-line promise was kept verbatim.

**README**: dev setup (install/dev/build/test), the architecture
summary (layer map + the ESLint boundary rules), the testing guide
(unit/e2e/privacy-invariant + the full gate), deployment, and the
attribution summary.

**E2E seeding**: `playwright.config.ts` seeds the tour flag as seen
for every existing spec (the ~113 specs never meet the first-run
overlay); `e2e/onboarding-tour.spec.ts` opts out with an empty
storageState to test the tour as the fresh-browser behavior it is.

**The release pass**: full regression (typecheck, eslint,
1269 unit — +42 over Task 53's 1227, 122 e2e — +9 over 113, static
export PASS), live QA (`scripts/phase11-live-qa.mjs`, zero
console/page errors), axe scans of the new surfaces (tour steps +
both info panes — zero criticals, `e2e/phase11-a11y.spec.ts`), VLM
critiques on all four new surfaces (tour, privacy pane,
about pane, restore-prompt door — all SHIP after the egress table
was restructured from three cramped columns to two and the
attribution list gained per-entry rules; a measured no-clipping
check `scripts/phase11-measure-table.mjs` settled the reviewer's
hallucinated clipping claim at 628 px and 312 px widths), and the
manual QA matrix sign-off recorded in the worklog. `package.json`
and the About pane agree on 1.0.0 (test-pinned); **v1 tagged**.
