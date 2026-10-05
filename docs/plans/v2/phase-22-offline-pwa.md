# Phase 22 — Offline PWA & Persistent Caches (Task 67)

> **Status: DONE** — shipped in v2 (tag `v2`) · [v2 overview](overview.md) · [plan library](../README.md) · [master plan](../../MASTER_PLAN.md)

[← Phase 21](phase-21-internationalization.md) · [Phase 23 →](../v3/phase-23-fitness-zones-metrics.md)

## Plan (v2 roadmap)

**Objective:** install it, use it in the mountains, never wait
twice.

- **22.1 Manifest + icons:** installable, standalone display,
  theme colors for both themes.
- **22.2 Service worker:** precache the static-export asset
  manifest; stale-while-revalidate runtime strategy; an
  update-available toast that asks before reloading — never a
  silent swap mid-edit.
- **22.3 Elevation cache persistence:** Cache Storage/IndexedDB
  backend for the [Phase 7](../v1/phase-07-merge-export.md) LRU design (rounded-coord keys, size cap,
  and a clear button in the privacy settings).
- **22.4 Offline proof:** e2e that blocks network, loads the app
  from cache, and completes a repair + export with zero requests.

**Non-goals:** background sync, push notifications.
**Verification:** offline e2e (the phase's centerpiece), Lighthouse
installability, cache-cap eviction tests, VLM on install/update
toasts.

## Delivery record (Task 67)

**Objective:** install it, use it in the mountains, never wait
twice — the closing phase of v2.

**22.1 Manifest + icons.** `src/app/manifest.ts` (the metadata
route, `/manifest.webmanifest`): standalone display, `/` start and
scope, and the exact sRGB render of globals.css's light
`--background` (`#F1F1F2`) as both chrome colors — computed by the
same script that rasterizes the icons, so the window chrome and the
page can never disagree. The dual-theme half the plan asked for
lives in layout.tsx as the pair of `prefers-color-scheme`
`<meta name="theme-color">` tags (light `#F1F1F2`, dark `#151516`):
a manifest cannot switch on the OS theme; the metas can. Icons are
the route mark itself (public/logo.svg), rasterized
deterministically by `scripts/generate-pwa-icons.mjs` (the repo's
own Playwright Chromium against a file:// page): 192 + 512 "any"
plus a 512 maskable with the mark held inside the 80% safe zone on
a full-bleed signal field.

**22.2 The service worker.** Hand-rolled `public/sw.js` — no
framework, no dependency. PRECACHE: `scripts/build-pwa.mjs` (wired
into `npm run build`) walks the standalone output and writes the
served-only `/precache-manifest.json` — every content-hashed
chunk, every public asset, `/`, the manifest route, and the icon
route (71 URLs on the current build). Install fetches them all
with `cache: "reload"`; ONE failure fails the install, so an
update can never half-land — the old version keeps serving.
RUNTIME: stale-while-revalidate for same-origin unhashed assets
(fonts, the MapLibre worker, share-card art) — with two hardening
twists the plan's words didn't spell out: reads fall through to
the PRECACHE (an asset precached but never requested online must
still serve), and revalidation is skipped while
`navigator.onLine` is false (no doomed background fetches; offline
degrades to cache-first). TILES: cache-first on exactly the two
egress-table tile hosts, capped at 800 entries with a count-based
trim — the one deliberate deviation from SWR, because
revalidating immutable tiles would double the bandwidth of exactly
the mountain trips this phase exists for; routing and elevation
APIs are never touched by the worker (consent gates stay exact).
NAVIGATIONS: network-first with the precached app shell as the
offline fallback. The update contract: the build script appends
the real `self.BUILD_ID` (a digest of the asset list) to the
served sw.js — byte changes are the ONLY update signal a browser
has — and the new worker, once precached, WAITS. The registrar
(`sw-registrar.tsx`, production-only, `updateViaCache: "none"`)
sees the waiting worker and ASKS: the update toast with a Reload
action, `duration: Infinity` (a consent prompt never vanishes on a
timer), and the reload fires only on that click through
SKIP_WAITING → controllerchange. Nothing ever swaps mid-edit.

**22.3 Persistent elevation terrain.** The [Phase 6](../v1/phase-06-elevation.md) LRU gained a
durable twin: `PersistentElevationCache`
(features/elevation/persistent-cache.ts — pure, injectable backend,
[§F-clean](../../MASTER_PLAN.md#f-project-structure)) extends the in-memory LRU with a debounced write-through
and a boot-time hydrate (newest-first, memory wins on conflict,
corrupt entries dropped). The browser backend
(lib/storage/elevationCacheStore.ts — `gpx-repair-studio.elevation`
v1, one `points` store) follows the sessionStore failure contract
exactly: no IndexedDB, blocked databases, quota errors — the first
failure latches persistence off with one warn, every later op is a
silent no-op, and the in-memory cache (therefore every feature)
behaves exactly as in [Phase 6](../v1/phase-06-elevation.md). Both layers cap at 5,000 points
(the [Phase 6](../v1/phase-06-elevation.md) constant); the persisted trim evicts oldest by write
time. Persistence recency is WRITE order, honestly documented —
reads refresh the memory LRU only. All four elevation surfaces
share the one provider, so the persistence landed in exactly one
place. The privacy pane's storage section gained the two Phase 22
rows — the terrain cache (with its live point count, read from the
real database) and the worker's three caches — each with a Clear
button and an inline confirmation; clearing the offline caches
also unregisters the worker, so the next online visit re-installs
and re-downloads exactly what it needs.

**22.4 The offline proof.** `e2e/phase22-offline.spec.ts` boots
the PRODUCTION standalone server on its own port (the dev server
must never be worker-controlled), warms the whole repair journey
online (upload, map fit, tiles settled), cuts the network
(`context.setOffline`), reloads — the app comes back from the
worker's precache — and then completes a full repair + export:
upload, gap detected, two vertices TYPED (the [Phase 16](phase-16-track-surgery.md)
keyboard-only path — the map test bridge is production-gated by
design, and numeric entry needs no pointer and no router), commit,
GPX download with the typed geometry marked `gpxr:reconstructed`.
THE COUNT: from the moment the network is cut, zero page-attributed
requests fail at the network layer. Worker-internal probes are
excluded by attribution (`request.serviceWorker()`) — they ARE the
offline machinery. One console signature is excluded by design:
an unviewed tile answered with an honest 503 (MapLibre marks it
errored and RETRIES when the network returns; a 200-empty tile
would cache as permanently blank terrain — a lie). Its companion
`phase22-update.spec.ts` deploys a real build-id change to the
served sw.js and proves the whole contract: the toast asks, an
in-progress flag survives the wait (no silent reload), the Reload
click reloads exactly once into the new version, and no toast
fires again.

**Verification:** 1889/1889 unit (the +22: the persistent cache's
write-through/coalescing/hydrate-order/cap-eviction/latch
contract, the withCache decorator compatibility, and the manifest's
installability fields pinned statically — the Lighthouse
criteria at millisecond cost); +2 e2e → **201 total**, the full
regression re-run in five chunks against the dev server (the two
Phase 22 specs boot their own production servers; one real find:
the batch run exposed a tile-warm timing window, fixed with a
2-second settle and the documented 503 exclusion). ESLint clean,
tsc clean, static export PASS (`npm run build` now carries the
PWA step: 71 precache URLs, build id baked). Live QA
`scripts/phase22-live-qa.mjs` 25/25: the manifest fetched and
field-checked, all three icons served at their TRUE PNG-header
dimensions, the served worker's BUILD_ID matched to the generated
manifest, precache spot-checks 200, the document's manifest link +
dual theme-color metas, the elevation database opening on boot,
the offline reload, the privacy pane reading a REAL seeded count
(5) through the app and zeroing after the clear, both Clear
confirmations, and zero console/page errors across the run. VLM:
five critiques (the update toast EN light/dark/zh, the privacy
storage pane, the offline landing) — eleven measurable claims,
every one DISPROVEN by `scripts/phase22-vlm-measure.mjs` geometry:
zero overflow in both locales with the text tails inside the box,
the text-button gap exactly the 8px token, the button dead-center
on the text block (0px — the model's "misalignment" measured the
description against the button and forgot the title), line-height
1.33 (the design system's standard step every zh surface ships),
the egress table's paragraphs losing nothing, the disclosure
leading at 1.63.

**Decisions recorded here:**
- Tiles are cache-first, not SWR (immutable bytes; revalidation
  would double mountain bandwidth) — the documented deviation
  from [§EE 22.2](#plan-v2-roadmap)'s wording, in the direction of the phase's own
  objective.
- An unviewed tile offline answers 503, never a fabricated 200 —
  MapLibre retries errored tiles on reconnect; a cached blank
  tile would lie forever.
- The update toast outlives any timer (`duration: Infinity`): a
  consent prompt disappears when the user decides, not before.
- The manifest carries the light chrome colors and the metas carry
  both themes — the manifest spec has no media queries, and the
  pre-paint script cannot reach the window chrome; an explicit
  in-app theme choice still follows the OS query there (the one
  place localStorage cannot reach), documented as the accepted
  edge.
- Registration is production-only and the map test bridge stays
  production-gated: the offline e2e uses the [Phase 16](phase-16-track-surgery.md) numeric
  entry instead of weakening either wall.
- `precache-manifest.json` and the versioned `sw.js` are
  build artifacts, never committed; the repo's `public/sw.js` is
  the readable source of truth.
- Non-goals held: no background sync, no push notifications.
