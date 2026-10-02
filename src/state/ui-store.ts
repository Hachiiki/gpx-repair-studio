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
 *     destinations). Task 42 revision: the tabs became tool cards —
 *     opening a card writes this mode, so the remembered intent and
 *     the open tool page can never drift apart.
 *
 * Transient state (NOT persisted):
 *   - Phase 3: `selectedGapId` — the gap currently highlighted on the map
 *     and in the gap list (GapList ↔ map selection sync). Cleared by the
 *     map binding hook when the session resets or re-detection removes the
 *     gap.
 *   - Task 42: `landingView` — which landing page is showing: the tool
 *     cards ("home") or the selected tool's detail page ("tool").
 *     Never persisted: a fresh load always opens on the cards, while a
 *     section reset keeps the tool page (the remembered-intent contract
 *     the tab used to carry — "New file" returns to the same tool's
 *     intake).
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
import type { ExportFormat } from "@/features/formats/export-formats";
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
 * coordinates were missing; "create" is the Create-from-stats section —
 * a watch that recorded the statistics but no GPS at all; "merge" is
 * the Merge section (Task 43) — two or more GPX files combined into one
 * route, arranged and exported; "plan" is the Plan-a-route section
 * (Task 50) — a draw-and-measure scratchpad with estimates and a pace
 * calculator, and deliberately NO export and NO share. Derived, never
 * stored: each section is "active" exactly while its own session holds
 * the stage, so the sections keep fully independent sessions (there is
 * no switcher — the landing-page cards are the only front door, Task
 * 26/42 revisions).
 */
export type AppSection = "repair" | "recovery" | "create" | "merge" | "plan";

/**
 * The landing's page (Task 42): "home" shows the tool cards; "tool"
 * shows the remembered mode's detail page (hero, explanation, and
 * intake). Transient by design — see the store header.
 */
export type LandingView = "home" | "tool";

/**
 * The landing page's selected tool (Task 20 + Task 26 revision): what
 * the next upload opens into — the repair workspace, the share-card
 * view, the Gap Recovery section, the Create-from-stats section, the
 * Merge section, or the Plan-a-route scratchpad (Task 50 — no file in,
 * no file out). Persisted as the remembered intent; "recovery",
 * "create", "merge", and "plan" values written by newer builds read
 * back fine, and older persisted "repair"/"share" values remain valid.
 * Task 42: opening a tool card writes this mode, so the remembered
 * intent and the open tool page can never drift apart.
 */
export type LandingMode =
  | SessionView
  | "recovery"
  | "create"
  | "merge"
  | "plan";

interface UiState {
  gapThresholds: GapThresholds;
  tileProvider: TileProviderId;
  /** Pace display unit (§J-2 min/km with a min/mi toggle). Phase 5. */
  paceUnit: PaceUnit;
  /** Export mode (§H-7): structure-preserving default. Phase 7. */
  exportMode: ExportMode;
  /** Pretty-print exported GPX (§H-7). Phase 7. */
  exportPrettyPrint: boolean;
  /** Export format (§EE 14.4): GPX full-fidelity default. Phase 14. */
  exportFormat: ExportFormat;
  /** Landing-page tool (Task 20 + Task 42): what the next upload opens into. */
  landingMode: LandingMode;
  /** Landing page (Task 42): the tool cards, or the tool's detail page. Transient. */
  landingView: LandingView;
  /** The gap highlighted on the map / gap list; `null` = none. Transient. */
  selectedGapId: GapId | null;

  setGapThresholds: (patch: Partial<GapThresholds>) => void;
  resetGapThresholds: () => void;
  setTileProvider: (provider: TileProviderId) => void;
  setPaceUnit: (unit: PaceUnit) => void;
  setExportMode: (mode: ExportMode) => void;
  setExportPrettyPrint: (pretty: boolean) => void;
  setExportFormat: (format: ExportFormat) => void;
  setLandingMode: (mode: LandingMode) => void;
  /** Task 42: open a tool's detail page (also becomes the remembered intent). */
  openLandingTool: (mode: LandingMode) => void;
  /** Task 42: leave the detail page, back to the tool cards. */
  closeLandingTool: () => void;
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
      exportFormat: "gpx" as ExportFormat,
      landingMode: "repair" as LandingMode,
      landingView: "home" as LandingView,
      selectedGapId: null,
      setGapThresholds: (patch) =>
        set((state) => ({ gapThresholds: { ...state.gapThresholds, ...patch } })),
      resetGapThresholds: () =>
        set({ gapThresholds: { ...DEFAULT_GAP_THRESHOLDS } }),
      setTileProvider: (tileProvider) => set({ tileProvider }),
      setPaceUnit: (paceUnit) => set({ paceUnit }),
      setExportMode: (exportMode) => set({ exportMode }),
      setExportPrettyPrint: (exportPrettyPrint) => set({ exportPrettyPrint }),
      setExportFormat: (exportFormat) => set({ exportFormat }),
      setLandingMode: (landingMode) => set({ landingMode }),
      // Task 42 — the cards home: one action keeps the open tool page
      // and the remembered upload intent the same value.
      openLandingTool: (mode) =>
        set({ landingMode: mode, landingView: "tool" }),
      closeLandingTool: () => set({ landingView: "home" }),
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
        exportFormat: state.exportFormat,
        landingMode: state.landingMode,
      }),
      // Avoid SSR/prerender hydration mismatches; AppShell rehydrates on
      // mount (see components/layout/app-shell.tsx).
      skipHydration: true,
    },
  ),
);
