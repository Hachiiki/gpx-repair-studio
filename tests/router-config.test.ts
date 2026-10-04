/**
 * Unit tests — routerConfig (§EE 17.1, the provider abstraction).
 *
 * The provider contract: one user-settable OSRM-compatible base URL
 * resolving to the endpoints every routing call uses; honest
 * validation of what the user typed; a plain-language hosts label the
 * footer chip and consent dialog quote; the configuration signature
 * that keeps one server's answers out of another's cache.
 */

import { translatorFor } from "@/i18n/runtime";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OSRM_BASE,
  DEFAULT_VALHALLA_URL,
  hostOf,
  normalizeCustomRouterUrl,
  resolveRouterEndpoints,
  routerHostsLabel,
  validateCustomRouterUrlInput,
} from "@/features/reconstruction/routerConfig";

describe("normalizeCustomRouterUrl", () => {
  it("keeps a clean https base URL as-is", () => {
    expect(normalizeCustomRouterUrl("https://osrm.example.com")).toBe(
      "https://osrm.example.com",
    );
  });

  it("strips trailing slashes and query strings", () => {
    expect(normalizeCustomRouterUrl("https://osrm.example.com///")).toBe(
      "https://osrm.example.com",
    );
    expect(normalizeCustomRouterUrl("https://osrm.example.com/?x=1")).toBe(
      "https://osrm.example.com",
    );
  });

  it("keeps a path prefix (reverse-proxy mounts)", () => {
    expect(normalizeCustomRouterUrl("https://example.com/osrm/")).toBe(
      "https://example.com/osrm",
    );
  });

  it("accepts http for local test servers", () => {
    expect(normalizeCustomRouterUrl("http://localhost:5000")).toBe(
      "http://localhost:5000",
    );
  });

  it("trims whitespace", () => {
    expect(normalizeCustomRouterUrl("  https://osrm.example.com  ")).toBe(
      "https://osrm.example.com",
    );
  });

  it("refuses junk and non-http schemes", () => {
    expect(normalizeCustomRouterUrl("")).toBeNull();
    expect(normalizeCustomRouterUrl("osrm.example.com")).toBeNull();
    expect(normalizeCustomRouterUrl("ftp://osrm.example.com")).toBeNull();
    expect(normalizeCustomRouterUrl("not a url")).toBeNull();
  });
});

describe("resolveRouterEndpoints (default vs custom)", () => {
  it("defaults: public OSRM for car, public Valhalla for foot", () => {
    const endpoints = resolveRouterEndpoints(null);
    expect(endpoints.carUrl).toBe(`${DEFAULT_OSRM_BASE}/route/v1/driving`);
    expect(endpoints.foot).toEqual({
      kind: "valhalla",
      url: DEFAULT_VALHALLA_URL,
    });
    expect(endpoints.configKey).toBe("default");
  });

  it("custom: BOTH profiles route to the user's server", () => {
    const endpoints = resolveRouterEndpoints("https://osrm.example.com");
    expect(endpoints.carUrl).toBe(
      "https://osrm.example.com/route/v1/driving",
    );
    expect(endpoints.foot).toEqual({
      kind: "osrm",
      url: "https://osrm.example.com/route/v1/foot",
    });
    // The signature keeps one server's cache answers out of another's.
    expect(endpoints.configKey).toBe("https://osrm.example.com");
    expect(endpoints.configKey).not.toBe(
      resolveRouterEndpoints(null).configKey,
    );
  });

  it("an invalid custom URL falls back to the public defaults", () => {
    expect(resolveRouterEndpoints("junk")).toEqual(resolveRouterEndpoints(null));
  });
});

describe("routerHostsLabel + hostOf", () => {
  it("names both public hosts by default", () => {
    expect(routerHostsLabel(resolveRouterEndpoints(null))).toBe(
      "router.project-osrm.org · valhalla1.openstreetmap.de",
    );
  });

  it("names only the custom host when one is set", () => {
    expect(
      routerHostsLabel(resolveRouterEndpoints("https://osrm.example.com")),
    ).toBe("osrm.example.com");
  });

  it("hostOf extracts the host, defensively", () => {
    expect(hostOf("https://a.example.com/route/v1/driving")).toBe(
      "a.example.com",
    );
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("validateCustomRouterUrlInput (honest verdicts)", () => {
  it("empty is valid and means 'use the public servers'", () => {
    expect(validateCustomRouterUrlInput("  ")).toEqual({
      ok: true,
      value: null,
    });
  });

  it("a good URL validates to its normalized form", () => {
    expect(
      validateCustomRouterUrlInput("https://osrm.example.com/"),
    ).toEqual({ ok: true, value: "https://osrm.example.com" });
  });

  it("a missing scheme names the fix", () => {
    const verdict = validateCustomRouterUrlInput("osrm.example.com");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(translatorFor("en")(verdict.reasonKey)).toMatch(/must start with https:\/\//i);
    }
  });

  it("an unparseable URL says so plainly", () => {
    const verdict = validateCustomRouterUrlInput("https://");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(translatorFor("en")(verdict.reasonKey)).toMatch(/does not parse/i);
    }
  });
});
