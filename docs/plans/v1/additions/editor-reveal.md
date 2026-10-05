# The Editor Reveal (Task 49 — user pass 49)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Pen system](pen-system.md) · [Plan-a-Route →](plan-a-route.md)

### Scope

Live follow-up to Task 48: the user could not see the requested features
in the drawing surfaces — "I don't see any of the features I requested in
the other modes that have a drawing mechanism." An audit of every surface
proved the features present in all three (repair, recovery, create: pen
group, path chips, Draw/Move/Pan rail + mode chip all in the DOM), but
**invisible at the moment they mattered**:

- **Repair**: the `DrawEditorPanel` inserts at the TOP of the tools
  column — above the gap list the "Draw route" click lives in — so the
  ~990 px card opened off-screen ABOVE the user's scroll position; the
  Pen and path chips never entered view (Task 48's own VLM critique had
  flagged this once).
- **Recovery**: the panel sits BELOW the guide/manual/gap cards; on a
  900 px viewport the Pen group's top landed at 787 px — 13 px visible.
- Create was never affected (the panel is the column's first card).

### Contracts

- **The editor must be SEEN when it opens**: when a draw editor session
  opens — or switches to another gap — the tools column scrolls to the
  panel's top, the Pen group leading the view.
- **The column only, never the map**: the scroll targets the sticky
  aside (its own scroll container at lg+); the page and the map stay
  exactly where the user's pointer left them. On smaller viewports the
  column doesn't scroll (scrollHeight ≈ clientHeight) and nothing moves.
- **The editor wins the same-flush race**: opening an editor also
  SELECTS the gap, and the GapList row's selection effect scrolls
  itself "nearest" in the same effect flush. The reveal scroll is
  deferred one `requestAnimationFrame` — after the row's scroll, still
  before the next paint (no visible flicker) — so the destination the
  user asked for (the editor) is the one that lands.
- **No mid-drawing re-scrolls**: the effect is keyed on the gap identity
  alone; vertex churn never moves the column (the GapList row
  discipline).

### Architecture

- `draw-editor-panel.tsx`: `cardRef` on the Card root (React 19
  ref-as-prop) + a `[gapId]`-keyed effect; rAF-deferred
  `column.scrollTo({ behavior: "smooth" })` computed from the panel's
  rect vs the `[data-testid$="tools-panel"]` column's rect; guarded for
  jsdom (no rAF/scrollTo crashes, no column → no-op).
- No store, hook, or controller changes — one presentation component
  covers both repair and recovery (they share the panel).

### Verification

- `tests/draw-editor-panel.test.tsx` (+5, file at 27): above-the-fold
  (repair) and below-the-fold (recovery) reveal math; no scroll when
  the column fits (mobile); no re-scroll on same-gap vertex churn;
  bare-mount no-op.
- E2E: `openEditor` (draw-editor.spec.ts) asserts the pen group
  `toBeInViewport({ ratio: 1 })` on every desktop (≥1024 px) editor
  open; both desktop recovery flows assert it too. 13/13 + 20/20
  (road-follow / create / manual-span) green.
- Live QA (`scripts/task49-live-qa.mjs`): repair reveal pen group top
  −587 px → +250 px; recovery +13 px visible → +249 px; Curve pen
  strokes after the reveal; zero console/page errors. VLM critiques
  (repair / recovery / curve) all SHIP.
- Baseline: 1042 unit + 77 e2e, typecheck + eslint clean, isolated
  static-export build PASS.
