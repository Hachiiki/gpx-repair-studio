# The Share Card (Task 20 — user-requested addition)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← v1 additions](../overview.md#user-requested-additions-v1-era) · [Gap recovery →](gap-recovery.md)

A second destination for an uploaded file, added after [Phase 7](../phase-07-merge-export.md) at the
user's request: a Strava-style activity share graphic — the route on a
transparent 1080×1920 (9:16) canvas whose PNG carries alpha (black
per the reference card during Tasks 23–40, transparent again since
Task 41 — the user's call, matching what the share views' "shown on
dark" note always claimed), the STRAVA wordmark, a
Distance / Pace / Time stats row, and a running-shoe icon — previewed
in-app and exported as a PNG (1× per the spec, 2× optional).

### O-1 Scope & honesty rules

- **Entry points.** The landing page carries a mode switch ("Repair a
  recording" / "Create a share card", remembered per [§D-4](../../../MASTER_PLAN.md#d-4-state-management-model-zustand)); the upload
  opens the matching workspace. Once loaded, the file switches freely
  between the repair workspace and the share view (header action +
  in-view link) with no re-parse.
- **The trio is recorded data, never invented.** Distance = the file's
  total geodesic length; Pace = total distance over recorded moving
  time (the [§L-1](../../../MASTER_PLAN.md#l-1-definitions) pace definition); Time = the recorded elapsed span
  (`t_last − t_first`, the Strava convention). A file without usable
  timestamps renders "—" for pace and time with the reason shown in
  the view — the [§L-2](../../../MASTER_PLAN.md#l-2-honesty-rules) rules apply to share graphics exactly as they
  apply to statistics tables.
- **The route is the honest route.** The card reuses `buildRouteView`
  verbatim: recorded pieces split at gaps and damage, plus re-imported
  `gpxr` reconstruction runs — drawn as independent strokes, never
  connected with fabricated legs. Antimeridian-crossing routes are
  longitude-unwrapped so they draw as the line the athlete traveled.
- **Multi-line palette.** One route color (#FC4C02) for everything:
  the card shows the activity as the file records it, recorded and
  previously-repaired stretches alike (the app's
  recorded/reconstructed distinction lives in the repair workspace,
  not on a share graphic).

### O-2 Architecture

- `lib/geo/mercator.ts` — pure normalized Web-Mercator + fit/center
  (the map's projection, without the camera).
- `lib/share/{layout,artwork,render,fonts}.ts` — the spec's layout
  math (every rect/baseline one derivation), the cleaned source-SVG
  path data, one canvas painter for preview AND export (WYSIWYG, the
  [§H](../../../MASTER_PLAN.md#h-gpx-processing-architecture) export contract applied to pixels), and the idempotent
  self-hosted Montserrat loader (local-first typography).
- `lib/share/path-bounds.ts` — SVG path-data ink-bounds parser
  (node-side only; it verifies the artwork's measured ink constants
  and never ships to the browser).
- `features/share/cardContent.ts` — the pure trio join.
- `hooks/use-share-card.ts` — the app-layer binding (route view →
  polylines, stats → content, offscreen paint → PNG download).
- `components/share/{share-card-canvas,share-view}.tsx` — the
  reusable component (props: routePolyline + the three strings) and
  the session view; the km/mi toggle is the extracted shared
  `PaceUnitToggle`.
- Session plumbing: `session-store.view` (repair | share, set at
  upload from the remembered landing mode), `ui-store.landingMode`
  (persisted preference), and the map-controller lifecycle keyed to
  the view so the map re-creates when the repair workspace returns.

### O-3 Phase 7 fix carried by this task

Re-uploaded repairs were double-counted in the statistics panel:
`originalDistanceStats` already measures `gpxr`-marked legs, and the
panel join added them again ("Total with repairs" read file-total +
marked-legs). The join now subtracts the marked distance from
"Recorded" and only live editor repairs add to totals; "Moving time
incl. repairs" likewise adds only live repair durations (a re-imported
run's distributed timestamps are already inside the recorded moving
time). Pinned by `tests/stats-panel-reimport.test.tsx`.

### O-4 Layout revisions (Tasks 21–23)

The card's geometry was revised three times against the user's
reference card; **Task 23 is the operative spec** (Tasks 21–22 are
historical), with two later revisions: **Task 40 un-squashes the
STRAVA wordmark** (the user's call — the SVG keeps its own
proportions), and **Task 41 restores the transparent background**
(the download carries alpha again — what the share views'
"Transparent background — shown on dark" note had claimed all
along; Task 23's solid #000000 matched the reference image but
contradicted that note).

- **Anchor-based, not derived.** Every position is a measured
  constant from the reference, pinned exactly (the lesson of the
  earlier revisions: pin the reference's numbers, don't re-derive
  them): route visible box x 64–1012 / y 219–1190 (contain, geometry
  inset by the casing half-width so the stroked ink cannot cross it);
  wordmark box 330×55 at top 1280, centered; stats top 1422, column
  centers 220 / 540 / 857, label 29px SemiBold over value 40px
  ExtraBold with a 9px gap; shoe slot 104×104 at top 1605;
  transparent background — the PNG carries alpha (Task 41). The
  implied rhythm —
  90 / 87 / ~90 gaps, content ending at 1709 with ~211px empty — is
  asserted by tests rather than used as an input.
- **Ink-based artwork placement.** The layout consumes each artwork's
  viewBox AND its measured ink bounds (`path-bounds.ts` verifies the
  constants in artwork.ts against the path data). Every artwork is
  CONTAINED (uniform scale, aspect preserved) and centered in its
  box — the shoe in its 104px slot, and since Task 40 the wordmark
  in its 330×55 box (~245×55, height binding). Task 23 had stretched
  the wordmark non-uniformly onto the box (the trace is ~4.45:1
  while the reference's wordmark is ~6:1) to chase the real mark's
  flatness; the user rejected the squeeze — the SVG stands as it
  is, and the height binding keeps the measured vertical rhythm
  (90/87 gaps) exact.
- **Casing as outline (Task 41).** The 16px #000000 casing pass
  stays under the 10px #FC4C02 route (spec-mandated) and is now
  VISIBLE ink — the background is transparent, so the casing reads
  as the route's outline on any backdrop (and disappears only on
  genuinely black ones). Task 23's solid-black interim had made it
  black-on-black and unprobeable, which retired its pixel
  assertions; Task 41's transparency restores both the ink and the
  assertions (the e2e asserts the casing's dark-ink share, and the
  live verify script probes its bbox plus its absence outside the
  route band).
