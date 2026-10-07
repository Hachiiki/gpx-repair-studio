/**
 * useLibrary (Phase 24 — docs/plans/v3/phase-24-activity-library-
 * records.md) — the training library's controller: the derived indexes
 * that live beside the shelf's sessions, the records and trends
 * aggregations over them, and the honest backfill that derives a
 * missing index from the stored record + original bytes.
 *
 * The one-derivation rule: every index comes from
 * `indexFromFileRecord` — parse the stored bytes through the real
 * pipeline, rebuild the merge the dashboard showed at save time, walk
 * it once. A session saved today and a session saved before Phase 24
 * re-derive through the SAME path, so the library's numbers can never
 * disagree with a restored session's dashboard.
 *
 * The backfill is LAZY BY DESIGN: the library surfaces call
 * `ensureIndexes()` when they open (never at app load — a full shelf
 * of 24 MB files must not re-parse on every visit), one row at a
 * time, and each result lands in the `library` store so it is paid
 * once. Planned routes (create/plan sections) are not recordings —
 * they stay on the shelf, are labeled as planned, and never join
 * records or trends.
 *
 * Failure posture: storage is optional (the storage layer's own
 * contract). A row whose bytes no longer parse marks itself "failed"
 * with a plain sentence and never blocks the rest.
 *
 * Phase 24 — Activity library, records & trends. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveSessionArtifacts } from "@/features/library/backfill";
import {
  readSessionIndex,
  type SessionIndex,
} from "@/features/library/index-session";
import {
  lifetimeRecords,
  type LifetimeRecords,
} from "@/features/library/records";
import {
  fitnessFatigue,
  volumeByPeriod,
  type FitnessFatigueResult,
  type VolumeRow,
} from "@/features/library/trends";
import { buildLibraryCsv } from "@/features/library/libraryCsv";
import {
  listLibraryIndexes,
  writeLibraryIndex,
  writeHeatmapStrips,
} from "@/lib/storage/sessionStore";
import { readSessionRecord } from "@/lib/storage/session-record";
import { downloadTextFile } from "@/lib/utils/download";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";
import type { SavedSessionsBinding } from "@/hooks/use-saved-sessions";
import type { SessionSection } from "@/lib/storage/sessionStore";

/** One shelf row as the library card renders it. */
export interface LibraryCardRow {
  id: string;
  name: string;
  /** The raw section key (translate via savedSessionSectionKey). */
  section: SessionSection;
  updatedAt: number;
  /** "planned" — a drawn route, not a recording (never joins records). */
  status: "indexed" | "pending" | "planned" | "failed";
  index: SessionIndex | null;
}

// App-layer facade: components may not import feature internals (ESLint
// boundary), so the library vocabulary they need flows through here.
export type { SessionIndex } from "@/features/library/index-session";
export type {
  LifetimeRecords,
  LibraryEffortEntry,
  LadderRecord,
  LadderDistance,
  ValueRecord,
} from "@/features/library/records";
export { EFFORT_LADDER, riegelLadder } from "@/features/library/records";
export type {
  FitnessFatigueResult,
  VolumeRow,
} from "@/features/library/trends";

/** A card row joined with its FULL index (records/trends/csv input). */
interface IndexedRow {
  id: string;
  name: string;
  index: SessionIndex;
}

/** The binding the library surfaces render. */
export interface LibraryBinding {
  cards: readonly LibraryCardRow[];
  /** Rows that carry a derived index (records/trends see only these). */
  records: LifetimeRecords;
  volumeWeek: readonly VolumeRow[];
  volumeMonth: readonly VolumeRow[];
  fitness: FitnessFatigueResult | null;
  /** A backfill pass is still running (the indexing disclosure). */
  backfilling: boolean;
  /** How many rows are waiting for their index. */
  pendingCount: number;
  /** Rows whose bytes no longer re-parse (each shows its sentence). */
  failedCount: number;
  /** Derive + persist any missing indexes (idempotent, one at a time). */
  ensureIndexes: () => void;
  /** The whole indexed library as a CSV download. */
  exportCsv: () => void;
}

export function useLibrary(
  sessions: SavedSessionsBinding,
): LibraryBinding {
  const { t } = useI18n();
  const [indexes, setIndexes] = useState<
    ReadonlyMap<string, SessionIndex>
  >(new Map());
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [backfilling, setBackfilling] = useState(false);
  /** One pass at a time — dialog re-opens never double-run. */
  const runningRef = useRef(false);

  // Load the stored indexes whenever the shelf changes (cheap — the
  // records are small); drifted shapes are discarded by the validator.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await listLibraryIndexes();
      if (!alive) return;
      const next = new Map<string, SessionIndex>();
      for (const [id, raw] of stored) {
        const index = readSessionIndex(raw);
        if (index !== null) next.set(id, index);
      }
      setIndexes(next);
    })();
    return () => {
      alive = false;
    };
  }, [sessions.rows]);

  const ensureIndexes = useCallback(() => {
    if (runningRef.current) return;
    const rows = sessions.rows;
    const known = indexes;
    const failed = failedIds;
    const todo = rows.filter((row) => {
      if (known.has(row.id) || failed.has(row.id)) return false;
      // Planned routes are not recordings — nothing to derive.
      return readSessionRecord(row.record)?.kind === "file";
    });
    if (todo.length === 0) return;

    runningRef.current = true;
    setBackfilling(true);
    void (async () => {
      try {
        for (const entry of todo) {
          // Phase 25 — one derivation, two artifacts: the index AND the
          // heatmap strips (the toggle later reads what this pass paid
          // for; re-deriving per surface would double the parse).
          const artifacts = await deriveSessionArtifacts(entry);
          if (artifacts === null || artifacts.index === null) {
            setFailedIds((current) => new Set(current).add(entry.id));
            continue;
          }
          const index = artifacts.index;
          await writeLibraryIndex(entry.id, index);
          await writeHeatmapStrips(entry.id, artifacts.strips);
          setIndexes((current) => {
            const next = new Map(current);
            next.set(entry.id, index);
            return next;
          });
        }
      } finally {
        runningRef.current = false;
        setBackfilling(false);
      }
    })();
  }, [sessions.rows, indexes, failedIds]);

  const cards = useMemo<LibraryCardRow[]>(
    () =>
      sessions.rows.map((row) => {
        const record = readSessionRecord(row.record);
        const index = indexes.get(row.id) ?? null;
        if (index !== null) {
          return {
            id: row.id,
            name: row.name,
            section: row.section,
            updatedAt: row.updatedAt,
            status: "indexed",
            index,
          };
        }
        if (record !== null && record.kind !== "file") {
          return {
            id: row.id,
            name: row.name,
            section: row.section,
            updatedAt: row.updatedAt,
            status: "planned",
            index: null,
          };
        }
        return {
          id: row.id,
          name: row.name,
          section: row.section,
          updatedAt: row.updatedAt,
          status: failedIds.has(row.id) ? "failed" : "pending",
          index: null,
        };
      }),
    [sessions.rows, indexes, failedIds],
  );

  const recordsRows = useMemo<IndexedRow[]>(
    () =>
      cards
        .filter((card) => card.status === "indexed" && card.index !== null)
        .map((card) => ({
          id: card.id,
          name: card.name,
          index: card.index!,
        })),
    [cards],
  );

  const records = useMemo(() => lifetimeRecords(recordsRows), [recordsRows]);
  const volumeWeek = useMemo(
    () => volumeByPeriod(recordsRows, "week"),
    [recordsRows],
  );
  const volumeMonth = useMemo(
    () => volumeByPeriod(recordsRows, "month"),
    [recordsRows],
  );
  const fitness = useMemo(() => fitnessFatigue(recordsRows), [recordsRows]);

  const exportCsv = useCallback(() => {
    const rows = recordsRows.map((recordRow) => {
      const entry = sessions.rows.find((r) => r.id === recordRow.id);
      return {
        name: recordRow.name,
        section: entry?.section ?? "repair",
        savedAtIso:
          entry !== undefined
            ? new Date(entry.updatedAt).toISOString()
            : "",
        index: recordRow.index,
      };
    });
    if (rows.length === 0) {
      announce(t("library.csv.empty"));
      return;
    }
    const csv = buildLibraryCsv({
      generatedAtIso: new Date().toISOString(),
      rows,
    });
    downloadTextFile("library.csv", csv, "text/csv");
    announce(t("library.csv.ready", { count: rows.length }));
  }, [recordsRows, sessions.rows, t]);

  const pendingCount = cards.filter((c) => c.status === "pending").length;
  const failedCount = cards.filter((c) => c.status === "failed").length;

  return {
    cards,
    records,
    volumeWeek,
    volumeMonth,
    fitness,
    backfilling,
    pendingCount,
    failedCount,
    ensureIndexes,
    exportCsv,
  };
}
