"use client";

/**
 * useOnlineStatus (§EE 17.4) — is the network up, Reactively.
 *
 * `navigator.onLine` + the online/offline events, one subscription per
 * consumer. The offline story stays honest: freehand drawing never
 * needs this, the snap control uses it to disable itself WITH an
 * explanation (never silently), and routing failures keep their own
 * "unavailable right now" status — this hook is the proactive twin,
 * not a replacement.
 *
 * Phase 17 — Road snapping, opt-in.
 */

import { useSyncExternalStore } from "react";

/** Read the current value defensively (SSR/prerender has no navigator). */
function onlineSnapshot(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * The navigator.onLine subscription (useSyncExternalStore — the
 * React-endorsed shape for external state: no effects, no setState,
 * SSR-honest by construction).
 */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, onlineSnapshot, () => true);
}
