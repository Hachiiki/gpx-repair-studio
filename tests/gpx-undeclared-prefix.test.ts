// @vitest-environment jsdom
/**
 * Undeclared-namespace-prefix recovery (parse.ts).
 *
 * Real-world motivation: GloryFit watches emit Garmin-style `gpxtpx:`
 * extensions without any `xmlns:gpxtpx` declaration — an XML namespace
 * violation that makes strict parsers (including every browser DOMParser)
 * reject the whole document. The parser's contract: when a document is
 * malformed AND uses prefixes it never declares, bind them on the root and
 * retry; surface a visible `undeclared-namespace` warning on success; keep
 * the ORIGINAL error when recovery cannot help (never mask a genuine
 * malformation). Point values are captured verbatim from the recovered
 * document — recovery touches structure, never data.
 */

import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { makeIo, parseFixture } from "./helpers/gpxTestUtils";

const GARMIN_TPE =
  "http://www.garmin.com/xmlschemas/TrackPointExtension/v1";

/** GloryFit-shaped minimal document with an undeclared gpxtpx prefix. */
const UNDECLARED_GPXTPX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gpx xmlns="http://www.topografix.com/GPX/1/0" version="1.0" creator="GloryFitPro">',
  "<metadata><time>2026-09-23T11:28:23.00Z</time></metadata>",
  "<trk><type>Outdoor run</type>",
  "<trkseg>",
  '<trkpt lat="14.689492" lon="121.094657">',
  "<ele>137</ele><time>2026-09-23T11:28:23.00Z</time>",
  "<extensions><gpxtpx:TrackPointExtension>",
  "<gpxtpx:hr>105</gpxtpx:hr><gpxtpx:cad>0</gpxtpx:cad>",
  "</gpxtpx:TrackPointExtension></extensions>",
  "</trkpt>",
  "</trkseg></trk></gpx>",
].join("\n");

/** Document with an undeclared prefix no known binding exists for. */
const UNDECLARED_UNKNOWN = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="X">',
  "<trk><trkseg>",
  '<trkpt lat="1.0" lon="2.0"><foo:sensor>hot</foo:sensor></trkpt>',
  "</trkseg></trk></gpx>",
].join("\n");

/** Genuinely malformed document that ALSO has an undeclared prefix —
 * recovery must fail and the ORIGINAL error must stand. */
const MALFORMED_WITH_PREFIX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="X">',
  "<trk><trkseg>",
  '<trkpt lat="1.0" lon="2.0"><gpxtpx:hr>100</gpxtpx:hr></trkpt',
  "</trkseg></trk></gpx>", // missing '>' on the trkpt closing tag
].join("\n");

describe("recovery: undeclared gpxtpx (GloryFit shape)", () => {
  it("parses after binding the prefix, values verbatim, warning surfaced", () => {
    const outcome = parseGpx(UNDECLARED_GPXTPX, makeIo());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const point = outcome.data.segments[0].points[0];
    expect(point.lat).toBeCloseTo(14.689492, 6);
    expect(point.lon).toBeCloseTo(121.094657, 6);
    expect(point.ele).toBe(137);
    expect(point.time).toBe(Date.parse("2026-09-23T11:28:23.00Z"));
    expect(point.flags).toEqual([]);
    // Verbatim capture survived the recovery untouched.
    expect(point.raw.lat).toBe("14.689492");
    expect(point.raw.lon).toBe("121.094657");
    // The extension snapshot is present and carries the hr/cad content.
    const extra = point.raw.children.find((c) => c.kind === "extra");
    expect(extra).toBeDefined();
    expect(extra!.kind === "extra" && extra!.xml).toContain("gpxtpx:hr");
    expect(extra!.kind === "extra" && extra!.xml).toContain("gpxtpx:cad");

    // Exactly one recovery warning, naming the prefix and the Garmin URI.
    const recoveryIssues = outcome.data.issues.filter(
      (i) => i.kind === "undeclared-namespace",
    );
    expect(recoveryIssues).toHaveLength(1);
    expect(recoveryIssues[0].severity).toBe("warning");
    expect(recoveryIssues[0].message).toContain("gpxtpx");
    expect(recoveryIssues[0].message).toContain(GARMIN_TPE);
  });

  it("the committed fixture parses with the same recovery warning", () => {
    const data = parseFixture("undeclared-prefix.gpx");
    expect(data.fileMeta).toMatchObject({ creator: "GloryFitPro", version: "1.0" });
    expect(data.segments[0].points).toHaveLength(8);
    expect(
      data.issues.filter((i) => i.kind === "undeclared-namespace"),
    ).toHaveLength(1);
    // Track meta survived too: type word + vendor extension snapshot.
    expect(data.tracks[0].type).toBe("Outdoor run");
    expect(data.tracks[0].extras[0].xml).toContain("<totalTime>36</totalTime>");
  });

  it("round-trips: exported bytes re-parse cleanly with no second warning", () => {
    const data = parseFixture("undeclared-prefix.gpx");
    const xml = exportGpxIdentity(data, makeIo());
    const reparsed = parseGpx(xml, makeIo());
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.data.segments[0].points).toHaveLength(8);
    // The export materializes the binding, so the re-parse needs no recovery.
    expect(
      reparsed.data.issues.filter((i) => i.kind === "undeclared-namespace"),
    ).toHaveLength(0);
    // And a second export is byte-stable (corpus stability contract).
    expect(exportGpxIdentity(reparsed.data, makeIo())).toBe(xml);
  });
});

describe("recovery: unknown prefixes", () => {
  it("binds to a clearly-marked synthetic URN and warns", () => {
    const outcome = parseGpx(UNDECLARED_UNKNOWN, makeIo());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const warning = outcome.data.issues.find(
      (i) => i.kind === "undeclared-namespace",
    );
    expect(warning).toBeDefined();
    expect(warning!.message).toContain("foo");
    expect(warning!.message).toContain(
      "urn:gpx-repair-studio:undeclared-prefix:foo",
    );
    const point = outcome.data.segments[0].points[0];
    expect(point.lat).toBe(1.0);
    expect(point.flags).toEqual([]);
  });
});

describe("recovery never masks genuine malformation", () => {
  it("malformed document with an undeclared prefix keeps the original error", () => {
    const outcome = parseGpx(MALFORMED_WITH_PREFIX, makeIo());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe("malformed-xml");
  });

  it("clean documents are unaffected — no warnings, single strict parse", () => {
    // garmin-extensions.gpx declares all its prefixes: the recovery path
    // must never fire for it (no undeclared-namespace issue anywhere).
    const data = parseFixture("garmin-extensions.gpx");
    expect(
      data.issues.filter((i) => i.kind === "undeclared-namespace"),
    ).toHaveLength(0);
    const strava = parseFixture("strava-export.gpx");
    expect(
      strava.issues.filter((i) => i.kind === "undeclared-namespace"),
    ).toHaveLength(0);
  });
});
