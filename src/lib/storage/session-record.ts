/**
 * Session records (Phase 10) — the pure capture/validate/hydrate layer of
 * crash/reload recovery. No storage, no stores, no DOM: this module turns
 * plain store-state slices into small serializable records and back, so
 * `lib/storage/sessionStore.ts` only ever moves bytes and
 * `hooks/use-session-recovery.ts` only ever orchestrates.
 *
 * Schema v1 — one discriminated union over the four drawing-bearing
 * sections (merge excluded by the Phase 10 decision gate):
 *
 *   - "file" (repair + recovery): the original file lives in the sibling
 *     `files` store as a blob; this record carries the repair work —
 *     per-gap reconstructions (vertices + settings), skip marks, manual
 *     spans, the file-level timing fallback, the gap thresholds the gaps
 *     were detected with, and the resolved road legs.
 *   - "create": the confirmed statistics + the drawn route + its settings.
 *   - "plan": the drawn route + the entered goal time.
 *
 * Deliberately NOT recorded (documented honesty, not omission):
 *   - undo/redo history — the stack spans one editor session by design;
 *   - elevation fetch status — opt-in network data, re-fetchable in one
 *     click, and the fetched POINTS live in the elevation store's own
 *     cache, never in the record (the payload stays small);
 *   - transient aids (pointer mode, pen, snap) — interaction, not work;
 *   - views (repair/share, studio/share) — a view is not work;
 *   - road-routing status (pending/failed) — re-derived on demand.
 *
 * Road legs ARE recorded: committed routed lines render and distance
 * from the side table, so without them a restored "Roads" line would
 * draw straight until its editor reopened. The restore path also seeds
 * the router cache from them — zero new routing requests, WYSIWYG.
 *
 * Identity rules that make restore safe: point ids and gap ids are
 * deterministic per document position (types/ids.ts), so re-parsing the
 * stored bytes re-detects the same gaps and every reconstruction and
 * manual span re-adopts its target. Vertices keep their ids; the
 * vertex-id allocator is re-armed to the highest stored sequence.
 *
 * Phase 10 — Session Recovery. Pure TypeScript.
 */

import type { GapThresholds } from "@/features/gpx/detectGaps";
import type { ActivityStats } from "@/features/create/stats";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import type {
  DrawVertex,
  GapId,
  ManualSpan,
  PathStyle,
  Reconstruction,
  RoadLeg,
  TimeStrategy,
  WorkingEdit,
} from "@/types/domain";

/**
 * Bump when the record shape changes; add a migration in readSessionRecord.
 *
 * v2 (Phase 13): file records gain `workingEdits` — the confirmed
 * deep-validation fix log of the repair section's working copy. v1
 * records migrate by defaulting it to an empty log (no fixes were
 * possible then); create/plan records are shape-identical across the
 * bump (only the version number moved).
 */
export const SESSION_RECORD_SCHEMA_VERSION = 2;

/** The read-side ceiling: newer records than this are discarded, never guessed. */
const MAX_READABLE_SCHEMA_VERSION = SESSION_RECORD_SCHEMA_VERSION;

// ---------------------------------------------------------------------------
// Stored shapes (exactly what IndexedDB holds)
// ---------------------------------------------------------------------------

/** A reconstruction minus its elevation status (see the module header). */
export interface StoredReconstruction {
  gapId: string;
  vertices: DrawVertex[];
  resampleSpacingM: number | "off";
  pathStyle?: PathStyle;
  geometryRevision: number;
  timeStrategy: TimeStrategy;
}

/** A stored working-copy edit (Phase 13) — the plain-JSON twin of `WorkingEdit`. */
export type StoredWorkingEdit = WorkingEdit;

/** Repair/recovery work — the file bytes sit beside it in the `files` store. */
export interface StoredFileSession {
  schemaVersion: typeof SESSION_RECORD_SCHEMA_VERSION;
  kind: "file";
  section: "repair" | "recovery";
  savedAt: number;
  fileName: string;
  gapThresholds: GapThresholds;
  reconstructions: Record<string, StoredReconstruction>;
  skippedGapIds: string[];
  manualSpans: ManualSpan[];
  fileTiming: FileTimingContext;
  roadLegs: Record<string, RoadLeg[]>;
  /**
   * The working-copy fix log (Phase 13) — empty for the recovery
   * section (it has no working copy) and for pre-v2 records.
   */
  workingEdits: StoredWorkingEdit[];
}

/** The create-from-stats session (no file in, one drawn route). */
export interface StoredCreateSession {
  schemaVersion: typeof SESSION_RECORD_SCHEMA_VERSION;
  kind: "create";
  section: "create";
  savedAt: number;
  stats: ActivityStats;
  reconstruction: StoredReconstruction;
  roadLegs: RoadLeg[];
  spacingM: number | "off";
  matchDistance: boolean;
  phase: "draw" | "review";
}

/** The plan-a-route scratchpad (no file, no export). */
export interface StoredPlanSession {
  schemaVersion: typeof SESSION_RECORD_SCHEMA_VERSION;
  kind: "plan";
  section: "plan";
  savedAt: number;
  plannedTimeMs: number | null;
  reconstruction: StoredReconstruction;
  roadLegs: RoadLeg[];
}

export type StoredSessionRecord =
  | StoredFileSession
  | StoredCreateSession
  | StoredPlanSession;

// ---------------------------------------------------------------------------
// Capture inputs (structural — the stores satisfy these without importing)
// ---------------------------------------------------------------------------

/** What the hook reads out of a repair or recovery session for capture. */
export interface FileSessionCapture {
  section: "repair" | "recovery";
  fileName: string;
  gapThresholds: GapThresholds;
  reconstructions: Readonly<Record<string, Reconstruction>>;
  skippedGapIds: readonly GapId[];
  manualSpans: readonly ManualSpan[];
  fileTiming: FileTimingContext;
  roadLegs: Readonly<Record<string, readonly RoadLeg[]>>;
  /** The working-copy fix log (Phase 13; recovery passes []). */
  workingEdits: readonly WorkingEdit[];
}

/** What the hook reads out of the create session for capture. */
export interface CreateSessionCapture {
  stats: ActivityStats;
  reconstruction: Reconstruction;
  roadLegs: readonly RoadLeg[];
  spacingM: number | "off";
  matchDistance: boolean;
  phase: "draw" | "review";
}

/** What the hook reads out of the plan session for capture. */
export interface PlanSessionCapture {
  plannedTimeMs: number | null;
  reconstruction: Reconstruction;
  roadLegs: readonly RoadLeg[];
}

// ---------------------------------------------------------------------------
// Hydration outputs (what each store's hydrate action consumes)
// ---------------------------------------------------------------------------

/** Repair/recovery store patch after the stored file re-parsed cleanly. */
export interface FileSessionHydration {
  reconstructions: Record<string, Reconstruction>;
  skippedGapIds: GapId[];
  manualSpans: ManualSpan[];
  fileTiming: FileTimingContext;
  roadLegs: Record<string, RoadLeg[]>;
  /** The vertex-id allocator re-armed to the highest stored sequence. */
  vertexSeq: number;
  /** The working-copy fix log (Phase 13) — [] for recovery/pre-v2 records. */
  workingEdits: WorkingEdit[];
}

/** Create store patch. */
export interface CreateSessionHydration {
  stats: ActivityStats;
  reconstruction: Reconstruction;
  roadLegs: RoadLeg[];
  spacingM: number | "off";
  matchDistance: boolean;
  phase: "draw" | "review";
  vertexSeq: number;
}

/** Plan store patch. */
export interface PlanSessionHydration {
  plannedTimeMs: number | null;
  reconstruction: Reconstruction;
  roadLegs: RoadLeg[];
  vertexSeq: number;
}

// ---------------------------------------------------------------------------
// Capture (state → record)
// ---------------------------------------------------------------------------

function captureReconstruction(recon: Reconstruction): StoredReconstruction {
  // Elevation status is dropped by design (module header); everything the
  // user authored — vertices, spacing, style, strategy — is kept verbatim.
  // The path style is NORMALIZED: the stores leave it undefined until the
  // user switches chips (the default "car" is never written), and the
  // restore path needs a mode to key the router-cache seed. "car" is the
  // exact value a reloaded editor would adopt anyway (openEditor's
  // `existing?.pathStyle ?? state.pathStyle` with the chip reset), so the
  // normalization is behavior-identical — it just makes the record say
  // what the session meant.
  const stored: StoredReconstruction = {
    gapId: recon.gapId,
    vertices: recon.vertices,
    resampleSpacingM: recon.resampleSpacingM,
    geometryRevision: recon.geometryRevision,
    timeStrategy: recon.timeStrategy,
    pathStyle: recon.pathStyle ?? "car",
  };
  return stored;
}

/** Capture a repair/recovery session's work (pure; caller stamps savedAt). */
export function captureFileSession(
  capture: FileSessionCapture,
  savedAt: number,
): StoredFileSession {
  const reconstructions: Record<string, StoredReconstruction> = {};
  for (const [gapId, recon] of Object.entries(capture.reconstructions)) {
    reconstructions[gapId] = captureReconstruction(recon);
  }
  const roadLegs: Record<string, RoadLeg[]> = {};
  for (const [gapId, legs] of Object.entries(capture.roadLegs)) {
    if (legs.length > 0) roadLegs[gapId] = [...legs];
  }
  return {
    schemaVersion: SESSION_RECORD_SCHEMA_VERSION,
    kind: "file",
    section: capture.section,
    savedAt,
    fileName: capture.fileName,
    gapThresholds: { ...capture.gapThresholds },
    reconstructions,
    skippedGapIds: [...capture.skippedGapIds],
    manualSpans: capture.manualSpans.map((span) => ({ ...span })),
    fileTiming: { ...capture.fileTiming },
    roadLegs,
    workingEdits: capture.workingEdits.map((edit) => ({
      ...edit,
      entries: edit.entries.map((entry) => ({ ...entry })),
    })),
  };
}

/** Capture the create session (pure; caller stamps savedAt). */
export function captureCreateSession(
  capture: CreateSessionCapture,
  savedAt: number,
): StoredCreateSession {
  return {
    schemaVersion: SESSION_RECORD_SCHEMA_VERSION,
    kind: "create",
    section: "create",
    savedAt,
    stats: { ...capture.stats },
    reconstruction: captureReconstruction(capture.reconstruction),
    roadLegs: [...capture.roadLegs],
    spacingM: capture.spacingM,
    matchDistance: capture.matchDistance,
    phase: capture.phase,
  };
}

/** Capture the plan session (pure; caller stamps savedAt). */
export function capturePlanSession(
  capture: PlanSessionCapture,
  savedAt: number,
): StoredPlanSession {
  return {
    schemaVersion: SESSION_RECORD_SCHEMA_VERSION,
    kind: "plan",
    section: "plan",
    savedAt,
    plannedTimeMs: capture.plannedTimeMs,
    reconstruction: captureReconstruction(capture.reconstruction),
    roadLegs: [...capture.roadLegs],
  };
}

// ---------------------------------------------------------------------------
// Hydration (record → store patch)
// ---------------------------------------------------------------------------

/**
 * Re-arm the vertex-id allocator: the highest `v{N}` sequence across every
 * stored vertex, floored by the vertex count (hand-crafted ids in a foreign
 * record must never make future ids collide with restored ones).
 */
export function rearmVertexSeq(
  recons: readonly { vertices: readonly DrawVertex[] }[],
): number {
  let max = 0;
  let count = 0;
  for (const recon of recons) {
    for (const vertex of recon.vertices) {
      count += 1;
      const match = /^v(\d+)$/.exec(vertex.id);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return Math.max(max, count);
}

function hydrateReconstruction(stored: StoredReconstruction): Reconstruction {
  // Elevation restarts honestly at "not fetched" — the record deliberately
  // carries no fetched points (module header).
  return {
    gapId: stored.gapId as GapId,
    vertices: stored.vertices,
    resampleSpacingM: stored.resampleSpacingM,
    geometryRevision: stored.geometryRevision,
    timeStrategy: stored.timeStrategy,
    ...(stored.pathStyle !== undefined ? { pathStyle: stored.pathStyle } : {}),
    elevation: { status: "not-fetched" },
  };
}

/** Build the repair/recovery store patch from a validated record. */
export function hydrateFileSession(
  record: StoredFileSession,
): FileSessionHydration {
  const reconstructions: Record<string, Reconstruction> = {};
  for (const [gapId, stored] of Object.entries(record.reconstructions)) {
    reconstructions[gapId] = hydrateReconstruction(stored);
  }
  return {
    reconstructions,
    skippedGapIds: record.skippedGapIds.map((id) => id as GapId),
    manualSpans: record.manualSpans.map((span) => ({ ...span })),
    fileTiming: { ...record.fileTiming },
    roadLegs: Object.fromEntries(
      Object.entries(record.roadLegs).map(([gapId, legs]) => [gapId, [...legs]]),
    ),
    vertexSeq: rearmVertexSeq(Object.values(record.reconstructions)),
    workingEdits: record.workingEdits.map((edit) => ({
      ...edit,
      entries: edit.entries.map((entry) => ({ ...entry })),
    })),
  };
}

/** Build the create store patch from a validated record. */
export function hydrateCreateSession(
  record: StoredCreateSession,
): CreateSessionHydration {
  return {
    stats: { ...record.stats },
    reconstruction: hydrateReconstruction(record.reconstruction),
    roadLegs: [...record.roadLegs],
    spacingM: record.spacingM,
    matchDistance: record.matchDistance,
    phase: record.phase,
    vertexSeq: rearmVertexSeq([record.reconstruction]),
  };
}

/** Build the plan store patch from a validated record. */
export function hydratePlanSession(
  record: StoredPlanSession,
): PlanSessionHydration {
  return {
    plannedTimeMs: record.plannedTimeMs,
    reconstruction: hydrateReconstruction(record.reconstruction),
    roadLegs: [...record.roadLegs],
    vertexSeq: rearmVertexSeq([record.reconstruction]),
  };
}

// ---------------------------------------------------------------------------
// Validation + migration (raw → record | null)
// ---------------------------------------------------------------------------

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isFiniteLatLon = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  isFiniteNumber((value as { lat: number }).lat) &&
  isFiniteNumber((value as { lon: number }).lon) &&
  Math.abs((value as { lat: number }).lat) <= 90 &&
  Math.abs((value as { lon: number }).lon) <= 180;

function isDrawVertex(value: unknown): value is DrawVertex {
  if (typeof value !== "object" || value === null) return false;
  const vertex = value as Record<string, unknown>;
  if (typeof vertex.id !== "string" || !isFiniteLatLon(vertex)) return false;
  const snapped = vertex.snappedTo;
  return snapped === undefined || typeof snapped === "string";
}

function isTimeStrategy(value: unknown): value is TimeStrategy {
  if (typeof value !== "object" || value === null) return false;
  const strategy = value as Record<string, unknown>;
  switch (strategy.kind) {
    case "distance-proportional":
    case "uniform":
    case "pace-estimated":
    case "none":
      return true;
    case "manual-duration":
      return isFiniteNumber(strategy.durationMs) && strategy.durationMs > 0;
    default:
      return false;
  }
}

function isStoredReconstruction(value: unknown): value is StoredReconstruction {
  if (typeof value !== "object" || value === null) return false;
  const recon = value as Record<string, unknown>;
  if (
    typeof recon.gapId !== "string" ||
    !Array.isArray(recon.vertices) ||
    !recon.vertices.every(isDrawVertex) ||
    !(recon.resampleSpacingM === "off" || isFiniteNumber(recon.resampleSpacingM)) ||
    !isFiniteNumber(recon.geometryRevision) ||
    !isTimeStrategy(recon.timeStrategy)
  ) {
    return false;
  }
  const style = recon.pathStyle;
  return (
    style === undefined ||
    style === "car" ||
    style === "foot" ||
    style === "off" ||
    style === "curve"
  );
}

function isRoadLeg(value: unknown): value is RoadLeg {
  if (typeof value !== "object" || value === null) return false;
  const leg = value as Record<string, unknown>;
  if (!isFiniteLatLon(leg.a) || !isFiniteLatLon(leg.b)) return false;
  if (!Array.isArray(leg.coordinates)) return false;
  for (const coord of leg.coordinates) {
    if (
      !Array.isArray(coord) ||
      coord.length < 2 ||
      !isFiniteNumber(coord[0]) ||
      !isFiniteNumber(coord[1])
    ) {
      return false;
    }
  }
  return isFiniteNumber(leg.routeDistanceM) && leg.routeDistanceM >= 0;
}

function isManualSpan(value: unknown): value is ManualSpan {
  if (typeof value !== "object" || value === null) return false;
  const span = value as Record<string, unknown>;
  if (typeof span.id !== "string") return false;
  switch (span.kind) {
    case "replace":
    case "insert":
      return (
        typeof span.beforePointId === "string" &&
        typeof span.afterPointId === "string"
      );
    case "extend":
      return (
        typeof span.anchorPointId === "string" &&
        (span.side === "after" || span.side === "before")
      );
    default:
      return false;
  }
}

function isFileTiming(value: unknown): value is FileTimingContext {
  if (typeof value !== "object" || value === null) return false;
  const timing = value as Record<string, unknown>;
  return (
    (timing.startMs === null || isFiniteNumber(timing.startMs)) &&
    (timing.totalDurationMs === null || isFiniteNumber(timing.totalDurationMs))
  );
}

function isGapThresholds(value: unknown): value is GapThresholds {
  if (typeof value !== "object" || value === null) return false;
  const thresholds = value as Record<string, unknown>;
  return (
    isFiniteNumber(thresholds.timeGapMs) &&
    isFiniteNumber(thresholds.speedAnomalyKmh) &&
    isFiniteNumber(thresholds.speedDtGuardMs)
  );
}

function isActivityStats(value: unknown): value is ActivityStats {
  if (typeof value !== "object" || value === null) return false;
  const stats = value as Record<string, unknown>;
  return (
    isFiniteNumber(stats.distanceM) &&
    isFiniteNumber(stats.durationMs) &&
    isFiniteNumber(stats.paceMsPerKm) &&
    isFiniteNumber(stats.startMs)
  );
}

function isRoadLegRecord(
  value: unknown,
): value is Record<string, RoadLeg[]> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(
    (legs) => Array.isArray(legs) && legs.every(isRoadLeg),
  );
}

/** The valid `FixReason` vocabulary (kept in lockstep with the domain). */
const FIX_REASONS = new Set([
  "spike",
  "duplicate",
  "drift",
  "sort",
  "elevation",
  "thin",
  "split",
  "range",
  "reorder",
  "copy",
]);

/** Structural check of one stored working-copy edit (Phase 13 v2;
 * Phase 16 adds the surgery entry kinds — an older build rejects
 * them with the whole record, the documented "discard, never guess"
 * downgrade rule). */
function isWorkingEdit(value: unknown): value is StoredWorkingEdit {
  if (typeof value !== "object" || value === null) return false;
  const edit = value as Record<string, unknown>;
  if (typeof edit.id !== "string" || edit.id.length === 0) return false;
  if (typeof edit.label !== "string") return false;
  if (typeof edit.reason !== "string" || !FIX_REASONS.has(edit.reason)) {
    return false;
  }
  if (!isFiniteNumber(edit.appliedAt)) return false;
  if (!Array.isArray(edit.entries) || edit.entries.length === 0) return false;
  return edit.entries.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (e.kind === "point-deletion") {
      return typeof e.pointId === "string" && e.pointId.length > 0;
    }
    if (e.kind === "segment-sort") {
      return typeof e.segmentId === "string" && e.segmentId.length > 0;
    }
    if (e.kind === "elevation-override") {
      return (
        typeof e.pointId === "string" &&
        e.pointId.length > 0 &&
        isFiniteNumber(e.ele) &&
        (e.originalEle === undefined || isFiniteNumber(e.originalEle))
      );
    }
    if (e.kind === "segment-split") {
      return (
        typeof e.segmentId === "string" &&
        e.segmentId.length > 0 &&
        typeof e.atPointId === "string" &&
        e.atPointId.length > 0
      );
    }
    if (e.kind === "segment-duplicate") {
      return typeof e.segmentId === "string" && e.segmentId.length > 0;
    }
    if (e.kind === "segment-order") {
      return (
        Array.isArray(e.order) &&
        e.order.length > 0 &&
        e.order.every((id) => typeof id === "string" && id.length > 0)
      );
    }
    return false;
  });
}

/**
 * Validate (and migrate) one raw stored value into a typed record. Null
 * for anything this build does not recognize — including NEWER schema
 * versions (an app downgrade must discard, never guess) — so a corrupt
 * or foreign row can never reach a store.
 */
export function readSessionRecord(raw: unknown): StoredSessionRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const version = record.schemaVersion;
  if (
    !isFiniteNumber(version) ||
    version < 1 ||
    version > MAX_READABLE_SCHEMA_VERSION
  ) {
    return null;
  }
  if (!isFiniteNumber(record.savedAt)) return null;

  // -- migrations: coerce older shapes to the current version first ------
  if (version === 1) {
    // v1 → v2 (Phase 13): file records gain the working-copy fix log.
    // No v1 session could hold fixes — the honest default is an empty
    // log. Create/plan records are shape-identical across the bump.
    if (record.kind === "file" && record.workingEdits === undefined) {
      record.workingEdits = [];
    }
    record.schemaVersion = SESSION_RECORD_SCHEMA_VERSION;
  }

  if (record.kind === "file") {
    if (record.section !== "repair" && record.section !== "recovery") {
      return null;
    }
    if (typeof record.fileName !== "string" || !isGapThresholds(record.gapThresholds)) {
      return null;
    }
    if (!isFileTiming(record.fileTiming)) return null;
    if (
      !Array.isArray(record.skippedGapIds) ||
      !record.skippedGapIds.every((id) => typeof id === "string") ||
      !Array.isArray(record.manualSpans) ||
      !record.manualSpans.every(isManualSpan)
    ) {
      return null;
    }
    if (typeof record.reconstructions !== "object" || record.reconstructions === null) {
      return null;
    }
    if (
      !Object.entries(record.reconstructions).every(
        ([, recon]) =>
          isStoredReconstruction(recon) &&
          (recon as StoredReconstruction).gapId.length > 0,
      )
    ) {
      return null;
    }
    if (!isRoadLegRecord(record.roadLegs)) return null;
    if (
      !Array.isArray(record.workingEdits) ||
      !record.workingEdits.every(isWorkingEdit)
    ) {
      return null;
    }
    return record as unknown as StoredFileSession;
  }

  if (record.kind === "create") {
    if (record.section !== "create") return null;
    if (!isActivityStats(record.stats)) return null;
    if (!isStoredReconstruction(record.reconstruction)) return null;
    if (!Array.isArray(record.roadLegs) || !record.roadLegs.every(isRoadLeg)) {
      return null;
    }
    if (!(record.spacingM === "off" || isFiniteNumber(record.spacingM))) {
      return null;
    }
    if (typeof record.matchDistance !== "boolean") return null;
    if (record.phase !== "draw" && record.phase !== "review") return null;
    return record as unknown as StoredCreateSession;
  }

  if (record.kind === "plan") {
    if (record.section !== "plan") return null;
    if (
      record.plannedTimeMs !== null &&
      !isFiniteNumber(record.plannedTimeMs)
    ) {
      return null;
    }
    if (!isStoredReconstruction(record.reconstruction)) return null;
    if (!Array.isArray(record.roadLegs) || !record.roadLegs.every(isRoadLeg)) {
      return null;
    }
    return record as unknown as StoredPlanSession;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Prompt description (record → display row)
// ---------------------------------------------------------------------------

/** One restorable session as the prompt renders it. */
export interface SessionRecordDescriptor {
  section: "repair" | "recovery" | "create" | "plan";
  savedAt: number;
  /** Primary line — the file name, or the route's shape. */
  label: string;
  /** Secondary line — what work would come back. */
  detail: string;
}

function describeVertices(count: number): string {
  return count === 1 ? "1 point" : `${count} points`;
}

/** Derive the prompt's display row from a validated record (pure). */
export function describeSessionRecord(
  record: StoredSessionRecord,
): SessionRecordDescriptor {
  const base = { section: record.section, savedAt: record.savedAt };
  if (record.kind === "file") {
    const drawn = Object.values(record.reconstructions).filter(
      (recon) => recon.vertices.length > 0,
    );
    const vertices = drawn.reduce(
      (total, recon) => total + recon.vertices.length,
      0,
    );
    const extras: string[] = [];
    if (record.manualSpans.length > 0) {
      extras.push(
        record.manualSpans.length === 1
          ? "1 manual span"
          : `${record.manualSpans.length} manual spans`,
      );
    }
    if (record.skippedGapIds.length > 0) {
      extras.push(
        record.skippedGapIds.length === 1
          ? "1 skipped gap"
          : `${record.skippedGapIds.length} skipped gaps`,
      );
    }
    // Phase 13: confirmed deep-validation fixes are work too — the
    // prompt's detail line says they would come back.
    if (record.workingEdits.length > 0) {
      const removed = record.workingEdits.reduce(
        (total, edit) =>
          total +
          edit.entries.filter((entry) => entry.kind === "point-deletion")
            .length,
        0,
      );
      const others = record.workingEdits.length;
      extras.push(
        others === 1
          ? removed > 0
            ? `1 fix (${removed} points)`
            : "1 fix"
          : `${others} fixes${removed > 0 ? ` (${removed} points)` : ""}`,
      );
    }
    const detailParts = [
      `${describeVertices(vertices)} drawn`,
      ...extras,
    ];
    return {
      ...base,
      label: record.fileName,
      detail: detailParts.join(" · "),
    };
  }
  if (record.kind === "create") {
    return {
      ...base,
      label: "Activity from stats",
      detail: `${describeVertices(record.reconstruction.vertices.length)} drawn · ${(
        record.stats.distanceM / 1000
      ).toFixed(1)} km entered`,
    };
  }
  return {
    ...base,
    label: "Route plan",
    detail: `${describeVertices(record.reconstruction.vertices.length)} drawn`,
  };
}
