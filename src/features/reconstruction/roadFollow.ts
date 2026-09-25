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
    const shape = leg?.shape;
    if (!Array.isArray(shape)) return null;
    const parsed = shape.filter(isLonLat).map((c) => [c[0], c[1]] as [number, number]);
    if (parsed.length < 2) return null;
    const km = leg?.summary?.length;
    return {
      coordinates: parsed,
      routeDistanceM:
        typeof km === "number" && Number.isFinite(km) ? km * 1000 : 0,
    };
  }
}

function routerKey(mode: RoutableRoadMode, a: LatLon, b: LatLon): string {
  return `${mode}|${legKey(a, b)}`;
}
