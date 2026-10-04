/**
 * Compare-mode store (Phase 19 — §EE 19.1): which compare view the
 * repair studio is in.
 *
 * A store (not hook state) because the map binding needs the overlay
 * BEFORE the draw/elevation bindings exist (the hook dependency order
 * in AppShell runs map → draw → elevation → compare), so the mode is
 * read at the top of the shell and the overlay is built by the pure
 * `buildCompareOverlay` join there. Never persisted — a new file
 * starts compare fresh (the compare hook resets it on model change).
 *
 * Phase 19 — Compare, summaries & guided flows. Client-side store.
 */

import { create } from "zustand";
import type { CompareMode } from "@/features/compare/compareStats";

export type { CompareMode };

interface CompareState {
  mode: CompareMode;
  setMode: (mode: CompareMode) => void;
  /** Back to "off" (a new file, a reset). */
  reset: () => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  mode: "off",
  setMode: (mode) => set({ mode }),
  reset: () => set({ mode: "off" }),
}));
