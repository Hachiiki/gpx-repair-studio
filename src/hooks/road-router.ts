"use client";

/**
 * road-router (§EE 17.1 + 17.2) — the app-layer owner of the ONE
 * shared routing instance.
 *
 * Two guarantees live here, at the only place a request can leave:
 *
 *   1. THE CONSENT GATE (hard): the injected fetch refuses unless
 *      this session's consent is "granted" — whichever hook calls the
 *      router, no request can ever leave the browser before the user
 *      said yes (the e2e asserts this by counting calls). The four
 *      draw hooks ALSO gate honestly at the effect level (status +
 *      enable notice) — this is the seatbelt under that UX.
 *
 *   2. THE PROVIDER CONFIG (live): the endpoints resolve from the
 *      ui-store's `customRouterUrl` on every request — the user's own
 *      OSRM-compatible server when set, the public demo servers
 *      otherwise — and the configuration signature joins every cache
 *      key inside the router, so answers from one server can never be
 *      served for another.
 *
 * Phase 17 — Road snapping, opt-in. App layer: stores + fetch allowed.
 */

import { RoadFollowRouter } from "@/features/reconstruction/roadFollow";
import {
  resolveRouterEndpoints,
  routerHostsLabel,
  validateCustomRouterUrlInput,
} from "@/features/reconstruction/routerConfig";
import { useUiStore } from "@/state/ui-store";

/**
 * Thrown by the gated fetch when consent is missing — swallowed by the
 * router's failure paths (straight-leg fallback), exactly like a
 * network error. The hooks' honest gate means this should never fire
 * from the UI; it exists so it CAN never fire at all.
 */
class RouterConsentError extends Error {
  constructor() {
    super("road snapping is not enabled for this session");
    this.name = "RouterConsentError";
  }
}

let sharedRoadRouter: RoadFollowRouter | null = null;

/**
 * The shared routing instance (one per page): its cache makes
 * undo/redo and vertex re-drags of the same leg instant, and every
 * section (repair, recovery, create, plan) shares it — one router per
 * page, not per section.
 */
export function getRoadRouter(): RoadFollowRouter {
  if (!sharedRoadRouter) {
    sharedRoadRouter = new RoadFollowRouter({
      fetch: (input, init) => {
        if (useUiStore.getState().routerConsent !== "granted") {
          return Promise.reject(new RouterConsentError());
        }
        return fetch(input, init);
      },
      config: () =>
        resolveRouterEndpoints(useUiStore.getState().customRouterUrl),
    });
  }
  return sharedRoadRouter;
}

/** §EE 17.2 — ask for consent (opens the dialog; never routes). */
export function requestRouterConsent(): void {
  useUiStore.getState().setRouterConsentDialogOpen(true);
}

/**
 * §EE 17.1/17.2 — the live provider label for the footer chip and the
 * consent dialog (components may not import feature modules, so the
 * hook supplies the primitives). `custom` is true when the user's own
 * router is configured — the copy adjusts.
 */
export function useRouterHostsLabel(): { hostsLabel: string; custom: boolean } {
  const customRouterUrl = useUiStore((s) => s.customRouterUrl);
  const custom = customRouterUrl !== null;
  if (!custom) {
    // Read once without subscribing — the default never changes.
    return {
      hostsLabel: routerHostsLabel(resolveRouterEndpoints(null)),
      custom: false,
    };
  }
  return {
    hostsLabel: routerHostsLabel(resolveRouterEndpoints(customRouterUrl)),
    custom: true,
  };
}

/**
 * §EE 17.1 — the privacy pane's routing settings, as a hook: the
 * persisted custom URL, honest validation (the pure rules live in
 * features/reconstruction/routerConfig, unit-tested there), apply and
 * reset. The component stays presentation; the store writes flow here.
 */
export function useRouterSettings(): {
  current: string | null;
  validate: (raw: string) => { ok: true; value: string | null } | { ok: false; reason: string };
  apply: (raw: string) => boolean;
  reset: () => void;
} {
  const current = useUiStore((s) => s.customRouterUrl);
  return {
    current,
    validate: validateCustomRouterUrlInput,
    apply: (raw: string) => {
      const verdict = validateCustomRouterUrlInput(raw);
      if (!verdict.ok) return false;
      useUiStore.getState().setCustomRouterUrl(verdict.value);
      return true;
    },
    reset: () => useUiStore.getState().setCustomRouterUrl(null),
  };
}
