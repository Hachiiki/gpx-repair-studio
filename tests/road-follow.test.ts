/**
 * Unit tests — road-follow (features/reconstruction/pathStyle.ts).
 *
 * The snap-to-road contract of the draw editor:
 *   - keying: directed leg keys, 6-decimal rounding, exact-pair lookup;
 *   - the WYSIWYG join: straight legs stay two-point geodesics, road legs
 *     contribute their interior stitched between the EXACT clicked nodes
 *     (providers snap waypoints onto the road — the line must still pass
 *     through what the user clicked), one midpoint per leg (distance-mid
 *     of the RENDERED leg);
 *   - closing geometry: road path when a leg resolved, chord otherwise;
 *   - straight-line honesty over the rendered path (road interiors count);
 *   - the router: OSRM/Valhalla request shapes and parsing, cache hits,
 *     in-flight dedup, short-leg fast path, and every failure mode
 *     resolving null (straight fallback — never a silent detour).
 */

import { describe, expect, it, vi } from "vitest";
import {
  closingLegCoordinates,
  decodePolyline6,
  findLeg,
  isStraightLinePath,
  joinDrawChain,
  legKey,
  MIN_ROAD_LEG_M,
  RoadFollowRouter,
  type RoadFetch,
} from "@/features/reconstruction/roadFollow";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import { resolveRouterEndpoints } from "@/features/reconstruction/routerConfig";
import type { RoadLeg } from "@/types/domain";

const A = { lat: 52.52, lon: 13.405 };
const B = { lat: 52.527, lon: 13.414 };
const C = { lat: 52.53, lon: 13.425 };

/** A road that bulges north between A and B (the "curve" case). */
const AB_ROAD: [number, number][] = [
  [13.4051, 52.5202], // provider-snapped start (≈ A, not exactly A)
  [13.408, 52.5245],
  [13.4105, 52.5265],
  [13.4139, 52.5268], // provider-snapped end (≈ B)
];

/** Road interior as LatLon points (AB_ROAD minus the snapped ends). */
const AB_INTERIOR = AB_ROAD.slice(1, -1).map(([lon, lat]) => ({ lat, lon }));

function roadLeg(a = A, b = B, coordinates = AB_ROAD): RoadLeg {
  return { a, b, coordinates, routeDistanceM: 1234 };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("leg keying and lookup", () => {
  it("legKey is directed and rounds to ~0.1 m", () => {
    expect(legKey(A, B)).not.toBe(legKey(B, A));
    const nudged = { lat: A.lat + 2e-7, lon: A.lon + 2e-7 };
    expect(legKey(nudged, B)).toBe(legKey(A, B));
  });

  it("findLeg matches the exact pair only", () => {
    const leg = roadLeg();
    expect(findLeg([leg], A, B)).toBe(leg);
    expect(findLeg([leg], B, A)).toBeNull();
    expect(findLeg([leg], A, C)).toBeNull();
    expect(findLeg([leg], { lat: A.lat + 0.001, lon: A.lon }, B)).toBeNull();
  });
});

describe("joinDrawChain (the WYSIWYG join)", () => {
  it("without legs, points are the nodes and midpoints are leg chords", () => {
    const joined = joinDrawChain([A, B, C], []);
    expect(joined.points).toEqual([A, B, C]);
    expect(joined.midpoints).toHaveLength(2);
    expect(joined.midpoints[0].lat).toBeCloseTo((A.lat + B.lat) / 2, 6);
  });

  it("stitches the road interior between the EXACT clicked nodes", () => {
    const joined = joinDrawChain([A, B], [roadLeg()]);
    // First/last road points (snapped off-node) are replaced by the nodes.
    expect(joined.points).toEqual([A, ...AB_INTERIOR, B]);
  });

  it("mixed chains: road legs and straight legs coexist in order", () => {
    const joined = joinDrawChain([A, B, C], [roadLeg()]);
    expect(joined.points).toEqual([A, ...AB_INTERIOR, B, C]);
  });

  it("midpoints of road legs sit on the rendered geometry, not the chord", () => {
    const joined = joinDrawChain([A, B], [roadLeg()]);
    expect(joined.midpoints).toHaveLength(1);
    const mid = joined.midpoints[0];
    // The chord midpoint of A→B sits at ~52.5235; the road bulges to
    // 52.52xx north of it — the rendered mid must be north of the chord.
    expect(mid.lat).toBeGreaterThan((A.lat + B.lat) / 2);
    // And within the road's bounding box.
    const lats = [A.lat, B.lat, ...AB_ROAD.map(([, lat]) => lat)];
    expect(mid.lat).toBeLessThanOrEqual(Math.max(...lats) + 1e-9);
    expect(mid.lat).toBeGreaterThanOrEqual(Math.min(...lats) - 1e-9);
  });

  it("degenerate road geometry (< 2 points) falls back to the straight leg", () => {
    const joined = joinDrawChain([A, B], [roadLeg(A, B, [[13.405, 52.52]])]);
    expect(joined.points).toEqual([A, B]);
  });

  it("a single node has no legs and no midpoints", () => {
    const joined = joinDrawChain([A], [roadLeg()]);
    expect(joined.points).toEqual([A]);
    expect(joined.midpoints).toEqual([]);
  });
});

describe("closingLegCoordinates", () => {
  it("is the chord when no leg resolved", () => {
    expect(closingLegCoordinates(A, B, [])).toEqual([
      [A.lon, A.lat],
      [B.lon, B.lat],
    ]);
  });

  it("carries the road interior between the exact ends", () => {
    expect(closingLegCoordinates(A, B, [roadLeg()])).toEqual([
      [A.lon, A.lat],
      ...AB_ROAD.slice(1, -1),
      [B.lon, B.lat],
    ]);
  });
});

describe("isStraightLinePath (rendered-path honesty)", () => {
  it("flags points that hug the anchor chord", () => {
    const mid = { lat: (A.lat + B.lat) / 2, lon: (A.lon + B.lon) / 2 };
    expect(isStraightLinePath([A, mid, B], A, B)).toBe(true);
  });

  it("passes when the rendered path deviates (a real road curve)", () => {
    expect(isStraightLinePath(joinDrawChain([A, B], [roadLeg()]).points, A, B)).toBe(
      false,
    );
  });

  it("empty paths are never straight-lined", () => {
    expect(isStraightLinePath([], A, B)).toBe(false);
  });
});

describe("decodePolyline6 (the demo server's actual shape format)", () => {
  it("decodes the live valhalla1.openstreetmap.de response exactly", () => {
    // Captured from a real POST to valhalla1.openstreetmap.de/route
    // (2026-09-27): locations 52.52,13.405 → 52.525,13.41,
    // costing pedestrian, shape_format geojson (ignored — the server
    // answered with polyline6 anyway, which is exactly why this decoder
    // exists: footpath routing resolved null and the editor reported
    // "Road follow unavailable" on every leg).
    const encoded =
      "ycqdcBurdqXyFeM_@_AyJ}VyKiXm@yAvAsBp@cAkBmE_BwDkEcKmXer@eCeGqQyb@uJ}UaAaCyBwFqRof@aCwFUq@]{@Wi@Yo@Qa@e@}@[v@cAbEi@xBOj@WfAMf@u@xCw@bD_@v@~@`CsLhSoBM{@[w@q@}HyIoAeAkCyBOh@iArDyAzEwNiJmEsCc_@aV_Ag@_@PWn@UM}@m@g@[]W}@i@aAo@_@WAoAYq@u@g@yb@sZqKuH";
    const decoded = decodePolyline6(encoded);
    expect(decoded.length).toBeGreaterThan(50);
    // First point: the response's own min corner — 52.520013, 13.404987.
    expect(decoded[0][1]).toBeCloseTo(52.520013, 6);
    expect(decoded[0][0]).toBeCloseTo(13.404987, 6);
    // Monotone-ish walk: every step is a small delta, no jumps.
    for (let i = 1; i < decoded.length; i += 1) {
      const step = Math.max(
        Math.abs(decoded[i][0] - decoded[i - 1][0]),
        Math.abs(decoded[i][1] - decoded[i - 1][1]),
      );
      expect(step).toBeLessThan(0.001);
    }
  });

  it("round-trips negative deltas and the zig-zag sign bit", () => {
    // A reference encoder (the standard algorithm, 1e-6 precision):
    // each 5-bit chunk carries the continuation flag; deltas zig-zag.
    const encode = (coordinates: [number, number][]): string => {
      let encoded = "";
      let prevLat = 0;
      let prevLon = 0;
      for (const [lon, lat] of coordinates) {
        const parts: [number, number][] = [
          [lat, prevLat],
          [lon, prevLon],
        ];
        for (const [current, previous] of parts) {
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
    };
    // Deltas of both signs on both axes, west of Greenwich, south of
    // the equator included (negative bases exercise the accumulators).
    const coordinates: [number, number][] = [
      [-13.404954, -10.123456],
      [-13.404952, -10.123455],
      [-13.404958, -10.123459],
      [-13.404951, -10.12345],
      [-13.405001, -10.1235],
    ];
    expect(decodePolyline6(encode(coordinates))).toEqual(coordinates);
  });

  it("an empty string yields no geometry", () => {
    expect(decodePolyline6("")).toEqual([]);
  });
});

describe("RoadFollowRouter (fetch injected)", () => {
  it("requests OSRM with lon,lat pairs and parses the geojson route", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse({
        code: "Ok",
        routes: [
          { distance: 1234.5, geometry: { coordinates: AB_ROAD } },
        ],
      }),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const leg = await router.segment("car", A, B);
    expect(leg).not.toBeNull();
    expect(leg?.coordinates).toEqual(AB_ROAD);
    expect(leg?.routeDistanceM).toBe(1234.5);
    expect(leg?.a).toEqual(A);
    expect(leg?.b).toEqual(B);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "https://router.project-osrm.org/route/v1/driving/13.405,52.52;13.414,52.527",
    );
    expect(String(url)).toContain("overview=full");
    expect(String(url)).toContain("geometries=geojson");
  });

  it("requests Valhalla pedestrian with a JSON POST and parses legs[0].shape", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse({
        trip: {
          legs: [{ shape: AB_ROAD, summary: { length: 1.234 } }],
        },
      }),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const leg = await router.segment("foot", A, B);
    expect(leg).not.toBeNull();
    expect(leg?.coordinates).toEqual(AB_ROAD);
    expect(leg?.routeDistanceM).toBeCloseTo(1234, 6);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://valhalla1.openstreetmap.de/route");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.costing).toBe("pedestrian");
    expect(body.shape_format).toBe("geojson");
    expect(body.locations).toEqual([
      { lat: A.lat, lon: A.lon },
      { lat: B.lat, lon: B.lon },
    ]);
  });

  it("parses the polyline6 STRING the demo server actually returns (user pass 36)", async () => {
    // The live valhalla1.openstreetmap.de ignores shape_format:"geojson"
    // and answers with an encoded polyline6 string. Before the decoder,
    // every footpath leg resolved null and the editor said "Road follow
    // unavailable right now" — this is that regression test.
    const encoded =
      "ycqdcBurdqXyFeM_@_AyJ}VyKiXm@yAvAsBp@cAkBmE_BwDkEcKmXer@eCeGqQyb@uJ}UaAaCyBwFqRof@aCwFUq@]{@Wi@Yo@Qa@e@}@[v@cAbEi@xBOj@WfAMf@u@xCw@bD_@v@~@`CsLhSoBM{@[w@q@}HyIoAeAkCyBOh@iArDyAzEwNiJmEsCc_@aV_Ag@_@PWn@UM}@m@g@[]W}@i@aAo@_@WAoAYq@u@g@yb@sZqKuH";
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse({
        trip: {
          legs: [{ shape: encoded, summary: { length: 0.781 } }],
        },
      }),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const leg = await router.segment("foot", A, B);
    expect(leg).not.toBeNull();
    expect(leg!.coordinates.length).toBeGreaterThan(50);
    // Every coordinate is finite and lon/lat-ordered around the request.
    for (const [lon, lat] of leg!.coordinates) {
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
    expect(leg!.coordinates[0][1]).toBeCloseTo(52.520013, 6);
    expect(leg!.coordinates[0][0]).toBeCloseTo(13.404987, 6);
    expect(leg!.routeDistanceM).toBeCloseTo(781, 6);
  });

  it("caches successes — a second call never fetches", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse({ routes: [{ distance: 1, geometry: { coordinates: AB_ROAD } }] }),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    await router.segment("car", A, B);
    const second = await router.segment("car", A, B);
    expect(second?.coordinates).toEqual(AB_ROAD);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(router.cached("car", A, B)?.coordinates).toEqual(AB_ROAD);
    // Mode is part of the key: foot re-routes.
    expect(router.cached("foot", A, B)).toBeNull();
  });

  it("dedups in-flight requests for the same leg", async () => {
    let release: () => void = () => {};
    const fetchMock = vi.fn<RoadFetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              jsonResponse({
                routes: [{ distance: 1, geometry: { coordinates: AB_ROAD } }],
              }),
            );
        }),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const first = router.segment("car", A, B);
    const second = router.segment("car", A, B);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("short legs resolve null without a request", async () => {
    const fetchMock = vi.fn<RoadFetch>();
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const near = { lat: A.lat, lon: A.lon + 0.00005 };
    expect(geodesicDistanceMeters(A, near)).toBeLessThan(MIN_ROAD_LEG_M);
    const leg = await router.segment("car", A, near);
    expect(leg).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves null on HTTP errors, bad payloads, and network failures", async () => {
    const cases: unknown[] = [
      { status: 500 }, // handled via ok:false below
      { code: "NoRoute", routes: [] },
      { routes: [{ distance: 5, geometry: { coordinates: [[13.4, 52.5]] } }] },
      { trip: { legs: [] } },
    ];
    for (const body of cases) {
      const router = new RoadFollowRouter({
        fetch: vi.fn<RoadFetch>().mockResolvedValue(jsonResponse(body)),
      });
      expect(await router.segment("car", A, B)).toBeNull();
    }
    const failing = new RoadFollowRouter({
      fetch: vi.fn<RoadFetch>().mockRejectedValue(new Error("offline")),
    });
    expect(await failing.segment("foot", A, B)).toBeNull();
  });

  // Phase 10 — session recovery: a restored routed line re-enters through
  // the cache, never the network.
  it("seedCache makes restored legs cache hits with zero fetches", async () => {
    const fetchMock = vi.fn<RoadFetch>();
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const stored: RoadLeg = {
      a: A,
      b: B,
      coordinates: AB_ROAD,
      routeDistanceM: 1234.5,
    };
    router.seedCache("car", [stored]);
    // The synchronous probe and the async resolve both hit the seed.
    expect(router.cached("car", A, B)?.coordinates).toEqual(AB_ROAD);
    await expect(router.segment("car", A, B)).resolves.toEqual(stored);
    expect(fetchMock).not.toHaveBeenCalled();
    // Mode is part of the key — the foot twin still routes.
    expect(router.cached("foot", A, B)).toBeNull();
  });

  it("seedCache skips malformed legs instead of poisoning the cache", () => {
    const router = new RoadFollowRouter({ fetch: vi.fn<RoadFetch>() });
    const broken = {
      a: { lat: Number.NaN, lon: 0 },
      b: B,
      coordinates: [] as [number, number][],
      routeDistanceM: 0,
    };
    router.seedCache("car", [broken]);
    expect(router.cached("car", broken.a, B)).toBeNull();
  });
});

describe("Phase 17 — routePolyline (the whole-line snap request)", () => {
  const P1 = { lat: 52.52, lon: 13.405 };
  const P2 = { lat: 52.527, lon: 13.414 };
  const P3 = { lat: 52.53, lon: 13.425 };

  function osrmResponse(coordinates: [number, number][]): unknown {
    return {
      code: "Ok",
      routes: [
        {
          distance: 1500,
          geometry: { coordinates },
        },
      ],
    };
  }

  it("sends EVERY waypoint in ONE request (the URL carries all pairs)", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse(osrmResponse([[13.405, 52.52], [13.41, 52.525], [13.425, 52.53]])),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const result = await router.routePolyline("car", [P1, P2, P3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain(`${P1.lon},${P1.lat};${P2.lon},${P2.lat};${P3.lon},${P3.lat}`);
    expect(url).toContain("overview=full");
    expect(result?.coordinates).toHaveLength(3);
    expect(result?.routeDistanceM).toBe(1500);
  });

  it("caches by the rounded-polyline hash — a repeat costs nothing", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse(osrmResponse([[13.405, 52.52], [13.425, 52.53]])),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    await router.routePolyline("car", [P1, P3]);
    // The same nodes rounded to 6 decimals hit the cache.
    await router.routePolyline("car", [
      { lat: P1.lat + 1e-9, lon: P1.lon },
      { lat: P3.lat, lon: P3.lon + 1e-9 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A one-node difference is a different key.
    await router.routePolyline("car", [P1, P2, P3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("foot routes through Valhalla with every waypoint as a location", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse({
        trip: {
          legs: [
            {
              shape: encodePolyline6ForTest([[13.405, 52.52], [13.425, 52.53]]),
              summary: { length: 1.5 },
            },
          ],
        },
      }),
    );
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const result = await router.routePolyline("foot", [P1, P3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("valhalla1.openstreetmap.de");
    const body = JSON.parse(String(init?.body)) as { locations: unknown[] };
    expect(body.locations).toHaveLength(2);
    expect(result?.routeDistanceM).toBe(1500);
  });

  it("refuses degenerate chains without a request", async () => {
    const fetchMock = vi.fn<RoadFetch>();
    const router = new RoadFollowRouter({ fetch: fetchMock });
    expect(await router.routePolyline("car", [])).toBeNull();
    expect(await router.routePolyline("car", [P1])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("every failure path resolves null (never a silent detour)", async () => {
    const fetchMock = vi
      .fn<RoadFetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "NoRoute", routes: [] }, false));
    const router = new RoadFollowRouter({ fetch: fetchMock });
    expect(await router.routePolyline("car", [P1, P3])).toBeNull();
  });

  it("seedPolyline adopts a resolved snap; cachedPolyline reads it back", async () => {
    const fetchMock = vi.fn<RoadFetch>();
    const router = new RoadFollowRouter({ fetch: fetchMock });
    const seeded = { coordinates: [[13.4, 52.52]] as [number, number][], routeDistanceM: 10 };
    router.seedPolyline("car", [P1, P3], seeded);
    expect(router.cachedPolyline("car", [P1, P3])).toBe(seeded);
    const result = await router.routePolyline("car", [P1, P3]);
    expect(result).toBe(seeded);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Phase 17 — the configurable endpoints (§EE 17.1)", () => {
  const A = { lat: 52.52, lon: 13.405 };
  const B = { lat: 52.527, lon: 13.414 };

  it("a custom base URL serves BOTH profiles (OSRM-compatible)", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse({
        code: "Ok",
        routes: [
          { distance: 1, geometry: { coordinates: [[13.405, 52.52], [13.414, 52.527]] } },
        ],
      }),
    );
    const router = new RoadFollowRouter({
      fetch: fetchMock,
      config: () => resolveRouterEndpoints("https://osrm.example.com"),
    });
    await router.segment("car", A, B);
    await router.segment("foot", A, B);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /^https:\/\/osrm\.example\.com\/route\/v1\/driving\//,
    );
    expect(fetchMock.mock.calls[1][0]).toMatch(
      /^https:\/\/osrm\.example\.com\/route\/v1\/foot\//,
    );
  });

  it("a server switch never serves the old server's cache", async () => {
    const fetchMock = vi.fn<RoadFetch>().mockResolvedValue(
      jsonResponse({
        code: "Ok",
        routes: [
          { distance: 1, geometry: { coordinates: [[13.405, 52.52], [13.414, 52.527]] } },
        ],
      }),
    );
    let custom: string | null = null;
    const router = new RoadFollowRouter({
      fetch: fetchMock,
      config: () => resolveRouterEndpoints(custom),
    });
    await router.segment("car", A, B); // public server
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("router.project-osrm.org");

    custom = "https://osrm.example.com";
    await router.segment("car", A, B); // same pair, new server → new request
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("osrm.example.com");
  });

  it("endpoints() reflects the live configuration", () => {
    const router = new RoadFollowRouter({
      fetch: vi.fn<RoadFetch>(),
      config: () => resolveRouterEndpoints("https://osrm.example.com"),
    });
    expect(router.endpoints().foot).toEqual({
      kind: "osrm",
      url: "https://osrm.example.com/route/v1/foot",
    });
  });
});

/** Encode [lon, lat] pairs as polyline6 (the test helper's twin). */
function encodePolyline6ForTest(
  coordinates: [number, number][],
): string {
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
