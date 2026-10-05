# The Plan-a-Route Section (Task 50 — user-requested addition)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Editor reveal](editor-reveal.md) · [Mode-honest editor →](mode-honest-editor.md)

The sixth tool: a route-planning scratchpad. The user draws a route on
the map, the app estimates the route's numbers — distance over the
rendered path, terrain elevation, the crow-flies comparison — and a
pace calculator computes what a user-entered time implies (pace,
speed, even splits). The section's defining contract, requested
explicitly: **no export and no share** — nothing leaves the page.

### Scope & contract

- **Input**: nothing — the map is the input. The landing's plan tool
  page carries a start card (the honest contract + "Start planning"),
  not an upload zone or a statistics form.
- **Drawing**: the FULL shared editor machinery — Default pen (click
  by click) and Curve pen (freehand strokes, simplified + smoothed,
  one undo per stroke), the three per-line path styles (Roads /
  Footpaths / Straight, routed through OSRM/Valhalla with the inline
  privacy warning and straight fallback), Move mode (the only mode
  that drags points), the vertex cap, undo/redo, and the D/M/P/C
  accelerators.
- **Estimates** (live, WYSIWYG over the rendered join):
  - distance (the same join the map draws — road legs included);
  - the crow-flies start→finish line and the detour factor;
  - opt-in elevation (the [Phase-6](../phase-06-elevation.md) disclosure-gated DEM lookup over
    the join's points, hysteresis gain/loss, honest staleness);
  - pace + speed + even splits from a goal time the user enters
    (h/m/s fields; the km/mi unit follows the app-wide setting).
- **Output**: none. No export card, no share dialog, no share view,
  no download of any kind — asserted by unit tests, e2e, and the live
  QA probe. The header offers only "Start over".

### Architecture

- `features/plan/estimate.ts` (pure): `planJoin` (the rendered join
  with cumulative distances — reuses `joinDrawChain` /
  `joinCurveChain`), `crowFliesDistanceM`, `detourFactor`, the pace /
  speed / splits / tail arithmetic, `planElevationSignature` (road
  legs + path style + session token), `PLAN_ROUTE_ID`,
  `PLAN_ELEVATION_STORE_KEY`.
- `state/plan-store.ts`: the sixth independent session store —
  `phase: "idle" | "studio"`, the drawModel command slice (identical
  to the create store's), the road-follow side table, pen/pointer/
  path-style settings, and `plannedTimeMs` (the pace calculator's
  input — a transient setting, never undoable). Deliberately NO view,
  share, export, spacing, or distance-basis state.
- Hooks: `use-plan-map` (own MapController + locate + fit; the route
  view is permanently null — the draft IS the route),
  `use-plan-draw` (the create draw hook's mirror minus finish/
  spacing), `use-plan-elevation` (the create elevation mirror over
  the join; controls only — no attachment, nothing to feed),
  `use-plan-estimates` (the crow-flies join + the app-layer facade
  re-exporting the pure math — components never import features).
- Components: `plan-workspace` (the layout, `plan-tools-panel`),
  `plan-studio` (composition root), `plan-guide-card` (the scratchpad
  contract + locate + clear), `plan-draw-panel` (the shared chip
  language, live distance, vertex list — no finish button),
  `plan-estimates-card` (crow-flies line, shared ElevationControls,
  the pace calculator).
- Wiring: `AppSection`/`LandingMode` gained `"plan"`; the sixth
  landing card (PencilRuler icon, generated Field-Plot illustration);
  the shell derives `section === "plan"` while the store's phase is
  studio; the header shows "Route plan" + "Start over".

### The pace calculator

- The h/m/s fields are local component state; the parsed time is
  pushed to the store (`setPlannedTimeMs`) — the card is the only
  writer, so there is no prop-sync loop (and no effect).
- The results render live: pace (the [§L-1](../../../MASTER_PLAN.md#l-1-definitions) arithmetic the whole app
  shares), speed, and the even-pace split table (one row per whole
  km/mi + the partial tail). The badge says **Planned** — a plan the
  user typed, never an estimated measurement.
- The splits' reveal (the Task-49 pattern): the first keystroke that
  makes the pace computable scrolls the splits minimally into view
  ("nearest"). Deferred 250 ms — a smooth scroll started on the first
  keystroke is cancelled by the next keystroke's DOM mutation.

### Verification

- `tests/plan-estimate.test.ts` (14): the join's cumulative walk
  (straight/routed/spline), crow-flies + detour (loops refuse), the
  pace/speed/splits/tail arithmetic in km and mi, the honesty
  undefined/null contracts, the freshness signature's axes.
- `tests/plan-store.test.ts` (13): the lifecycle (idle ⇄ studio,
  reset bumps the session token), the planned time never touching
  history, the shared command contract (undo/redo/clear, one undo per
  stroke, off→curve flip, cap refusal), settings never undoable, and
  a structural guard that no share/export/view key can ever appear in
  the store.
- `tests/plan-ui.test.tsx` (14): the start card's contract + intent,
  the guide card's no-export copy and degraded locate states, the
  draw panel's chips (no Curves chip, no finish control), the
  estimates card's crow-flies line, pace flow (32:35 → 6:13 /km, 9.6
  km/h, 5 splits + tail, field → store push), clear, and the
  no-export/share/download assertions.
- E2E `e2e/plan-route.spec.ts` (6): the tool page intake; draw →
  live distance + crow-flies + vertex list; the pace calculator end
  to end (45:00 → ~9:59 /km, 9.0 km/h, 4 splits + tail, clear); the
  no-export/no-share contract across the tools AND the header;
  elevation opt-in + disclosure gate (zero requests before confirm) +
  the stale transition after an edit; "Start over" back to the tool
  page. Two landing-count assertions elsewhere (smoke, merge-tool)
  moved from five cards to six.
- Live QA (`scripts/task50-live-qa.mjs`): the full user flow with
  zero console/page errors — 4.51 km drawn, crow-flies 3.57 km /
  1.3×, 45:00 → 9:59 /km + 6.0 km/h + 5 split rows, a freehand Curve
  pen stroke committing through the shared machinery, all
  export/share probes at 0. VLM critiques (cards, studio, pace ×2):
  SHIP after the splits-reveal fix (the first pace critique caught
  the splits below the tools-column fold — fixed with the deferred
  reveal). The curve-stroke critique's "ghost line" was verified by
  pixel inspection to be the by-design on-curve midpoint insertion
  handles (shared with every editor since Task 46), and the
  "Straight lines" chip highlight is the curve-style home-chip
  convention (user pass 48) — both known design, not defects.
- Baseline: 1083 unit + 80 e2e, typecheck + eslint clean, isolated
  static-export build PASS.
