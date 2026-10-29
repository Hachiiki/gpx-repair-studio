/**
 * useSessionFinish — the finished-on-export controller (Task 75).
 *
 * Every dashboard's download funnel marks its session finished; this hook
 * is the banner's brain: it reads the section's finishedAt (reactively),
 * and owns the three exits the user asked for —
 *
 *   - SAVE the session to the shelf (the same capture + entry the
 *     header's Sessions door writes — one capture layer, two homes);
 *   - FRESH WORKSPACE: reset the section and open its landing tool page
 *     (the same door a tool card opens), ready for the next activity;
 *   - BACK TO HOME: reset and show the tool cards.
 *
 * Plus DISMISS: clear the mark and keep working — an export is not a
 * locked door. Merge carries no shelf session (the Phase 10 decision
 * gate), so its banner offers the two exits only.
 *
 * Cross-section (repair / recovery / create / merge). Client-side hook.
 */

"use client";

import { useCallback, useState } from "react";
import {
  captureCurrentSession,
  savedSessionSectionLabel,
} from "@/hooks/use-saved-sessions";
import { saveSessionEntry } from "@/lib/storage/sessionStore";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";
import { useUiStore, type LandingMode } from "@/state/ui-store";
import { useCreateStore } from "@/state/create-store";
import { useMergeStore } from "@/state/merge-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useSessionStore } from "@/state/session-store";

/** The sections whose downloads finish a session (plan has no export). */
export type FinishableSection = "repair" | "recovery" | "create" | "merge";

/** The save flow's state (the banner renders it honestly). */
export type SessionSaveState = "idle" | "saving" | "saved" | "failed";

/** The binding the banner renders. */
export interface SessionFinishBinding {
  /** The last export's timestamp (null = no banner). */
  finishedAt: number | null;
  /** The save flow's state. */
  saveState: SessionSaveState;
  /** A sensible default name (the file's stem, or the section's label). */
  suggestedName: string;
  /** True when this section can be saved to the shelf (merge cannot). */
  canSave: boolean;
  /** Save the current work under a name (the shelf's own write). */
  save: (name: string) => Promise<void>;
  /** Reset the section and open its landing tool page. */
  fresh: () => void;
  /** Reset the section and show the home cards. */
  home: () => void;
  /** Dismiss the banner — the user keeps working on the session. */
  dismiss: () => void;
}

/** Reset one section's stores (its own definition of "empty again"). */
function resetSection(section: FinishableSection): void {
  switch (section) {
    case "repair":
      useSessionStore.getState().reset();
      break;
    case "recovery":
      useRecoveryStore.getState().reset();
      break;
    case "create":
      useCreateStore.getState().reset();
      break;
    case "merge":
      useMergeStore.getState().reset();
      break;
  }
}

/** The landing page whose tool detail "fresh workspace" opens. */
function landingModeFor(section: FinishableSection): LandingMode {
  if (section === "repair") {
    return useSessionStore.getState().view === "share" ? "share" : "repair";
  }
  return section;
}

export function useSessionFinish(
  section: FinishableSection,
): SessionFinishBinding {
  const { t } = useI18n();
  const [saveState, setSaveState] = useState<SessionSaveState>("idle");

  // The finished mark of THIS section (the other stores' selectors return
  // null — no re-render when a sibling section exports).
  const repairFinished = useSessionStore((s) =>
    section === "repair" ? s.finishedAt : null,
  );
  const recoveryFinished = useRecoveryStore((s) =>
    section === "recovery" ? s.finishedAt : null,
  );
  const createFinished = useCreateStore((s) =>
    section === "create" ? s.finishedAt : null,
  );
  const mergeFinished = useMergeStore((s) =>
    section === "merge" ? s.finishedAt : null,
  );
  const finishedAt =
    repairFinished ?? recoveryFinished ?? createFinished ?? mergeFinished;

  const canSave = section !== "merge";

  // A sensible default: the parsed file's stem, else the section's label.
  const suggestedName = (() => {
    if (section === "repair") {
      return useSessionStore.getState().fileName ?? "activity";
    }
    if (section === "recovery") {
      return useRecoveryStore.getState().fileName ?? "activity";
    }
    if (section === "merge") return "Merged activity"; // never saved — placeholder
    return savedSessionSectionLabel(section);
  })()
    .replace(/\.(gpx|tcx|fit|json)$/i, "")
    .trim();

  const save = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      const capture = captureCurrentSession();
      if (capture === null) {
        // Nothing nameable (merge, or the work already left) — say so
        // honestly and keep the banner's other exits.
        setSaveState("failed");
        announce(t("hook.savedSessions.nothingToSave"));
        return;
      }
      setSaveState("saving");
      const id = await saveSessionEntry({
        name: trimmed.length > 0 ? trimmed : suggestedName,
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
        setSaveState("failed");
        announce(t("hook.savedSessions.saveFailed"));
        return;
      }
      setSaveState("saved");
      announce(
        t("hook.savedSessions.saved", {
          name: trimmed.length > 0 ? trimmed : suggestedName,
        }),
      );
    },
    [suggestedName, t],
  );

  const fresh = useCallback(() => {
    resetSection(section);
    useUiStore.getState().openLandingTool(landingModeFor(section));
  }, [section]);

  const home = useCallback(() => {
    resetSection(section);
    useUiStore.getState().closeLandingTool();
  }, [section]);

  const dismiss = useCallback(() => {
    switch (section) {
      case "repair":
        useSessionStore.getState().clearFinished();
        break;
      case "recovery":
        useRecoveryStore.getState().clearFinished();
        break;
      case "create":
        useCreateStore.getState().clearFinished();
        break;
      case "merge":
        useMergeStore.getState().clearFinished();
        break;
    }
  }, [section]);

  return {
    finishedAt,
    saveState,
    suggestedName,
    canSave,
    save,
    fresh,
    home,
    dismiss,
  };
}
