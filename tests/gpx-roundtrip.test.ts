// @vitest-environment jsdom
/**
 * Identity round-trip tests (docs/MASTER_PLAN.md §H "non-negotiable
 * invariant", §N-1 export suite — Phase 1 identity scope).
 *
 * For every parseable fixture:
 *   1. parse → export → re-parse produces a semantically identical model,
 *      including the verbatim raw strings of every original point
 *      (byte-identity of lat/lon attribute values and ele/time texts);
 *   2. export is deterministic and stable (exporting the re-parsed model
 *      reproduces the same bytes);
 *   3. the output is well-formed GPX with the standard declaration and LF
 *      line endings;
 *   4. the identity exporter emits NO provenance markers (gpxr stays
 *      unused until Phase 7).
 */

import { describe, expect, it } from "vitest";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { parseGpx } from "@/features/gpx/parse";
import { generateSyntheticGpx } from "@/features/gpx/fixtures/generators";
import {
  PARSEABLE_FIXTURES,
  makeIo,
  parseFixture,
  projectModel,
  roundTrip,
} from "./helpers/gpxTestUtils";

describe("identity round-trip over the whole corpus", () => {
  for (const fixture of PARSEABLE_FIXTURES) {
    it(`${fixture} — re-parses to an identical model`, () => {
      const first = parseFixture(fixture);
      const { xml, second } = roundTrip(first);

      // Well-formed output with declaration and LF endings.
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
      expect(xml.endsWith("\n")).toBe(true);
      expect(xml.charCodeAt(0)).toBe("<".charCodeAt(0)); // no BOM in output

      // Semantic + verbatim-value identity (raw strings included).
      expect(projectModel(second)).toEqual(projectModel(first));

      // Both models frozen outside production.
      expect(Object.isFrozen(second)).toBe(true);

      // No provenance markers in identity output (Phase 7 scope).
      expect(xml).not.toContain("gpx-repair.studio");
    });
  }

  it("export is stable: export(parse(export(x))) === export(x)", () => {
    for (const fixture of PARSEABLE_FIXTURES) {
      const first = parseFixture(fixture);
      const { xml, second } = roundTrip(first);
      expect(exportGpxIdentity(second, makeIo())).toBe(xml);
    }
  });
});

describe("original-data-untouched invariant (explicit checks)", () => {
  it("every original point value survives the loop byte-identically", () => {
    const first = parseFixture("bad-coords.gpx");
    const { second } = roundTrip(first);
    for (let i = 0; i < first.segments[0].points.length; i++) {
      const a = first.segments[0].points[i];
      const b = second.segments[0].points[i];
      expect(b.raw.lat).toBe(a.raw.lat); // 'abc', null, '', '91.5' … verbatim
      expect(b.raw.lon).toBe(a.raw.lon);
      expect(b.ele).toBe(a.ele);
      expect(b.time).toBe(a.time);
      const aTexts = a.raw.children.filter((c) => c.kind !== "extra");
      const bTexts = b.raw.children.filter((c) => c.kind !== "extra");
      expect(bTexts).toEqual(aTexts); // ele/time texts, byte-identical
    }
  });

  it("exported bytes contain the original attribute spellings", () => {
    const first = parseFixture("valid-1.1.gpx");
    const { xml } = roundTrip(first);
    expect(xml).toContain('lat="52.520006"');
    expect(xml).toContain('<ele>41.6</ele>');
    expect(xml).toContain("<time>2024-05-01T07:00:00Z</time>");
    // Trailing zeros from the padded fixture survive.
    const padded = roundTrip(parseFixture("pretty-indented.gpx")).xml;
    expect(padded).toContain("41.60");
  });

  it("exactly-attributed points: absent attributes stay absent", () => {
    const data = parseFixture("bad-coords.gpx");
    const { xml } = roundTrip(data);
    // The point without a lat attribute is re-emitted without one.
    expect(xml).not.toMatch(/<trkpt lon="13\.405094" lat=""\/>/);
    expect(xml).toMatch(/<trkpt lon="13\.405094"(?: [^>]*)?>/);
  });

  it("export never mutates the model", () => {
    const first = parseFixture("valid-1.1.gpx");
    const before = JSON.stringify(first);
    roundTrip(first);
    expect(JSON.stringify(first)).toBe(before);
  });
});

describe("structure preservation details", () => {
  it("GPX 1.0 files keep version and root-level metadata layout", () => {
    const { xml } = roundTrip(parseFixture("valid-1.0.gpx"));
    expect(xml).toContain('version="1.0"');
    expect(xml).toContain('creator="Garmin eTrex 20"');
    // 1.0 layout: name/time directly under root, no <metadata>.
    expect(xml).toMatch(/<gpx [^>]*><name>Old Trail<\/name><time>/);
    expect(xml).not.toContain("<metadata>");
  });

  it("waypoints and routes are re-emitted with their children", () => {
    const { xml } = roundTrip(parseFixture("wpt-rte.gpx"));
    expect(xml).toContain("<sym>Flag, Blue</sym>");
    expect(xml).toContain("gpxx:WaypointExtension");
    expect((xml.match(/<rtept/g) ?? []).length).toBe(3);
  });

  it("vendor extensions survive at every level", () => {
    const { xml } = roundTrip(parseFixture("garmin-extensions.gpx"));
    expect(xml).toContain("<gpxtpx:hr>152</gpxtpx:hr>");
    expect(xml).toContain("<gpxtpx:cad>84</gpxtpx:cad>");
    expect(xml).toContain("TrackStatsExtension");
  });

  it("root/track/segment extras are re-emitted at their anchored positions", () => {
    const { xml } = roundTrip(parseFixture("extra-children.gpx"));
    expect(xml).toContain("root-level");
    expect(xml).toContain('position="after-first-point"');
    expect(xml).toContain('position="after-segment"');
    // The extra sits between the first and second trkpt.
    const seg = xml.slice(xml.indexOf("<trkseg>"), xml.indexOf("</trkseg>"));
    const firstPt = seg.indexOf("<trkpt");
    const extra = seg.indexOf("segext");
    const secondPt = seg.indexOf("<trkpt", firstPt + 1);
    expect(extra).toBeGreaterThan(firstPt);
    expect(extra).toBeLessThan(secondPt);
  });

  it("unknown extra namespaces stay bound in the serialized snapshots", () => {
    const { xml } = roundTrip(parseFixture("extra-children.gpx"));
    expect(xml).toContain("http://example.com/foo");
  });

  it("unicode content survives", () => {
    const { xml } = roundTrip(parseFixture("unicode-names.gpx"));
    expect(xml).toContain("Morgensport – 晨间跑步 – Désirée's loop");
    expect(xml).toContain("水塔 / Wasserturm");
  });
});

describe("synthetic round-trip at scale", () => {
  it("a 5 000-point generated file round-trips identically", () => {
    const xml = generateSyntheticGpx({ pointCount: 5_000, seed: 99 });
    const io = makeIo();
    const parse = (text: string) => {
      const result = parseGpx(text, io);
      if (!result.ok) throw new Error("parse failed");
      return result.data;
    };
    const first = parse(xml);
    const out = exportGpxIdentity(first, io);
    const second = parse(out);
    expect(projectModel(second)).toEqual(projectModel(first));
    expect(exportGpxIdentity(second, io)).toBe(out);
  }, 60_000);
});
