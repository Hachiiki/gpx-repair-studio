# The Pen System — Curve Is a Pen (Task 48 — user pass 48)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Pointer modes](pointer-modes-path-styles.md) · [Editor reveal →](editor-reveal.md)

### Scope

Two corrections from live use of Tasks 45–47, both about what the user
holds in their hand:

1. **Dragging is Move-mode-only** — in Draw mode the pencil ADDS, it
   never edits: a press-drag over a placed handle moves nothing and
   plants no surprise point (before Task 48 the drag was
   pointer-targeted and worked in every mode). The grab cursor and the
   hover-grow affordance now show in Move mode only.
2. **Curve is a PEN, not a path style** — the path-style chips are
   three again (Roads / Footpaths / Straight); a new Pen chip group
   (Default pen / Curve pen) decides HOW Draw captures points:
   - **Default pen** — the classic pencil: click to place points one by
     one (exactly the pre-Task-46 behavior);
   - **Curve pen** — freehand: press and DRAG across the map; the
     captured trace is simplified into the line's next nodes and — when
     the line is local (Straight) — smoothed by the Task-46 spline. A
     quick tap still places a single point.
   Any pen × any path style combines freely: default pen + Roads for
   the basics, Curve pen + Footpaths for a hand-drawn trail, back to
   default pen + Straight — the per-line style system is untouched.

### Contracts

- **One stroke = one undo step**: a committed stroke is a single
  `set-vertices` command appending its nodes; undo removes exactly the
  stroke, redo restores it. The stroke's exact first/last samples are
  user data — never simplified away.
- **The Curve pen's signature**: a stroke committed while the line is
  `"off"` (Straight) flips the line to `"curve"` so the spline smooths
  it; routed lines (car/foot) keep their routing — the stroke's nodes
  are waypoints. The Straight chip covers both `off` and `curve`
  (curve is local like straight); tapping it flattens a smooth line.
- **Budget honesty**: a stroke can never overflow the vertex hard cap —
  `simplifyStroke` iteratively raises its Douglas-Peucker tolerance
  (then decimates) until the node count fits the remaining budget.
  Routing strokes cap at 12 waypoints (each node pair is one routing
  request); local strokes cap at 40 (dense spline food).
- **Draw-mode semantics**: click adds; drag never adds (the released
  press of a stray drag is swallowed, default pen) or strokes (Curve
  pen); taps with the Curve pen add single points. Move drags; Pan
  navigates.
- **WYSIWYG unchanged**: the live stroke renders with the exact draft
  chain paint (what the pen drags is what the line will be); the
  spline/baking machinery of [§U](pointer-modes-path-styles.md) is reused verbatim for curve-pen lines.

### Architecture

- `types/domain.ts`: `PenMode = "default" | "curve"`.
- `features/reconstruction/stroke.ts` (new, pure): `simplifyStroke`
  (iterative Douglas-Peucker with per-use caps, endpoint pinning,
  dedupe) + `douglasPeucker` (iterative, stack-based).
- `lib/map/mapController.ts`: `#penMode` + `setPenMode`; the
  `gpxr-draft-stroke` source/layer (live freehand preview in the draft
  paint); `#onCanvasMouseDown/#onMouseMove/#onMouseUp` stroke capture
  (min step 2.5 px, tap threshold 8 px, trailing-click suppression);
  handle drags gated to Move mode; `onStrokeCommit` session callback;
  the test bridge reports `penMode` + `strokeActive`.
- The three stores: `pen` + `setPenMode` + `commitStroke` (one
  `set-vertices` append; off → curve flip via `setPathStyle`).
- The three hooks: `onStrokeCommit` wiring (budget from the active
  reconstruction, routing flag from the path style), pen → controller
  effect, the C keyboard accelerator (D/M/P unchanged).
- Panels ×2 (`draw-editor-panel`, `route-draw-panel`) + the map chrome:
  the Pen chip group (`pen-mode-*` testids), three path chips (no
  Curves), the mode chip says "Curve pen" while the curve pen draws.

### Verification

- `tests/stroke.test.ts` (8): DP shape/endpoint guarantees, per-use
  caps, budget compliance, degenerate taps.
- Store suites ×3: `commitStroke` appends as ONE undo step, off → curve
  flip, routed lines stay routed, cap refusal, unique ids.
- Panel suites: pen chips render + dispatch; no `road-follow-curve`
  chip; a curve line reads as Straight (pressed), tapping flattens.
- E2E draw-editor.spec.ts: the editing test now proves a Draw-mode drag
  moves NOTHING before Move mode moves it; the Curves test became the
  Curve pen test (freehand drag → spline interior → one undo → tap
  still adds → C toggles back). road-follow.spec.ts drags in Move mode.
- Baseline: 1037 unit + 74 e2e, typecheck + eslint clean; live QA
  (screenshots + console sweep) and VLM critiques all SHIP.
