# The Landing Tool Cards (Task 42 — user-requested addition)

> **Status: DONE** — v1-era user-requested addition, shipped with v1 (tag `v1`) · [v1 overview](../overview.md#user-requested-additions-v1-era) · [plan library](../../README.md) · [master plan](../../../MASTER_PLAN.md)

[← Gap recovery](gap-recovery.md) · [Merge section →](merge-section.md)

The landing page's four-tab segmented control ("Repair a recording" /
"Create a share card" / "Recover a GPS gap" / "Create from stats",
Tasks 20→26) was replaced by a two-page front door, per the user's
request: **a cards home, then a per-tool page.**

### S-1 Scope & contracts

- **The home page** ("What would you like to do?") shows one card per
  tool — an illustration of what the tool does (AI-generated, Field
  Plot art direction: paper, ink linework, one orange accent, faint
  contours, no text), an icon chip, a mono kicker, the title, a blurb,
  and an "Open" affordance. The card IS the button (one tap target,
  44px+ by construction, `aria-label` "«title» — open this tool").
- **The tool page** carries everything the old tab swap revealed —
  hero, intake (upload zone / statistics form), the "How it works"
  trio — plus a new **fact strip** (Input / Output / Best for: the
  concrete contract under the teaching copy) and the **"All tools"**
  back button at the top-left of the hero column.
- **One intent, one action.** Opening a card sets BOTH the remembered
  upload intent (`landingMode`, still persisted per [§D-4](../../../MASTER_PLAN.md#d-4-state-management-model-zustand)) and the open
  page (`landingView: "tool"`, transient) — the same `openLandingTool`
  store action, so the intent and the page can never drift apart.
  `closeLandingTool` returns to the cards.
- **Reset keeps the tool page.** A section reset ("New file") returns
  to the landing on the remembered tool's page with its intake ready —
  the same remembered-intent contract the tab carried (batch uploads
  of many files through one tool stay one-click). A fresh load always
  opens on the cards (`landingView` is never persisted).
- **Focus management (the page-turn contract).** Entering a tool page
  focuses its `h2` (screen readers announce the new page; Tab restarts
  inside it — the card that opened it is unmounted). Returning to the
  cards focuses the card that was opened (tracked in SessionIdleView
  local state), so keyboard users never land on `document.body`.

### S-2 Architecture

- `state/ui-store.ts` — `LandingView = "home" | "tool"` (transient,
  excluded from `partialize`), `openLandingTool(mode)` /
  `closeLandingTool()`; `landingMode` unchanged (persisted intent).
- `components/layout/landing-cards.tsx` — `LandingCardsView` + the
  `LANDING_TOOLS` registry (kicker/title/blurb/alt/icon per tool) and
  the focus-return refs.
- `components/layout/session-views.tsx` — `SessionIdleView` is now the
  dispatcher (home → cards, tool → `ToolDetailView`); the tool page
  owns the back button, hero, intake, steps, and fact strip
  (`WORKFLOW_STEPS` / `HERO_COPY` carried over verbatim; new
  `TOOL_FACTS`).
- `public/cards/{repair,share,recovery,create}.webp` — 896×512
  optimized illustrations (raws + prompts under `scripts/qa/task42/`).
- e2e compatibility: the card grid keeps the `landing-mode-toggle`
  testid and each card keeps `landing-mode-{mode}`, so existing specs'
  clicks carried over; the shared `e2e/helpers/landing.ts`
  `enterRepairTool(page)` enters the repair tool from any landing
  state (no-op when a tool page is already open) and every
  repair-section spec's local `upload()` calls it first.

### S-3 Verification

Unit: the landing suite re-pinned (cards: four doors, illustrated,
alt text, open intent, focus round-trip; tool page: hero, intake,
steps, facts, back intent, mount focus) — 941 passing. E2E: smoke
teaches the new home → card → page flow; gap-recovery re-pinned its
reset handoffs (back-to-cards before the toggle; the remembered tool
page asserted by heading instead of the retired radio semantics);
share-card's regression test opens the repair card explicitly — 67
passing. Live QA (agent-browser, desktop 1440×900 + mobile 375×667):
all four illustrations load, no console/page errors, no horizontal
overflow, focus lands on the tool heading on entry and back on the
originating card on return. VLM critiques: illustrations 4/4 KEEP
(one regeneration — the create watch face initially carried digits,
forbidden), home page SHIP (desktop full-page + mobile), tool page
structure PASS (flagged items were pre-existing conventions: the
upload-zone/footer privacy lines are two phrasings of the [§M-3](../../../MASTER_PLAN.md#m-3-user-facing-disclosure)
promise at two scopes).
