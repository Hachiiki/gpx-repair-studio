/**
 * GPX Repair Studio — domain model (docs/MASTER_PLAN.md §G).
 *
 * This module is the project's shared type vocabulary. It defines the
 * parsed representation of a GPX file, the validation/gap vocabulary, and
 * the (Phase 4+) reconstruction types. It contains **types only** — no
 * runtime code, no imports beyond the branded ids.
 *
 * Core design goals (§D-3):
 *   1. Provenance is structural — `SourceKind` discriminants and the
 *      `Estimated<T>` wrapper make it impossible to accidentally feed
 *      estimated data into functions typed for recorded data.
 *   2. Original data is immutable — parse returns a deeply frozen model in
 *      development/test builds; production relies on `readonly` types.
 *   3. Derived data is never stored as truth — reconstruction results are
 *      pure functions of `(OriginalTrackData, Reconstruction)`.
 *
 * Phase 1 additions beyond the plan's §G sketch (documented deviations,
 * all serving the identity-export invariant of §H):
 *   - `RawTrkptCapture` / anchored-extras snapshots retain the *verbatim
 *     source strings* of every original point (attributes, `<ele>`/`<time>`
 *     text, extra child XML) so the identity exporter can re-emit them
 *     byte-for-byte. Repair only ever inserts; originals are never rewritten.
 *   - `PointAnomaly` is extended with parse-time-local kinds
 *     (`invalid-coord`, `invalid-ele`, `unreliable-time`, `out-of-range-coord`)
 *     so relational checks (validate) and point-local damage (parse) share
 *     one flag vocabulary on the frozen model.
 *
 * Phase 1 — GPX Domain Core. Pure types; no runtime behavior here.
 */

import type { GapId, PointId, SegmentId, VertexId } from "./ids";

// The id types are part of the shared vocabulary: consumers import them
// from here without needing to know about ids.ts.
export type { GapId, PointId, SegmentId, VertexId } from "./ids";

// ---------------------------------------------------------------------------
// Geo primitives
// ---------------------------------------------------------------------------

/** A WGS-84 position. `lat`/`lon` in decimal degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Provenance primitives (§G)
// ---------------------------------------------------------------------------

/** Discriminates recorded data from user-reconstructed data. */
export type SourceKind = "original" | "reconstructed";

/**
 * Any estimated value must carry its method, forcing UI/export to label it
 * (§G "enforcement mechanics": the UI must unwrap `.value` and render the
 * method; estimated values are never presented as measured).
 */
export interface Estimated<T> {
  value: T;
  method:
    | "distance-proportional" // timestamps spread by cumulative distance
    | "uniform" // timestamps spread by index
    | "manual" // user-entered duration/elevation
    | "elevation-api" // fetched from a DEM provider
    | "interpolated"; // resampled geometry / profile smoothing
}

// ---------------------------------------------------------------------------
// Original (recorded) data — immutable after parse (§G)
// ---------------------------------------------------------------------------

/**
 * Anomalies attached to a track point. Point-local damage (`invalid-coord`,
 * `invalid-ele`, `unreliable-time`, `zero-coord`) is flagged at parse time;
 * relational anomalies (`out-of-range-coord`, `time-reversed`, `speed-spike`,
 * `dup`) are added by the validator onto a copied model.
 */
export type PointAnomaly =
  | "invalid-coord" // lat/lon attribute missing, empty, or not a number
  | "out-of-range-coord" // |lat| > 90 or |lon| > 180
  | "zero-coord" // lat === 0 && lon === 0 (GPS-loss artifact)
  | "invalid-ele" // <ele> present but not a number
  | "unreliable-time" // <time> present but not strict ISO-8601-with-timezone
  | "time-reversed" // earlier than the preceding point's time
  | "speed-spike" // implied leg speed above the configured threshold
  | "dup"; // consecutive duplicate coordinates

/**
 * Verbatim capture of one `<trkpt>` child element, in document order.
 * `ele`/`time` are the raw text of the *first* respective child; any further
 * child (including second `<ele>`/`<time>` elements, vendor extensions, …)
 * is kept as a serialized `extra` snapshot. This is what makes byte-faithful
 * identity re-emission possible.
 */
export type RawTrkptChild =
  | { kind: "ele"; text: string }
  | { kind: "time"; text: string }
  | { kind: "extra"; xml: string };

/**
 * Byte-fidelity capture of a track point exactly as it appeared in the
 * source document. `lat`/`lon` are the decoded attribute *values* (`null`
 * when the attribute was absent — absent stays absent on re-export).
 * Values are re-emitted verbatim by the identity exporter; nothing here is
 * ever mutated.
 */
export interface RawTrkptCapture {
  lat: string | null;
  lon: string | null;
  children: readonly RawTrkptChild[];
}

/** One recorded `<trkpt>`, validated for numeric sanity at parse time. */
export interface OriginalTrackPoint extends LatLon {
  /** Discriminant: this is recorded data (never reconstructed). */
  source: "original";
  id: PointId;
  /**
   * Elevation in meters, exactly as recorded. `undefined` when absent or
   * unparseable (see `flags`).
   */
  ele?: number;
  /** Epoch milliseconds, exactly as recorded. `undefined` when absent/unreliable. */
  time?: number;
  /** Anomalies; see `PointAnomaly`. */
  flags: readonly PointAnomaly[];
  /** Verbatim source capture for identity export. Never mutated. */
  raw: RawTrkptCapture;
}

/**
 * A non-`trkpt` child of `<trkseg>` (rare in the wild, e.g. vendor
 * extensions), anchored to the number of `trkpt` elements that preceded it
 * so the exporter can re-emit it at its original position.
 */
export interface AnchoredExtra {
  afterPointCount: number;
  xml: string;
}

/** One recorded `<trkseg>` — an ordered run of track points. */
export interface OriginalSegment {
  id: SegmentId;
  /** Parent `<trk>` ordinal. */
  trackIndex: number;
  points: readonly OriginalTrackPoint[];
  /** Non-`trkpt` children of the `<trkseg>`, anchored by point count. */
  extras: readonly AnchoredExtra[];
}

/**
 * A non-standard child of `<trk>` (anything but `name`/`desc`/`type`/
 * `trkseg`), anchored to the number of `trkseg` elements that preceded it.
 */
export interface TrackExtra {
  afterSegmentCount: number;
  xml: string;
}

/** Metadata of one `<trk>`. */
export interface TrackMeta {
  trackIndex: number;
  name?: string;
  desc?: string;
  type?: string;
  /** Non-standard `<trk>` children, anchored by segment count. */
  extras: readonly TrackExtra[];
}

/** A `<wpt>` waypoint, passed through verbatim for re-export. */
export interface Waypoint {
  /** Serialized snapshot of the original `<wpt>` element (namespaces intact). */
  rawXml: string;
  /** First `<name>` text, trimmed — for display only. */
  name?: string;
}

/** A `<rte>` route, passed through verbatim for re-export. */
export interface Route {
  /** Serialized snapshot of the original `<rte>` element (namespaces intact). */
  rawXml: string;
  /** First `<name>` text, trimmed — for display only. */
  name?: string;
}

/** Verbatim attribute/text capture for the file-level metadata. */
export interface FileMetaRaw {
  /** The `version` attribute exactly as written (e.g. `"1.1"`). */
  version: string;
  /** The `creator` attribute, or `undefined` when absent. */
  creator?: string;
  /** Raw text of the file-level `<time>` element, if any. */
  metadataTime?: string;
}

/** File-level `<metadata>` (or GPX 1.0 root-level) information. */
export interface FileMeta {
  creator?: string;
  version: "1.0" | "1.1";
  name?: string;
  /** Epoch ms of the file-level `<time>`; `undefined` when absent/unreliable. */
  time?: number;
  /** Verbatim capture for identity export. */
  raw: FileMetaRaw;
  /** Non-`name`/`time` children of `<metadata>`, serialized in order. */
  metadataExtras: readonly string[];
}

/** The complete parsed representation of one GPX file. Frozen after parse. */
export interface OriginalTrackData {
  tracks: readonly TrackMeta[];
  segments: readonly OriginalSegment[];
  waypoints: readonly Waypoint[];
  routes: readonly Route[];
  /** Non-standard root children (`<metadata>`/`<wpt>`/`<rte>`/`<trk>` excluded). */
  rootExtras: readonly string[];
  fileMeta: FileMeta;
  /** Warnings collected at parse/validate time (§G). */
  issues: readonly ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Parse outcomes (typed errors — §H-2 "hard failure")
// ---------------------------------------------------------------------------

/** Hard parse failures. Anything else is modeled tolerantly with issues. */
export type GpxParseError =
  | {
      /** The document is not well-formed XML. */
      kind: "malformed-xml";
      message: string;
      line?: number;
      column?: number;
    }
  | {
      /** Well-formed XML, but the root element is not `<gpx>`. */
      kind: "not-a-gpx-document";
      rootElement: string | null;
    }
  | {
      /** The `version` attribute is missing or not "1.0"/"1.1". */
      kind: "invalid-version";
      found: string | null;
    };

/** Result of `parseGpx`: a typed model or a typed error — never throws. */
export type ParseOutcome =
  | { ok: true; data: OriginalTrackData }
  | { ok: false; error: GpxParseError };

// ---------------------------------------------------------------------------
// Validation (§H-3)
// ---------------------------------------------------------------------------

export type ValidationIssueKind =
  | "invalid-coord" // parse: lat/lon missing/unparseable
  | "out-of-range-coord" // |lat| > 90 or |lon| > 180
  | "zero-coord" // run of (0,0) points
  | "invalid-ele" // parse: <ele> unparseable
  | "out-of-range-ele" // ele outside the sanity window
  | "unreliable-time" // parse: <time> not strict ISO-8601-with-tz
  | "undeclared-namespace" // parse: prefix used without xmlns (bound for parsing)
  | "time-reversed" // time earlier than the previous point's
  | "speed-spike" // implied leg speed above threshold
  | "duplicate-point" // consecutive identical coordinates
  | "empty-segment" // <trkseg> without any <trkpt>
  | "single-point-segment" // <trkseg> with exactly one <trkpt>
  | "track-without-segments" // <trk> without any <trkseg>
  | "no-timing-data"; // no point in the file carries a usable <time>

export type ValidationSeverity = "info" | "warning" | "error";

/** Reference to a point inside a segment. */
export interface PointRef {
  segmentId: SegmentId;
  pointId: PointId;
}

/** One finding of the validator (or an aggregated parse warning). */
export interface ValidationIssue {
  kind: ValidationIssueKind;
  severity: ValidationSeverity;
  message: string;
  /** Point references involved in the finding (aggregated where sensible). */
  points?: readonly PointRef[];
  /** Segments referenced by structural findings. */
  segments?: readonly SegmentId[];
}

// ---------------------------------------------------------------------------
// Gaps (§H-4)
// ---------------------------------------------------------------------------

export type GapKind = "time-gap" | "speed-anomaly" | "segment-break";

export type GapSeverity = "info" | "suspect" | "severe";

export interface GapBoundary {
  segmentId: SegmentId;
  pointId: PointId;
}

/** A candidate repair site between two adjacent recorded points. */
export interface DetectedGap {
  id: GapId;
  kind: GapKind;
  before: GapBoundary;
  after: GapBoundary;
  /** `t_after − t_before` in ms; undefined if either time is missing. */
  elapsedMs?: number;
  /** Geodesic straight-line distance between the boundary points (diagnostic). */
  impliedDistanceM?: number;
  /** Implied straight-line speed in m/s (diagnostic only). */
  impliedSpeed?: number;
  severity: GapSeverity;
  status: "new" | "in-progress" | "reconstructed" | "skipped";
}

// ---------------------------------------------------------------------------
// Reconstruction vocabulary (§G) — types only until Phase 4
// ---------------------------------------------------------------------------

/** A user-placed vertex of a reconstruction polyline. */
export interface DrawVertex {
  id: VertexId;
  lat: number;
  lon: number;
  /** Set when the vertex was snapped to an original track point. */
  snappedTo?: PointId;
}

/** How missing timestamps are distributed across a reconstruction. */
export type TimeStrategy =
  | { kind: "distance-proportional" }
  | { kind: "uniform" }
  | { kind: "manual-duration"; durationMs: number }
  | { kind: "none" };

/** User-authored repair of one gap. Small by construction (vertices+settings). */
export interface Reconstruction {
  gapId: GapId;
  vertices: DrawVertex[];
  /** Densification spacing in meters, or `'off'` to keep vertices only. */
  resampleSpacingM: number | "off";
  /** Bumped on every vertex change → derived data recomputes lazily. */
  geometryRevision: number;
  /** Settings, NOT undoable commands (§D-3.5). */
  timeStrategy: TimeStrategy;
  elevation?: {
    status: "not-fetched" | "fetching" | "complete" | "failed";
    provider?: string;
    /** Stale when ≠ `geometryRevision`. */
    fetchedAtRevision?: number;
  };
}

/** A derived reconstructed point (never authoritative; always recomputed). */
export interface ReconstructedPoint {
  source: "reconstructed";
  lat: number;
  lon: number;
  /** Original vertex, when spacing = 'off'. */
  vertexId?: VertexId;
  ele?: Estimated<number>;
  time?: Estimated<number>;
  /** Cumulative distance from the gap start, in meters. */
  cumDistanceM: number;
}

/** One entry of the ordered merged view (Phase 7 export basis). */
export interface MergedPointView {
  point: OriginalTrackPoint | ReconstructedPoint;
  /** Global sequence number in the merged view. */
  order: number;
  belongsToGap?: GapId;
}
