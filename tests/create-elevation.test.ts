/**
 * Unit tests — the create workflow's elevation join
 * (features/create/elevation.ts + hooks/use-create-elevation.ts).
 *
 * The freshness contract is the whole point of this module:
 *   - the signature separates bases (drawn vs scaled) and sessions, and
 *     ignores resample spacing (samples are cumulative-distance keyed);
 *   - `readFreshCreateElevation` hands the export samples ONLY while the
 *     record matches the current revision + signature — a vertex edit, a
 *     distance-basis change, or a new session (a full reset followed by
 *     an identical-looking route) all exclude the old values;
 *   - `createPointElevation` interpolates the samples onto the track
 *     (exact hits are provider values, mid-points interpolated).
 *
 * Store-driven (zustand outside React): both stores are driven directly,
 * exactly like the create-store tests.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  CREATE_ELEVATION_STORE_KEY,
  createElevationSignature,
} from "@/features/create/elevation";
import { buildCreateTrack, type CreateTrack } from "@/features/create/track";
import {
  createPointElevation,
  readFreshCreateElevation,
} from "@/hooks/use-create-elevation";
import { useCreateStore } from "@/state/create-store";
import { useElevationStore } from "@/state/elevation-store";

const STATS = {
  distanceM: 5230,
  durationMs: 1_955_000,
  paceMsPerKm: 374_000,
  startMs: Date.UTC(2026, 8, 20, 5, 30),
};

/** Draw the two-vertex route and finish into the review phase. */
function reachReviewTrack(): CreateTrack {
  useCreateStore.getState().beginDrawing(STATS);
  useCreateStore.getState().addVertex({ lat: 52.52, lon: 13.405 });
  useCreateStore.getState().addVertex({ lat: 52.53, lon: 13.405 });
  useCreateStore.getState().finishRoute();
  const state = useCreateStore.getState();
  const track = buildCreateTrack(STATS, {
    vertices: state.reconstruction.vertices,
    roadLegs: state.roadLegs,
    spacingM: state.spacingM,
    matchDistance: state.matchDistance,
  })!;
  expect(track).not.toBeNull();
  return track;
}

/** Seed a fresh, complete record for the given track. */
function seedRecord(track: CreateTrack) {
  const state = useCreateStore.getState();
  const fetchSeq = useElevationStore.getState().beginFetch(
    CREATE_ELEVATION_STORE_KEY,
    {
      providerId: "open-meteo",
      fetchedAtRevision: state.reconstruction.geometryRevision,
      fetchedAtRoadSignature: createElevationSignature(
        track,
        state.roadLegs,
        state.sessionSeq,
      ),
      totalPoints: track.path.length,
      sentPoints: track.path.length,
    },
  );
  useElevationStore.getState().finish(CREATE_ELEVATION_STORE_KEY, fetchSeq, {
    status: "complete",
    samples: [
      { cumDistanceM: 0, ele: 48 },
      { cumDistanceM: track.finalDistanceM, ele: 52 },
    ],
    resolvedPoints: 2,
  });
}

beforeEach(() => {
  useCreateStore.getState().reset();
  useElevationStore.getState().reset();
});

describe("createElevationSignature", () => {
  it("separates the distance bases and the sessions, not the spacing", () => {
    const drawn = { scaleApplied: false, scaleFactor: null };
    const scaled = { scaleApplied: true, scaleFactor: 5230 / 4508.4 };

    // Spacing is invisible to the signature (cumulative-distance keying).
    expect(createElevationSignature(drawn, [], 0)).toBe(
      createElevationSignature(drawn, [], 0),
    );
    // A basis change moves it…
    expect(createElevationSignature(scaled, [], 0)).not.toBe(
      createElevationSignature(drawn, [], 0),
    );
    // …and so does a new session…
    expect(createElevationSignature(drawn, [], 1)).not.toBe(
      createElevationSignature(drawn, [], 0),
    );
    // …and so does a resolved road leg.
    const leg = {
      a: { lat: 52.52, lon: 13.405 },
      b: { lat: 52.53, lon: 13.405 },
      coordinates: [
        [13.405, 52.52],
        [13.405, 52.53],
      ] as [number, number][],
      routeDistanceM: 1112,
    };
    expect(createElevationSignature(drawn, [leg], 0)).not.toBe(
      createElevationSignature(drawn, [], 0),
    );
  });
});

describe("readFreshCreateElevation (the export's click-time join)", () => {
  it("returns the samples + provider while the record matches the basis", () => {
    const track = reachReviewTrack();
    seedRecord(track);

    const attachment = readFreshCreateElevation();
    expect(attachment).not.toBeNull();
    expect(attachment!.samples).toEqual([
      { cumDistanceM: 0, ele: 48 },
      { cumDistanceM: track.finalDistanceM, ele: 52 },
    ]);
    expect(attachment!.providerName).toBe("Open-Meteo");
  });

  it("excludes the record after a vertex edit (revision bump)", () => {
    const track = reachReviewTrack();
    seedRecord(track);

    const moved = useCreateStore.getState().reconstruction.vertices[1];
    useCreateStore.getState().moveVertex(moved.id, { lat: 52.531, lon: 13.406 });
    expect(readFreshCreateElevation()).toBeNull();
  });

  it("excludes the record after a distance-basis change (the scale toggle)", () => {
    const track = reachReviewTrack();
    seedRecord(track);

    // 5.23 km recorded vs ~1.11 km drawn — far past the notice ratio, so
    // the toggle actually applies the scale transform (a new basis).
    useCreateStore.getState().setMatchDistance(true);
    expect(readFreshCreateElevation()).toBeNull();
  });

  it("never inherits across sessions: a reset + identical route is stale", () => {
    const track = reachReviewTrack();
    seedRecord(track);
    const revisionBefore = useCreateStore.getState().reconstruction.geometryRevision;

    // Full reset, then draw EXACTLY the same two vertices — the store
    // lands on the same revision, legs, and basis as before. Only the
    // session token separates the two activities.
    useCreateStore.getState().reset();
    const redrew = reachReviewTrack();
    expect(useCreateStore.getState().reconstruction.geometryRevision).toBe(
      revisionBefore,
    );
    expect(redrew.path).toHaveLength(track.path.length);
    expect(readFreshCreateElevation()).toBeNull();
  });

  it("returns null for absent and failed records", () => {
    const track = reachReviewTrack();
    expect(readFreshCreateElevation()).toBeNull(); // nothing fetched

    const state = useCreateStore.getState();
    const fetchSeq = useElevationStore.getState().beginFetch(
      CREATE_ELEVATION_STORE_KEY,
      {
        providerId: "open-meteo",
        fetchedAtRevision: state.reconstruction.geometryRevision,
        fetchedAtRoadSignature: createElevationSignature(
          track,
          state.roadLegs,
          state.sessionSeq,
        ),
        totalPoints: 1,
        sentPoints: 1,
      },
    );
    useElevationStore.getState().finish(CREATE_ELEVATION_STORE_KEY, fetchSeq, {
      status: "failed",
      samples: [],
      resolvedPoints: 0,
      error: "The elevation service could not be reached.",
    });
    expect(readFreshCreateElevation()).toBeNull();
  });
});

describe("createPointElevation (the per-point interpolation)", () => {
  it("interpolates between samples and labels honestly", () => {
    const attachment = {
      samples: [
        { cumDistanceM: 0, ele: 48 },
        { cumDistanceM: 100, ele: 52 },
      ],
      providerName: "Open-Meteo",
    };

    // Exact sample hits are provider values.
    expect(createPointElevation(attachment, 0)).toEqual({
      value: 48,
      method: "elevation-api",
    });
    expect(createPointElevation(attachment, 100)).toEqual({
      value: 52,
      method: "elevation-api",
    });
    // The midpoint is interpolated (and says so).
    expect(createPointElevation(attachment, 50)).toEqual({
      value: 50,
      method: "interpolated",
    });
    // No attachment → no elevation, never a guess.
    expect(createPointElevation(null, 50)).toBeUndefined();
  });
});
