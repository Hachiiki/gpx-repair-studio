/**
 * Unit tests — the create pace plan (features/create/pace.ts + the
 * create store's Task-73 slice).
 *
 * The Task 73 contract:
 *   - a pace segment is the inclusive span between two drawn points at
 *     a stated pace; overlapping plans paint over (absorb/trim), and
 *     edits that destroy an endpoint prune the plan honestly;
 *   - the paced timeline preserves the recorded DURATION exactly:
 *     planned stretches run their stated pace, the unplanned remainder
 *     absorbs the difference, and only an implausible remainder (outside
 *     0.3–3× the activity average) scales the plan — flagged `clamped`;
 *   - terrain breathes around the plan (Minetti grade factor, the GAP
 *     model): uphill stretches come out slower, downhill faster, the
 *     total still pinned to the recorded duration;
 *   - splits integrate the SAME timeline (the bars and the file agree);
 *   - with no plan and no elevation estimate, nothing shapes the curve —
 *     the export keeps today's distance-proportional times.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPacedTimeline,
  contiguousSelectionSpan,
  elevationAtFromSamples,
  makeRoomForSegment,
  paceSplits,
  pacedTimesForFile,
  prunePaceSegments,
  type PaceSegment,
} from "@/features/create/pace";
import { buildCreateTrack } from "@/features/create/track";
import type { ElevationSample } from "@/features/elevation/samples";
import {
  captureCreateSession,
  hydrateCreateSession,
  readSessionRecord,
  type StoredCreateSession,
} from "@/lib/storage/session-record";
import { useCreateStore } from "@/state/create-store";
import type { DrawVertex, VertexId } from "@/types/domain";
import { vertexId } from "@/types/ids";

const STATS = {
  distanceM: 4_220,
  durationMs: 1_266_000, // 21:06 — 5:00/km over 4.22 km
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

function track(spacingM: number | "off" = 25) {
  return buildCreateTrack(STATS, {
    vertices: L_CHAIN,
    roadLegs: [],
    spacingM,
    matchDistance: false,
  })!;
}

const NO_ELEVATION = elevationAtFromSamples(null);

/** A simple two-stretch terrain: uphill then downhill. */
function hillElevation(): ElevationSample[] {
  return [
    { cumDistanceM: 0, ele: 100 },
    { cumDistanceM: 2_110, ele: 210 },
    { cumDistanceM: 4_220, ele: 110 },
  ];
}

/** ms per meter of an m:ss-per-km pace. */
const perMeter = (minutes: number, seconds = 0): number =>
  ((minutes * 60 + seconds) * 1000) / 1000;

// ---------------------------------------------------------------------------
// Selection spans
// ---------------------------------------------------------------------------

describe("contiguousSelectionSpan", () => {
  it("resolves a contiguous run of two or more", () => {
    const span = contiguousSelectionSpan(L_CHAIN, new Set(["v1", "v2"] as const).size === 2 ? new Set<VertexId>(["v1" as VertexId, "v2" as VertexId]) : new Set<VertexId>());
    expect(span).toEqual({
      fromVertexId: "v1" as VertexId,
      toVertexId: "v2" as VertexId,
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it("refuses a scattered selection", () => {
    expect(
      contiguousSelectionSpan(L_CHAIN, new Set<VertexId>(["v1" as VertexId, "v3" as VertexId])),
    ).toBeNull();
  });

  it("refuses a single point and stale ids", () => {
    expect(contiguousSelectionSpan(L_CHAIN, new Set<VertexId>(["v2" as VertexId]))).toBeNull();
    expect(contiguousSelectionSpan(L_CHAIN, new Set<VertexId>(["v1" as VertexId, "v9" as VertexId]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Make-room + pruning
// ---------------------------------------------------------------------------

describe("makeRoomForSegment", () => {
  const seg = (from: string, to: string): PaceSegment => ({
    id: `ps-${from}-${to}`,
    fromVertexId: from as never,
    toVertexId: to as never,
    paceMsPerMeter: 300,
  });

  it("keeps disjoint segments", () => {
    const kept = makeRoomForSegment(
      [seg("v3", "v5")],
      "v1" as VertexId,
      "v2" as VertexId,
      L_CHAIN,
    );
    expect(kept).toHaveLength(0);
  });

  it("absorbs a fully covered segment and trims a partially covered one", () => {
    const chain = vertices(
      [52.52, 13.4],
      [52.525, 13.4],
      [52.53, 13.4],
      [52.535, 13.4],
      [52.54, 13.4],
    );
    // v2–v3 sits fully inside the new v1–v3 plan → absorbed; v4–v5 is
    // disjoint → kept. (A segment sharing only the new span's ENDPOINT
    // trims to a one-vertex remnant and drops — covered below.)
    const kept = makeRoomForSegment(
      [seg("v2", "v3"), seg("v4", "v5")],
      "v1" as VertexId,
      "v3" as VertexId,
      chain,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].fromVertexId).toBe("v4");
    expect(kept[0].toVertexId).toBe("v5");
  });

  it("drops a segment whose only non-overlapping remnant is one vertex", () => {
    const chain = vertices(
      [52.52, 13.4],
      [52.525, 13.4],
      [52.53, 13.4],
      [52.535, 13.4],
      [52.54, 13.4],
    );
    // v4–v5 shares v4 with the new v1–v4 plan; the leftover (v5 alone)
    // cannot stand.
    const kept = makeRoomForSegment(
      [seg("v4", "v5")],
      "v1" as VertexId,
      "v4" as VertexId,
      chain,
    );
    expect(kept).toHaveLength(0);
  });

  it("trims the non-overlapping side when the new span paints over half", () => {
    // A 5-vertex chain: plan 1–4, then paint 3–5 → the old plan trims
    // to 1–2 (the kept part still spans two vertices).
    const chain = vertices(
      [52.52, 13.4],
      [52.525, 13.4],
      [52.53, 13.4],
      [52.535, 13.4],
      [52.54, 13.4],
    );
    const kept = makeRoomForSegment(
      [seg("v1", "v4")],
      "v3" as VertexId,
      "v5" as VertexId,
      chain,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].fromVertexId).toBe("v1");
    expect(kept[0].toVertexId).toBe("v2");
  });

  it("drops a trim remnant narrower than two vertices", () => {
    const chain = vertices(
      [52.52, 13.4],
      [52.525, 13.4],
      [52.53, 13.4],
      [52.535, 13.4],
    );
    // Old plan 1–3; new plan 2–4 → the remnant (1–1) cannot stand alone.
    const kept = makeRoomForSegment(
      [seg("v1", "v3")],
      "v2" as VertexId,
      "v4" as VertexId,
      chain,
    );
    expect(kept).toHaveLength(0);
  });
});

describe("prunePaceSegments", () => {
  it("drops segments whose endpoints vanished or flipped", () => {
    const vid = (id: string) => id as VertexId;
    const segments: PaceSegment[] = [
      { id: "a", fromVertexId: vid("v1"), toVertexId: vid("v2"), paceMsPerMeter: 300 },
      { id: "b", fromVertexId: vid("v2"), toVertexId: vid("v3"), paceMsPerMeter: 280 },
      { id: "c", fromVertexId: vid("v3"), toVertexId: vid("v1"), paceMsPerMeter: 260 },
    ];
    const pruned = prunePaceSegments(
      [L_CHAIN[0], L_CHAIN[1]], // v3 is gone
      segments,
    );
    expect(pruned).toHaveLength(1);
    expect(pruned[0].id).toBe("a");
  });

  it("keeps everything when the chain supports every span", () => {
    const segments: PaceSegment[] = [
      {
        id: "a",
        fromVertexId: "v1" as VertexId,
        toVertexId: "v2" as VertexId,
        paceMsPerMeter: 300,
      },
    ];
    expect(prunePaceSegments(L_CHAIN, segments)).toBe(segments);
  });
});

// ---------------------------------------------------------------------------
// The paced timeline
// ---------------------------------------------------------------------------

describe("buildPacedTimeline", () => {
  it("returns null without a plan and without terrain", () => {
    expect(
      buildPacedTimeline(track(), STATS.durationMs, STATS.startMs, [], NO_ELEVATION),
    ).toBeNull();
  });

  it("runs the planned stretch at its pace; the remainder absorbs; the total is preserved", () => {
    const t = track();
    const drawnAvg = STATS.durationMs / t.finalDistanceM;
    const firstLegM = t.path.find((p) => p.vertexId === "v2")!.cumDistanceM;
    const plan: PaceSegment[] = [
      { id: "ps1", fromVertexId: "v1" as VertexId, toVertexId: "v2" as VertexId, paceMsPerMeter: perMeter(4) },
    ];
    const timeline = buildPacedTimeline(
      t,
      STATS.durationMs,
      STATS.startMs,
      plan,
      NO_ELEVATION,
    )!;
    expect(timeline).not.toBeNull();
    expect(timeline.segmentCount).toBe(1);
    expect(timeline.plannedM).toBeCloseTo(firstLegM, -1);
    expect(timeline.clamped).toBe(false);

    // The file's arithmetic: first = start, last = start + duration.
    const times = timeline.times;
    expect(times[0].value).toBe(STATS.startMs);
    expect(times[times.length - 1].value).toBe(STATS.startMs + STATS.durationMs);
    expect(new Set(times.map((x) => x.method))).toEqual(
      new Set(["pace-estimated"]),
    );

    // Monotone.
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i].value).toBeGreaterThanOrEqual(times[i - 1].value);
    }

    // The planned stretch's average ≈ the stated pace; the remainder's
    // ≈ the derived remainder pace (both disclosed numbers).
    const at = (cumM: number) => {
      const i = t.path.findIndex(
        (p, index) =>
          index === t.path.length - 1 ||
          (p.cumDistanceM <= cumM && t.path[index + 1].cumDistanceM > cumM),
      );
      return times[Math.max(0, i)].value;
    };
    const plannedAvg =
      (at(firstLegM) - at(0)) / firstLegM;
    expect(plannedAvg).toBeGreaterThan(perMeter(4) * 0.98);
    expect(plannedAvg).toBeLessThan(perMeter(4) * 1.02);
    const remainder = timeline.remainderPaceMsPerMeter!;
    // It absorbed the fast planned stretch — slower than the drawn avg.
    expect(remainder).toBeGreaterThan(drawnAvg);
    const restAvg =
      (times[times.length - 1].value - at(firstLegM)) /
      (t.finalDistanceM - firstLegM);
    expect(restAvg / remainder).toBeGreaterThan(0.98);
    expect(restAvg / remainder).toBeLessThan(1.02);
  });

  it("scales a plan that covers the whole route, keeping the duration and flagging it", () => {
    const t = track();
    const plan: PaceSegment[] = [
      { id: "ps1", fromVertexId: "v1" as VertexId, toVertexId: "v2" as VertexId, paceMsPerMeter: perMeter(3) },
      { id: "ps2", fromVertexId: "v2" as VertexId, toVertexId: "v3" as VertexId, paceMsPerMeter: perMeter(7) },
    ];
    const timeline = buildPacedTimeline(
      t,
      STATS.durationMs,
      STATS.startMs,
      plan,
      NO_ELEVATION,
    )!;
    expect(timeline.remainderPaceMsPerMeter).toBeNull();
    expect(timeline.clamped).toBe(true); // 3:00 + 7:00 ≠ 21:06 over 4.22 km
    expect(timeline.times[timeline.times.length - 1].value).toBe(
      STATS.startMs + STATS.durationMs,
    );
    // The relative shape survives: the first stretch stays the faster one.
    const firstLegM = t.path.find((p) => p.vertexId === "v2")!.cumDistanceM;
    const firstAvg =
      (timeline.times[t.path.findIndex((p) => p.vertexId === "v2")].value -
        timeline.times[0].value) /
      firstLegM;
    const lastAvg =
      (timeline.times[timeline.times.length - 1].value -
        timeline.times[t.path.findIndex((p) => p.vertexId === "v2")].value) /
      (t.finalDistanceM - firstLegM);
    expect(firstAvg).toBeLessThan(lastAvg);
  });

  it("flags a plan whose remainder leaves the plausible window", () => {
    const t = track();
    // Nearly the whole route at a very slow pace: the remainder would
    // need to run faster than 0.3× the average to keep the total.
    const plan: PaceSegment[] = [
      { id: "ps1", fromVertexId: "v1" as VertexId, toVertexId: "v3" as VertexId, paceMsPerMeter: perMeter(9) },
    ];
    const timeline = buildPacedTimeline(
      t,
      STATS.durationMs,
      STATS.startMs,
      plan,
      NO_ELEVATION,
    )!;
    expect(timeline.clamped).toBe(true);
    expect(timeline.times[timeline.times.length - 1].value).toBe(
      STATS.startMs + STATS.durationMs,
    );
  });

  it("breathes with the terrain: uphill slower, downhill faster, total kept", () => {
    const t = track();
    const timeline = buildPacedTimeline(
      t,
      STATS.durationMs,
      STATS.startMs,
      [],
      elevationAtFromSamples(hillElevation()),
    )!;
    expect(timeline.elevationModulated).toBe(true);
    expect(timeline.segmentCount).toBe(0);
    const avg = STATS.durationMs / t.finalDistanceM;
    const first = timeline.samples.find((s) => s.cumM > 800)!;
    const last = timeline.samples.find((s) => s.cumM > 3_800)!;
    expect(first.paceMsPerMeter).toBeGreaterThan(avg * 1.05); // the climb
    expect(first.paceMsPerMeter).toBeLessThan(avg * 1.5);
    expect(last.paceMsPerMeter).toBeLessThan(avg * 0.98); // the descent
    expect(last.paceMsPerMeter).toBeGreaterThan(avg * 0.6);
    // Terrain rides every display sample.
    expect(first.eleM).toBeDefined();
    expect(last.eleM).toBeDefined();
    // The display series is decimated.
    expect(timeline.samples.length).toBeLessThanOrEqual(221);
    // The total is still the watch's.
    expect(timeline.times[timeline.times.length - 1].value).toBe(
      STATS.startMs + STATS.durationMs,
    );
  });

  it("keeps the plan's pace on a hill (the grade breathes around it)", () => {
    const t = track();
    const firstLegM = t.path.find((p) => p.vertexId === "v2")!.cumDistanceM;
    const plan: PaceSegment[] = [
      { id: "ps1", fromVertexId: "v1" as VertexId, toVertexId: "v2" as VertexId, paceMsPerMeter: perMeter(4, 30) },
    ];
    const timeline = buildPacedTimeline(
      t,
      STATS.durationMs,
      STATS.startMs,
      plan,
      elevationAtFromSamples(hillElevation()),
    )!;
    // The planned stretch averages the stated pace even over the climb
    // (the climb slows parts of it, the normalization rebalances).
    const v2Index = t.path.findIndex((p) => p.vertexId === "v2");
    const plannedAvg =
      (timeline.times[v2Index].value - timeline.times[0].value) / firstLegM;
    expect(plannedAvg).toBeGreaterThan(perMeter(4, 30) * 0.95);
    expect(plannedAvg).toBeLessThan(perMeter(4, 30) * 1.05);
  });
});

describe("paceSplits", () => {
  it("integrates the timeline — the bars and the file agree", () => {
    const t = track();
    const timeline = buildPacedTimeline(
      t,
      STATS.durationMs,
      STATS.startMs,
      [
        {
          id: "ps1",
          fromVertexId: "v1" as VertexId,
          toVertexId: "v2" as VertexId,
          paceMsPerMeter: perMeter(3, 45),
        },
      ],
      NO_ELEVATION,
    )!;
    const splits = paceSplits(timeline, t, 1000);
    expect(splits.length).toBe(Math.ceil(t.finalDistanceM / 1000));
    // The first split (inside the planned 4:15 stretch) is faster than
    // the last (the slow remainder) — the graph goes up and down.
    expect(splits[0].paceMsPerMeter).toBeLessThan(
      splits[splits.length - 1].paceMsPerMeter,
    );
    // Split times sum to the duration (exact integration).
    let coveredM = 0;
    let timeSum = 0;
    const timeAt = (cumM: number) => {
      const index = t.path.findIndex(
        (p, i) =>
          i === t.path.length - 1 ||
          (p.cumDistanceM <= cumM && t.path[i + 1].cumDistanceM > cumM),
      );
      return timeline.times[Math.max(0, index)].value;
    };
    for (const split of splits) {
      timeSum += timeAt(split.toM) - timeAt(split.fromM);
      coveredM += split.toM - split.fromM;
    }
    expect(coveredM).toBeCloseTo(t.finalDistanceM, 6);
    expect(timeSum).toBeCloseTo(STATS.durationMs, -2);
  });
});

describe("pacedTimesForFile", () => {
  it("keeps the base distance-proportional times without a plan or terrain", () => {
    const t = track();
    const times = pacedTimesForFile(
      t,
      STATS.durationMs,
      STATS.startMs,
      [],
      null,
    );
    expect(times).toHaveLength(t.path.length);
    expect(times[0].method).toBe("distance-proportional");
    expect(times[times.length - 1].value).toBe(STATS.startMs + STATS.durationMs);
  });

  it("carries the pace-estimated method once a plan shapes the curve", () => {
    const t = track();
    const times = pacedTimesForFile(
      t,
      STATS.durationMs,
      STATS.startMs,
      [{ id: "ps1", fromVertexId: "v1" as VertexId, toVertexId: "v2" as VertexId, paceMsPerMeter: perMeter(4) }],
      null,
    );
    expect(new Set(times.map((x) => x.method))).toEqual(
      new Set(["pace-estimated"]),
    );
  });
});

// ---------------------------------------------------------------------------
// The store's pace slice
// ---------------------------------------------------------------------------

describe("create store pace plan", () => {
  beforeEach(() => {
    useCreateStore.getState().reset();
    useCreateStore.setState({
      phase: "draw",
      stats: { distanceM: 4_220, durationMs: 1_266_000, paceMsPerKm: 300_000, startMs: 0 },
      reconstruction: {
        ...useCreateStore.getState().reconstruction,
        vertices: L_CHAIN.map((v) => ({ ...v })),
      },
    });
  });

  it("applies, updates, and removes a stretch", () => {
    const store = useCreateStore.getState();
    store.applyPaceSegment("v1" as VertexId, "v2" as VertexId, 240);
    expect(useCreateStore.getState().paceSegments).toEqual([
      { id: "ps1", fromVertexId: "v1" as VertexId, toVertexId: "v2" as VertexId, paceMsPerMeter: 240 },
    ]);
    store.updatePaceSegment("ps1", 260);
    expect(useCreateStore.getState().paceSegments[0].paceMsPerMeter).toBe(260);
    store.removePaceSegment("ps1");
    expect(useCreateStore.getState().paceSegments).toHaveLength(0);
  });

  it("paints over an overlapping plan (the last assignment wins)", () => {
    const store = useCreateStore.getState();
    store.applyPaceSegment("v1" as VertexId, "v2" as VertexId, 240);
    store.applyPaceSegment("v2" as VertexId, "v3" as VertexId, 280);
    store.applyPaceSegment("v1" as VertexId, "v3" as VertexId, 300);
    expect(useCreateStore.getState().paceSegments).toHaveLength(1);
    expect(useCreateStore.getState().paceSegments[0]).toMatchObject({
      fromVertexId: "v1" as VertexId,
      toVertexId: "v3" as VertexId,
      paceMsPerMeter: 300,
    });
  });

  it("prunes the plan when an endpoint vertex is deleted", () => {
    const store = useCreateStore.getState();
    store.applyPaceSegment("v1" as VertexId, "v2" as VertexId, 240);
    store.deleteVertex("v2" as VertexId);
    expect(useCreateStore.getState().paceSegments).toHaveLength(0);
  });

  it("refuses invalid spans and paces", () => {
    const store = useCreateStore.getState();
    store.applyPaceSegment("v3" as VertexId, "v1" as VertexId, 240); // reversed
    store.applyPaceSegment("v1" as VertexId, "v9" as VertexId, 240); // stale id
    store.applyPaceSegment("v1" as VertexId, "v2" as VertexId, -5); // non-positive pace
    expect(useCreateStore.getState().paceSegments).toHaveLength(0);
  });

  it("round-trips through the session capture/hydrate shape", () => {
    const store = useCreateStore.getState();
    store.applyPaceSegment("v1" as VertexId, "v2" as VertexId, 240);
    const record = captureCreateSession(
      {
        stats: store.stats!,
        reconstruction: store.reconstruction,
        roadLegs: store.roadLegs,
        spacingM: store.spacingM,
        matchDistance: store.matchDistance,
        phase: "draw",
        paceSegments: useCreateStore.getState().paceSegments,
        paceSeq: useCreateStore.getState().paceSeq,
        wobbleSegments: [],
        wobbleSeq: 0,
        noiseSeed: null,
      },
      1,
    );
    const read = readSessionRecord(JSON.parse(JSON.stringify(record)))!;
    expect(read.kind).toBe("create");
    const hydrated = hydrateCreateSession(read as StoredCreateSession);
    expect(hydrated.paceSegments).toEqual([
      { id: "ps1", fromVertexId: "v1" as VertexId, toVertexId: "v2" as VertexId, paceMsPerMeter: 240 },
    ]);
    expect(hydrated.paceSeq).toBeGreaterThanOrEqual(1);
    // A malformed plan field discards the plan, never the route.
    const broken = readSessionRecord({
      ...JSON.parse(JSON.stringify(record)),
      paceSegments: [{ id: "x", fromVertexId: 1, toVertexId: 2, paceMsPerMeter: "slow" }],
    })!;
    expect(
      hydrateCreateSession(broken as StoredCreateSession).paceSegments,
    ).toHaveLength(0);
  });
});
