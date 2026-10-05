# The Mode-Honest Editor (Task 52 — user pass 52)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Plan-a-Route](plan-a-route.md) · [Home redesign →](home-redesign.md)

**The report.** "In draw mode I can still drag points — dragging should
only work in the dragging-points mode. This may apply to the other
editors as well."

**The investigation.** The drag gate itself was probed end to end
(`e2e/_probe.spec.ts`, since deleted) across all four editors — Plan,
Create, Repair, and Recovery (which renders Repair's panel) — with
mouse drags, touch drags, chip switching, keyboard cycling (D→M→D), and
path-style switches that rebuild the session. In every case a Draw-mode
drag moved nothing; the single handle-drag entry point
(`mapController`'s `draftHandleHit` mousedown, gated
`pointerMode === "move"` since user pass 48) held. What the report
exposed instead was **mode-blind affordances**: the editor told the user
dragging was live regardless of the mode —

- the Pen chips (Default / Curve) rendered as fully live buttons in
  Move and Pan, so the panel read "drawing is on" while the pointer
  was actually in Move — where dragging a point legitimately works;
- the road-follow status said "Drag any point to adjust it — the road
  re-finds itself" in **every** mode, inviting the exact gesture the
  Draw mode refuses;
- the map legend said "Drawn point (drag to move)" unconditionally;
- the Create guide card said "Drag any point to adjust it" mid-draw;
- the `c` accelerator toggled the pen from Move/Pan in three of the
  four hooks, "un-drawing" a mode that was never drawn.

**The fix — every affordance tells the truth about the mode:**

- Pen chips render **inert** outside Draw (disabled, dimmed, wrapped in
  a `cursor-not-allowed` span; `aria-pressed` retained so the pen is
  remembered), with a `role="status"` note: "The pen works in Draw mode
  only — press D (or the pencil tool) to draw. Right now the pointer
  drags your points / navigates the map." All three panels; Recovery
  inherits Repair's panel.
- The road-follow status is mode-aware: Move keeps "Drag any point to
  adjust it — the road re-finds itself."; Draw/Pan get "Switch to Move
  (M) to drag a point — the road re-finds itself."
- Legend: "Drawn point (drag in Move mode)".
- Create guide card: "…Switch to Move (M) to drag any point…".
- `c` is gated to Draw in all four hooks (Plan already had it).

**The regression pins.** `e2e/pointer-mode-gating.spec.ts` (3 specs —
Plan, Create, Repair): draw a line, drag a handle in Draw → chain
byte-identical; switch to Move → chips disabled + note visible + the
same drag moves the point (>1e-5°); back to Draw → no-op again, chips
live. A `settledChain` helper waits out road-leg and snap round-trips
so the comparisons are race-free (the first probe's false "movement"
was a snap-at-add-time landing after the snapshot). Unit tests pin the
inert chips (disabled + `aria-pressed` kept + note copy per mode) and
the mode-aware status in all three panels.

- Live QA (`scripts/task52-live-qa.mjs`): three screenshots, zero
  console/page errors; VLM critiques (scripts/qa/task52/): move-mode
  inert pen SHIP, draw-mode live pen SHIP, legend SHIP.
- Baseline after Task 52: 1184 unit + 107 e2e, typecheck + eslint
  clean, isolated static-export build PASS.
