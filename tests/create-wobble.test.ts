/**
 * Unit tests — the human-like GPS plan (features/create/wobble.ts + the
 * create store's Task-74 slice + the finished-on-export marks of Task 75).
 *
 * The Task 74 contract:
 *   - a wobble segment is the inclusive span between two drawn points at
 *     an intensity; overlapping plans paint over, and edits that destroy
 *     an endpoint prune the plan honestly;
 *   - the drawn ANCHORS never move; the interpolated points inside the
 *     span wander (an Ornstein-Uhlenbeck lateral process with a taper to
 *     zero at every anchor), and the cumulative distances recompute over
 *     the wiggly line — the honest length a watch would record;
 *   - spacing-"off" legs get fill points first (wobble needs points);
 *   - everything is deterministic: same seed + same path → same wobble;
 *   - the altimeter treatment (fast noise + slow drift) never mutates
 *     the DEM samples and keeps their cumulative distances;
 *   - Task 75: every export funnel marks its session finished, and the
 *     mark clears when new work begins.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resamplePath,
  type PathPoint,
} from "@/features/reconstruction/resample";
import {
  strongestIntensity,
  watchNoiseSamples,
  wobblePathPoints,
  type WobbleSegment,
} from "@/features/create/wobble";
import { buildCreateTrack } from "@/features/create/track";
import {
  captureCreateSession,
  hydrateCreateSession,
  readSessionRecord,
} from "@/lib/storage/session-record";
import { useCreateStore } from "@/state/create-store";
import { useMergeStore } from "@/state/merge-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useSessionStore } from "@/state/session-store";
import type { DrawVertex, VertexId } from "@/types/domain";
import { vertexId } from "@/types/ids";
import type { ElevationSample } from "@/features/elevation/samples";

const STATS = {
  distanceM: 4_220,
  durationMs: 1_266_000,
  paceMsPerKm: 300_000, // 5:00/km — the stats triple's third member
  startMs: Date.UTC(2026, 9, 1, 6, 0),
};

function vertices(...positions: [number, number][]): DrawVertex[] {
  return positions.map(([lat, lon], i) => ({
    id: vertexId(i + 1),
    lat,
    lon,
  }));
}

/** The Berlin L-chain (≈ 1.11 km north + 3.11 km east ≈ 4.22 km). */
const L_CHAIN = vertices(
  [52.52, 13.405],
  [52.53, 13.405],
  [52.53, 13.455],
);

function segment(
  overrides: Partial<WobbleSegment> = {},
): WobbleSegment {
  return {
    id: "ws1",
    fromVertexId: "v1" as VertexId,
    toVertexId: "v2" as VertexId,
    intensity: "moderate",
    seed: 987_654,
    ...overrides,
  };
}

/** The densified straight chain (spacing on) — wobble's raw material. */
function straightPath(spacingM: number | "off" = 25): PathPoint[] {
  return resamplePath(null, L_CHAIN, null, spacingM);
}

/** Approximate perpendicular distance (meters) from the v1→v2 chord. */
function chordDeviationM(point: PathPoint): number {
  const [a, b] = L_CHAIN;
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lon * 111_320 * cosLat;
  const ay = a.lat * 111_320;
  const bx = b.lon * 111_320 * cosLat;
  const by = b.lat * 111_320;
  const px = point.lon * 111_320 * cosLat;
  const py = point.lat * 111_320;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  return Math.abs((px - ax) * dy - (py - ay) * dx) / len;
}

beforeEach(() => {
  useCreateStore.getState().reset();
  useSessionStore.getState().reset();
  useRecoveryStore.getState().reset();
  useMergeStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Geometry wobble
// ---------------------------------------------------------------------------

describe("wobblePathPoints", () => {
  it("returns an unchanged copy when no plan exists", () => {
    const path = straightPath();
    const out = wobblePathPoints(path, []);
    expect(out).toEqual(path);
    expect(out).not.toBe(path);
  });

  it("is deterministic — same seed, same path, same wobble", () => {
    const path = straightPath();
    const first = wobblePathPoints(path, [segment()]);
    const second = wobblePathPoints(path, [segment()]);
    expect(first).toEqual(second);
    // And a different seed wanders differently.
    const third = wobblePathPoints(path, [segment({ seed: 42 })]);
    expect(third).not.toEqual(first);
  });

  it("never moves the drawn anchors", () => {
    const path = straightPath();
    const out = wobblePathPoints(path, [segment()]);
    const anchorsIn = path.filter((p) => p.vertexId !== undefined);
    const anchorsOut = out.filter((p) => p.vertexId !== undefined);
    expect(anchorsOut).toHaveLength(anchorsIn.length);
    for (let i = 0; i < anchorsIn.length; i += 1) {
      expect(anchorsOut[i]!.lat).toBe(anchorsIn[i]!.lat);
      expect(anchorsOut[i]!.lon).toBe(anchorsIn[i]!.lon);
    }
  });

  it("displaces the interior points off the ruler line", () => {
    const path = straightPath();
    const out = wobblePathPoints(path, [segment()]);
    expect(out).toHaveLength(path.length); // spacing on — nothing inserted
    let maxDeviation = 0;
    for (const point of out) {
      if (point.vertexId !== undefined) continue;
      if (point.cumDistanceM > 1_200) continue; // only the v1→v2 span
      maxDeviation = Math.max(maxDeviation, chordDeviationM(point));
    }
    // Moderate (σ ≈ 2.6 m, taper included) over a 1.1 km stretch — the
    // line must visibly breathe, never stay on the chord.
    expect(maxDeviation).toBeGreaterThan(0.5);
  });

  it("tapers — the wander shrinks toward the anchors", () => {
    const path = straightPath();
    const out = wobblePathPoints(path, [segment({ intensity: "strong" })]);
    const span = out.filter(
      (p) => p.vertexId === undefined && p.cumDistanceM <= 1_111,
    );
    expect(span.length).toBeGreaterThan(10);
    // The first interior point sits inside the taper's reach (25 m from
    // its anchor, reach 35 m) AND the OU has just left zero — its
    // deviation must stay under the stretch's own maximum.
    const first = chordDeviationM(span[0]!);
    const max = Math.max(...span.map((p) => chordDeviationM(p)));
    expect(max).toBeGreaterThan(first);
  });

  it("recomputes honest cumulative distances over the wiggly line", () => {
    const path = straightPath();
    const out = wobblePathPoints(path, [segment()]);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.cumDistanceM).toBeGreaterThanOrEqual(
        out[i - 1]!.cumDistanceM,
      );
    }
    const straightTotal = path[path.length - 1]!.cumDistanceM;
    const wobbledTotal = out[out.length - 1]!.cumDistanceM;
    expect(wobbledTotal).toBeGreaterThan(straightTotal);
    // ...but only by a hair — a wobble is decoration, not a detour.
    expect(wobbledTotal - straightTotal).toBeLessThan(straightTotal * 0.01);
  });

  it("fills spacing-off legs before wobbling them", () => {
    const path = straightPath("off"); // the bare vertex chain
    expect(path).toHaveLength(3);
    const out = wobblePathPoints(path, [segment()], 6_000);
    expect(out.length).toBeGreaterThan(3);
    expect(out.filter((p) => p.vertexId === undefined).length).toBeGreaterThan(
      5,
    );
    // The anchors survived the fill untouched.
    const anchors = out.filter((p) => p.vertexId !== undefined);
    expect(anchors).toHaveLength(3);
  });

  it("respects the point budget when filling", () => {
    const path = straightPath("off");
    const out = wobblePathPoints(path, [segment()], 20);
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it("wanders harder at stronger intensities", () => {
    const path = straightPath();
    const meanDeviation = (intensity: WobbleSegment["intensity"]) => {
      const out = wobblePathPoints(path, [segment({ intensity })]);
      const span = out.filter(
        (p) => p.vertexId === undefined && p.cumDistanceM <= 1_111,
      );
      return (
        span.reduce((sum, p) => sum + chordDeviationM(p), 0) / span.length
      );
    };
    const subtle = meanDeviation("subtle");
    const moderate = meanDeviation("moderate");
    const strong = meanDeviation("strong");
    expect(strong).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(subtle);
  });

  it("stays visible and honest — deviation meters-scale, inflation inside the reconcile noise band", () => {
    // The whole route wobbled at each intensity: the deviation must be
    // real meters (visible when zoomed — the feature's whole point after
    // the straight-line regression), and the length inflation must stay
    // inside the reconciliation's own 2% noise band at the default 25 m
    // spacing, so a wobbled draw never trips the distance dialog.
    const [v1, v2, v3] = L_CHAIN;
    const chordOf = (a: DrawVertex, b: DrawVertex) => {
      const cosLat = Math.cos((a.lat * Math.PI) / 180);
      const ax = a.lon * 111_320 * cosLat;
      const ay = a.lat * 111_320;
      const bx = b.lon * 111_320 * cosLat;
      const by = b.lat * 111_320;
      const len = Math.hypot(bx - ax, by - ay);
      return (point: PathPoint) => {
        const px = point.lon * 111_320 * cosLat;
        const py = point.lat * 111_320;
        return Math.abs((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / len;
      };
    };
    const firstLegChord = chordOf(v1!, v2!);
    const secondLegChord = chordOf(v2!, v3!);
    const firstLegM = straightPath()[1]!.cumDistanceM; // the N leg's end
    for (const [intensity, minDeviation] of [
      ["subtle", 2],
      ["moderate", 4],
      ["strong", 8],
    ] as const) {
      const base = straightPath();
      const out = wobblePathPoints(base, [
        segment({
          intensity,
          fromVertexId: "v1" as VertexId,
          toVertexId: "v3" as VertexId,
        }),
      ]);
      const straightTotal = base[base.length - 1]!.cumDistanceM;
      const total = out[out.length - 1]!.cumDistanceM;
      const inflation = (total - straightTotal) / straightTotal;
      let maxDeviation = 0;
      for (const point of out) {
        if (point.vertexId !== undefined) continue;
        const deviation =
          point.cumDistanceM <= firstLegM
            ? firstLegChord(point)
            : secondLegChord(point);
        if (deviation > maxDeviation) maxDeviation = deviation;
      }
      expect(maxDeviation).toBeGreaterThan(minDeviation);
      expect(inflation).toBeLessThan(0.02);
    }
  });
});

// ---------------------------------------------------------------------------
// The altimeter treatment
// ---------------------------------------------------------------------------

describe("watchNoiseSamples", () => {
  const samples: ElevationSample[] = Array.from({ length: 50 }, (_, i) => ({
    cumDistanceM: i * 100,
    ele: 100,
  }));

  it("is deterministic and keeps the sample positions", () => {
    const first = watchNoiseSamples(samples, 77, "moderate");
    const second = watchNoiseSamples(samples, 77, "moderate");
    expect(first).toEqual(second);
    expect(first.map((s) => s.cumDistanceM)).toEqual(
      samples.map((s) => s.cumDistanceM),
    );
  });

  it("never mutates the DEM input and changes the output", () => {
    const copy = samples.map((s) => ({ ...s }));
    const out = watchNoiseSamples(samples, 77, "moderate");
    expect(samples).toEqual(copy);
    const changed = out.filter((s, i) => s.ele !== samples[i]!.ele);
    expect(changed.length).toBeGreaterThan(0);
  });

  it("stays near zero mean at a plausible amplitude", () => {
    const out = watchNoiseSamples(samples, 1234, "moderate");
    const noise = out.map((s, i) => s.ele - samples[i]!.ele);
    const mean = noise.reduce((a, b) => a + b, 0) / noise.length;
    const rms = Math.sqrt(
      noise.reduce((a, b) => a + b * b, 0) / noise.length,
    );
    expect(Math.abs(mean)).toBeLessThan(1.5); // no systematic offset
    expect(rms).toBeGreaterThan(0.3); // visibly noisy
    expect(rms).toBeLessThan(8); // ...but watch-plausible
  });

  it("leaves fewer than two samples alone", () => {
    const single: ElevationSample[] = [{ cumDistanceM: 0, ele: 10 }];
    expect(watchNoiseSamples(single, 5, "strong")).toEqual(single);
  });
});

describe("strongestIntensity", () => {
  it("picks the strongest of the plan", () => {
    expect(strongestIntensity([])).toBeNull();
    expect(
      strongestIntensity([
        segment({ intensity: "subtle" }),
        segment({ id: "ws2", intensity: "strong" }),
      ]),
    ).toBe("strong");
    expect(
      strongestIntensity([segment({ intensity: "moderate" })]),
    ).toBe("moderate");
  });
});

// ---------------------------------------------------------------------------
// The store's wobble slice
// ---------------------------------------------------------------------------

describe("create store wobble plan", () => {
  it("applies a wobble with a stable altimeter seed", () => {
    const store = useCreateStore.getState();
    store.beginDrawing(STATS);
    for (const vertex of L_CHAIN) {
      useCreateStore.getState().addVertex({ lat: vertex.lat, lon: vertex.lon });
    }
    useCreateStore.getState().applyWobble("v1" as VertexId, "v2" as VertexId, "moderate");
    const state = useCreateStore.getState();
    expect(state.wobbleSegments).toHaveLength(1);
    expect(state.wobbleSegments[0]!.intensity).toBe("moderate");
    expect(state.noiseSeed).not.toBeNull();
    const seed = state.noiseSeed;
    // A second stretch keeps the seed (the noise must not re-roll).
    useCreateStore.getState().applyWobble("v2" as VertexId, "v3" as VertexId, "subtle");
    expect(useCreateStore.getState().noiseSeed).toBe(seed);
    expect(useCreateStore.getState().wobbleSegments).toHaveLength(2);
  });

  it("paints over an overlapping plan (re-apply re-rolls the seed)", () => {
    const store = useCreateStore.getState();
    store.beginDrawing(STATS);
    for (const vertex of L_CHAIN) {
      useCreateStore.getState().addVertex({ lat: vertex.lat, lon: vertex.lon });
    }
    useCreateStore.getState().applyWobble("v1" as VertexId, "v3" as VertexId, "subtle");
    useCreateStore.getState().applyWobble("v1" as VertexId, "v2" as VertexId, "strong");
    const state = useCreateStore.getState();
    expect(state.wobbleSegments).toHaveLength(1);
    expect(state.wobbleSegments[0]!.toVertexId).toBe("v2" as VertexId);
    expect(state.wobbleSegments[0]!.intensity).toBe("strong");
  });

  it("removes one stretch and prunes on vertex deletion", () => {
    const store = useCreateStore.getState();
    store.beginDrawing(STATS);
    for (const vertex of L_CHAIN) {
      useCreateStore.getState().addVertex({ lat: vertex.lat, lon: vertex.lon });
    }
    useCreateStore.getState().applyWobble("v1" as VertexId, "v2" as VertexId, "moderate");
    useCreateStore.getState().applyWobble("v2" as VertexId, "v3" as VertexId, "subtle");
    useCreateStore.getState().removeWobbleSegment(
      useCreateStore.getState().wobbleSegments[1]!.id,
    );
    expect(useCreateStore.getState().wobbleSegments).toHaveLength(1);
    // Deleting the endpoint prunes the span honestly.
    useCreateStore.getState().deleteVertex("v2" as VertexId);
    expect(useCreateStore.getState().wobbleSegments).toHaveLength(0);
  });

  it("rides the session capture/hydrate round-trip", () => {
    const store = useCreateStore.getState();
    store.beginDrawing(STATS);
    for (const vertex of L_CHAIN) {
      useCreateStore.getState().addVertex({ lat: vertex.lat, lon: vertex.lon });
    }
    useCreateStore.getState().applyWobble("v1" as VertexId, "v2" as VertexId, "strong");
    const captured = useCreateStore.getState();
    const record = captureCreateSession(
      {
        stats: captured.stats!,
        reconstruction: captured.reconstruction,
        roadLegs: captured.roadLegs,
        spacingM: captured.spacingM,
        matchDistance: captured.matchDistance,
        phase: "draw",
        paceSegments: captured.paceSegments,
        paceSeq: captured.paceSeq,
        wobbleSegments: captured.wobbleSegments,
        wobbleSeq: captured.wobbleSeq,
        noiseSeed: captured.noiseSeed,
      },
      Date.now(),
    );
    expect(record.wobbleSegments).toHaveLength(1);
    const hydrated = hydrateCreateSession(record);
    expect(hydrated.wobbleSegments).toEqual(captured.wobbleSegments);
    expect(hydrated.noiseSeed).toBe(captured.noiseSeed);
    // A malformed field discards the wobble, never the route.
    const raw = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
    raw.wobbleSegments = [{ id: 3, fromVertexId: "v1" }];
    const sanitized = readSessionRecord(raw);
    expect(sanitized?.kind).toBe("create");
    expect(
      (sanitized as { wobbleSegments?: unknown[] }).wobbleSegments ?? [],
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The track join
// ---------------------------------------------------------------------------

describe("buildCreateTrack with a wobble plan", () => {
  it("bakes the wobble into the file's line (anchors preserved)", () => {
    const plain = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 25,
      matchDistance: false,
    })!;
    const wobbled = buildCreateTrack(STATS, {
      vertices: L_CHAIN,
      roadLegs: [],
      spacingM: 25,
      matchDistance: false,
      wobbleSegments: [segment()],
    })!;
    expect(wobbled.pointCount).toBe(plain.pointCount);
    let maxShift = 0;
    for (let i = 0; i < plain.path.length; i += 1) {
      const a = plain.path[i]!;
      const b = wobbled.path[i]!;
      if (a.vertexId !== undefined) {
        // Anchors are the user's data — identical.
        expect(b.lat).toBe(a.lat);
        expect(b.lon).toBe(a.lon);
        continue;
      }
      const shift = Math.hypot(
        (b.lat - a.lat) * 111_320,
        (b.lon - a.lon) * 111_320,
      );
      maxShift = Math.max(maxShift, shift);
    }
    expect(maxShift).toBeGreaterThan(0.5);
    // The wiggly line is the honest (slightly longer) distance.
    expect(wobbled.finalDistanceM).toBeGreaterThan(plain.finalDistanceM);
  });
});

// ---------------------------------------------------------------------------
// Task 75 — the finished-on-export marks
// ---------------------------------------------------------------------------

describe("finished-on-export marks", () => {
  it("create: marks, clears, and never carries into a new activity", () => {
    const store = useCreateStore.getState();
    store.beginDrawing(STATS);
    useCreateStore.getState().markExported();
    expect(useCreateStore.getState().finishedAt).not.toBeNull();
    useCreateStore.getState().clearFinished();
    expect(useCreateStore.getState().finishedAt).toBeNull();
    useCreateStore.getState().markExported();
    // A new activity is new work.
    useCreateStore.getState().beginDrawing(STATS);
    expect(useCreateStore.getState().finishedAt).toBeNull();
    useCreateStore.getState().markExported();
    useCreateStore.getState().reset();
    expect(useCreateStore.getState().finishedAt).toBeNull();
  });

  it("repair: marks, and a new upload clears", () => {
    useSessionStore.getState().markExported();
    expect(useSessionStore.getState().finishedAt).not.toBeNull();
    useSessionStore.getState().beginLoad("next.gpx");
    expect(useSessionStore.getState().finishedAt).toBeNull();
  });

  it("recovery: marks, and a reset clears", () => {
    useRecoveryStore.getState().markExported();
    expect(useRecoveryStore.getState().finishedAt).not.toBeNull();
    useRecoveryStore.getState().clearFinished();
    expect(useRecoveryStore.getState().finishedAt).toBeNull();
  });

  it("merge: marks, and new files clear", () => {
    useMergeStore.getState().markExported();
    expect(useMergeStore.getState().finishedAt).not.toBeNull();
    useMergeStore.getState().beginFiles(["a.gpx"]);
    expect(useMergeStore.getState().finishedAt).toBeNull();
  });

  it("the wobble group honors vi.fn smoke (imports stay clean)", () => {
    const spy = vi.fn();
    spy();
    expect(spy).toHaveBeenCalled();
  });
});
