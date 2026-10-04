/**
 * useSavedSessions (Phase 18 — docs/MASTER_PLAN.md §EE 18.3/18.4) — the
 * named-session manager's controller: the shelf behind the header's
 * "Sessions" door and the landing's "Open a session file" link.
 *
 * Owns the orchestration around the storage layer's `saved` store:
 *   - SAVE the current section's work under a name (the same capture
 *     the autosave takes — one capture layer, two homes; the same WORK
 *     predicate gates it, exported from use-session-recovery so the
 *     two can never disagree);
 *   - LIST / RENAME / DELETE the shelf's entries;
 *   - EXPORT one entry as a portable `.gpxrepair.json` (18.3's document
 *     built from the very same record — a named save and an exported
 *     file are the same session in two wrappings);
 *   - IMPORT a `.gpxrepair.json` onto the shelf (validated by the same
 *     reader that opens one directly);
 *   - OPEN: bring an entry (or a portable file straight from disk) back
 *     as the working session through the ONE restore path
 *     (hooks/restore-session.ts — the Phase 10 sequence).
 *
 * Failure posture: storage is optional. Every operation degrades to an
 * announced plain sentence when IndexedDB is blocked — the app works
 * exactly as before (the storage layer's own contract).
 *
 * Phase 18 — Batch & portable sessions. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureCreateSession,
  captureFileSession,
  capturePlanSession,
  readSessionRecord,
  type StoredSessionRecord,
} from "@/lib/storage/session-record";
import {
  deleteSavedSession,
  isSessionStorageAvailable,
  listSavedSessions,
  renameSavedSession,
  saveSessionEntry,
  type SavedSessionEntry,
  type SessionSection,
} from "@/lib/storage/sessionStore";
import {
  buildPortableSession,
  portableSessionFileName,
  readPortableSession,
  serializePortableSession,
  type ReadPortableSessionResult,
} from "@/lib/storage/portable-session";
import { restoreSessionFromRecord } from "@/hooks/restore-session";
import { sessionSectionHasWork } from "@/hooks/use-session-recovery";
import { downloadTextFile } from "@/lib/utils/download";
import { announce } from "@/lib/announcements";
import { useCreateStore } from "@/state/create-store";
import { useEditorStore } from "@/state/editor-store";
import { usePlanStore } from "@/state/plan-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useSessionStore } from "@/state/session-store";
import { useUiStore } from "@/state/ui-store";
import { useWorkingStore } from "@/state/working-store";

/** One shelf row as the manager renders it (the storage entry + derived). */
export type SavedSessionRow = SavedSessionEntry;

/** The section labels the manager shows (the landing's vocabulary). */
const SECTION_LABELS: Record<SessionSection, string> = {
  repair: "Repair",
  recovery: "Gap recovery",
  create: "Create from stats",
  plan: "Plan a route",
};

export function savedSessionSectionLabel(section: SessionSection): string {
  return SECTION_LABELS[section];
}

/** What the current capture holds (the save dialog's honesty line). */
export interface CurrentSessionCapture {
  section: SessionSection;
  record: StoredSessionRecord;
  view: "repair" | "share";
  source: { name: string; type: string; blob: Blob } | null;
}

/**
 * The ACTIVE section, as the shell derives it (merge/batch never reach
 * here — neither has nameable sessions). Null when no section holds
 * the stage with work on it.
 */
export function activeSessionSection(): SessionSection | null {
  if (sessionSectionHasWork("plan")) return "plan";
  if (sessionSectionHasWork("create")) return "create";
  if (sessionSectionHasWork("recovery")) return "recovery";
  if (sessionSectionHasWork("repair")) return "repair";
  return null;
}

/** Whether anything is nameable right now (cheap — no capture built). */
export function hasNameableSession(): boolean {
  return activeSessionSection() !== null;
}

/**
 * Capture the ACTIVE section's work (the autosave's capture, verbatim —
 * same stores, same shape). Returns null when no section holds work
 * (the WORK predicate): nothing nameable, nothing to save.
 */
export function captureCurrentSession(): CurrentSessionCapture | null {
  // The app-shell's section derivation, mirrored: the first section
  // whose session holds the stage. Batch/merge never reach here.
  const plan = usePlanStore.getState();
  if (plan.phase === "studio" && sessionSectionHasWork("plan")) {
    return {
      section: "plan",
      record: capturePlanSession(
        {
          plannedTimeMs: plan.plannedTimeMs,
          reconstruction: plan.reconstruction,
          roadLegs: plan.roadLegs,
        },
        Date.now(),
      ),
      view: "repair",
      source: null,
    };
  }

  const create = useCreateStore.getState();
  if (create.stats !== null && sessionSectionHasWork("create")) {
    return {
      section: "create",
      record: captureCreateSession(
        {
          stats: create.stats,
          reconstruction: create.reconstruction,
          roadLegs: create.roadLegs,
          spacingM: create.spacingM,
          matchDistance: create.matchDistance,
          phase: create.phase === "review" ? "review" : "draw",
        },
        Date.now(),
      ),
      view: "repair",
      source: null,
    };
  }

  const recovery = useRecoveryStore.getState();
  if (
    recovery.status === "parsed" &&
    recovery.sourceFile !== null &&
    sessionSectionHasWork("recovery")
  ) {
    return {
      section: "recovery",
      record: captureFileSession(
        {
          section: "recovery",
          fileName: recovery.fileName ?? recovery.sourceFile.name,
          gapThresholds: useUiStore.getState().gapThresholds,
          reconstructions: recovery.reconstructions,
          skippedGapIds: recovery.skippedGapIds,
          manualSpans: recovery.manualSpans,
          fileTiming: recovery.fileTiming,
          roadLegs: recovery.roadLegs,
          // The recovery section has no working copy.
          workingEdits: [],
        },
        Date.now(),
      ),
      view: "repair",
      source: {
        name: recovery.sourceFile.name,
        type: recovery.sourceFile.type || "application/gpx+xml",
        blob: recovery.sourceFile,
      },
    };
  }

  const repair = useSessionStore.getState();
  if (
    repair.status === "parsed" &&
    repair.sourceFile !== null &&
    sessionSectionHasWork("repair")
  ) {
    const editor = useEditorStore.getState();
    return {
      section: "repair",
      record: captureFileSession(
        {
          section: "repair",
          fileName: repair.fileName ?? repair.sourceFile.name,
          gapThresholds: useUiStore.getState().gapThresholds,
          reconstructions: editor.reconstructions,
          skippedGapIds: editor.skippedGapIds,
          manualSpans: editor.manualSpans,
          fileTiming: editor.fileTiming,
          roadLegs: editor.roadLegs,
          // Phase 13 — the working copy's confirmed-fix log.
          workingEdits: useWorkingStore.getState().edits,
        },
        Date.now(),
      ),
      view: repair.view === "share" ? "share" : "repair",
      source: {
        name: repair.sourceFile.name,
        type: repair.sourceFile.type || "application/gpx+xml",
        blob: repair.sourceFile,
      },
    };
  }

  return null;
}

/** Typed import outcomes (plain sentences render them). */
export type ImportPortableOutcome =
  | { status: "imported"; name: string }
  | { status: "opened"; name: string }
  | { status: "error"; message: string };

/** The binding the sessions manager renders. */
export interface SavedSessionsBinding {
  rows: readonly SavedSessionRow[];
  /** The mount scan settled (the manager's empty state is final then). */
  hasScanned: boolean;
  /** Storage alive at all (the honest "unavailable" line when not). */
  available: boolean;
  /** Save the current section's work under a name. */
  saveCurrent: (name: string) => Promise<boolean>;
  /**
   * 18.3's "export from the session", direct: capture the current
   * work and download it as a .gpxrepair.json WITHOUT writing the
   * shelf (the shelf's own export stays the second door to the same
   * document).
   */
  exportCurrent: () => Promise<boolean>;
  renameRow: (id: string, name: string) => Promise<void>;
  deleteRow: (id: string) => Promise<void>;
  /** Export one entry as a .gpxrepair.json download. */
  exportRow: (id: string) => Promise<void>;
  /** Open one entry back as the working session (the one restore path). */
  openRow: (id: string) => Promise<boolean>;
  /** Read a .gpxrepair.json from disk: onto the shelf (and optionally straight into the app). */
  importPortableFile: (
    file: File,
    openNow: boolean,
  ) => Promise<ImportPortableOutcome>;
  /** Refresh the list (after external changes; cheap + guarded). */
  refresh: () => Promise<void>;
}

export function useSavedSessions(): SavedSessionsBinding {
  const [rows, setRows] = useState<readonly SavedSessionRow[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [available, setAvailable] = useState(true);
  /** One operation at a time — open/save races would double-apply. */
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const listed = await listSavedSessions();
    setRows(listed);
    setAvailable(isSessionStorageAvailable());
    setHasScanned(true);
  }, []);

  // The mount scan. The setState calls happen after the await (never
  // synchronously inside the effect body) — the derived-not-effect rule.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveCurrent = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) return false;
      const capture = captureCurrentSession();
      if (capture === null) {
        announce("Nothing to save yet — draw or fix something first.");
        return false;
      }
      if (busyRef.current) return false;
      busyRef.current = true;
      try {
        const id = await saveSessionEntry({
          name: trimmed,
          section: capture.section,
          record: capture.record,
          ...(capture.view === "share" ? { view: capture.view } : {}),
          ...(capture.source !== null
            ? {
                source: {
                  name: capture.source.name,
                  type: capture.source.type,
                  blob: capture.source.blob,
                },
              }
            : {}),
        });
        if (id === null) {
          announce(
            "Could not save the session — storage is unavailable or full.",
          );
          return false;
        }
        await refresh();
        announce(`Saved — "${trimmed}" is on your sessions shelf.`);
        return true;
      } finally {
        busyRef.current = false;
      }
    },
    [refresh],
  );

  const exportCurrent = useCallback(async () => {
    const capture = captureCurrentSession();
    if (capture === null) {
      announce("Nothing to export yet — draw or fix something first.");
      return false;
    }
    const doc = buildPortableSession(
      capture.record,
      capture.view === "share" ? { view: capture.view } : {},
      Date.now(),
    );
    const json = await serializePortableSession(
      doc,
      capture.source !== null
        ? {
            name: capture.source.name,
            type: capture.source.type,
            blob: capture.source.blob,
          }
        : undefined,
    );
    // The document's name: the original file's stem, or the section
    // when no file exists (create/plan).
    const base =
      capture.source !== null
        ? capture.source.name
        : savedSessionSectionLabel(capture.section);
    const fileName = portableSessionFileName(base);
    downloadTextFile(fileName, json, "application/json");
    announce(`Export ready — ${fileName} downloaded.`);
    return true;
  }, []);

  const renameRow = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) return;
      const done = await renameSavedSession(id, trimmed);
      if (!done) {
        announce("Could not rename the session.");
        return;
      }
      await refresh();
    },
    [refresh],
  );

  const deleteRow = useCallback(
    async (id: string) => {
      const done = await deleteSavedSession(id);
      if (!done) {
        announce("Could not delete the session.");
        return;
      }
      await refresh();
      announce("Session deleted.");
    },
    [refresh],
  );

  const exportRow = useCallback(async (id: string) => {
    const listed = await listSavedSessions();
    const entry = listed.find((row) => row.id === id);
    if (!entry) return;
    const record = readSessionRecord(entry.record);
    if (record === null) {
      announce(
        "This saved session can no longer be read — its record is unreadable.",
      );
      return;
    }
    const doc = buildPortableSession(
      record,
      entry.view !== undefined ? { view: entry.view } : {},
      entry.updatedAt,
    );
    const json = await serializePortableSession(
      doc,
      entry.source !== undefined
        ? {
            name: entry.source.name,
            type: entry.source.type,
            blob: entry.source.blob,
          }
        : undefined,
    );
    const fileName = portableSessionFileName(entry.name);
    downloadTextFile(fileName, json, "application/json");
    announce(`Export ready — ${fileName} downloaded.`);
  }, []);

  const openRow = useCallback(async (id: string) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      const listed = await listSavedSessions();
      const entry = listed.find((row) => row.id === id);
      if (!entry) {
        announce("That session is no longer on the shelf.");
        return false;
      }
      const record = readSessionRecord(entry.record);
      if (record === null) {
        announce(
          "This saved session can no longer be read — its record is unreadable.",
        );
        return false;
      }
      const outcome = await restoreSessionFromRecord(
        record,
        entry.source !== null && entry.source !== undefined
          ? {
              name: entry.source.name,
              type: entry.source.type,
              blob: entry.source.blob,
            }
          : null,
        { view: entry.view },
      );
      if (outcome.status !== "restored") {
        announce(
          outcome.reason === "missing-source"
            ? "This session is missing its original file — it cannot be reopened."
            : "The original file no longer parses — the session cannot be reopened.",
        );
        return false;
      }
      return true;
    } finally {
      busyRef.current = false;
    }
  }, []);

  const importPortableFile = useCallback(
    async (file: File, openNow: boolean): Promise<ImportPortableOutcome> => {
      let json: string;
      try {
        json = await file.text();
      } catch {
        return { status: "error", message: "The file could not be read." };
      }
      const result: ReadPortableSessionResult = readPortableSession(json);
      if (!result.ok) {
        const message =
          result.error.kind === "not-json"
            ? "This file is not a session file — it is not valid JSON."
            : result.error.kind === "wrong-format"
              ? "This file is not a GPX Repair Studio session file."
              : result.error.kind === "newer-version"
                ? `This session file was written by a newer version (v${result.error.version}) — update the app to open it.`
                : result.error.kind === "bad-session"
                  ? "The session inside this file is unreadable."
                  : "The original recording inside this session file is unreadable.";
        announce(message);
        return { status: "error", message };
      }
      // A name for the shelf: the file's stem, minus the extension.
      const stem = file.name
        .replace(/\.gpxrepair\.json$/i, "")
        .replace(/\.json$/i, "");
      const name = stem.trim().length > 0 ? stem : "Imported session";
      const id = await saveSessionEntry({
        name,
        section: result.file.record.section,
        record: result.file.record,
        ...(result.file.view === "share" ? { view: result.file.view } : {}),
        ...(result.file.source !== null
          ? {
              source: {
                name: result.file.source.name,
                type: result.file.source.type,
                blob: result.file.source.blob,
              },
            }
          : {}),
      });
      if (id === null) {
        return {
          status: "error",
          message:
            "Could not add the session to the shelf — storage is unavailable or full.",
        };
      }
      await refresh();
      if (!openNow) {
        announce(`Imported — "${name}" is on your sessions shelf.`);
        return { status: "imported", name };
      }
      const opened = await openRow(id);
      return opened
        ? { status: "opened", name }
        : {
            status: "error",
            message:
              "The session was imported but could not be opened — its file no longer parses.",
          };
    },
    [openRow, refresh],
  );

  return {
    rows,
    hasScanned,
    available,
    saveCurrent,
    exportCurrent,
    renameRow,
    deleteRow,
    exportRow,
    openRow,
    importPortableFile,
    refresh,
  };
}
