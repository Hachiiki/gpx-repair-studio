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
 *   - Phase 7: export settings (§H-7 mode + pretty-print) — the
 *     pre-export dialog's controls, remembered across sessions.
 *   - Task 20: the landing page's mode (repair a recording vs create
 *     a share card) — the remembered intent for the NEXT upload; the
 *     active session's view lives in the session store, not here.
 *     Task 26 revision: the toggle gained a third tab, "Recover a GPS
 *     gap" — selecting it routes the next upload into the Gap Recovery
 *     section's own session (still one remembered intent, three
 *     destinations).
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
import type { ExportMode } from "@/features/gpx/exportGpx";
import {
  DEFAULT_TILE_PROVIDER,
  type TileProviderId,
} from "@/lib/map/styles";
import type { PaceUnit } from "@/lib/utils/format";
import type { SessionView } from "@/state/session-store";
import type { GapId } from "@/types/domain";

/** localStorage key — versioned so future setting renames can migrate. */
export const UI_SETTINGS_STORAGE_KEY = "gpx-repair-studio.settings.v1";

/**
 * The top-level section of the app (Task 26). "repair" is the original
 * repair studio (the app's core flow); "recovery" is the Gap Recovery
 * section — a separate, self-contained workflow for recovering a missing
 * GPS section from an activity whose elapsed time continued while
 * coordinates were missing. Derived, never stored: the recovery section
 * is "active" exactly while its own session is loading or parsed, so the
 * two sections keep fully independent sessions (there is no switcher —
 * the landing-page tab is the only front door, Task 26 revision).
 */
export type AppSection = "repair" | "recovery";

/**
 * The landing page's tab (Task 20 + Task 26 revision): what the next
 * upload opens into — the repair workspace, the share-card view, or the
 * Gap Recovery section. Persisted as the remembered intent; "recovery"
 * values written by newer builds read back fine, and older persisted
 * "repair"/"share" values remain valid.
 */
export type LandingMode = SessionView | "recovery";

interface UiState {
  gapThresholds: GapThresholds;
  tileProvider: TileProviderId;
  /** Pace display unit (§J-2 min/km with a min/mi toggle). Phase 5. */
  paceUnit: PaceUnit;
  /** Export mode (§H-7): structure-preserving default. Phase 7. */
  exportMode: ExportMode;
  /** Pretty-print exported GPX (§H-7). Phase 7. */
  exportPrettyPrint: boolean;
  /** Landing-page tab (Task 20 + Task 26 revision): what the next upload opens into. */
  landingMode: LandingMode;
  /** The gap highlighted on the map / gap list; `null` = none. Transient. */
  selectedGapId: GapId | null;

  setGapThresholds: (patch: Partial<GapThresholds>) => void;
  resetGapThresholds: () => void;
  setTileProvider: (provider: TileProviderId) => void;
  setPaceUnit: (unit: PaceUnit) => void;
  setExportMode: (mode: ExportMode) => void;
  setExportPrettyPrint: (pretty: boolean) => void;
  setLandingMode: (mode: LandingMode) => void;
  selectGap: (gapId: GapId | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      gapThresholds: { ...DEFAULT_GAP_THRESHOLDS },
      tileProvider: DEFAULT_TILE_PROVIDER,
      paceUnit: "km" as PaceUnit,
      exportMode: "structure-preserving" as ExportMode,
      exportPrettyPrint: false,
      landingMode: "repair" as LandingMode,
      selectedGapId: null,
      setGapThresholds: (patch) =>
        set((state) => ({ gapThresholds: { ...state.gapThresholds, ...patch } })),
      resetGapThresholds: () =>
        set({ gapThresholds: { ...DEFAULT_GAP_THRESHOLDS } }),
      setTileProvider: (tileProvider) => set({ tileProvider }),
      setPaceUnit: (paceUnit) => set({ paceUnit }),
      setExportMode: (exportMode) => set({ exportMode }),
      setExportPrettyPrint: (exportPrettyPrint) => set({ exportPrettyPrint }),
      setLandingMode: (landingMode) => set({ landingMode }),
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
        paceUnit: state.paceUnit,
        exportMode: state.exportMode,
        exportPrettyPrint: state.exportPrettyPrint,
        landingMode: state.landingMode,
      }),
      // Avoid SSR/prerender hydration mismatches; AppShell rehydrates on
      // mount (see components/layout/app-shell.tsx).
      skipHydration: true,
    },
  ),
);
