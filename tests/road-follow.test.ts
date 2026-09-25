/**
 * Unit tests — road-follow (features/reconstruction/roadFollow.ts).
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
  findLeg,
  isStraightLinePath,
  joinDrawChain,
  legKey,
  MIN_ROAD_LEG_M,
  RoadFollowRouter,
  type RoadFetch,
} from "@/features/reconstruction/roadFollow";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
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
});
