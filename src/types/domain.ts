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
 * Phase 14 additions (formats in & out — §EE 14):
 *   - `TrackPointMetrics` — the read-only hr/cad/watts passthrough carried by
 *     points imported from TCX/FIT (never by GPX parse; never editable).
 *   - `GpxParseError` (name kept for stability — it is the parse-error
 *     vocabulary of the whole app now) gains the non-GPX intake kinds:
 *     `unsupported-format`, `not-a-tcx-document`, `malformed-fitness-file`.
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
    | "pace-estimated" // duration derived from the file's recorded pace
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
  /**
   * Phase 14 — recorded physiology metrics from TCX/FIT import
   * (heart rate / cadence / power). Read-only passthrough: the GPX
   * parser never sets it, no editor can change it, and the KML/GeoJSON/
   * CSV exporters read it for their optional columns. The GPX re-export
   * path emits the same values through the synthesized
   * `gpxtpx:TrackPointExtension` raw capture instead.
   */
  metrics?: TrackPointMetrics;
}

/**
 * Recorded sensor channels one point can carry (Phase 14 — TCX/FIT import
 * passthrough). Kept as plain optional numbers so structured clones,
 * persistence, and the working copy need no special handling; absent for
 * GPX-parsed points and always absent on reconstructed points.
 */
export interface TrackPointMetrics {
  /** Heart rate, beats per minute. */
  hr?: number;
  /** Cadence, rpm (bike) or steps-per-minute (run). */
  cad?: number;
  /** Power, watts (cycling recorders). */
  watts?: number;
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

/**
 * Re-import recognition of our own provenance markers (§H-7, Phase 7): a
 * point whose `<extensions>` carry `<gpxr:reconstructed …/>` was inserted
 * by a previous GPX Repair Studio export. The marker is captured at parse
 * time (the verbatim extension snapshot is kept, so identity re-export
 * preserves it) and every consumer — detection, statistics, the map —
 * treats the point as reconstructed, never recorded.
 */
export interface RepairMarker {
  pointId: PointId;
  segmentId: SegmentId;
  /** Matches `Estimated<T>["method"]` of the exported timestamp, if any. */
  timeMethod?: string;
  /** Matches `Estimated<T>["method"]` of the exported elevation, if any. */
  eleMethod?: string;
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
  /**
   * Re-imported provenance markers (§H-7): present only when the file was
   * produced by a previous repair export. Empty/omitted for normal files.
   */
  repairMarkers?: readonly RepairMarker[];
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
    }
  | {
      /** Phase 14 — the bytes matched no known track-file format. */
      kind: "unsupported-format";
      /** What the sniffer saw, for the honest error copy. */
      detail: string;
    }
  | {
      /** Phase 14 — well-formed XML, but the root is not a TCX
       * `<TrainingCenterDatabase>`. */
      kind: "not-a-tcx-document";
      rootElement: string | null;
    }
  | {
      /** Phase 14 — the FIT container itself is unreadable (bad header,
       * no recoverable messages). Truncation that still yields records
       * is NOT this error — it decodes with a validation issue. */
      kind: "malformed-fitness-file";
      message: string;
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
  | "no-timing-data" // no point in the file carries a usable <time>
  | "reimported-repair" // parse: gpxr provenance markers found (info only)
  | "conversion-note"; // Phase 14: a TCX/FIT import disclosure (info only)

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

export type GapKind =
  | "time-gap"
  | "speed-anomaly"
  | "segment-break"
  | "manual"
  | "manual-insert";

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

/**
 * A user-created repair span — the always-available repair entry point
 * (detection is a helper, never a gate). Three shapes:
 *
 *   - `replace`: two recorded points picked on the map that bound a
 *     recorded stretch to redraw. The id uses the same scheme as detected
 *     gaps, so a manual span over an already-detected boundary deduplicates
 *     into that gap's editor session and reconstruction.
 *   - `insert`: ONE recorded point picked ("add missing route"); the app
 *     derived the next recorded point as the far boundary. Same id scheme,
 *     same dedupe — it behaves exactly like a replace span, only the second
 *     pick click was skipped.
 *   - `extend`: ONE recorded point picked with NO far boundary — the drawn
 *     path extends past the route's start/end (`side` records which).
 *     Open-ended: there is nothing to reconnect to. `side` also preserves
 *     route-order semantics for the merge/export phase (a "before" chain
 *     precedes its anchor in route order).
 */
export type ManualSpan =
  | {
      id: GapId;
      kind: "replace";
      /** The earlier of the two points, in document order. */
      beforePointId: PointId;
      /** The later of the two points, in document order. */
      afterPointId: PointId;
    }
  | {
      id: GapId;
      kind: "insert";
      /** The picked anchor — the earlier boundary in document order. */
      beforePointId: PointId;
      /** The derived next recorded point — the later boundary. */
      afterPointId: PointId;
    }
  | {
      id: GapId;
      kind: "extend";
      /** The picked anchor the drawn path attaches to. */
      anchorPointId: PointId;
      /** "after" = extends past the anchor (route end); "before" = the
       * drawn path precedes the anchor in route order (route start). */
      side: "after" | "before";
    };

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

/**
 * How missing timestamps are distributed across a reconstruction.
 *
 * `pace-estimated` (Task 28) is the Gap Recovery section's "the app
 * calculates it" source: the duration is the drawn distance divided by
 * the file's recorded average speed — the user never types a number.
 * It needs the path length at plan-resolution time (passed alongside
 * the file timing context), unlike the boundary-derived kinds.
 */
export type TimeStrategy =
  | { kind: "distance-proportional" }
  | { kind: "uniform" }
  | { kind: "manual-duration"; durationMs: number }
  | { kind: "pace-estimated" }
  | { kind: "none" };

/** User-authored repair of one gap. Small by construction (vertices+settings). */
export interface Reconstruction {
  gapId: GapId;
  vertices: DrawVertex[];
  /** Densification spacing in meters, or `'off'` to keep vertices only. */
  resampleSpacingM: number | "off";
  /**
   * The line's path style (Tasks 46–47): road / footpath / curve /
   * straight, remembered per line and adopted by the editor when it
   * reopens. A setting, never undoable (§D-3.5). Absent = "off".
   */
  pathStyle?: PathStyle;
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

// ---------------------------------------------------------------------------
// Road-follow legs (draw editor "snap to road")
// ---------------------------------------------------------------------------

/**
 * How the draw editor renders the path between two clicked points:
 * `"car"` follows drivable roads (public OSRM), `"foot"` follows footpaths
 * and pedestrian ways (public Valhalla), `"off"` draws straight geodesics.
 */
export type RoadFollowMode = "car" | "foot" | "off";

/**
 * The path style of a drawn line (Tasks 46–47 — what the line does
 * between clicks, remembered PER LINE): the three road-follow modes
 * plus `"curve"` — a smooth local spline through the line's points
 * (no network, nothing leaves the browser). Values stay aligned with
 * `RoadFollowMode` so the router consumes the same strings.
 *
 * User pass 48: `"curve"` is no longer offered by the path-style chips
 * — it is the Curve PEN's doing. A freehand stroke committed while the
 * line is local (`"off"`) flips the line to `"curve"` so the spline
 * smooths it; Roads/Footpaths keep the routed geometry instead.
 */
export type PathStyle = RoadFollowMode | "curve";

/**
 * What the pointer does over the map while a draw session is open
 * (Task 45 — the explicit three-way pointer toggle):
 *
 *  - `"draw"` — clicks place points (the classic Draw; map panning is
 *    disabled so a drag never fights a click). With the Curve pen
 *    (user pass 48) a press-drag captures a freehand stroke instead;
 *  - `"move"` — clicks place nothing; every placed point grows into an
 *    oversized grab target and drags freely (each release = one undo
 *    step). Empty-space drags still pan the map. This is the ONLY mode
 *    where dragging a placed point works (user pass 48 — in Draw the
 *    pencil adds, it never edits);
 *  - `"pan"` — normal map navigation.
 */
export type PointerMode = "draw" | "move" | "pan";

/**
 * The DRAW-mode pen (user pass 48 — curve is a pen, not a path style):
 *
 *  - `"default"` — the classic pencil: click to place points one by
 *    one, straight/routed legs between them (what the app always did);
 *  - `"curve"` — freehand: press and DRAG the pen across the map; the
 *    captured trace is simplified into the line's next points and
 *    smoothed locally when the line is straight (nothing leaves the
 *    browser). A quick tap still places a single point.
 *
 * The pen decides HOW points are captured; the per-line path style
 * (Roads / Footpaths / Straight) still decides what happens between
 * them — any pen × any style combination is valid.
 */
export type PenMode = "default" | "curve";

/**
 * One road-followed leg of a drawn chain: the road geometry the routing
 * service returned for the node pair (`a` → `b`). Derived, network-resolved
 * data — kept in a store side table keyed by gap id, NEVER inside the
 * undoable `Reconstruction` (§D-3: derived data is never stored as truth).
 * `coordinates` are `[lon, lat]` in GeoJSON order, `a` → `b`; the provider
 * snaps waypoints onto the road, so the first/last points can sit a few
 * meters off `a`/`b` — consumers stitch the exact nodes around the interior.
 */
export interface RoadLeg {
  a: LatLon;
  b: LatLon;
  /** `[lon, lat]` road geometry, provider-snapped endpoints included. */
  coordinates: [number, number][];
  /** Route length reported by the provider (meters) — diagnostic only. */
  routeDistanceM: number;
}

/** One entry of the ordered merged view (Phase 7 export basis). */
export interface MergedPointView {
  point: OriginalTrackPoint | ReconstructedPoint;
  /** Global sequence number in the merged view. */
  order: number;
  belongsToGap?: GapId;
}

// ---------------------------------------------------------------------------
// Deep validation & the working copy (Phase 13 — §EE 13.1/13.2)
// ---------------------------------------------------------------------------

/**
 * Why a working-copy edit exists — the honesty trail every fix carries
 * into the export note and the change log. Phase 16 adds the surgery
 * reasons (manual geometry control, §EE 16.1).
 */
export type FixReason =
  | "spike" // a teleport leg's point removed
  | "duplicate" // a near-duplicate point removed (keep-first)
  | "drift" // a stop-and-wander GPS-drift run collapsed
  | "sort" // a segment reordered by timestamp (order is estimated)
  | "elevation" // an outlying elevation replaced by interpolation
  | "thin" // a dense recording decimated to a minimum spacing
  | "split" // a segment cut in two at a picked point (Phase 16)
  | "range" // a manual A–B stretch of points deleted (Phase 16)
  | "reorder" // segments rearranged by hand (Phase 16)
  | "copy"; // a segment duplicated (Phase 16)

/**
 * One override of the immutable original (§EE 13.2). Entries are the
 * atomic units; a `WorkingEdit` groups the entries of ONE confirmed fix
 * so undo removes exactly what the user approved.
 */
export type WorkingEditEntry =
  | { kind: "point-deletion"; pointId: PointId }
  | { kind: "segment-sort"; segmentId: SegmentId }
  | {
      kind: "elevation-override";
      pointId: PointId;
      /** The replacement elevation, meters. */
      ele: number;
      /** How the replacement was derived (exported as `eleMethod`). */
      method: Estimated<number>["method"];
      /** The recorded elevation it replaces, when there was one. */
      originalEle?: number;
    }
  /** Phase 16 — split a segment AFTER this point: the following points
   * move to a derived segment (`{segmentId}~s{n}`) in the same track;
   * point ids stay original-parse-stable, so later edits and gap anchors
   * keep resolving. No-op when the point is the segment's last. */
  | { kind: "segment-split"; segmentId: SegmentId; atPointId: PointId }
  /** Phase 16 — insert a copy of the segment right after it (same
   * track). The copy's point ids are rewritten to `{derivedId}:{i}` so
   * later edits can address them without aliasing the source points;
   * segment extras (vendor children) are NOT copied — disclosed in the
   * preview. */
  | { kind: "segment-duplicate"; segmentId: SegmentId }
  /** Phase 16 — the new segment order (a permutation of the ids that
   * exist when this entry replays; within-track moves only — the track
   * structure is never crossed). One entry = one rearrangement = one
   * undo step. */
  | { kind: "segment-order"; order: readonly SegmentId[] };

/** One user-confirmed fix on the working copy — one undo step. */
export interface WorkingEdit {
  /** Deterministic id: `fix/{seq}` allocated by the working store. */
  id: string;
  /** Human label for the change log, e.g. "Remove 4 speed spikes". */
  label: string;
  reason: FixReason;
  /** Epoch ms when the fix was confirmed. */
  appliedAt: number;
  entries: readonly WorkingEditEntry[];
}

/**
 * A recorded point as the working copy holds it: identical to the
 * original except an elevation replaced by a fix (§EE 13.2 "smoothing").
 * `ele` is the OVERRIDDEN value (every consumer sees the fix); the
 * verbatim `raw` capture and `workingEle` keep the provenance.
 */
export interface WorkingTrackPoint extends OriginalTrackPoint {
  /** Present only when a fix replaced this point's elevation. */
  workingEle?: {
    /** The replacement value (mirrors `ele`). */
    ele: number;
    /** How the replacement was derived (export marker). */
    method: Estimated<number>["method"];
    /** The recorded elevation it replaced, when there was one. */
    originalEle?: number;
  };
}

/** What the working layer changed, for honest stat labels. */
export interface WorkingMeta {
  /** Points removed from the working view (all reasons). */
  deletedPointCount: number;
  /** Segments reordered by timestamp. */
  sortedSegmentIds: readonly SegmentId[];
  /** Elevations replaced by interpolation. */
  overriddenEleCount: number;
  /** Segments cut in two (Phase 16 surgery). */
  splitCount: number;
  /** Segment copies inserted (Phase 16 surgery). */
  duplicatedSegmentCount: number;
  /** Manual segment rearrangements applied (Phase 16 surgery). */
  reorderedSegmentCount: number;
  /** True when at least one edit exists. */
  hasEdits: boolean;
}

/** A working-copy view of the file: original-shaped, edits applied. */
export interface WorkingTrackData extends OriginalTrackData {
  segments: readonly (Omit<OriginalSegment, "points"> & {
    points: readonly WorkingTrackPoint[];
  })[];
  /** Edit bookkeeping; absent/empty for a pristine copy. */
  working?: WorkingMeta;
}

/** Deep-check issue kinds (§EE 13.1) — the fixable recording damage. */
export type DeepIssueKind =
  | "speed-spike" // implied leg speed above the (high) teleport threshold
  | "duplicate-cluster" // near-duplicate points (< radius within a window)
  | "non-monotonic-time" // backwards time transitions
  | "elevation-outlier" // step/z-score elevation damage
  | "gps-drift" // sustained sub-threshold scatter (stop-and-wander)
  | "missing-elevation"; // runs of points without <ele>

export type DeepIssueSeverity = "error" | "warning" | "info";

/** One deep-check finding, aggregated per kind (bounded output). */
export interface DeepIssue {
  kind: DeepIssueKind;
  severity: DeepIssueSeverity;
  /** Occurrences folded into this issue (legs, transitions, points). */
  count: number;
  message: string;
  /** The points involved, in document order (the textual list basis). */
  points: readonly PointRef[];
  /** Segments involved (whole-segment findings). */
  segments?: readonly SegmentId[];
}

/** The deep validation report over one (working) model. */
export interface DeepReport {
  issues: readonly DeepIssue[];
  /** Total occurrences across issues (0 = clean). */
  totalCount: number;
}

/** The one-click fixes (§EE 13.4). */
export type FixKind =
  | "remove-spikes"
  | "dedupe"
  | "sort-by-time"
  | "smooth-elevations"
  | "remove-drift"
  | "thin";

/** The named preset bundles (§EE 13.5). */
export type PresetId =
  | "drift-cleanup"
  | "dedupe-sort"
  | "resample-thin"
  | "spike-sweep";

/** The manual surgery operations (§EE 16.1) — planned like fixes. */
export type SurgeryKind =
  | "split-segment"
  | "delete-range"
  | "duplicate-segment"
  | "reorder-segments";

/** A planned fix: what would change, before anything does. */
export interface FixPlan {
  /** Which fix / preset / surgery op produced the plan. */
  kind: FixKind | PresetId | SurgeryKind;
  label: string;
  /** The entries applying the plan would write. */
  entries: readonly WorkingEditEntry[];
  /** The points the plan touches (jump/preview list). */
  points: readonly PointRef[];
  /** What-would-change lines for the preview dialog. */
  summary: readonly string[];
}
