/**
 * InfoContent (Phase 11) — the "Privacy & Data" and "About" panes.
 *
 * The §M-3 disclosure, in full: the exact egress table (§M-2, updated
 * for the shipped road-follow pens — the plan's original two-row table
 * predates Tasks 44–50), what works offline, how to switch every
 * provider, and exactly what this device stores (Phase 10's IndexedDB
 * sessions + the settings key). Plus the About pane's attribution for
 * the open data and software the app is built on.
 *
 * Copy discipline — the same contract the landing teaches with: every
 * claim here describes shipped behavior, pinned to the code by tests
 * (tests/info-content.test.tsx asserts the provider names/hosts this
 * page names match the constants in lib/map/styles.ts,
 * features/elevation, and features/reconstruction/roadFollow.ts, so a
 * provider change that forgets this page fails the suite).
 *
 * Pure presentation, no props — the InfoDialog hosts it.
 */

"use client";

import { APP_VERSION } from "@/components/layout/app-version";

/* ------------------------------------------------------------------ */
/* Privacy & Data                                                      */
/* ------------------------------------------------------------------ */

/**
 * The egress table's rows — the complete list of what ever leaves the
 * browser (§M-2). Exported for the pinning tests.
 */
export interface EgressRow {
  /** What the user does that triggers it. */
  trigger: string;
  /** The service(s) contacted — display names. */
  destination: string;
  /** The exact hosts — pinned to source constants by tests. */
  hosts: string;
  /** What is actually sent, and what is deliberately never sent. */
  payload: string;
}

export const EGRESS_ROWS: readonly EgressRow[] = [
  {
    trigger: "The map is visible",
    destination: "Map tiles — OpenFreeMap (default) or OpenStreetMap raster",
    hosts: "tiles.openfreemap.org · tile.openstreetmap.org",
    payload:
      "Tile coordinates (x/y/z) for the visible area, plus the standard metadata any web request carries (IP address, user agent). Tile-level only — roughly kilometers at low zoom. Never your GPX, never precise positions.",
  },
  {
    trigger: "You draw with the Roads or Footpaths path style",
    destination: "Public routing services — OSRM (roads) and Valhalla (footpaths)",
    hosts: "router.project-osrm.org · valhalla1.openstreetmap.de",
    payload:
      "Only the two endpoints of each line segment you place, to find the road between them. Never the file, never recorded points. The Curve pen and Straight lines are fully local — no request at all.",
  },
  {
    trigger: "You opt in to an elevation lookup (per reconstruction, after a disclosure)",
    destination: "Open-Meteo Elevation API (Copernicus DEM GLO-90)",
    hosts: "api.open-meteo.com",
    payload:
      "The coordinates of the reconstructed points only — the count is shown before you confirm. Never the full file, never the recorded route. Off by default; nothing fetches until you ask.",
  },
];

export function PrivacyPane() {
  return (
    <div className="space-y-6" data-testid="privacy-pane">
      {/* The promise — §M-1. */}
      <section className="space-y-2">
        <h3 className="text-[17px] font-bold tracking-tight">
          Everything else runs on this device
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Reading the file, parsing, gap detection, drawing, geodesy,
          timestamp reconstruction, statistics, merging, and export all
          execute in this browser tab. There is no account, no server
          copy, no analytics, and no cookies. Closing the tab destroys
          everything in memory.
        </p>
      </section>

      {/* The egress table — §M-2, the complete list. */}
      <section className="space-y-2" aria-labelledby="privacy-egress-heading">
        <h3
          id="privacy-egress-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          What leaves this browser — the complete list
        </h3>
        <div className="overflow-x-auto rounded-[10px] border-[1.5px] border-ink">
          <table
            className="w-full border-collapse text-left"
            data-testid="privacy-egress-table"
          >
            <thead>
              <tr className="border-b-[1.5px] border-ink bg-ink/[0.04]">
                <th
                  scope="col"
                  className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-shade"
                >
                  When
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-shade"
                >
                  Where
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-shade"
                >
                  What is sent
                </th>
              </tr>
            </thead>
            <tbody>
              {EGRESS_ROWS.map((row) => (
                <tr
                  key={row.trigger}
                  className="border-b-[1.5px] border-ink/10 align-top last:border-b-0"
                >
                  <td className="px-3 py-2.5 text-[12.5px] font-semibold leading-snug">
                    {row.trigger}
                    <span className="mt-1 block font-mono text-[10.5px] font-normal tracking-[0.01em] text-shade">
                      {row.hosts}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] leading-snug text-muted-foreground">
                    {row.destination}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {row.payload}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          That is the whole list. The core flow — upload, inspect, draw
          with Straight or Curve lines, time reconstruction, statistics,
          merge, export, share card — makes no requests at all, and an
          automated test runs that flow with a strict network allow-list
          and fails if anything else is ever contacted.
        </p>
      </section>

      {/* Offline behavior. */}
      <section className="space-y-2" aria-labelledby="privacy-offline-heading">
        <h3
          id="privacy-offline-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          Working offline
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Everything except the three rows above works with the network
          off: upload, parse, inspect, draw (Straight and Curve), time
          reconstruction, statistics, merge, export, and the share card.
          Without tiles the basemap degrades visibly but the route, the
          gaps, and every drawn line still render — and the map
          toolbar&apos;s basemap picker has a &quot;None&quot; option
          that never requests tiles at all.
        </p>
      </section>

      {/* Provider switching. */}
      <section className="space-y-2" aria-labelledby="privacy-providers-heading">
        <h3
          id="privacy-providers-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          Choosing the providers
        </h3>
        <ul role="list" className="space-y-1.5">
          <li className="text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Basemap:</span>{" "}
            the map toolbar&apos;s basemap control (the layers icon)
            switches between OpenFreeMap, OpenStreetMap Standard raster,
            and None — remembered with your settings.
          </li>
          <li className="text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              Road-following:
            </span>{" "}
            OSRM serves the Roads path style and Valhalla serves
            Footpaths — public demo servers, best-effort by design. When
            one is unreachable the line falls back to straight segments
            until it recovers, and the editor says so.
          </li>
          <li className="text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Elevation:</span>{" "}
            Open-Meteo (Copernicus DEM GLO-90) is the only provider
            today, and it is opt-in per reconstruction — the disclosure
            with the exact point count is shown before anything is sent.
          </li>
        </ul>
      </section>

      {/* Storage on this device — the Phase 10 disclosure in full. */}
      <section className="space-y-2" aria-labelledby="privacy-storage-heading">
        <h3
          id="privacy-storage-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          What this device stores
        </h3>
        <ul role="list" className="space-y-2">
          <li
            className="rounded-[10px] border-[1.5px] border-ink/15 p-3"
            data-testid="privacy-storage-settings"
          >
            <p className="text-[13px] font-semibold">
              Settings — localStorage
            </p>
            <p className="mt-1 font-mono text-[11px] text-shade">
              gpx-repair-studio.settings.v1
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Your gap thresholds, basemap choice, units, export
              preferences, and the last tool you opened. Settings only —
              never GPX data.
            </p>
          </li>
          <li
            className="rounded-[10px] border-[1.5px] border-ink/15 p-3"
            data-testid="privacy-storage-sessions"
          >
            <p className="text-[13px] font-semibold">
              Unfinished work — IndexedDB
            </p>
            <p className="mt-1 font-mono text-[11px] text-shade">
              gpx-repair-studio.sessions
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              While you draw, the original file&apos;s bytes and your
              edits (points, spans, settings) are autosaved — one record
              per tool, at most four, so a reload or closed tab offers
              your work back instead of losing it. Never uploaded. Clear
              it with Discard or &quot;Clear all saved sessions&quot; on
              the landing page, &quot;Start over&quot; in a workspace, or
              by clearing this site&apos;s data in the browser.
            </p>
          </li>
        </ul>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          No cookies. No analytics. No accounts. If you clear site data
          and close the tab, nothing remains anywhere.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

/** The open-data / open-software credits — exported for the pinning tests. */
export const ATTRIBUTIONS: readonly { name: string; credit: string }[] = [
  {
    name: "MapLibre GL JS",
    credit: "Open-source WebGL map rendering (BSD-2-Clause).",
  },
  {
    name: "OpenFreeMap & OpenStreetMap",
    credit:
      "Map tiles — the Positron style via OpenFreeMap, and the classic raster tiles. Map data © OpenStreetMap contributors.",
  },
  {
    name: "OSRM & Valhalla",
    credit:
      "Road-following for the Roads and Footpaths pens, served from their public demo servers (OpenStreetMap data).",
  },
  {
    name: "Open-Meteo — Copernicus DEM GLO-90",
    credit:
      "Opt-in elevation lookups. © Open-Meteo.com — contains modified Copernicus data.",
  },
  {
    name: "Archivo, Big Shoulders, IBM Plex Mono & Montserrat",
    credit:
      "The type system — self-hosted with the app, which makes no font requests at runtime.",
  },
];

export function AboutPane() {
  return (
    <div className="space-y-6" data-testid="about-pane">
      <section className="space-y-2">
        <h3 className="text-[17px] font-bold tracking-tight">
          A local-first workbench for GPX files
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          GPX Repair Studio exists because GPS recordings break in
          predictable ways — signal loss in tunnels and downtown
          canyons, watches that keep the numbers but lose the map,
          platforms that split one activity into pieces. Six tools fix
          those files, and every one of them runs entirely in your
          browser: nothing you open here is ever uploaded.
        </p>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          The whole app is built on one principle:{" "}
          <span className="font-semibold text-foreground">
            recorded data and reconstructed data never mix
          </span>
          . Statistics label what was measured and what was drawn,
          exports mark every reconstructed point so platforms like
          Strava can see the difference, and the original recording is
          never modified — repairs are added alongside it, and undo
          always gets you back.
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="about-attribution-heading">
        <h3
          id="about-attribution-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          Built on open data &amp; software
        </h3>
        <ul role="list" className="space-y-1.5">
          {ATTRIBUTIONS.map((entry) => (
            <li
              key={entry.name}
              data-testid="about-attribution-row"
              className="text-[13px] leading-relaxed text-muted-foreground"
            >
              <span className="font-semibold text-foreground">
                {entry.name}
              </span>{" "}
              — {entry.credit}
            </li>
          ))}
        </ul>
      </section>

      <p
        className="border-t-[1.5px] border-ink/15 pt-4 font-mono text-[11px] tracking-[0.04em] text-shade"
        data-testid="about-version"
      >
        Version {APP_VERSION} · local-first · no tracking
      </p>
    </div>
  );
}
