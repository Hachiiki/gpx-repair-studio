/**
 * English dictionary — app-shell strings (toasts, announcements, dialogs wiring) (Phase 21).
 *
 * Extracted from the shell domain's components. Keys are namespaced
 * `shell.*`. English values are the app's existing copy, moved
 * VERBATIM — the dictionary is the contract every locale checks
 * against.
 */

export const shell = {
  /**
   * The composition root's own copy (app-shell.tsx). The shell fires
   * no toasts itself — the hooks it wires do — so this file holds the
   * skip link, the header's pseudo file names for the file-less
   * sections (create/merge/plan/batch), and the elevation profile's
   * gain/loss summary the shell computes for the chart's aria-label.
   */

  /** The keyboard skip link past the header. */
  "shell.skipToContent": "Skip to content",

  /** AppHeader's fileName fallbacks for sections with no real file. */
  "shell.header.createFileName": "Activity from stats",
  "shell.header.mergedRecordings": "{count} recordings merged",
  "shell.header.planFileName": "Route plan",
  "shell.header.batchFallback": "Batch queue",
  "shell.header.batchFiles": "{count} files",

  /** The elevation profile's mixed-mode gain/loss (aria-label fragment). */
  "shell.elevation.gainLoss": "{gain} m up, {loss} m down",

  "shell.section.repair": "Repair",
  "shell.section.recovery": "Gap recovery",
  "shell.section.create": "Create from stats",
  "shell.section.plan": "Plan a route",
} as const;
