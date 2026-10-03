import { expect, type Page } from "@playwright/test";

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

/** Encode [lon, lat] pairs as a polyline6 string (Valhalla's shape). */
function encodePolyline6(coordinates: [number, number][]): string {
  let encoded = "";
  let prevLat = 0;
  let prevLon = 0;
  for (const [lon, lat] of coordinates) {
    for (const [current, previous] of [
      [lat, prevLat],
      [lon, prevLon],
    ] as const) {
      const delta = Math.round(current * 1e6) - Math.round(previous * 1e6);
      let value = delta < 0 ? ~(delta << 1) : delta << 1;
      do {
        let chunk = value & 0x1f;
        value >>>= 5;
        if (value > 0) chunk |= 0x20;
        encoded += String.fromCharCode(chunk + 63);
      } while (value > 0);
    }
    prevLat = lat;
    prevLon = lon;
  }
  return encoded;
}

/**
 * Answer Valhalla (footpaths) with the demo server's REAL response shape:
 * `trip.legs[0].shape` as an encoded polyline6 STRING (the server ignores
 * `shape_format: "geojson"` — decoded client-side since user pass 36).
 * The route echoes the request's own waypoints plus a mid-point bulged
 * north — same deterministic "curve" contract as mockOsrmBulge.
 */
export async function mockValhallaBulge(
  page: Page,
  options: { offsetLat?: number; log?: OsrmCallLog } = {},
): Promise<void> {
  const offsetLat = options.offsetLat ?? 0.0004;
  await page.route(/valhalla1\.openstreetmap\.de/, async (route) => {
    const body = route.request().postDataJSON() as {
      locations?: { lat: number; lon: number }[];
    };
    const locations = body.locations ?? [];
    if (
      locations.length !== 2 ||
      locations.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))
    ) {
      await route.fulfill({ json: { trip: { legs: [] } } });
      return;
    }
    const [a, b] = locations;
    options.log?.legs.push({ a, b });
    if (options.log) options.log.count += 1;
    const mid = {
      lat: (a.lat + b.lat) / 2 + offsetLat,
      lon: (a.lon + b.lon) / 2,
    };
    await route.fulfill({
      json: {
        trip: {
          legs: [
            {
              shape: encodePolyline6([
                [a.lon, a.lat],
                [mid.lon, mid.lat],
                [b.lon, b.lat],
              ]),
              summary: { length: 1.5 },
            },
          ],
        },
      },
    });
  });
}

/**
 * §EE 17.2 — grant road-snapping consent through the REAL UI, for the
 * specs that assert routing behavior. Requires a draw editor (or any
 * draw panel) to be open with its enable notice visible; clicks the
 * notice's button, then the dialog's grant. No test-only shortcuts:
 * the flow is exactly what a user does.
 */
export async function grantRoadConsent(page: Page): Promise<void> {
  const enable = page.getByTestId("road-consent-enable");
  if (await enable.isVisible().catch(() => false)) {
    await enable.click();
    await page.getByTestId("router-consent-grant").click();
    await expect(page.getByTestId("router-consent-dialog")).toBeHidden();
  }
}

/**
 * §EE 17.3 — answer OSRM whole-polyline (snap) requests: ANY waypoint
 * count (>= 2), the route passing through every requested waypoint
 * with a mid-point bulged north between each consecutive pair. The
 * snap engine's one request therefore returns real interior points
 * per pair — assertable on the rendered chain.
 */
export async function mockOsrmPolyline(
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
      pairs.length < 2 ||
      pairs.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))
    ) {
      await route.fulfill({ json: { code: "InvalidUrl", routes: [] } });
      return;
    }
    if (options.log) options.log.count += 1;
    const coordinates: [number, number][] = [[pairs[0].lon, pairs[0].lat]];
    let distance = 0;
    for (let i = 1; i < pairs.length; i += 1) {
      const a = pairs[i - 1];
      const b = pairs[i];
      coordinates.push([
        (a.lon + b.lon) / 2,
        (a.lat + b.lat) / 2 + offsetLat,
      ]);
      coordinates.push([b.lon, b.lat]);
      distance += haversineM(a, b) * 1.2;
    }
    await route.fulfill({
      json: {
        code: "Ok",
        routes: [
          {
            distance,
            geometry: { coordinates },
          },
        ],
      },
    });
  });
}
