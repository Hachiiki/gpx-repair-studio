# Phase 17 — Road Snapping, Opt-In (Task 62)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 16](phase-16-track-surgery.md) · [Phase 18 →](phase-18-batch-portable-sessions.md)

## Plan (v2 roadmap)

**Objective:** the biggest realism upgrade for reconstructions,
without breaking the privacy promise.

- **17.1 Router provider abstraction:** OSRM-compatible endpoint,
  configurable URL; default points at a public OSRM instance with
  plain-language privacy implications stated; self-hosting
  instructions added to the README and privacy page.
- **17.2 Consent gate:** explicit per-session opt-in (never
  persisted as default-on, re-asked each session, never silent);
  plain notice: "snapping sends the drawn line to a third-party
  router". Toggle lives in the draw tools; consent state shown in
  the footer while active.
- **17.3 Snap engine:** match the drawn polyline to the routed
  path, preview with distance delta (routed vs straight-line),
  apply/unapply (undo), in-memory cache keyed by rounded-polyline
  hash (persistent cache joins [Phase 22](phase-22-offline-pwa.md)).
- **17.4 Offline/declined fallback:** unchanged freehand drawing;
  the snap control disables with an explanation when offline.

**Non-goals:** turn-by-turn instructions, routing waypoints,
ever snapping original recorded data (only user-drawn
reconstructions), any other external service.
**Verification:** provider adapter with mocked fetch, consent-flow
e2e (no network call before consent — asserted), privacy page copy
update, VLM on the snap preview.

## Delivery record (Task 62)

**Story.** The realism upgrade gained a privacy architecture. Every
routing request is now consent-gated: nothing leaves the browser
until the user enables road snapping for the session — the draw tools
ask in plain language, the footer states the on state with the exact
hosts, and every fresh page load asks again. The one-shot **Snap to
road** command arrived: a straight-drawn line matches onto the road
network in a single whole-polyline request, previews on the very line
the map renders (with an honest distance delta), and applies as ONE
undo step that moves the geometry and the path style together. And
the router became configurable: point both path styles and the snap
at your own OSRM-compatible server, set in the privacy pane, with
self-hosting instructions in the README.

**What shipped.**

- **The provider abstraction** (`features/reconstruction/routerConfig.ts`):
  one user-settable OSRM-compatible base URL (a persisted preference,
  validated with plain-language errors, normalized defensively — path
  prefixes kept, query stripped); resolved endpoints — no custom URL:
  car → the public OSRM demo, foot → the public Valhalla demo (v1
  behavior); custom URL: BOTH profiles → `{base}/route/v1/{driving|
  foot}`. The configuration signature joins every router cache key,
  so one server's answers can never be served for another's. The
  hosts label (`routerHostsLabel`) is the single source the footer
  chip and the consent dialog quote.
- **The consent gate** ([§EE 17.2](#plan-v2-roadmap), defense in depth): the HARD gate —
  `hooks/road-router.ts`'s shared router injects a fetch that refuses
  unless the session's consent is "granted" (whichever of the four
  draw hooks calls, no request can physically leave; the e2e asserts
  the provider's call count is zero before consent). The HONEST gate —
  all four leg-resolution effects (repair / recovery / create / plan)
  check consent BEFORE requesting: cached legs still render (a
  session restore keeps its road geometry, zero network), the status
  stays quiet, and the panels show the enable notice. Consent lives in
  the ui-store as TRANSIENT state (never persisted, never
  default-on — every page load starts "unknown"); the
  RouterConsentDialog (grant + manage modes) mounts once in AppShell;
  the SiteFooter carries the chip while granted — hosts named, one
  click from off.
- **The snap engine** (`features/reconstruction/snapEngine.ts` +
  `RoadFollowRouter.routePolyline`): the drawn chain's nodes
  (anchor → vertices → far anchor) reduce to a waypoint budget
  (Douglas-Peucker, endpoints pinned, ≤ 48) and route in ONE request;
  the returned geometry matches back to the nodes MONOTONELY (each
  waypoint resolves to the nearest geometry vertex at-or-after the
  previous match — providers snap waypoints, so matches are near, not
  exact) and slices into per-pair `RoadLeg`s — the same side-table
  vocabulary per-leg follow uses, so the PREVIEW rides the existing
  renderer: the map, the distance badge, and the closing preview all
  show the road path through the WYSIWYG join (no new map surface).
  The in-memory snap cache is keyed by the rounded-polyline hash
  ([§EE 17.3](#plan-v2-roadmap) verbatim; persistence joins [Phase 22](phase-22-offline-pwa.md)). The preview box
  carries three honest numbers: your line as rendered (legs included),
  on the road, and the signed delta — each measured the way the user
  can verify it.
- **The apply** (`drawModel.setLineCommand` — the new `set-line`
  command): ONE undoable step replacing the vertices (the routed
  geometry reduced to ≤ 128 waypoints) AND the line's path style; the
  inverse swaps both snapshots (an absent style CLEARS the field — an
  undo of a snap on a never-styled line returns to straight, not to
  "car"). Both reconstruction stores sync the ACTIVE chip style on
  set-line commit/undo/redo (`styleSyncPatch`), and the recovery store
  gained the `submitCommand` twin. The applied line renders its exact
  road shape with ZERO re-requests: the apply seeds the side table
  with the waypoint slices PLUS the two anchor stubs (the honest
  few-meter stitches where the provider snapped the endpoints), and
  the router cache with all of it — every pair the leg effect will
  look up is a hit.
- **The shared machine** (`hooks/use-road-snap.ts`): one state machine
  for both reconstruction editors (repair + recovery; plan/create keep
  per-leg follow only — the [§EE](#plan-v2-roadmap) non-goal "only user-drawn
  reconstructions" scopes the snap to the reconstruction editors).
  The preview is keyed to the chain (a referentially stable token);
  staleness DERIVES at render (the context lives in state, the chain
  is a pure closure read) and the side-table restore is a store write
  in an effect — the react-hooks set-state-in-effect/refs discipline
  throughout. Apply re-checks staleness at event time.
- **Offline** (`hooks/use-online-status.ts`, `useSyncExternalStore`):
  the snap control disables WITH an explanation; freehand drawing
  never stops; routable chips keep v1's honest request-failure
  fallback.
- **Privacy/docs**: the egress table's routing row reworded (off
  until you say yes, re-asked every session; the custom-router
  option); "Choosing the providers" gains the Routing control — URL
  input + Save/Use-public-servers + honest validation errors; the
  README gains the consent + self-hosting sections.

**Verification.** +69 unit → 1672/1672: router-config (17),
snap-engine (16), set-line + both stores (9), road-follow extensions
(routePolyline request shape, rounded-polyline cache, Valhalla
multi-waypoint, custom-URL both-profiles, server-switch cache
isolation — 12), router-consent-dialog (7), panel consent/snap UI
(8); e2e phase17-road-snap 8/8 — the consent gate with the call
count ASSERTED zero before consent, decline, footer manage/revoke,
the snap flow (preview → apply → chip flip → ONE undo → straight
back, no re-requests), cancel, offline, custom router (the demo
server untouched), invalid-URL error. Full regression: the 158-test
baseline re-run green with `grantRoadConsent` added where specs
assert routing (road-follow, session-recovery). Typecheck + eslint
clean (two set-state-in-effect findings restructured into derivation
+ store writes, one ref-read finding into state); static export PASS.
Live QA 35/35 both themes + mobile, zero console/page errors. VLM on
the snap preview + consent dialog + mobile: 5 claims measured — the
dl misalignment, the "Privacy&Bdata" link, and the footer alignment
DISPROVEN (left edges identical, textContent correct, justify
flex-end); the mobile below-the-fold Apply CONFIRMED and fixed (the
preview box now reveals the sheet + scrolls into view; measured
applyBottom 870 → 728 within the 844 viewport); "Cancel is vague"
adopted as "Keep my drawing". Post-fix re-critique 8/10; the
remaining claims are the app-wide dialog hierarchy (ghost secondary)
and the deliberate honesty copy — settled by consistency.

**Decisions & deviations.** (1) The consent gate applies to ALL
router traffic, not just the new snap engine — v1 road-follow fired
network on the first leg with no gate; [§EE 17.2](#plan-v2-roadmap)'s "no network call
before consent" closed that retroactively. (2) The plan's preview
"with distance delta (routed vs straight-line)" generalizes to the
RENDERED chain length (legs included) — a road-followed line re-snapped
shows Δ≈0 instead of a fabricated straight-line difference; the
straight-drawn case (the snap's target) is exactly the plan's
wording. (3) The snap engine lives in the repair + recovery editors
only. (4) The applied line keeps anchor stubs — the provider's
snapped endpoints stitch to the exact anchors (the WYSIWYG contract
every road leg follows). (5) The custom URL replaces BOTH profiles;
foot keeps Valhalla only on the default (public) configuration.
