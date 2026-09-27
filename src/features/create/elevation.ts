/**
 * Create elevation — the "create from activity stats" workflow's elevation
 * freshness vocabulary (the review phase's opt-in terrain lookup).
 *
 * The whole fetch/label/stale machinery is REUSED from Phase 6: the shared
 * provider (Open-Meteo behind the LRU cache), the elevation store's
 * per-key records, the 400-point cap (`pickFetchPoints`), and the
 * cumulative-distance interpolation (`interpolateSample`) — the one metric
 * that survives resample-spacing changes, because the chain geometry is
 * the same and only the fill density between nodes moves.
 *
 * What is create-specific is the FRESHNESS SIGNATURE. A repair's samples
 * go stale on vertex edits (`geometryRevision`) and road-leg changes
 * (`roadLegsSignature`). The create workflow adds a third axis: the
 * distance BASIS. Choosing "use my watch's distance" scales the whole
 * shape about its centroid — the coordinates move and the cumulative
 * distances rescale — so the fetch must record which basis it ran against
 * and any basis change stales it (re-estimate or the values stay out of
 * the export, the same honest rule repairs follow).
 *
 * The store key is namespaced (`create::route`, the `recovery::` pattern):
 * the repair studio and the recovery section key their records by gap ids,
 * and this section's single pseudo-route record can never collide with —
 * or prune — theirs.
 *
 * "Create from activity stats" section. Pure TypeScript: no React, no DOM,
 * no stores (the store-reading join lives in the hook layer).
 */

import { roadLegsSignature } from "@/features/elevation/samples";
import type { CreateTrack } from "@/features/create/track";
import type { GapId, RoadLeg } from "@/types/domain";

/**
 * The elevation-store key of the create route's fetch record. `create::`
 * can never collide with parsed gap ids (`gap/{id}/{id}`), extension span
 * ids, or the recovery section's `recovery::` namespace.
 */
export const CREATE_ELEVATION_STORE_KEY = "create::route" as GapId;

/**
 * The freshness signature of a create track: the resolved road legs, the
 * distance basis, and the session token. `drawn` marks the as-drawn
 * geometry; `scaled:<f>` marks the shape scaled to the watch's distance by
 * factor `f` — the coordinates and cumulative distances both move under a
 * basis change, so the signature must move with them. The session token
 * (`create-store.sessionSeq`, bumped by every full reset) separates two
 * DIFFERENT routes that land on the same revision/legs/basis tuple — a
 * fresh 3-click route after a reset would otherwise inherit the previous
 * activity's elevations. Resample spacing is deliberately absent:
 * samples are keyed by cumulative distance along the same chain, which
 * spacing changes do not alter.
 */
export function createElevationSignature(
  track: Pick<CreateTrack, "scaleApplied" | "scaleFactor">,
  legs: readonly RoadLeg[],
  sessionSeq: number,
): string {
  const basis = track.scaleApplied
    ? `scaled:${track.scaleFactor?.toFixed(5) ?? "??"}`
    : "drawn";
  return `${roadLegsSignature(legs)}|${basis}|s${sessionSeq}`;
}
