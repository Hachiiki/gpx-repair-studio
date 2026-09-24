/**
 * XmlIo adapter guard tests (infrastructure layer).
 *
 * Node environment on purpose: no DOM globals exist here, which is exactly
 * the condition the adapter's guards must diagnose clearly.
 */

import { describe, expect, it } from "vitest";
import { createDomXmlIo } from "@/lib/utils/xml";

describe("createDomXmlIo (bare Node: no DOM globals)", () => {
  it("throws a descriptive error when DOMParser is unavailable", () => {
    expect(() => createDomXmlIo()).toThrow(/no global DOMParser/);
  });

  it("DOMParser absence is detected before XMLSerializer", () => {
    // Ordering guarantee: the parser check fires first, so the message is
    // deterministic even when both globals are missing.
    const message = (() => {
      try {
        createDomXmlIo();
      } catch (err) {
        return (err as Error).message;
      }
      return "";
    })();
    expect(message).toContain("DOMParser");
    expect(message).not.toContain("XMLSerializer");
  });

  it("throws when only XMLSerializer is missing", () => {
    const hadParser = "DOMParser" in globalThis;
    (globalThis as Record<string, unknown>).DOMParser = class Dummy {};
    try {
      expect(() => createDomXmlIo()).toThrow(/no global XMLSerializer/);
    } finally {
      if (hadParser) {
        delete (globalThis as Record<string, unknown>).DOMParser;
      }
    }
  });
});
