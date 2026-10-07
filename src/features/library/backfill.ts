/**
 * The backfill derivation — Phase 24's lazy index pass grown one
 * artifact richer for Phase 25 (docs/plans/v3/
 * phase-25-heatmap-personal-segments.md §25.1).
 *
 * ONE derivation path, TWO persisted artifacts: parse the stored bytes
 * through the real pipeline (runParsePipeline — the worker-backed
 * client), rebuild the merge the dashboard showed at save time
 * (mergeFromFileRecord), then walk it ONCE for the index
 * (indexSession) and once more for the heatmap strips
 * (features/heatmap/strips.ts). A session saved today, a session
 * backfilled from a pre-Phase-24 shelf, and a session re-derived for
 * its strips all pass through the same functions, so the card numbers,
 * the records, and the map's density wash can never disagree about
 * what a session is.
 *
 * The callers (use-library's ensureIndexes, use-heatmap's strip
 * backfill, use-segments' matcher pass) own the orchestration — lazy,
 * one row at a time, results persisted; this module owns the row.
 *
 * Phase 25 — Heatmap & personal segments. Pure orchestration module
 * (no React, no DOM).
 */

import { heatmapStrips } from "@/features/heatmap/strips";
import {
  indexSession,
  mergeFromFileRecord,
} from "@/features/library/index-session";
import { runParsePipeline } from "@/lib/gpx/parse-client";
import { readSessionRecord } from "@/lib/storage/session-record";
import type { SavedSessionEntry } from "@/lib/storage/sessionStore";
import type { StoredFileSession } from "@/lib/storage/session-record";

/**
 * Everything one backfilled row produces: the library index (null when
 * the merge walk yields nothing) and the heatmap strips (never null —
 * an empty track is an empty Float64Array, a valid strip record).
 */
export interface SessionArtifacts {
  index: ReturnType<typeof indexSession>;
  strips: ReturnType<typeof heatmapStrips>;
}

/**
 * Derive one saved file-session's artifacts from its stored record +
 * original bytes — parse, merge once, walk twice. Returns null when
 * the row is not derivable (planned route, missing blob, unparseable
 * bytes, or a drifted record) — the caller decides how to disclose.
 */
export async function deriveSessionArtifacts(
  entry: SavedSessionEntry,
): Promise<SessionArtifacts | null> {
  const record = readSessionRecord(entry.record);
  if (record === null || record.kind !== "file") return null;
  if (entry.source === undefined) return null;
  try {
    const bytes = await entry.source.blob.arrayBuffer();
    const parsed = await runParsePipeline(
      { bytes, fileName: entry.source.name },
      { gapThresholds: record.gapThresholds },
    );
    if (!parsed.ok) return null;
    const merge = mergeFromFileRecord(parsed.data, record);
    return {
      index: indexSession(merge, {
        timeGapMs: record.gapThresholds.timeGapMs,
      }),
      strips: heatmapStrips(merge),
    };
  } catch {
    return null;
  }
}

/**
 * Parse + merge one saved file-session for the segment matcher — the
 * same path minus the persistence artifacts (matching needs the full
 * track, not the decimated strips; deriving strips here would be
 * wasted work). Returns the merge or null, same disclosure contract.
 */
export async function mergeSessionEntry(
  entry: SavedSessionEntry,
): Promise<Parameters<typeof indexSession>[0] | null> {
  const record = readSessionRecord(entry.record);
  if (record === null || record.kind !== "file") return null;
  if (entry.source === undefined) return null;
  try {
    const bytes = await entry.source.blob.arrayBuffer();
    const parsed = await runParsePipeline(
      { bytes, fileName: entry.source.name },
      { gapThresholds: record.gapThresholds },
    );
    if (!parsed.ok) return null;
    return mergeFromFileRecord(parsed.data, record);
  } catch {
    return null;
  }
}

/** The file-session record guard the orchestrators share. */
export function readFileSessionRecord(
  entry: SavedSessionEntry,
): StoredFileSession | null {
  const record = readSessionRecord(entry.record);
  return record !== null && record.kind === "file" ? record : null;
}
