/**
 * UI settings store (docs/MASTER_PLAN.md §D-4) — non-session, non-data
 * user preferences.
 *
 * Phase 2 owns exactly one setting group: the gap-detection thresholds
 * (§H-4). These are *settings*, not undoable commands (§D-3.5): changing
 * them triggers a pure re-detection over the unchanged original model.
 *
 * Persistence: thresholds survive reloads via `localStorage` — settings
 * only, never GPX data (§E-8 explicitly rejects localStorage for track
 * data). `skipHydration` keeps SSR/prerender and the first client render
 * identical (defaults); `AppShell` rehydrates after mount.
 *
 * Phase 2 — Upload & Inspection UI. Later phases add layout/dialog state
 * here per §D-4 (export mode, elevation provider choice, mobile panels).
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_GAP_THRESHOLDS,
  type GapThresholds,
} from "@/features/gpx/detectGaps";

/** localStorage key — versioned so future setting renames can migrate. */
export const UI_SETTINGS_STORAGE_KEY = "gpx-repair-studio.settings.v1";

interface UiState {
  gapThresholds: GapThresholds;
  setGapThresholds: (patch: Partial<GapThresholds>) => void;
  resetGapThresholds: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      gapThresholds: { ...DEFAULT_GAP_THRESHOLDS },
      setGapThresholds: (patch) =>
        set((state) => ({ gapThresholds: { ...state.gapThresholds, ...patch } })),
      resetGapThresholds: () =>
        set({ gapThresholds: { ...DEFAULT_GAP_THRESHOLDS } }),
    }),
    {
      name: UI_SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Settings only — actions and any future non-persisted UI state stay
      // out of localStorage.
      partialize: (state) => ({ gapThresholds: state.gapThresholds }),
      // Avoid SSR/prerender hydration mismatches; AppShell rehydrates on
      // mount (see components/layout/app-shell.tsx).
      skipHydration: true,
    },
  ),
);
