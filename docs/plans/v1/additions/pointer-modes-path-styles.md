# Pointer Modes & Path Styles (Tasks 44–47 — user-requested additions)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Merge section](merge-section.md) · [Pen system →](pen-system.md)

### Scope

Four additions to the draw editors, all serving the same goal — the
points the user places should look good and be fully theirs:

1. **Merge Share (Task 44)** — the Combine Recordings studio carries the
   same header Share flow as the other tools: warn first (the file
   downloads, the card opens), export the merged GPX (the identical file
   the Download button produces), then the share card built from the
   MERGED model's own statistics. Cancel is a full no-op.
2. **Pointer modes (Task 45)** — a three-way explicit toggle:
   - `draw` — clicks place points (panning disabled, the anti-fat-finger
     contract);
   - `move` — clicks place nothing; every placed point grows into an
     oversized grab target and drags freely (one undo step per
     release); empty-space drags still pan the map;
   - `pan` — normal navigation (point drags still work — they are
     pointer-targeted, never a pan).
   Keyboard accelerators D / M / P; the on-map chip cycles
   Draw → Move → Pan.
3. **Curves (Task 46)** — the fourth path style: a Catmull-Rom spline
   through the clicked points (interpolating — the line passes exactly
   through every node). Fully local. The curve is BAKED into ordinary
   points on commit/export, so the shape survives any platform (GPX has
   no native curve); what the map previewed is what the file carries.
4. **Per-line path styles (Task 47)** — Roads / Footpaths / Curves /
   Straight, picked before or while drawing and REMEMBERED PER LINE:
   `setPathStyle` writes the active reconstruction's own style, and
   every editor opener re-adopts the line's remembered style. Footpath
   lines render dashed on the map (the classic pedestrian-way
   convention); road lines stay solid.

### Contracts

- **WYSIWYG, one implementation**: `curveLegInterior` is the single
  spline sampler — the map's draft join, the distance badge, and the
  exported points all call it, so preview === export by construction
  (pinned by a byte-for-byte unit test).
- **The closing leg stays straight**: the segment from the last chain
  node into the far anchor renders as the dashed "closes on finish"
  preview — the export never splines it (the same WYSIWYG rule).
- **Settings, never commands**: `pathStyle` and the pointer mode never
  touch the undo stack ([§D-3.5](../../../MASTER_PLAN.md#d-3-core-architectural-decisions)); switching styles mid-edit does not
  invalidate elevation freshness.
- **Session-start mode re-assertion**: `endDrawSession` resets the
  controller to pan; every hook re-asserts the store's pointer mode
  after `startDrawSession` — a session restart (e.g. a style switch
  rebuilding the joins) can never inherit the stale pan.
- **Honesty**: routing (car/foot) keeps its external-service disclosure
  and straight-line fallback; curve and straight never touch the
  network; the merge share card's trio is the merged model's own
  arithmetic ([§L-2](../../../MASTER_PLAN.md#l-2-honesty-rules) — "—" with reasons, never invented values).

### Architecture

- `types/domain.ts`: `PointerMode`, `PathStyle`,
  `Reconstruction.pathStyle?`.
- `lib/map/mapController.ts`: `#pointerMode` tri-state (legacy
  `drawMode` derives for the e2e bridge), `setPointerMode`,
  `#applyHandleEmphasis` (Move mode's bigger handles + hit radius),
  the `gpxr-recon-dashed` layer (complementary filter against the solid
  recon layer).
- `features/reconstruction/roadFollow.ts`: the spline module
  (`curveSplinePoints`, `curveLegInterior`, `joinCurveChain`,
  `CURVE_SAMPLE_M`).
- `features/reconstruction/resample.ts`: `resamplePath(…, pathStyle)`
  bakes curve legs (interpolated role; spacing never re-densifies
  them; the closing leg excluded).
- The three editor stores + hooks: `pathStyle` with per-line memory;
  `makeJoins` closes over the style; the routing effect resolves legs
  only for car/foot.
- `state/merge-store.ts` + `hooks/use-merge-share.ts` +
  `components/merge/{share-merge-dialog,merge-share-view}.tsx`: the
  merge Share flow (the create section's pattern transposed).

### Verification

- `tests/merge-share.test.tsx` (16), `tests/path-styles.test.ts` (13),
  the migrated store/map-component suites.
- E2E: merge Share flow (download content-checked), Move mode (adds
  nothing / drags any point / one undo restores), Curves (rendered line
  gains the spline interior, clicked nodes verbatim).
- Baseline: 1018 unit + 74 e2e, typecheck + eslint clean, static
  export passes.
