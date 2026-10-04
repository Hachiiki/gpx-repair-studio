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
 * Per-segment styles (the Phase 20 mode-switching fix): the path style is
 * a property of each SEGMENT, stored on the vertex the segment ends at
 * (`DrawVertex.legStyle`). Switching the style chips only changes how the
 * NEXT segment generates — placed segments keep their own geometry, their
 * own resolved legs (mode-tagged), and their own spline forever. The join
 * every consumer runs is `joinStyledChain`.
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
  DEFAULT_VALHALLA_URL,
  resolveRouterEndpoints,
  type ResolvedRouterEndpoints,
} from "./routerConfig";
import {
  crossTrackDistanceMeters,
  geodesicDistanceMeters,
  interpolateLatLon,
  polylineLengthMeters,
} from "@/lib/geo/geodesy";
import type {
  LatLon,
  PathStyle,
  RoadFollowMode,
  RoadLeg,
} from "@/types/domain";

/** Routable modes ("off" resolves nothing). */
export type RoutableRoadMode = Exclude<RoadFollowMode, "off">;

/** Legs shorter than this stay straight (no request — sub-leg snaps). */
export const MIN_ROAD_LEG_M = 10;

/** Per-request timeout; a timed-out leg falls back to a straight line. */
export const ROAD_ROUTE_TIMEOUT_MS = 6000;

/**
 * Upper bound on waypoints per whole-polyline snap request (§EE 17.3):
 * the chain's nodes are Douglas-Peucker-reduced to this before the
 * request — the public demo servers are best-effort and long URL
 * paths are fragile; the shape survives the reduction (endpoints
 * kept, tolerance escalated only as far as needed).
 */
export const SNAP_MAX_WAYPOINTS = 48;

/**
 * The result of one whole-polyline route: the provider's geometry
 * through every requested waypoint (lon/lat pairs, like every
 * provider here) plus the provider's own distance when it sent one.
 */
export interface RoutedPolyline {
  coordinates: [number, number][];
  routeDistanceM: number;
}

// ---------------------------------------------------------------------------
// Leg keying + lookup (pure)
// ---------------------------------------------------------------------------

/** Round to ~0.1 m — a dragged-back vertex re-hits the same key. */
const r6 = (value: number): string => value.toFixed(6);

/**
 * The rounded-polyline hash the snap cache is keyed by (§EE 17.3):
 * every node rounded to ~0.1 m (the same `r6` the leg cache uses)
 * plus the mode. A dragged-back line re-hits the same key; a one-node
 * difference is a different key. In-memory only — persistence joins
 * Phase 22.
 */
export function snapPolylineKey(
  mode: RoutableRoadMode,
  nodes: readonly LatLon[],
): string {
  return `${mode}|${nodes.map((n) => `${r6(n.lat)},${r6(n.lon)}`).join(">")}`;
}

/** Directed cache key for one leg (a→b; the reverse leg is distinct). */
export function legKey(a: LatLon, b: LatLon): string {
  return `${r6(a.lat)},${r6(a.lon)}>${r6(b.lat)},${r6(b.lon)}`;
}

/**
 * The leg matching the node pair exactly (rounded). `mode` filters by
 * the asking segment's own profile — a mixed line can hold car AND
 * foot legs for one pair — with pre-fix legs (no mode) matching any.
 */
export function findLeg(
  legs: readonly RoadLeg[],
  a: LatLon,
  b: LatLon,
  mode?: RoutableRoadMode,
): RoadLeg | null {
  for (const leg of legs) {
    if (mode !== undefined && leg.mode !== undefined && leg.mode !== mode) {
      continue;
    }
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

// ---------------------------------------------------------------------------
// The per-segment styled join (the Phase 20 mode-switching fix)
// ---------------------------------------------------------------------------

/**
 * One node of a drawn chain, carrying the style of the SEGMENT that
 * ends at it (`legStyle`). Plain `LatLon` inputs are legal — their
 * legs fall back to `fallbackStyle` (the legacy whole-line style), so
 * every pre-fix caller and every restored session renders unchanged.
 */
export type ChainNode = LatLon & { legStyle?: PathStyle };

/** The effective style of the leg ending at `node`. */
export function legStyleOf(
  node: ChainNode,
  fallbackStyle: PathStyle = "off",
): PathStyle {
  return node.legStyle ?? fallbackStyle;
}

/** The routable profile of a style, or `null` for local styles. */
export function routableOf(style: PathStyle): RoutableRoadMode | null {
  return style === "car" || style === "foot" ? style : null;
}

/**
 * The per-segment chain join — ONE line, MANY modes. Each leg renders
 * under the style it was DRAWN with: "car"/"foot" legs substitute
 * their mode-matched road geometry, "curve" legs contribute their
 * Catmull-Rom spline interior (the same sampler joinCurveChain uses,
 * so the styled join and the all-curve join agree leg for leg), and
 * "off" legs stay straight — even when a leg for that pair happens to
 * exist under another mode (a straight segment is straight by design,
 * never silently re-routed). This is the single join every consumer
 * (map draft, distance badge, estimates, export) runs — WYSIWYG for
 * mixed lines by construction.
 *
 * Backward compatibility: a node with NO `legStyle` is a pre-fix
 * (or restored legacy) node — it asks UNFILTERED, exactly as the
 * whole-line join always did, so restored sessions render unchanged.
 */
export function joinStyledChain(
  nodes: readonly ChainNode[],
  legs: readonly RoadLeg[],
  fallbackStyle: PathStyle = "off",
): DrawChainGeometry {
  const points: LatLon[] = [];
  const midpoints: LatLon[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (i === 0) {
      // Plain output points — the join's result carries no style
      // baggage (consumers compare/render coordinates only).
      points.push({ lat: nodes[0].lat, lon: nodes[0].lon });
      continue;
    }
    const a = nodes[i - 1];
    const b = nodes[i];
    const explicit = nodes[i].legStyle;
    const style = explicit ?? fallbackStyle;
    const interior: LatLon[] = [];
    if (style === "curve" && nodes.length >= 3) {
      // The spline basis mirrors joinCurveChain exactly: p0 = the node
      // before the leg's start (clamped), p3 = the node after its end.
      const p0 = i >= 2 ? nodes[i - 2] : a;
      const p3 = nodes[i + 1] ?? b;
      interior.push(...curveLegInterior(p0, a, b, p3));
    } else {
      const mode = routableOf(style);
      const leg =
        explicit !== undefined
          ? mode
            ? findLeg(legs, a, b, mode)
            : null
          : findLeg(legs, a, b); // legacy node: any resolved leg applies
      if (leg && leg.coordinates.length >= 2) {
        for (let j = 1; j < leg.coordinates.length - 1; j += 1) {
          const [lon, lat] = leg.coordinates[j];
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            interior.push({ lat, lon });
          }
        }
      }
    }
    points.push(...interior, { lat: b.lat, lon: b.lon });
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
 * path when a leg resolved — filtered by the asking style's profile
 * when given, so a closing segment continues in the mode the route was
 * last drawn with — and the straight chord otherwise. The dashed
 * closing preview and the committed rendering use the same geometry.
 */
export function closingLegCoordinates(
  from: LatLon,
  to: LatLon,
  legs: readonly RoadLeg[],
  style?: PathStyle,
): [number, number][] {
  const mode = style !== undefined ? routableOf(style) : undefined;
  const leg = findLeg(legs, from, to, mode ?? undefined);
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
 * Road-leg resolver: cache + in-flight dedup + timeout around the
 * routing providers (§EE 17.1: the endpoints resolve through the
 * provider abstraction — the public demo servers by default, the
 * user's own OSRM-compatible server when one is configured; the
 * configuration signature joins every cache key so a server switch
 * can never serve another server's answers). Any failure resolves
 * `null` — the caller renders the straight leg (WYSIWYG: a missing
 * road is honestly straight, never a silent detour).
 */
export class RoadFollowRouter {
  readonly #fetchImpl: RoadFetch;
  readonly #getConfig: () => ResolvedRouterEndpoints;
  readonly #cache = new Map<string, RoadLeg>();
  readonly #inFlight = new Map<string, Promise<RoadLeg | null>>();
  /** §EE 17.3: the whole-polyline snap cache (rounded-polyline hash). */
  readonly #snapCache = new Map<string, RoutedPolyline>();
  readonly #snapInFlight = new Map<string, Promise<RoutedPolyline | null>>();

  constructor(options: {
    fetch: RoadFetch;
    /** Live endpoint configuration (defaults to the public servers). */
    config?: () => ResolvedRouterEndpoints;
  }) {
    this.#fetchImpl = options.fetch;
    this.#getConfig = options.config ?? (() => resolveRouterEndpoints(null));
  }

  /** The endpoints a request would use right now (footer/dialog copy). */
  endpoints(): ResolvedRouterEndpoints {
    return this.#getConfig();
  }

  /** Synchronous cache probe (optimistic first paint, no request). */
  cached(mode: RoutableRoadMode, a: LatLon, b: LatLon): RoadLeg | null {
    return this.#cache.get(this.#routerKey(mode, a, b)) ?? null;
  }

  /** Drop every cached leg (mode switches keep entries; tests clear). */
  clearCache(): void {
    this.#cache.clear();
    this.#snapCache.clear();
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
      this.#cache.set(this.#routerKey(mode, leg.a, leg.b), leg);
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
    const key = this.#routerKey(mode, a, b);
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

  /**
   * Synchronous snap-cache probe — a repeated snap of the same rounded
   * polyline costs nothing (§EE 17.3's in-memory cache; persistence
   * joins Phase 22).
   */
  cachedPolyline(
    mode: RoutableRoadMode,
    nodes: readonly LatLon[],
  ): RoutedPolyline | null {
    return this.#snapCache.get(snapPolylineKey(mode, nodes)) ?? null;
  }

  /** Seed a resolved snap into the cache (re-snaps cost nothing). */
  seedPolyline(
    mode: RoutableRoadMode,
    nodes: readonly LatLon[],
    result: RoutedPolyline,
  ): void {
    this.#snapCache.set(snapPolylineKey(mode, nodes), result);
  }

  /**
   * §EE 17.3 — route the WHOLE drawn polyline through the provider in
   * ONE request: every node is a waypoint, the provider snaps each to
   * its road network and returns the through-path. Same-key calls
   * share one request; every failure path resolves `null`.
   */
  routePolyline(
    mode: RoutableRoadMode,
    nodes: readonly LatLon[],
  ): Promise<RoutedPolyline | null> {
    const usable = nodes.filter(
      (n) => Number.isFinite(n.lat) && Number.isFinite(n.lon),
    );
    if (usable.length < 2) return Promise.resolve(null);
    const key = snapPolylineKey(mode, usable);
    const hit = this.#snapCache.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = this.#snapInFlight.get(key);
    if (pending) return pending;
    const request = this.#providerRoute(mode, usable, makeTimeoutSignal())
      .then((path) => {
        if (path) this.#snapCache.set(key, path);
        return path;
      })
      .catch(() => null)
      .finally(() => {
        this.#snapInFlight.delete(key);
      });
    this.#snapInFlight.set(key, request);
    return request;
  }

  async #route(
    mode: RoutableRoadMode,
    a: LatLon,
    b: LatLon,
  ): Promise<RoadLeg | null> {
    try {
      const path = await this.#providerRoute(mode, [a, b], makeTimeoutSignal());
      if (!path) return null;
      // The mode rides on the leg: a mixed line's lookups filter by the
      // asking segment's own profile (the Phase 20 per-segment fix).
      return { a, b, coordinates: path.coordinates, routeDistanceM: path.routeDistanceM, mode };
    } catch {
      return null;
    }
  }

  /** One provider request for a node list (2 for a leg, N for a snap). */
  async #providerRoute(
    mode: RoutableRoadMode,
    nodes: readonly LatLon[],
    signal: AbortSignal,
  ): Promise<RoutedPolyline | null> {
    const config = this.#getConfig();
    if (mode === "foot" && config.foot.kind === "valhalla") {
      return await this.#valhalla(config, nodes, signal);
    }
    const url =
      mode === "car" ? config.carUrl : config.foot.kind === "osrm" ? config.foot.url : config.carUrl;
    return await this.#osrm(url, nodes, signal);
  }

  async #osrm(
    url: string,
    nodes: readonly LatLon[],
    signal: AbortSignal,
  ): Promise<RoutedPolyline | null> {
    const waypoints = nodes.map((n) => `${n.lon},${n.lat}`).join(";");
    const response = await this.#fetchImpl(
      `${url}/${waypoints}?overview=full&geometries=geojson`,
      { signal },
    );
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

  async #valhalla(
    config: ResolvedRouterEndpoints,
    nodes: readonly LatLon[],
    signal: AbortSignal,
  ): Promise<RoutedPolyline | null> {
    const url = config.foot.kind === "valhalla" ? config.foot.url : DEFAULT_VALHALLA_URL;
    const response = await this.#fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: nodes.map((n) => ({ lat: n.lat, lon: n.lon })),
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

  /** Cache key for one leg under the LIVE configuration. */
  #routerKey(mode: RoutableRoadMode, a: LatLon, b: LatLon): string {
    return `${this.#getConfig().configKey}|${mode}|${legKey(a, b)}`;
  }
}

/**
 * An abort signal that fires at the routing timeout (shared by the
 * per-leg and whole-polyline requests).
 */
function makeTimeoutSignal(): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ROAD_ROUTE_TIMEOUT_MS);
  return controller.signal;
}
