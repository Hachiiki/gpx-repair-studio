/**
 * RoadFollow — "snap to road" for the draw editor
 * (docs/MASTER_PLAN.md Phase 4 extension; §D-3 "derived data is never
 * stored as truth").
 *
 * The drawn chain's nodes are `near-anchor → vertices (→ far-anchor)`. A
 * **leg** is one consecutive node pair. With road-follow on, each leg's
 * rendered AND committed geometry is the road path between its endpoints,
 * resolved from a public routing service:
 *
 *   - `"car"`  — OSRM demo server (drivable roads, no key, CORS-enabled);
 *   - `"foot"` — Valhalla demo server (pedestrian ways and footpaths);
 *   - `"off"`  — straight geodesic legs (the Phase-4 default behavior).
 *
 * WYSIWYG stitching: providers snap waypoints onto the road, so a returned
 * geometry can start/end a few meters off the clicked nodes. Every consumer
 * renders `[a, …roadInterior, b]` — the exact clicked nodes always sit ON
 * the line, and every rendered point is committed. The distance badge and
 * the straight-line warning run over the same joined geometry, so the
 * number the user reads is the number the line draws.
 *
 * Purity contract: this module is pure TypeScript. The router takes an
 * injected `fetch` (ESLint: no global fetch in features/**) — the React
 * binding hook supplies the browser implementation.
 *
 * Privacy: only the two clicked leg endpoints are ever sent to the
 * provider. The GPX file never leaves the browser.
 */

import { STRAIGHT_LINE_MAX_DEVIATION_M } from "./drawModel";
import {
  crossTrackDistanceMeters,
  geodesicDistanceMeters,
  interpolateLatLon,
  polylineLengthMeters,
} from "@/lib/geo/geodesy";
import type { LatLon, RoadFollowMode, RoadLeg } from "@/types/domain";

/** Routable modes ("off" resolves nothing). */
export type RoutableRoadMode = Exclude<RoadFollowMode, "off">;

/** Legs shorter than this stay straight (no request — sub-leg snaps). */
export const MIN_ROAD_LEG_M = 10;

/** Per-request timeout; a timed-out leg falls back to a straight line. */
export const ROAD_ROUTE_TIMEOUT_MS = 6000;

/** Public routing endpoints (keyless, CORS-enabled, best-effort). */
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const VALHALLA_ROUTE_URL = "https://valhalla1.openstreetmap.de/route";

// ---------------------------------------------------------------------------
// Leg keying + lookup (pure)
// ---------------------------------------------------------------------------

/** Round to ~0.1 m — a dragged-back vertex re-hits the same key. */
const r6 = (value: number): string => value.toFixed(6);

/** Directed cache key for one leg (a→b; the reverse leg is distinct). */
export function legKey(a: LatLon, b: LatLon): string {
  return `${r6(a.lat)},${r6(a.lon)}>${r6(b.lat)},${r6(b.lon)}`;
}

/** The leg matching the node pair exactly (rounded), or null. */
export function findLeg(
  legs: readonly RoadLeg[],
  a: LatLon,
  b: LatLon,
): RoadLeg | null {
  for (const leg of legs) {
    if (
      r6(leg.a.lat) === r6(a.lat) &&
      r6(leg.a.lon) === r6(a.lon) &&
      r6(leg.b.lat) === r6(b.lat) &&
      r6(leg.b.lon) === r6(b.lon)
    ) {
      return leg;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The WYSIWYG join (pure) — one implementation for rendering, distance,
// and commit
// ---------------------------------------------------------------------------

/** The joined geometry of a drawn chain (what the map renders). */
export interface DrawChainGeometry {
  /** The rendered line: nodes with road legs substituted between them. */
  points: LatLon[];
  /**
   * One insertion midpoint per node leg, ordered by leg index — the
   * distance-mid of the RENDERED leg (on the road, not on the chord).
   */
  midpoints: LatLon[];
}

/**
 * Join the chain nodes into the rendered geometry: straight legs stay
 * two-point geodesics; road-followed legs contribute their interior
 * points, stitched between the exact nodes (WYSIWYG contract above).
 */
export function joinDrawChain(
  nodes: readonly LatLon[],
  legs: readonly RoadLeg[],
): DrawChainGeometry {
  const points: LatLon[] = [];
  const midpoints: LatLon[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (i === 0) {
      points.push(nodes[0]);
      continue;
    }
    const a = nodes[i - 1];
    const b = nodes[i];
    const leg = findLeg(legs, a, b);
    const interior: LatLon[] = [];
    if (leg && leg.coordinates.length >= 2) {
      for (let j = 1; j < leg.coordinates.length - 1; j += 1) {
        const [lon, lat] = leg.coordinates[j];
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          interior.push({ lat, lon });
        }
      }
    }
    points.push(...interior, b);
    midpoints.push(legMidpoint(a, b, interior));
  }
  return { points, midpoints };
}

/** Distance-mid of one rendered leg: on the road when a leg resolved. */
function legMidpoint(a: LatLon, b: LatLon, interior: readonly LatLon[]): LatLon {
  if (interior.length === 0) return interpolateLatLon(a, b, 0.5);
  const leg = [a, ...interior, b];
  const total = polylineLengthMeters(leg);
  if (!Number.isFinite(total) || total <= 0) return interpolateLatLon(a, b, 0.5);
  let walked = 0;
  for (let i = 0; i + 1 < leg.length; i += 1) {
    const step = geodesicDistanceMeters(leg[i], leg[i + 1]);
    if (!Number.isFinite(step)) continue;
    if (walked + step >= total / 2) {
      const remaining = total / 2 - walked;
      const t = step > 0 ? remaining / step : 0.5;
      return interpolateLatLon(leg[i], leg[i + 1], Math.min(1, Math.max(0, t)));
    }
    walked += step;
  }
  return leg[leg.length - 1];
}

/**
 * The joined chain points (rendering/distance convenience over
 * `joinDrawChain`). With no legs this is exactly the node list.
 */
export function roadChainPoints(
  nodes: readonly LatLon[],
  legs: readonly RoadLeg[],
): LatLon[] {
  return joinDrawChain(nodes, legs).points;
}

// ---------------------------------------------------------------------------
// The curve path style (Task 46 — "Curves": a smooth local spline)
// ---------------------------------------------------------------------------

/**
 * Curve sampling step (meters of leg length between spline samples).
 * Dense enough to read as a smooth arc on the map and to import into
 * any platform as ordinary points; coarse enough to keep files small.
 */
export const CURVE_SAMPLE_M = 10;

/**
 * Catmull-Rom spline through the nodes (Task 46): the classic
 * interpolating spline — the line passes EXACTLY through every clicked
 * point and bends smoothly through the corners between them. End
 * tangents use duplicated endpoints (the natural "free" ends).
 *
 * Planar lat/lon arithmetic at map scale (sub-centimeter vs geodesic at
 * city-scale legs); the cumulative distances everywhere else stay
 * geodesic-honest. Pure and local — nothing leaves the browser.
 *
 * Returns the full polyline INCLUDING the exact nodes (t=0/t=1 hits
 * them), so callers can render or bake it verbatim (WYSIWYG).
 */
export function curveSplinePoints(
  nodes: readonly LatLon[],
  sampleStepM: number = CURVE_SAMPLE_M,
): LatLon[] {
  if (nodes.length <= 2) return [...nodes];
  const points: LatLon[] = [nodes[0]];
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    points.push(
      ...curveLegInterior(
        nodes[i - 1] ?? nodes[i],
        nodes[i],
        nodes[i + 1],
        nodes[i + 2] ?? nodes[i + 1],
        sampleStepM,
      ),
      nodes[i + 1],
    );
  }
  return points;
}

/**
 * One leg's spline interior (t ∈ (0,1), endpoints excluded) — the shared
 * sampler so the map's preview, the distance badge, and the committed/
 * exported points are the SAME curve (WYSIWYG, one implementation).
 */
export function curveLegInterior(
  p0: LatLon,
  p1: LatLon,
  p2: LatLon,
  p3: LatLon,
  sampleStepM: number = CURVE_SAMPLE_M,
): LatLon[] {
  const legM = geodesicDistanceMeters(p1, p2);
  const steps = Math.min(
    48,
    Math.max(2, Number.isFinite(legM) && legM > 0 ? Math.ceil(legM / sampleStepM) : 2),
  );
  const interior: LatLon[] = [];
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    interior.push({
      lat:
        0.5 *
        (2 * p1.lat +
          (-p0.lat + p2.lat) * t +
          (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
          (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3),
      lon:
        0.5 *
        (2 * p1.lon +
          (-p0.lon + p2.lon) * t +
          (2 * p0.lon - 5 * p1.lon + 4 * p2.lon - p3.lon) * t2 +
          (-p0.lon + 3 * p1.lon - 3 * p2.lon + p3.lon) * t3),
    });
  }
  return interior;
}

/**
 * The curve-style chain join (the `"curve"` path style): the rendered
 * line is the spline through the nodes, and each leg's insertion
 * midpoint sits at the spline's distance-mid — so "+" handles land ON
 * the curve the user sees, never on a straight chord beneath it.
 */
export function joinCurveChain(
  nodes: readonly LatLon[],
): DrawChainGeometry {
  if (nodes.length < 2) {
    return { points: [...nodes], midpoints: [] };
  }
  const points: LatLon[] = [nodes[0]];
  const midpoints: LatLon[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const interior = curveLegInterior(
      nodes[i - 1] ?? nodes[i],
      nodes[i],
      nodes[i + 1],
      nodes[i + 2] ?? nodes[i + 1],
    );
    points.push(...interior, nodes[i + 1]);
    midpoints.push(legMidpoint(nodes[i], nodes[i + 1], interior));
  }
  return { points, midpoints };
}

/**
 * The closing-segment geometry (last chain node → far anchor): the road
 * path when a leg resolved, the straight chord otherwise. The dashed
 * closing preview and the committed rendering use the same geometry.
 */
export function closingLegCoordinates(
  from: LatLon,
  to: LatLon,
  legs: readonly RoadLeg[],
): [number, number][] {
  const leg = findLeg(legs, from, to);
  if (!leg || leg.coordinates.length < 2) {
    return [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ];
  }
  return [
    [from.lon, from.lat],
    ...leg.coordinates.slice(1, -1),
    [to.lon, to.lat],
  ];
}

/**
 * Straight-line honesty over the RENDERED path (not just the vertices): a
 * chain whose clicked points hug the anchor chord but whose ROAD path
 * curves is not "a straight line" — and vice versa.
 */
export function isStraightLinePath(
  points: readonly LatLon[],
  before: LatLon,
  after: LatLon,
  maxDeviationM: number = STRAIGHT_LINE_MAX_DEVIATION_M,
): boolean {
  if (points.length === 0) return false;
  let max = 0;
  for (const point of points) {
    const deviation = Math.abs(crossTrackDistanceMeters(point, before, after));
    if (Number.isFinite(deviation) && deviation > max) max = deviation;
  }
  return max <= maxDeviationM;
}

// ---------------------------------------------------------------------------
// Router (network; fetch injected)
// ---------------------------------------------------------------------------

/** Injected fetch shape (the browser implementation, or a test double). */
export type RoadFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** A parsed provider result before node stitching. */
interface ProviderPath {
  coordinates: [number, number][];
  routeDistanceM: number;
}

/**
 * Decode an encoded polyline string (1e-6 precision — the format the
 * Valhalla demo server actually returns for `shape`, regardless of the
 * requested `shape_format`). Standard variable-length delta encoding:
 * each coordinate's chars carry 5 bits, value chunks are -63 offset,
 * continuation flag 0x20; deltas zig-zag decode and accumulate.
 *
 * Verified against valhalla1.openstreetmap.de: "ycqdcBurdqX…" →
 * [13.404987, 52.520013], … (lon-lat pairs, like every provider here).
 */
export function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lon / 1e6, lat / 1e6]);
  }
  return coordinates;
}

const isLonLat = (candidate: unknown): candidate is [number, number] =>
  Array.isArray(candidate) &&
  candidate.length >= 2 &&
  Number.isFinite(candidate[0]) &&
  Number.isFinite(candidate[1]);

/**
 * Road-leg resolver: cache + in-flight dedup + timeout around the two
 * public providers. Any failure resolves `null` — the caller renders the
 * straight leg (WYSIWYG: a missing road is honestly straight, never a
 * silent detour).
 */
export class RoadFollowRouter {
  readonly #fetchImpl: RoadFetch;
  readonly #cache = new Map<string, RoadLeg>();
  readonly #inFlight = new Map<string, Promise<RoadLeg | null>>();

  constructor(options: { fetch: RoadFetch }) {
    this.#fetchImpl = options.fetch;
  }

  /** Synchronous cache probe (optimistic first paint, no request). */
  cached(mode: RoutableRoadMode, a: LatLon, b: LatLon): RoadLeg | null {
    return this.#cache.get(routerKey(mode, a, b)) ?? null;
  }

  /** Drop every cached leg (mode switches keep entries; tests clear). */
  clearCache(): void {
    this.#cache.clear();
  }

  /**
   * Phase 10 — session recovery: adopt persisted road legs into the cache
   * so a restored routed line finds cache hits instead of re-issuing the
   * same OSRM/Valhalla requests (WYSIWYG restore, zero network). Only
   * well-formed legs are accepted — a foreign record can never poison the
   * cache for pairs it does not legitimately answer.
   */
  seedCache(mode: RoutableRoadMode, legs: readonly RoadLeg[]): void {
    for (const leg of legs) {
      if (
        !Number.isFinite(leg.a?.lat) ||
        !Number.isFinite(leg.a?.lon) ||
        !Number.isFinite(leg.b?.lat) ||
        !Number.isFinite(leg.b?.lon)
      ) {
        continue;
      }
      this.#cache.set(routerKey(mode, leg.a, leg.b), leg);
    }
  }

  /**
   * Resolve one leg. Same-key calls share a single request; successes are
   * cached for the session; every failure path resolves `null`.
   */
  segment(
    mode: RoutableRoadMode,
    a: LatLon,
    b: LatLon,
  ): Promise<RoadLeg | null> {
    if (geodesicDistanceMeters(a, b) < MIN_ROAD_LEG_M) {
      return Promise.resolve(null);
    }
    const key = routerKey(mode, a, b);
    const hit = this.#cache.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = this.#inFlight.get(key);
    if (pending) return pending;
    const request = this.#route(mode, a, b)
      .then((leg) => {
        if (leg) this.#cache.set(key, leg);
        return leg;
      })
      .catch(() => null)
      .finally(() => {
        this.#inFlight.delete(key);
      });
    this.#inFlight.set(key, request);
    return request;
  }

  async #route(
    mode: RoutableRoadMode,
    a: LatLon,
    b: LatLon,
  ): Promise<RoadLeg | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROAD_ROUTE_TIMEOUT_MS);
    try {
      const path =
        mode === "car"
          ? await this.#osrm(a, b, controller.signal)
          : await this.#valhalla(a, b, controller.signal);
      if (!path) return null;
      return { a, b, coordinates: path.coordinates, routeDistanceM: path.routeDistanceM };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async #osrm(a: LatLon, b: LatLon, signal: AbortSignal): Promise<ProviderPath | null> {
    const url = `${OSRM_ROUTE_URL}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
    const response = await this.#fetchImpl(url, { signal });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const route = (body as { routes?: unknown[] } | null)?.routes?.[0] as
      | { distance?: unknown; geometry?: { coordinates?: unknown } }
      | undefined;
    const coordinates = route?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) return null;
    const parsed = coordinates.filter(isLonLat).map((c) => [c[0], c[1]] as [number, number]);
    if (parsed.length < 2) return null;
    const distance = route?.distance;
    return {
      coordinates: parsed,
      routeDistanceM:
        typeof distance === "number" && Number.isFinite(distance) ? distance : 0,
    };
  }

  /**
   * The provider shape, coordinates only. The demo server ignores the
   * requested `shape_format: "geojson"` and answers with an encoded
   * polyline6 STRING (verified live) — accept both shapes so the parser
   * tracks whichever the server sends:
   *   - array  → [[lon, lat], …] (a server that honored the request);
   *   - string → encoded polyline6 (the observed demo behavior).
   */
  #valhallaShape(shape: unknown): [number, number][] | null {
    if (typeof shape === "string") {
      if (shape.length === 0) return null;
      const decoded = decodePolyline6(shape);
      return decoded.length >= 2 ? decoded : null;
    }
    if (!Array.isArray(shape)) return null;
    const parsed = shape.filter(isLonLat).map((c) => [c[0], c[1]] as [number, number]);
    return parsed.length >= 2 ? parsed : null;
  }

  async #valhalla(a: LatLon, b: LatLon, signal: AbortSignal): Promise<ProviderPath | null> {
    const response = await this.#fetchImpl(VALHALLA_ROUTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: [
          { lat: a.lat, lon: a.lon },
          { lat: b.lat, lon: b.lon },
        ],
        costing: "pedestrian",
        shape_format: "geojson",
      }),
      signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const leg = (body as { trip?: { legs?: unknown[] } } | null)?.trip?.legs
      ?.[0] as
      | { shape?: unknown; summary?: { length?: unknown } }
      | undefined;
    const coordinates = this.#valhallaShape(leg?.shape);
    if (!coordinates) return null;
    const km = leg?.summary?.length;
    return {
      coordinates,
      routeDistanceM:
        typeof km === "number" && Number.isFinite(km) ? km * 1000 : 0,
    };
  }
}

function routerKey(mode: RoutableRoadMode, a: LatLon, b: LatLon): string {
  return `${mode}|${legKey(a, b)}`;
}
