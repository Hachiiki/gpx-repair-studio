/**
 * RouterConfig (§EE 17.1) — the routing provider abstraction.
 *
 * One user-settable value: the base URL of an OSRM-compatible routing
 * server. Everything else about the providers resolves from it:
 *
 *   - no custom URL (default): "car" routes through the public OSRM
 *     demo server and "foot" through the public Valhalla demo server
 *     (the v1 behavior, now stated with its privacy implications);
 *   - a custom URL: BOTH profiles route through it at
 *     `{base}/route/v1/{driving|foot}` — an OSRM-compatible server
 *     serves whichever profile it was built with, which the
 *     self-hosting instructions in the README say plainly.
 *
 * The custom URL is a PREFERENCE (persisted like the basemap choice);
 * it is not consent — §EE 17.2's opt-in stays a separate, per-session,
 * never-persisted state. Purity contract: no fetch here, no stores —
 * callers (the app-layer router factory) inject both.
 *
 * Phase 17 — Road snapping, opt-in. Pure TypeScript.
 */

/** The public OSRM demo server (drivable roads; best-effort, keyless). */
export const DEFAULT_OSRM_BASE = "https://router.project-osrm.org";

/** The public Valhalla demo server (pedestrian ways; best-effort). */
export const DEFAULT_VALHALLA_URL = "https://valhalla1.openstreetmap.de/route";

/** The profile segment each mode maps to on an OSRM-compatible server. */
export type RouterProfile = "driving" | "foot";

/**
 * The resolved endpoints the router actually calls — derived from the
 * user's choice, never stored.
 */
export interface ResolvedRouterEndpoints {
  /** OSRM-compatible route service URL for the "car" mode. */
  carUrl: string;
  /**
   * The "foot" mode: an OSRM-compatible URL (custom server), or the
   * Valhalla demo POST endpoint (default).
   */
  foot:
    | { kind: "osrm"; url: string }
    | { kind: "valhalla"; url: string };
  /**
   * A stable signature of this configuration (joins every router cache
   * key, so answers from one server can never be served for another).
   */
  configKey: string;
}

/** Normalize a user-entered base URL; `null` when it is not usable. */
export function normalizeCustomRouterUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (!parsed.hostname) return null;
  // A base URL only — strip query/hash; keep any path prefix the user's
  // reverse-proxy mounts the service under; strip the trailing slash.
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${path}`;
}

/**
 * Resolve the live endpoints for a custom base URL (`null`/invalid →
 * the public defaults). Pure: same input, same output, no clock, no
 * network.
 */
export function resolveRouterEndpoints(
  customUrl: string | null,
): ResolvedRouterEndpoints {
  const custom = customUrl === null ? null : normalizeCustomRouterUrl(customUrl);
  if (custom === null) {
    return {
      carUrl: `${DEFAULT_OSRM_BASE}/route/v1/driving`,
      foot: { kind: "valhalla", url: DEFAULT_VALHALLA_URL },
      configKey: "default",
    };
  }
  return {
    carUrl: `${custom}/route/v1/driving`,
    foot: { kind: "osrm", url: `${custom}/route/v1/foot` },
    configKey: custom,
  };
}

/** The display host of an OSRM-compatible route URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * The plain-language label of where drawn points go under this
 * configuration — the footer chip and the consent dialog quote it, so
 * the user always reads the SAME host names the requests will hit.
 */
export function routerHostsLabel(endpoints: ResolvedRouterEndpoints): string {
  if (endpoints.foot.kind === "osrm") {
    return hostOf(endpoints.carUrl);
  }
  return `${hostOf(endpoints.carUrl)} · ${hostOf(endpoints.foot.url)}`;
}

/** An honest, sentence-form validation verdict for the settings input. */
export function validateCustomRouterUrlInput(
  raw: string,
): { ok: true; value: string | null } | { ok: false; reasonKey: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      ok: false,
      reasonKey: "router.reason.scheme",
    };
  }
  if (normalizeCustomRouterUrl(trimmed) === null) {
    return {
      ok: false,
      reasonKey: "router.reason.parse",
    };
  }
  return { ok: true, value: normalizeCustomRouterUrl(trimmed) };
}
