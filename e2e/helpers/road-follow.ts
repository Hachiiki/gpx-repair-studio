import type { Page } from "@playwright/test";

/**
 * Road-follow E2E helpers — deterministic routing-network control.
 *
 * The draw editor's road follow calls public routing services from the
 * browser (OSRM for roads, Valhalla for footpaths). Specs that draw must
 * never depend on live services: these helpers pin the network.
 *
 *   - `abortRoadRouting`: every routing request fails fast — the editor
 *     falls back to straight legs (the WYSIWYG straight fallback), exactly
 *     like an offline user.
 *   - `mockOsrmBulge`: answers every OSRM request with an echo of its own
 *     waypoints plus a mid-point bulged north — a deterministic "curve"
 *     the specs can assert on the rendered chain.
 */

/** Fail every routing request (straight-line fallback). */
export async function abortRoadRouting(page: Page): Promise<void> {
  await page.route(
    /router\.project-osrm\.org|valhalla1\.openstreetmap\.de/,
    (route) => route.abort(),
  );
}

/** A mutable request counter the mock fills in. */
export interface OsrmCallLog {
  count: number;
  /** The waypoint pairs requested so far ([lon, lat] per endpoint). */
  legs: { a: { lat: number; lon: number }; b: { lat: number; lon: number } }[];
}

/**
 * Answer OSRM with `[a, bulged-mid, b]` (the mid sits `offsetLat` north of
 * the geometric midpoint). The rendered chain therefore gains exactly one
 * road point per leg — trivially assertable.
 */
export async function mockOsrmBulge(
  page: Page,
  options: { offsetLat?: number; log?: OsrmCallLog } = {},
): Promise<void> {
  const offsetLat = options.offsetLat ?? 0.0004;
  await page.route(/router\.project-osrm\.org/, async (route) => {
    const url = new URL(route.request().url());
    const waypointPart = url.pathname.split("/").pop() ?? "";
    const pairs = waypointPart
      .split(";")
      .map((pair) => pair.split(",").map(Number))
      .map(([lon, lat]) => ({ lat, lon }));
    if (
      pairs.length !== 2 ||
      pairs.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))
    ) {
      await route.fulfill({ json: { code: "InvalidUrl", routes: [] } });
      return;
    }
    const [a, b] = pairs;
    options.log?.legs.push({ a, b });
    if (options.log) options.log.count += 1;
    const mid = {
      lat: (a.lat + b.lat) / 2 + offsetLat,
      lon: (a.lon + b.lon) / 2,
    };
    await route.fulfill({
      json: {
        code: "Ok",
        routes: [
          {
            distance: 1500,
            geometry: {
              coordinates: [
                [a.lon, a.lat],
                [mid.lon, mid.lat],
                [b.lon, b.lat],
              ],
            },
          },
        ],
      },
    });
  });
}

/** Haversine distance in meters (assertions only — the app uses Vincenty). */
export function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371008.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
