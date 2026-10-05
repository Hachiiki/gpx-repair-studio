# Phase 8 — Mobile & Accessibility Hardening (Task 51 backfill)

> **Status: DONE** — shipped in v1 (tag `v1`) · [v1 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 7](phase-07-merge-export.md) · [Phase 9 →](phase-09-performance-large-files.md)

## Plan

- **Objective:** production-quality touch UX and WCAG 2.1 AA compliance.
- **Scope:** touch gesture refinement (draw/pan toggle, two-finger pan in draw mode, ≥44 px hit targets, long-press contextual actions); responsive bottom-sheet panel system; focus management; ARIA live announcements (gap detected, reconstruction finished, export ready); keyboard operability for all non-canvas controls; color-blind-safe palette verification (dash + badge + legend redundancy); reduced-motion support.
- **Tasks:** gesture layer hardening; sheet layout; announcement hook; a11y audit pass + fixes.
- **Files/components:** `components/layout/MobileSheet*`, gesture handling in `lib/map/`, `hooks/useAnnouncer.ts`, style tokens.
- **Dependencies:** [Phase 7](phase-07-merge-export.md) (feature-complete surface to harden).
- **Tests:** Playwright mobile suites (touch draw on 360 px viewport); axe-core scans on all primary states (empty, loaded, editing, exporting) with zero critical violations; keyboard-only E2E for panel flows.
- **Acceptance criteria:** full repair flow completable on a real touch device; axe criticals = 0; all interactive controls reachable/operable by keyboard; provenance distinguishable in color-blind simulation.
- **Definition of done:** committed as `phase(8): mobile and accessibility hardening`.
- **Non-goals:** numeric coordinate-entry fallback (deferred backlog), i18n, PWA.

## Delivery record (Task 51 backfill)

*Phase 8 of [§P](overview.md) — the production-quality touch and screen-reader pass.
Committed as `ba997c6`; its closeout record was backfilled during the
Task 51 verification (the [Phase 9](phase-09-performance-large-files.md) session found the commit already on
the branch with no worklog/plan entry — the work below is that
commit's, read back from the diff.*

### The announcement bus (`lib/announcements.ts`, `Announcer`)

- The workflow moments that have NO visual focus change — gaps
  detected after a parse, a reconstruction finishing, an export ready,
  a long-press deleting a drawn point — are exactly the moments a
  screen reader would otherwise sit silent through. `announce(msg)` is
  a module-level pub/sub any layer can call (hooks, stores, the
  MapLibre controller) with no prop-drilling, context, or import
  cycle; `Announcer` (mounted once in the shell) renders the single
  polite `aria-live` region. Announcements are the mirror of badges
  and banners the sighted UI already shows — never a second UI.

### One tools column, two layouts (`WorkspaceToolsColumn`)

- Desktop (lg+) keeps the classic sticky aside, class-for-class. Touch
  widths get the [§P](overview.md) Phase 8 bottom sheet: a 9.5 rem scrollable peek
  (swipe inside it browses without opening), a 35 dvh expanded state
  (the map keeps its working canvas above), a 44 px grab-bar toggle
  (tap, Enter/Space, or a ≥28 px drag, with honest `aria-expanded`),
  and an IntersectionObserver that hides the sheet once the user
  scrolls into the statistics section. The draw editor's Task-49
  reveal effect dispatches `gpxr:tools-reveal`, the mobile twin of the
  column scroll — opening an editor brings the Pen chips to the
  thumb. The sheet's scroll container carries the same
  `tools-panel` testid the aside uses, so every reveal/reveal-test
  works unchanged on both layouts.

### The touch layer (`mapController`)

- Two-finger pan/zoom owns navigation while a draw mode is active (a
  one-finger draw never fights the map); coarse pointers get ≥44 px
  hit targets on handles (visually honest — an invisible 44 px halo
  around a 5 px dot is a trap, so the target IS the drawn handle
  size); a stationary ≥N ms press on a vertex handle in draw mode is
  long-press delete, cancelled by ≥8 px of travel (it became a drag).

### Keyboard operability

- The skip link is the first tab stop; the whole repair flow
  (upload → gap list → editor → export) is drivable by keyboard; the
  export dialog takes focus, closes on Esc, and returns focus to its
  opener; the sheet's grab bar is a real button (Enter/Space toggle).

### Verification

- `e2e/accessibility.spec.ts`: axe-core scans (serious + critical
  bar, zero disable-rules/exclusions) over the plan's primary states —
  landing, tool page, parsed workspace, draw editor open, export
  dialog, and the mobile sheet-expanded editing state.
- `e2e/keyboard.spec.ts`: the four flows above, tab-stop order
  included. `e2e/mobile-touch.spec.ts`: the touch gestures through
  `e2e/helpers/touch.ts` (tap, drag, two-finger pan, long-press) at
  375 px, drawing included.
- Also in the commit: `use-media-query` (SSR-safe, `lg` breakpoint
  single source), the URI-wrap fix that kept GloryFit's long
  `<link>` text from overflowing the mobile viewport, dialog/table
  a11y fixes, and reduced-motion support in `globals.css`.
- Baseline after Phase 8: 1176 unit + the suite's a11y/keyboard/
  mobile-touch specs green (full-suite green re-proven at Task 51).
