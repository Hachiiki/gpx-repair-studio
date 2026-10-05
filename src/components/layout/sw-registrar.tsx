/**
 * ServiceWorkerRegistrar (Phase 22.2/22.3 — §EE 22.2/22.3) — the app's
 * offline boot, mounted once in the root layout.
 *
 * Three jobs, in order:
 *
 *   1. Register the service worker — PRODUCTION ONLY. The dev server
 *      must never be controlled (its chunks are ephemeral); `updateVia-
 *      Cache: "none"` makes every navigation re-check /sw.js for byte
 *      changes, so a deploy is noticed on the next visit, not whenever
 *      the HTTP cache feels like it.
 *   2. The update contract (§EE 22.2): when a new worker has finished
 *      precaching and is WAITING, ask — a toast with a Reload action.
 *      Only that click posts SKIP_WAITING; the controllerchange that
 *      follows reloads the page. Nothing ever swaps mid-edit silently.
 *   3. The persistent elevation cache's lifecycle (§EE 22.3): hydrate
 *      on mount (terrain from previous sessions joins the memory LRU)
 *      and flush the debounced write-through on pagehide, so the last
 *      batch of a session is not lost to a hard close.
 *
 * Renders nothing. Fails silently — no serviceWorker, a rejected
 * registration, a blocked database: the app simply behaves like the
 * fully-online Phase 21 build.
 */

"use client";

import { useEffect, useRef } from "react";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/hooks/use-i18n";
import {
  flushElevationCache,
  hydrateElevationCache,
} from "@/hooks/use-elevation";

export function ServiceWorkerRegistrar() {
  const { t } = useI18n();
  // Locale may change mid-session; the registration effect must run
  // once, so it reads the translator through a ref (kept current in
  // its own effect — never during render).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    // -- the persistent elevation cache (§EE 22.3) -----------------------
    hydrateElevationCache();
    const onHide = () => flushElevationCache();
    window.addEventListener("pagehide", onHide);

    // -- the service worker (§EE 22.2) ------------------------------------
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return () => window.removeEventListener("pagehide", onHide);
    }

    let cancelled = false;
    /** Set the moment the user clicks Reload — the only door to a reload. */
    let reloadArmed = false;

    const offerUpdate = (worker: ServiceWorker) => {
      if (cancelled) return;
      toast({
        title: tRef.current("shell.pwa.updateTitle"),
        description: tRef.current("shell.pwa.updateBody"),
        // A consent prompt must not vanish on a timer — it stays
        // until the user decides (the X remains for "not now").
        duration: Infinity,
        action: (
          <ToastAction
            altText={tRef.current("shell.pwa.updateAction")}
            onClick={() => {
              reloadArmed = true;
              worker.postMessage("SKIP_WAITING");
            }}
          >
            {tRef.current("shell.pwa.updateAction")}
          </ToastAction>
        ),
      });
    };

    const onControllerChange = () => {
      // Only a user-armed activation reloads — a FIRST activation
      // (no armed flag) must never interrupt the session.
      if (reloadArmed) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator
      .serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        // An update that landed while the tab was away.
        if (registration.waiting && navigator.serviceWorker.controller) {
          offerUpdate(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          if (incoming === null) return;
          incoming.addEventListener("statechange", () => {
            if (
              incoming.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              offerUpdate(incoming);
            }
          });
        });
      })
      .catch(() => {
        /* registration refused — the online app is unaffected */
      });

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onHide);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  return null;
}
