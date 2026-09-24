// @vitest-environment jsdom
/**
 * Provenance-extension schema tests (docs/MASTER_PLAN.md §H-7).
 *
 * The gpxr vocabulary is defined in Phase 1 but deliberately NOT wired
 * into the exporter — these tests lock the schema so Phase 7 can rely on
 * it, and the round-trip suite separately asserts the identity exporter
 * emits no gpxr markers.
 */

import { describe, expect, it } from "vitest";
import {
  GPXR_ATTRIBUTES,
  GPXR_ELEMENTS,
  GPXR_NAMESPACE,
  GPXR_PREFIX,
  buildReconstructedExtension,
  buildSummaryExtension,
} from "@/features/gpx/provenanceSchema";
import { makeIo } from "./helpers/gpxTestUtils";

describe("schema constants", () => {
  it("declares the documented namespace, prefix, and names", () => {
    expect(GPXR_NAMESPACE).toBe("https://gpx-repair.studio/schema/1");
    expect(GPXR_PREFIX).toBe("gpxr");
    expect(GPXR_ELEMENTS).toEqual({ reconstructed: "reconstructed", summary: "summary" });
    expect(GPXR_ATTRIBUTES).toEqual({
      timeMethod: "timeMethod",
      eleMethod: "eleMethod",
      reconstructedDistanceM: "reconstructedDistanceM",
      gapCount: "gapCount",
    });
  });
});

describe("buildReconstructedExtension", () => {
  it("creates a namespaced marker with provided attributes only", () => {
    const io = makeIo();
    const doc = io.createDocument(
      "http://www.topografix.com/GPX/1/1",
      "gpx",
    );
    const el = buildReconstructedExtension(doc, {
      timeMethod: "distance-proportional",
      eleMethod: "elevation-api",
    });
    expect(el.namespaceURI).toBe(GPXR_NAMESPACE);
    expect(el.tagName).toBe("gpxr:reconstructed");
    expect(el.getAttribute("timeMethod")).toBe("distance-proportional");
    expect(el.getAttribute("eleMethod")).toBe("elevation-api");

    const partial = buildReconstructedExtension(doc, { timeMethod: "uniform" });
    expect(partial.getAttribute("timeMethod")).toBe("uniform");
    expect(partial.hasAttribute("eleMethod")).toBe(false);
  });
});

describe("buildSummaryExtension", () => {
  it("creates a summary with numeric attributes as strings", () => {
    const io = makeIo();
    const doc = io.createDocument(
      "http://www.topografix.com/GPX/1/1",
      "gpx",
    );
    const el = buildSummaryExtension(doc, {
      reconstructedDistanceM: 1842.7,
      gapCount: 3,
    });
    expect(el.namespaceURI).toBe(GPXR_NAMESPACE);
    expect(el.tagName).toBe("gpxr:summary");
    expect(el.getAttribute("reconstructedDistanceM")).toBe("1842.7");
    expect(el.getAttribute("gapCount")).toBe("3");
    expect(io.serialize(el)).toContain('gapCount="3"');
  });
});
