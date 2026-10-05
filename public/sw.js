/*
 * GPX Repair Studio — service worker (Phase 22.2, §EE 22.2).
 *
 * The offline contract: install it, use it in the mountains, never
 * wait twice.
 *
 *   - PRECACHE: the build-generated asset manifest ("/precache-
 *     manifest.json", written by scripts/build-pwa.mjs) lists every
 *     hashed chunk, every public asset, and the app shell — fetched
 *     once at install, atomically. A failed precache fails the
 *     install, so the previous version keeps serving (updates are
 *     all-or-nothing).
 *   - RUNTIME (stale-while-revalidate): same-origin assets that are
 *     not content-hashed (fonts, the maplibre worker, share-card
 *     templates) serve instantly from cache and refresh quietly in
 *     the background.
 *   - TILES (cache-first): basemap tiles are effectively immutable
 *     for this app's lifetime, so a viewed tile is served offline
 *     forever and never re-requested — the one deliberate deviation
 *     from SWR, because revalidating tiles would double the
 *     bandwidth of exactly the mountain trips this phase exists for.
 *     Only the two tile hosts from the privacy pane's egress table
 *     are cached; routing and elevation APIs are NEVER touched by
 *     this worker (their consent gates and caches stay exact).
 *   - NAVIGATIONS: network-first with the precached app shell as the
 *     offline fallback — fresh HTML whenever the network exists, the
 *     app from cache whenever it does not.
 *   - UPDATES never swap silently: the new worker precaches, then
 *     WAITS. The page sees the waiting worker and asks (a toast with
 *     a Reload action); only that user's "Reload" posts
 *     SKIP_WAITING. Nothing reloads behind the editor's back.
 *
 * The served copy of this file carries a build id appended by the
 * build script (self.BUILD_ID) — every build changes the bytes, which
 * is what makes the browser notice an update at all.
 */

/* global self, caches, clients, fetch, Response */

const PRECACHE = "gpx-repair-studio.precache.v1";
const RUNTIME = "gpx-repair-studio.runtime.v1";
const TILES = "gpx-repair-studio.tiles.v1";
const MANIFEST_URL = "/precache-manifest.json";
const APP_SHELL = "/";

/** The tile hosts (the egress table's first row, and nothing else). */
const TILE_HOSTS = new Set([
  "tiles.openfreemap.org",
  "tile.openstreetmap.org",
]);

/** Tile-cache ceiling — past it, arbitrary entries are trimmed. */
const TILE_CACHE_MAX = 800;

/** Default BUILD_ID for the repo copy; the build script appends the real one. */
self.BUILD_ID = self.BUILD_ID || "dev";

/* ------------------------------------------------------------------ */
/* Install — precache the whole asset manifest, atomically.            */
/* ------------------------------------------------------------------ */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`precache manifest ${response.status}`);
      }
      const manifest = await response.json();
      const urls = Array.isArray(manifest.urls) ? manifest.urls : [];
      if (urls.length === 0) {
        throw new Error("precache manifest is empty");
      }
      const cache = await caches.open(PRECACHE);
      // One failure fails them all — the update must not half-land.
      await Promise.all(
        urls.map((url) =>
          cache.add(new Request(url, { cache: "reload" })),
        ),
      );
    })(),
  );
});

/* ------------------------------------------------------------------ */
/* Activate — drop precache entries no build references, then claim.   */
/* ------------------------------------------------------------------ */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(MANIFEST_URL, { cache: "no-store" }).catch(
        () => null,
      );
      const manifest =
        response && response.ok ? await response.json().catch(() => null) : null;
      const keep = new Set(
        manifest && Array.isArray(manifest.urls) ? manifest.urls : [],
      );
      keep.add(MANIFEST_URL);
      const cache = await caches.open(PRECACHE);
      const stale = (await cache.keys())
        .map((request) => new URL(request.url).pathname)
        .filter((pathname) => !keep.has(pathname));
      await Promise.all(stale.map((pathname) => cache.delete(pathname)));
      // Tile + runtime caches persist across builds by design
      // ("never wait twice" survives an update).
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------------------------------------------ */
/* Updates — the user decides, never a silent swap (§EE 22.2).         */
/* ------------------------------------------------------------------ */

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ------------------------------------------------------------------ */
/* Fetch — the strategies.                                             */
/* ------------------------------------------------------------------ */

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The manifest itself is always network-fresh (it IS the version).
  if (url.pathname === MANIFEST_URL) return;

  // App navigations: network-first, app-shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Hashed build chunks and other precached paths: cache-first.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg")
  ) {
    event.respondWith(cacheFirst(request, PRECACHE));
    return;
  }

  // Basemap tiles (the two egress-table hosts, nothing else):
  // cache-first with a trim, offline forever.
  if (TILE_HOSTS.has(url.hostname)) {
    event.respondWith(tileCache(request));
    return;
  }

  // Other same-origin assets (fonts, vendor, cards, icons): SWR.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME));
    return;
  }

  // Everything else (routing APIs, Open-Meteo, telemetry-free): the
  // worker does not touch it — the network speaks directly.
});

/* ------------------------------------------------------------------ */
/* Strategy helpers.                                                   */
/* ------------------------------------------------------------------ */

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(PRECACHE);
      // Only the shell route is cached as an offline fallback; tool
      // routes share the single-page app anyway.
      if (new URL(request.url).pathname === APP_SHELL) {
        cache.put(APP_SHELL, response.clone());
      }
    }
    return response;
  } catch {
    const cache = await caches.open(PRECACHE);
    const cached =
      (await cache.match(APP_SHELL)) ||
      (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    return offlineResponse();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Not precached and no network — answer honestly instead of
    // throwing a failed request at the page.
    return offlineResponse();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  // Read from ANY cache: runtime first, but an asset that was
  // precached without ever being requested online must still serve.
  const cached = await caches.match(request, { ignoreSearch: false });
  // Revalidate only while there is a network — offline, this is a
  // plain cache-first (no doomed background fetches).
  const refresh =
    self.navigator.onLine === false
      ? null
      : fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === "opaque")) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);
  if (cached) return cached;
  const fresh = (await refresh) || null;
  if (fresh) return fresh;
  return offlineResponse();
}

async function tileCache(request) {
  const cache = await caches.open(TILES);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      // Opaque tile responses are ~768 B accounting artifacts; the trim
      // counts entries, not bytes, so quota stays predictable.
      cache.put(request, response.clone());
      void trimTileCache(cache);
    }
    return response;
  } catch {
    // A tile the user never viewed, requested offline: hand MapLibre
    // an honest 503 so it marks the tile errored (blank patch) —
    // never a fabricated tile that would lie about the terrain.
    return offlineResponse();
  }
}

function offlineResponse() {
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

async function trimTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_CACHE_MAX) return;
  const excess = keys.length - TILE_CACHE_MAX;
  await Promise.all(
    keys.slice(0, excess).map((request) => cache.delete(request)),
  );
}
