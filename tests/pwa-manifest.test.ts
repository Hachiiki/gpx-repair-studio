/**
 * Unit tests — src/app/manifest.ts (Phase 22.1): the installability
 * contract, pinned statically. These are exactly the criteria
 * Lighthouse's "installable" audit walks (a fetched manifest with a
 * name, a start_url, a standalone-ish display, and an icon at least
 * 192px) — asserted here so a careless edit fails in milliseconds,
 * not at audit time.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import manifestRoute from "@/app/manifest";

const m = manifestRoute();

describe("the web app manifest (Phase 22.1)", () => {
  it("is installable: name, id, start_url, and a standalone display", () => {
    expect(m.name).toBe("GPX Repair Studio");
    expect(m.short_name).toBeTruthy();
    expect(m.id).toBe("/");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(
      m.display,
    );
  });

  it("carries an icon of at least 192px (any + maskable)", () => {
    const icons = m.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    const sized = icons.filter(
      (icon) =>
        typeof icon.sizes === "string" &&
        icon.sizes !== "any" &&
        parseInt(icon.sizes.split("x")[0]!, 10) >= 192,
    );
    expect(sized.length).toBeGreaterThan(0);
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    // Every sized icon points at a PNG that actually ships in public/.
    for (const icon of sized) {
      expect(icon.src).toMatch(/^\/icons\/[a-z0-9-]+\.png$/);
      expect(
        existsSync(path.join(process.cwd(), "public", icon.src.slice(1))),
      ).toBe(true);
    }
  });

  it("carries both chrome colors (the light render of --background)", () => {
    expect(m.theme_color).toBe("#F1F1F2");
    expect(m.background_color).toBe("#F1F1F2");
  });

  // layout.tsx cannot be imported under vitest (next/font), so the
  // description is pinned verbatim here; the two must never drift.
  it("describes the app in the layout metadata's own words (pinned verbatim)", () => {
    expect(m.description).toBe(
      "Repair and reconstruct incomplete GPX running activities — locally in your browser. No GPX data ever leaves your device.",
    );
  });
});
