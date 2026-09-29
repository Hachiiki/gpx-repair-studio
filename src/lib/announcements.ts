/**
 * Announcements — the message bus behind the app's aria-live region
 * (Phase 8).
 *
 * The MASTER_PLAN §P Phase 8 scope calls for ARIA live announcements
 * at the workflow moments that have no visual focus change: gaps
 * detected after a parse, a reconstruction finishing, an export being
 * ready, and (touch) a long-press deleting a drawn point. Those
 * moments fire from React hooks, stores, and the MapLibre controller
 * alike, so the bus is a module-level pub/sub — any layer can
 * `announce(...)` without prop-drilling, context, or an import cycle
 * (components and lib/map both depend on THIS module; nothing here
 * depends on either).
 *
 * The non-visual twin contract: the sighted UI already shows the same
 * information as badges/banners/toasts — announcements are its
 * screen-reader mirror, polite and ephemeral, never a duplicate UI.
 */

export type AnnouncementListener = (message: string) => void;

const listeners = new Set<AnnouncementListener>();

/**
 * Speak a message to assistive tech. Safe anywhere (no-op before the
 * Announcer region mounts, in tests, or during SSR).
 */
export function announce(message: string): void {
  if (typeof message !== "string" || message.length === 0) return;
  for (const listener of listeners) {
    try {
      listener(message);
    } catch {
      // a broken subscriber never blocks the others
    }
  }
}

/** Subscribe to announcements; returns the unsubscribe handle. */
export function subscribeAnnouncements(
  listener: AnnouncementListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
