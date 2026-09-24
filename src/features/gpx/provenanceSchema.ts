/**
 * GPX provenance-extension schema — `xmlns:gpxr` (docs/MASTER_PLAN.md §H-7).
 *
 * Defines the XML vocabulary that marks reconstructed data in exported
 * files so our own re-import can tell repairs apart from recordings:
 *
 *   - Per reconstructed point:
 *       <extensions>
 *         <gpxr:reconstructed timeMethod="…" eleMethod="…"/>
 *       </extensions>
 *   - Per track (repair summary):
 *       <gpxr:summary reconstructedDistanceM="…" gapCount="…"/>
 *
 * Standard GPX consumers ignore unknown extensions; our parser round-trips
 * them. **Status: schema + builders defined, NOT yet used by the exporter**
 * — Phase 1's export is identity-only (re-emit originals verbatim). The
 * extension markers are wired into `exportGpx` by the merge/export phases
 * (Phase 7), which is also when these builders gain their callers in
 * production code. They are unit-tested now so the vocabulary is locked.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript: no DOM globals — builders
 * receive the target `Document` they must create elements in.
 */

/** Namespace URI of the gpxr extension vocabulary. */
export const GPXR_NAMESPACE = "https://gpx-repair.studio/schema/1";

/** Conventional prefix bound to {@link GPXR_NAMESPACE} in exports. */
export const GPXR_PREFIX = "gpxr";

/** Element names of the vocabulary. */
export const GPXR_ELEMENTS = {
  /** Per-point provenance marker inside `<extensions>`. */
  reconstructed: "reconstructed",
  /** Track-level repair summary. */
  summary: "summary",
} as const;

/** Attribute names of the vocabulary. */
export const GPXR_ATTRIBUTES = {
  /** Which strategy distributed this point's timestamp. */
  timeMethod: "timeMethod",
  /** Where this point's elevation came from. */
  eleMethod: "eleMethod",
  /** Total reconstructed distance in meters (summary). */
  reconstructedDistanceM: "reconstructedDistanceM",
  /** Number of repaired gaps (summary). */
  gapCount: "gapCount",
} as const;

/** Attribute values for {@link GPXR_ELEMENTS.reconstructed}. */
export interface ReconstructedMarkerAttributes {
  /** Matches `Estimated<T>["method"]` for timestamps, when estimated. */
  timeMethod?: string;
  /** Matches `Estimated<T>["method"]` for elevation, when estimated. */
  eleMethod?: string;
}

/**
 * Build the per-point `<gpxr:reconstructed>` marker element inside the
 * given (export) document. Attributes are emitted only when the
 * corresponding value is estimated — an original point never carries a
 * marker at all.
 */
export function buildReconstructedExtension(
  doc: Document,
  attrs: ReconstructedMarkerAttributes,
): Element {
  const el = doc.createElementNS(
    GPXR_NAMESPACE,
    `${GPXR_PREFIX}:${GPXR_ELEMENTS.reconstructed}`,
  );
  if (attrs.timeMethod !== undefined) {
    el.setAttribute(GPXR_ATTRIBUTES.timeMethod, attrs.timeMethod);
  }
  if (attrs.eleMethod !== undefined) {
    el.setAttribute(GPXR_ATTRIBUTES.eleMethod, attrs.eleMethod);
  }
  return el;
}

/** Attribute values for {@link GPXR_ELEMENTS.summary}. */
export interface SummaryAttributes {
  reconstructedDistanceM: number;
  gapCount: number;
}

/** Build the track-level `<gpxr:summary>` element inside the given document. */
export function buildSummaryExtension(
  doc: Document,
  attrs: SummaryAttributes,
): Element {
  const el = doc.createElementNS(
    GPXR_NAMESPACE,
    `${GPXR_PREFIX}:${GPXR_ELEMENTS.summary}`,
  );
  el.setAttribute(
    GPXR_ATTRIBUTES.reconstructedDistanceM,
    String(attrs.reconstructedDistanceM),
  );
  el.setAttribute(GPXR_ATTRIBUTES.gapCount, String(attrs.gapCount));
  return el;
}
