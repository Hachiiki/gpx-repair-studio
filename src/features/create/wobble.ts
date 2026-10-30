/**
 * Create wobble — the "create from activity stats" workflow's human-like
 * GPS plan (Task 74): the user marks stretches of the drawn route and the
 * ruler-straight lines between those points are replaced by watch-style
 * GPS movement — correlated lateral wander (an Ornstein-Uhlenbeck process,
 * the same family GPS error models use), slight along-track jitter, and
 * amplitude that tapers to zero at every user point (the drawn anchors
 * stay EXACT: user data is never moved).
 *
 * The same feature answers "why does the estimated elevation look so
 * smooth": a DEM is clean terrain by construction, and a watch never
 * records clean terrain. When a wobble plan exists, the opt-in elevation
 * estimate gets the altimeter treatment for the FILE and its previews —
 * fast sensor noise plus slow barometric drift, seeded deterministically
 * — so `<ele>` reads like a recording instead of a survey.
 *
 * The model, disclosed in place:
 *   - A wobble segment is the INCLUSIVE span between two drawn points
 *     (vertex ids, route order) at an intensity, with its own seed. The
 *     paint-over rule (pace.ts's shared span machinery) resolves overlaps.
 *   - Geometry: every INTERPOLATED or ROAD point inside the span is
 *     displaced laterally by TWO summed OU streams sampled along the
 *     path — a slow meander (the watch's position bias wandering over
 *     tens of seconds of travel, σ by intensity up to ~8 m — city/
 *     tree-cover numbers, not lab numbers) plus a fast per-fix scatter
 *     (ρ ≈ 30–40 m) — plus a small longitudinal jitter bounded well
 *     under half the local point gap (ordering can never flip). VERTEX
 *     points never move; displacement tapers to zero approaching every
 *     anchor (smoothstep over ≤ 35 m). A wobbled straight leg with no
 *     interior points (spacing "off") gets fill points first — wobble
 *     needs points to wobble.
 *   - Distances are recomputed geodesically after displacement, so the
 *     file's line IS the line the preview showed, and its length is the
 *     honest wiggly length (a hair longer than the ruler line, exactly
 *     like a real recording).
 *   - Elevation: `watchNoiseSamples` adds two OU streams to the DEM
 *     samples — fast noise (ρ ≈ 90 m) and slow drift (ρ ≈ 900 m) —
 *     σ by the plan's strongest intensity. The DEM record itself is
 *     never mutated (the estimate stays the honest terrain); the noise
 *     is a display/export transform, one seed, applied identically by
 *     the preview and the file so they can never disagree.
 *
 * Everything is deterministic: same seed + same path → same wobble, so
 * undo/redo, session restore, and tests all reproduce byte-identically.
 *
 * Task 74. Pure TypeScript: no React, no DOM, no stores.
 */

import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { PathPoint } from "@/features/reconstruction/resample";
import type { ElevationSample } from "@/features/elevation/samples";
import type { DrawVertex, LatLon, VertexId } from "@/types/domain";

// ---------------------------------------------------------------------------
// Make-room (the wobble flavor)
// ---------------------------------------------------------------------------

/**
 * Make room for a new wobble stretch — the paint-over rule with
 * ADJACENCY tolerance: spans that share only an endpoint coexist (a
 * route wobbling v1→v2 and then v2→v3 is two stretches of ONE wobble,
 * not a conflict — unlike pace, where the shared point's stretch
 * belongs to the later plan). Overlap in two or more vertices absorbs
 * or trims, exactly like the pace rule.
 */
export function makeRoomForWobble<T extends {
  fromVertexId: VertexId;
  toVertexId: VertexId;
}>(
  spans: readonly T[],
  fromVertexId: VertexId,
  toVertexId: VertexId,
  vertices: readonly DrawVertex[],
): T[] {
  const indexOf = (id: VertexId): number =>
    vertices.findIndex((v) => v.id === id);
  const from = indexOf(fromVertexId);
  const to = indexOf(toVertexId);
  if (from === -1 || to === -1 || from >= to) return [...spans];

  const kept: T[] = [];
  for (const span of spans) {
    const a = indexOf(span.fromVertexId);
    const b = indexOf(span.toVertexId);
    if (a === -1 || b === -1) continue; // stale — dropped by pruning anyway
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    // Disjoint OR adjacent (sharing at most one endpoint): coexist.
    if (hi <= from || lo >= to) {
      kept.push(span);
      continue;
    }
    if (lo >= from && hi <= to) continue; // fully absorbed
    // Trim to the non-overlapping side, if it still spans two vertices.
    if (lo < from) {
      if (from - lo >= 2) {
        kept.push({ ...span, toVertexId: vertices[from - 1].id });
      }
    } else if (hi > to) {
      if (hi - to >= 2) {
        kept.push({ ...span, fromVertexId: vertices[to + 1].id });
      }
    }
  }
  return kept;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** How strongly the watch wobbles (amplitude scales, correlation lengths). */
export type WobbleIntensity = "subtle" | "moderate" | "strong";

/** The selectable intensities, display order. */
export const WOBBLE_INTENSITY_OPTIONS: readonly WobbleIntensity[] = [
  "subtle",
  "moderate",
  "strong",
];

/** One planned wobble stretch: the inclusive span between two drawn points. */
export interface WobbleSegment {
  /** Stable id (`ws{N}`, allocated by the store's monotonic sequence). */
  id: string;
  /** The earlier drawn point (route order). */
  fromVertexId: VertexId;
  /** The later drawn point (route order) — the span is inclusive. */
  toVertexId: VertexId;
  /** How strongly the stretch wobbles. */
  intensity: WobbleIntensity;
  /** The stretch's deterministic geometry seed. */
  seed: number;
}

/** The strongest intensity present in a plan (the elevation noise follows). */
export function strongestIntensity(
  segments: readonly WobbleSegment[],
): WobbleIntensity | null {
  let strongest: WobbleIntensity | null = null;
  for (const segment of segments) {
    if (
      strongest === null ||
      WOBBLE_INTENSITY_OPTIONS.indexOf(segment.intensity) >
        WOBBLE_INTENSITY_OPTIONS.indexOf(strongest)
    ) {
      strongest = segment.intensity;
    }
  }
  return strongest;
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, seed-deterministic (the tests' reproducibility). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A gaussian stream (Box-Muller with the spare cached — one RNG, no waste). */
function gaussianStream(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/**
 * An Ornstein-Uhlenbeck sampler stepped by arc length: mean-reverting to
 * zero, stationary variance σ², correlation length ρ. Stepping exactly:
 *   x' = x·e^(−Δs/ρ) + σ·√(1 − e^(−2Δs/ρ))·N(0,1)
 * Deterministic for a given (seed, step sequence).
 */
function ouProcess(seed: number, sigmaM: number, rhoM: number) {
  const gauss = gaussianStream(mulberry32(seed));
  let x = 0;
  return (deltaSM: number): number => {
    if (!(deltaSM > 0)) return x;
    const decay = Math.exp(-deltaSM / rhoM);
    const innovation = sigmaM * Math.sqrt(Math.max(0, 1 - decay * decay));
    x = x * decay + innovation * gauss();
    if (!Number.isFinite(x)) x = 0;
    return x;
  };
}

/** The smoothstep ease (taper's shape — flat at both ends, zero at anchors). */
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

// ---------------------------------------------------------------------------
// Geometry wobble
// ---------------------------------------------------------------------------

/**
 * Lateral + longitudinal amplitude scales per intensity. The lateral
 * wander is TWO OU streams summed — a slow meander (position bias
 * drifting across tens of seconds of travel: city GPS routinely wanders
 * 5–15 m around the true line, so "strong" reads as urban-canyon
 * conditions) plus a fast per-fix scatter that gives the line its GPS
 * texture when zoomed to street level. Length honesty at the default 25 m
 * spacing: subtle 0.2% / moderate 0.9% / strong 1.8% on a fully-wobbled
 * line — inside the reconcile threshold's own noise band, never a detour.
 */
const WOBBLE_PARAMS: Record<
  WobbleIntensity,
  {
    sigmaM: number;
    rhoM: number;
    fastSigmaM: number;
    fastRhoM: number;
    longFactor: number;
  }
> = {
  subtle: {
    sigmaM: 2.0,
    rhoM: 180,
    fastSigmaM: 1.2,
    fastRhoM: 30,
    longFactor: 0.12,
  },
  moderate: {
    sigmaM: 5.0,
    rhoM: 220,
    fastSigmaM: 2.0,
    fastRhoM: 35,
    longFactor: 0.15,
  },
  strong: {
    sigmaM: 8.5,
    rhoM: 260,
    fastSigmaM: 2.4,
    fastRhoM: 40,
    longFactor: 0.2,
  },
};

/** The anchor taper's reach (meters), clamped by the span's own length. */
const TAPER_M = 35;

/** Fill spacing for wobbled legs that have no interior points (spacing off). */
const WOBBLE_FILL_M = 25;

/** A resolved wobble window on the path (distance domain). */
interface WobbleWindow {
  fromM: number;
  toM: number;
  intensity: WobbleIntensity;
  seed: number;
}

/** One window's live sampler state (built per call — never shared). */
interface WindowState {
  /** The slow meander stream. */
  lateral: (deltaSM: number) => number;
  /** The fast per-fix scatter stream (summed onto the meander). */
  fast: (deltaSM: number) => number;
  uniform: () => number;
  lastCumM: number;
}

/**
 * Resolve the segments' distance windows on the path (vertices keep their
 * ids through resample; a world-scale drawing's decimation may drop one —
 * such a segment is skipped honestly, never approximated — the pace
 * plan's rule).
 */
function wobbleWindows(
  path: readonly PathPoint[],
  segments: readonly WobbleSegment[],
): WobbleWindow[] {
  if (segments.length === 0) return [];
  const cumOf = new Map<VertexId, number>();
  for (const point of path) {
    if (point.vertexId !== undefined && !cumOf.has(point.vertexId)) {
      cumOf.set(point.vertexId, point.cumDistanceM);
    }
  }
  const windows: WobbleWindow[] = [];
  for (const segment of segments) {
    const fromM = cumOf.get(segment.fromVertexId);
    const toM = cumOf.get(segment.toVertexId);
    if (fromM === undefined || toM === undefined || !(toM > fromM)) continue;
    windows.push({
      fromM,
      toM,
      intensity: segment.intensity,
      seed: segment.seed,
    });
  }
  windows.sort((a, b) => a.fromM - b.fromM);
  return windows;
}

/** The window whose (fromM, toM) brackets this cum, if any. */
function owningWindow(
  windows: readonly WobbleWindow[],
  cumM: number,
): WobbleWindow | null {
  for (const window of windows) {
    if (cumM >= window.fromM && cumM <= window.toM) return window;
  }
  return null;
}

/** True for the points that must never move (user vertices + anchors). */
function isAnchorPoint(point: PathPoint): boolean {
  return (
    point.vertexId !== undefined ||
    point.role === "before-anchor" ||
    point.role === "after-anchor"
  );
}

/**
 * Apply the wobble plan to a resampled path. Returns a copy; when nothing
 * applies (no windows, or nothing displaceable inside them) the copy
 * carries the input unchanged — callers treat it as a pure transform.
 *
 * The user's VERTEX points (and the path's endpoints) never move; the
 * displacement tapers to zero at every anchor, so the wobbled line meets
 * the drawn anchors exactly. Cumulative distances are recomputed
 * geodesically over the displaced line — the honest wiggly length.
 *
 * `pointBudget` caps the fill points inserted for spacing-"off" legs (the
 * track's own MAX_CREATE_TRACK_POINTS).
 */
export function wobblePathPoints(
  path: readonly PathPoint[],
  segments: readonly WobbleSegment[],
  pointBudget: number = Number.POSITIVE_INFINITY,
): PathPoint[] {
  if (path.length < 3 || segments.length === 0) return [...path];
  const windows = wobbleWindows(path, segments);
  if (windows.length === 0) return [...path];

  // -- Pass 1: densify wobbled anchor-to-anchor legs with no interior ---
  // (spacing "off" leaves pure vertex chains; wobble needs points. The
  // check is structural: the NEXT point being an anchor means this leg
  // got no interpolated fill from the resampler.)
  const densified: PathPoint[] = [];
  let budget = Math.max(0, pointBudget - path.length);
  for (let i = 0; i < path.length; i += 1) {
    densified.push(path[i]);
    if (i === path.length - 1) break;
    const next = path[i + 1];
    if (!isAnchorPoint(next)) continue; // interior exists — nothing to fill
    const legM = next.cumDistanceM - path[i].cumDistanceM;
    const midM = (path[i].cumDistanceM + next.cumDistanceM) / 2;
    const window = owningWindow(windows, midM);
    if (window === null) continue; // only wobbled legs fill
    if (!(legM > WOBBLE_FILL_M * 1.5) || budget <= 0) continue;
    const wanted = Math.min(budget, Math.ceil(legM / WOBBLE_FILL_M) - 1);
    if (wanted <= 0) continue;
    budget -= wanted;
    for (let k = 1; k <= wanted; k += 1) {
      const fraction = k / (wanted + 1);
      densified.push({
        lat: path[i].lat + (next.lat - path[i].lat) * fraction,
        lon: path[i].lon + (next.lon - path[i].lon) * fraction,
        role: "interpolated",
        cumDistanceM: path[i].cumDistanceM + legM * fraction,
      });
    }
  }

  // -- Pass 2: the anchor cums (every vertex point — the taper targets) ---
  const anchors: number[] = [];
  for (const point of densified) {
    if (point.vertexId !== undefined) anchors.push(point.cumDistanceM);
  }
  anchors.sort((a, b) => a - b);
  const nearestAnchorDistance = (cumM: number): number => {
    let lo = 0;
    let hi = anchors.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid] < cumM) lo = mid + 1;
      else hi = mid;
    }
    let best = Math.abs(anchors[lo] - cumM);
    if (lo > 0) {
      const before = Math.abs(anchors[lo - 1] - cumM);
      if (before < best) best = before;
    }
    return best;
  };

  // -- Pass 3: displace the non-anchor points inside each window ---
  const states = new Map<WobbleWindow, WindowState>();
  const stateFor = (window: WobbleWindow): WindowState => {
    let state = states.get(window);
    if (state === undefined) {
      const params = WOBBLE_PARAMS[window.intensity];
      state = {
        lateral: ouProcess(window.seed, params.sigmaM, params.rhoM),
        fast: ouProcess(
          (window.seed ^ 0x68bc21eb) >>> 0,
          params.fastSigmaM,
          params.fastRhoM,
        ),
        uniform: mulberry32((window.seed ^ 0x9e3779b9) >>> 0),
        lastCumM: window.fromM,
      };
      states.set(window, state);
    }
    return state;
  };

  const result: PathPoint[] = [];
  for (let i = 0; i < densified.length; i += 1) {
    const point = densified[i];
    const prev = densified[i - 1] ?? point;
    const next = densified[i + 1] ?? point;
    if (isAnchorPoint(point)) {
      result.push({ ...point });
      continue;
    }
    const midM = (prev.cumDistanceM + next.cumDistanceM) / 2;
    const window = owningWindow(windows, midM);
    if (window === null) {
      result.push({ ...point });
      continue;
    }
    const state = stateFor(window);
    const deltaSM = Math.max(0, point.cumDistanceM - state.lastCumM);
    state.lastCumM = point.cumDistanceM;
    const lateral = state.lateral(deltaSM) + state.fast(deltaSM);
    // Taper: zero at every anchor (span ends + interior vertices).
    const taperReach = Math.min(TAPER_M, (window.toM - window.fromM) / 6);
    const taper =
      taperReach > 0
        ? smoothstep(nearestAnchorDistance(point.cumDistanceM) / taperReach)
        : 0;
    if (taper <= 0) {
      result.push({ ...point });
      continue;
    }
    // Local direction in meters (planar tangent — the displacement is
    // meters-scale; the geodesic recompute below keeps distances honest).
    const cosLat = Math.cos((point.lat * Math.PI) / 180);
    const dirLatM = (next.lat - prev.lat) * 111320;
    const dirLonM = (next.lon - prev.lon) * 111320 * cosLat;
    const dirLen = Math.hypot(dirLatM, dirLonM);
    if (!(dirLen > 0.01)) {
      result.push(point);
      continue;
    }
    const dirLat = dirLatM / dirLen;
    const dirLon = dirLonM / dirLen;
    const nLat = -dirLon; // left normal
    const nLon = dirLat;
    // Longitudinal jitter, bounded well under half the local gap so the
    // point ordering can never flip.
    const gapM = Math.min(
      Math.abs(point.cumDistanceM - prev.cumDistanceM),
      Math.abs(next.cumDistanceM - point.cumDistanceM),
    );
    const longitudinal =
      (state.uniform() - 0.5) * 2 * WOBBLE_PARAMS[window.intensity].longFactor * gapM * taper;
    const offsetLateral = lateral * taper;
    const dLatM = nLat * offsetLateral + dirLat * longitudinal;
    const dLonM = nLon * offsetLateral + dirLon * longitudinal;
    result.push({
      ...point,
      lat: point.lat + dLatM / 111320,
      lon: point.lon + dLonM / (111320 * cosLat),
    });
  }

  // -- Pass 4: honest cumulative distances over the displaced line --
  let cumulative = 0;
  for (let i = 0; i < result.length; i += 1) {
    if (i > 0) {
      const legM = geodesicDistanceMeters(result[i - 1], result[i]);
      if (Number.isFinite(legM)) cumulative += legM;
    }
    result[i].cumDistanceM = cumulative;
  }
  return result;
}

// ---------------------------------------------------------------------------
// The wobbled line as a draft-chain geometry (the draw map's live preview)
// ---------------------------------------------------------------------------

/** The joined geometry of a wobbled chain (the same shape the styled
 * join returns — points plus one insertion midpoint per leg). */
export interface WobbledChainGeometry {
  points: LatLon[];
  midpoints: LatLon[];
}

/**
 * The half-distance point of a leg's run — ON the wiggly line, not the
 * chord (the midpoint-insertion affordance must sit where the user sees
 * the line). Pure; total over runs of at least one point.
 */
function runMidpoint(run: readonly PathPoint[]): LatLon {
  const first = run[0]!;
  const last = run[run.length - 1]!;
  const halfAbs = first.cumDistanceM + (last.cumDistanceM - first.cumDistanceM) / 2;
  for (let k = 1; k < run.length; k += 1) {
    const prev = run[k - 1]!;
    const point = run[k]!;
    const span = point.cumDistanceM - prev.cumDistanceM;
    if (point.cumDistanceM >= halfAbs || k === run.length - 1) {
      const t = span > 0 ? (halfAbs - prev.cumDistanceM) / span : 0;
      return {
        lat: prev.lat + (point.lat - prev.lat) * t,
        lon: prev.lon + (point.lon - prev.lon) * t,
      };
    }
  }
  return { lat: last.lat, lon: last.lon };
}

/**
 * The wobbled path AS the draft chain's geometry: the path already is
 * the chain (every drawn vertex embedded verbatim, road and curve
 * interiors included by the resample), so the legs are the runs between
 * consecutive vertex points. One midpoint per leg, on the rendered line.
 * This is what the draw map renders for wobbled plans — the preview is
 * the file's geometry, not a straight-line stand-in.
 */
export function wobbledChainGeometry(
  path: readonly PathPoint[],
): WobbledChainGeometry {
  const points: LatLon[] = [];
  const midpoints: LatLon[] = [];
  let runStart = 0;
  for (let i = 0; i < path.length; i += 1) {
    points.push({ lat: path[i]!.lat, lon: path[i]!.lon });
    const closesLeg =
      path[i]!.vertexId !== undefined || i === path.length - 1;
    if (!closesLeg) continue;
    midpoints.push(runMidpoint(path.slice(runStart, i + 1)));
    runStart = i;
  }
  return { points, midpoints };
}

// ---------------------------------------------------------------------------
// The altimeter treatment (elevation noise for the file + its previews)
// ---------------------------------------------------------------------------

/** Fast + slow OU amplitudes per intensity (meters) — real barometric
 * altimeter numbers: per-fix scatter of 1–3 m plus slow drift that
 * accumulates several meters over an hour of recording. */
const ELENOISE_PARAMS: Record<
  WobbleIntensity,
  { fastSigmaM: number; fastRhoM: number; slowSigmaM: number; slowRhoM: number }
> = {
  subtle: { fastSigmaM: 0.8, fastRhoM: 90, slowSigmaM: 1.2, slowRhoM: 900 },
  moderate: { fastSigmaM: 1.6, fastRhoM: 90, slowSigmaM: 2.8, slowRhoM: 900 },
  strong: { fastSigmaM: 3.0, fastRhoM: 90, slowSigmaM: 5.0, slowRhoM: 900 },
};

/**
 * The watch-altimeter treatment: the DEM samples plus two OU streams
 * (fast sensor noise + slow barometric drift), seeded deterministically.
 * The input is never mutated; the output carries the same cumulative
 * distances with noised elevations. Fewer than two samples → unchanged.
 */
export function watchNoiseSamples(
  samples: readonly ElevationSample[],
  seed: number,
  intensity: WobbleIntensity,
): ElevationSample[] {
  if (samples.length < 2) return [...samples];
  const params = ELENOISE_PARAMS[intensity];
  const fast = ouProcess(seed, params.fastSigmaM, params.fastRhoM);
  const slow = ouProcess((seed ^ 0x51ed270b) >>> 0, params.slowSigmaM, params.slowRhoM);
  const out: ElevationSample[] = [];
  let lastCumM = samples[0].cumDistanceM;
  for (const sample of samples) {
    const deltaSM = Math.max(0, sample.cumDistanceM - lastCumM);
    lastCumM = sample.cumDistanceM;
    const noise = fast(deltaSM) + slow(deltaSM);
    out.push({
      cumDistanceM: sample.cumDistanceM,
      ele: sample.ele + (Number.isFinite(noise) ? noise : 0),
    });
  }
  return out;
}
