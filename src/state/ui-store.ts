/**
 * UI settings store (docs/MASTER_PLAN.md §D-4) — non-session, non-data
 * user preferences + transient interaction state.
 *
 * Setting groups (persisted to `localStorage` — settings only, never GPX
 * data, §E-8):
 *   - Phase 2: gap-detection thresholds (§H-4). Changing them is a
 *     *setting*, not an undoable command (§D-3.5): it triggers a pure
 *     re-detection over the unchanged original model.
 *   - Phase 3: basemap tile provider (§E-1 — OpenFreeMap default, OSM
 *     raster fallback option).
 *
 * Transient state (NOT persisted):
 *   - Phase 3: `selectedGapId` — the gap currently highlighted on the map
 *     and in the gap list (GapList ↔ map selection sync). Cleared by the
 *     map binding hook when the session resets or re-detection removes the
 *     gap.
 *
 * `skipHydration` keeps SSR/prerender and the first client render identical
 * (defaults); `AppShell` rehydrates after mount.
 *
 * Phase 3 — Map Display.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_GAP_THRESHOLDS,
  type GapThresholds,
} from "@/features/gpx/detectGaps";
import {
  DEFAULT_TILE_PROVIDER,
  type TileProviderId,
} from "@/lib/map/styles";
import type { GapId } from "@/types/domain";

/** localStorage key — versioned so future setting renames can migrate. */
export const UI_SETTINGS_STORAGE_KEY = "gpx-repair-studio.settings.v1";

interface UiState {
  gapThresholds: GapThresholds;
  tileProvider: TileProviderId;
  /** The gap highlighted on the map / gap list; `null` = none. Transient. */
  selectedGapId: GapId | null;

  setGapThresholds: (patch: Partial<GapThresholds>) => void;
  resetGapThresholds: () => void;
  setTileProvider: (provider: TileProviderId) => void;
  selectGap: (gapId: GapId | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      gapThresholds: { ...DEFAULT_GAP_THRESHOLDS },
      tileProvider: DEFAULT_TILE_PROVIDER,
      selectedGapId: null,
      setGapThresholds: (patch) =>
        set((state) => ({ gapThresholds: { ...state.gapThresholds, ...patch } })),
      resetGapThresholds: () =>
        set({ gapThresholds: { ...DEFAULT_GAP_THRESHOLDS } }),
      setTileProvider: (tileProvider) => set({ tileProvider }),
      selectGap: (selectedGapId) => set({ selectedGapId }),
    }),
    {
      name: UI_SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Settings only — the transient selection (and any future
      // non-persisted UI state) stays out of localStorage.
      partialize: (state) => ({
        gapThresholds: state.gapThresholds,
        tileProvider: state.tileProvider,
      }),
      // Avoid SSR/prerender hydration mismatches; AppShell rehydrates on
      // mount (see components/layout/app-shell.tsx).
      skipHydration: true,
    },
  ),
);
