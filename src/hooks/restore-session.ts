/**
 * restoreSessionFromRecord (Phase 18 — docs/MASTER_PLAN.md §EE 18.3/18.4)
 * — the one code path that brings a stored session record back to life.
 *
 * Phase 10's reload-restore ran this sequence inline; Phase 18's
 * portable `.gpxrepair.json` files and named saved sessions need the
 * exact same dance (re-parse the ORIGINAL bytes through the real
 * pipeline, hydrate the stores, seed the road router cache), so the
 * sequence lives here once and every door uses it:
 *
 *   IndexedDB autosave restore  →  use-session-recovery.ts
 *   named saved session open    →  use-saved-sessions.ts
 *   portable session file open  →  use-saved-sessions.ts
 *
 * What each caller still owns: WHERE the record + bytes came from, and
 * the autosave bookkeeping around it (offer lists, signature adoption,
 * re-persisting) — this module only restores, never stores.
 *
 * Honesty rules: the bytes re-parse through the SAME pipeline an upload
 * takes (worker parse, honest failures); a record whose bytes no longer
 * parse reports "parse-failed" and the CALLER decides what to do with
 * the stored copy (the autosave deletes it; a saved session stays — the
 * user's shelf is not the app's to clean).
 *
 * Phase 18 — Batch & portable sessions. Client-side orchestration.
 */

"use client";

import {
  hydrateCreateSession,
  hydrateFileSession,
  hydratePlanSession,
  type StoredSessionRecord,
} from "@/lib/storage/session-record";
import { getRoadRouter } from "@/hooks/use-draw-editor";
import { loadGpxFile } from "@/hooks/use-gpx-session";
import { loadRecoveryFile } from "@/hooks/use-recovery-session";
import { announce } from "@/lib/announcements";
import { useCreateStore } from "@/state/create-store";
import { useEditorStore } from "@/state/editor-store";
import { usePlanStore } from "@/state/plan-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useSessionStore } from "@/state/session-store";
import { useUiStore } from "@/state/ui-store";
import { useWorkingStore } from "@/state/working-store";

/** What `restoreSessionFromRecord` reports back. */
export type RestoreSessionOutcome =
  | { status: "restored"; section: "repair" | "recovery" | "create" | "plan" }
  | { status: "unusable"; reason: "missing-source" | "parse-failed" | "bad-kind" };

/** The original bytes, shaped exactly like the storage layers hold them. */
export interface RestoreSessionSource {
  name: string;
  type: string;
  blob: Blob;
}

/**
 * Restore one session. `record` is a VALIDATED stored record (the
 * `readSessionRecord` ceiling already ran); `source` is required for
 * file-backed records (repair/recovery) and ignored otherwise.
 */
export async function restoreSessionFromRecord(
  record: StoredSessionRecord,
  source: RestoreSessionSource | null,
  options: { view?: "repair" | "share" } = {},
): Promise<RestoreSessionOutcome> {
  if (record.kind === "file") {
    if (source === null) {
      return { status: "unusable", reason: "missing-source" };
    }
    // The gaps must re-detect with the thresholds the session used
    // (part of the session's meaning — the Phase 10 rule).
    useUiStore.getState().setGapThresholds(record.gapThresholds);
    const rebuilt = new File([source.blob], source.name, {
      type: source.type || "application/gpx+xml",
    });
    if (record.section === "repair") {
      await loadGpxFile(rebuilt);
      useSessionStore.getState().setView(options.view === "share" ? "share" : "repair");
    } else {
      await loadRecoveryFile(rebuilt);
    }
    const sessionStore =
      record.section === "repair"
        ? useSessionStore.getState()
        : useRecoveryStore.getState();
    if (sessionStore.status !== "parsed") {
      return { status: "unusable", reason: "parse-failed" };
    }
    const hydration = hydrateFileSession(record);
    if (record.section === "repair") {
      useEditorStore.getState().hydrate(hydration);
      // Phase 13 — the working copy's fix log rides the same restore
      // (deterministic point ids re-attach the edits).
      useWorkingStore.getState().hydrate(hydration.workingEdits);
    } else {
      useRecoveryStore.getState().hydrate(hydration);
    }
    seedRouterFromFileRecord(record);
    announce(
      record.section === "repair"
        ? "Repair session restored."
        : "Recovery session restored.",
    );
    return { status: "restored", section: record.section };
  }

  if (record.kind === "create") {
    useCreateStore.getState().hydrate(hydrateCreateSession(record));
    const style = record.reconstruction.pathStyle;
    if ((style === "car" || style === "foot") && record.roadLegs.length > 0) {
      getRoadRouter().seedCache(style, record.roadLegs);
    }
    announce("Create session restored.");
    return { status: "restored", section: "create" };
  }

  if (record.kind === "plan") {
    usePlanStore.getState().hydrate(hydratePlanSession(record));
    const style = record.reconstruction.pathStyle;
    if ((style === "car" || style === "foot") && record.roadLegs.length > 0) {
      getRoadRouter().seedCache(style, record.roadLegs);
    }
    announce("Plan session restored.");
    return { status: "restored", section: "plan" };
  }

  return { status: "unusable", reason: "bad-kind" };
}

/** Seed the shared router cache from a file record's stored legs (WYSIWYG). */
function seedRouterFromFileRecord(
  record: Extract<StoredSessionRecord, { kind: "file" }>,
): void {
  const router = getRoadRouter();
  for (const [gapId, legs] of Object.entries(record.roadLegs)) {
    const style = record.reconstructions[gapId]?.pathStyle;
    if ((style === "car" || style === "foot") && legs.length > 0) {
      router.seedCache(style, legs);
    }
  }
}
