# Home Redesign — Compact Tiles (Tasks 55–56 — user-requested)

> **Status: DONE** — user-requested addition landed just after the `v1` tag (Tasks 55–56); it set up the v2 landing work · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Mode-honest editor](mode-honest-editor.md) · [v2 overview →](../../v2/overview.md)

**Task 55 (proposal only)**: the user found the Task 42 landing too
large — a 2×3 grid of cards with 16:9 illustration plates ran the page
~1400 px tall — and asked for a denser, non-card layout to review
before any code changed. Three variants shipped as a self-contained
mockup (`download/design-mockups/home-redesign.html`, A/B/C switcher):
A · index list (no illustrations), B · index + sticky preview rail,
C · compact 3-across icon tiles.

**Task 56 (this section)**: the user picked **C** and asked that the
illustrations stay. `landing-cards.tsx` was rebuilt as a tile grid:

- **Grid**: `md:grid-cols-3` (2 rows of six where the cards needed
  3), 2 columns on small screens, 1 on phones; the page column widened
  to `max-w-5xl`. Measured: 1070 px tall at 1440 (was ~1400), 1006 px
  at the 900 px band (was ~1515 there), 2599 px on mobile (was ~3300).
- **Tile**: the illustration kept on a shorter **2:1 plate** (~165 px
  at desktop, was 253), then a compact body — icon chip + mono kicker,
  15 px title, a **one-line blurb clamped to three lines** (the full
  two-sentence copy retired from the home; the tool detail page already
  carries it in HERO_COPY/TOOL_FACTS/workflow trio), and the signal
  "Open →" row pinned to the floor. Field Plot language unchanged.
- **Contract preserved**: same testids (`landing-mode-toggle`,
  `landing-mode-{mode}`, `landing-start-tour`), same button+img DOM
  (6 buttons, 6 `/cards/*.webp` with alt text — unit-pinned), same
  focus-return behavior, same aria-labels. The odd-count centering
  rule was dropped (six tiles fill the grid evenly).
- **Verification**: typecheck + eslint clean; 1269/1269 unit; full
  Playwright **122/122** (re-ran the landing-critical chunks after the
  `lg:`→`md:` breakpoint change); live QA geometry checks pass at
  1440/900/390 (3/3/1 columns, zero horizontal overflow, plates at
  2:1, touch targets ≥ 44 px, zero console/page errors —
  `scripts/task56-live-qa.mjs`); VLM critiques: desktop 9/10, mobile
  9/10 (all six plates populated), and the band-900 "overlapping N
  button" claim **disproven by DOM measurement**
  (`scripts/task56-probe-overlap.mjs`: zero foreign elements intersect
  the create tile; the "N" is the compass badge inside the plate
  artwork).
- **QA-script lessons recorded**: seed the tour flag for landing
  screenshots (a fresh browser opens the onboarding overlay over the
  grid) and scroll the page before `fullPage` captures (below-fold
  `decoding="async"` images are loaded but not yet painted, and read
  as empty plates — `scripts/task56-live-qa.mjs` now does both).
