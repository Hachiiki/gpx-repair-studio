/**
 * The stored segment record — Phase 25.2 (docs/plans/v3/
 * phase-25-heatmap-personal-segments.md): one user-authored segment
 * plus its persisted efforts.
 *
 * The segment itself is USER data (like a named session — it survives
 * the deletion of the session it was drawn from; its geometry is its
 * own). The efforts block is DERIVED data under the one-derivation
 * rule: recomputed from the stored shelf through the real
 * parse → merge → match path whenever the shelf fingerprint or the
 * matcher version drifts, never patched in place — the same
 * "the record is the truth, the index is its shadow" contract the
 * library store (§24.4) runs on.
 *
 * Shape is versioned like every stored record; reads keep a ceiling —
 * discard, never guess.
 *
 * Phase 25 — Heatmap & personal segments. Pure TypeScript.
 */

import {
  personalRecord,
  sortEffortRows,
  type SegmentEffortRow,
} from "@/features/segments/matcher";

/** Bump when the row shape changes; the read side keeps a ceiling. */
export const SEGMENT_SCHEMA_VERSION = 1;

/** How the segment's anchors were authored (disclosed in the UI). */
export type SegmentSource = "stretch" | "drawn";

/** The persisted efforts block (derived, fingerprint-gated). */
export interface SegmentEfforts {
  /** The shelf fingerprint the rows were computed under. */
  fingerprint: string;
  /** When the pass finished (epoch ms) — the "as of" disclosure. */
  computedAt: number;
  rows: readonly SegmentEffortRow[];
}

/** One stored segment (exactly what IndexedDB holds). */
export interface SegmentRow {
  schemaVersion: typeof SEGMENT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: number;
  source: SegmentSource;
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  /** Along-track length at creation (the matcher's reference window). */
  lengthM: number;
  efforts?: SegmentEfforts;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readLatLon(
  value: unknown,
): { lat: number; lon: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw.lat) || !isFiniteNumber(raw.lon)) return null;
  return { lat: raw.lat, lon: raw.lon };
}

function readEffortRow(value: unknown): SegmentEffortRow | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.sessionId !== "string") return null;
  if (typeof raw.sessionName !== "string") return null;
  if (
    raw.activityStartMs !== null &&
    !isFiniteNumber(raw.activityStartMs)
  ) {
    return null;
  }
  if (!isFiniteNumber(raw.elapsedMs) || !(raw.elapsedMs > 0)) return null;
  if (typeof raw.reconstructed !== "boolean") return null;
  return {
    sessionId: raw.sessionId,
    sessionName: raw.sessionName,
    activityStartMs: raw.activityStartMs as number | null,
    elapsedMs: raw.elapsedMs,
    reconstructed: raw.reconstructed,
  };
}

function readEfforts(value: unknown): SegmentEfforts | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.fingerprint !== "string") return null;
  if (!isFiniteNumber(raw.computedAt)) return null;
  if (!Array.isArray(raw.rows)) return null;
  const rows: SegmentEffortRow[] = [];
  for (const entry of raw.rows) {
    const row = readEffortRow(entry);
    if (row === null) return null;
    rows.push(row);
  }
  return {
    fingerprint: raw.fingerprint,
    computedAt: raw.computedAt,
    rows,
  };
}

/**
 * Validate a stored segment (shape + version ceiling). A drifted
 * record is discarded, never partially read.
 */
export function readSegmentRow(value: unknown): SegmentRow | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== SEGMENT_SCHEMA_VERSION) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  if (typeof raw.name !== "string" || raw.name.length === 0) return null;
  if (!isFiniteNumber(raw.createdAt)) return null;
  if (raw.source !== "stretch" && raw.source !== "drawn") return null;
  const start = readLatLon(raw.start);
  if (start === null) return null;
  const end = readLatLon(raw.end);
  if (end === null) return null;
  if (!isFiniteNumber(raw.lengthM) || !(raw.lengthM > 0)) return null;
  let efforts: SegmentEfforts | undefined;
  if (raw.efforts !== undefined) {
    const parsed = readEfforts(raw.efforts);
    if (parsed === null) return null;
    efforts = parsed;
  }
  if (efforts === undefined) {
    return {
      schemaVersion: SEGMENT_SCHEMA_VERSION,
      id: raw.id,
      name: raw.name,
      createdAt: raw.createdAt,
      source: raw.source,
      start,
      end,
      lengthM: raw.lengthM,
    };
  }
  return {
    schemaVersion: SEGMENT_SCHEMA_VERSION,
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    source: raw.source,
    start,
    end,
    lengthM: raw.lengthM,
    efforts,
  };
}

// ---------------------------------------------------------------------------
// View models (the hook renders these; kept here for one definition)
// ---------------------------------------------------------------------------

/** A segment joined with its ranked efforts + PR (the tab's row). */
export interface SegmentView {
  row: SegmentRow;
  /** Display order: clean by elapsed, then flagged. */
  efforts: readonly SegmentEffortRow[];
  /** The best clean effort (null ⇒ only flagged or none). */
  pr: SegmentEffortRow | null;
}

/** Join a stored row into its view model (sorted + PR resolved). */
export function segmentView(row: SegmentRow): SegmentView {
  const efforts = sortEffortRows(row.efforts?.rows ?? []);
  return { row, efforts, pr: personalRecord(efforts) };
}
