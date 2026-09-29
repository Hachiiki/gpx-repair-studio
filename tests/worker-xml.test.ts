// @vitest-environment jsdom
/**
 * Worker-XML engine parity tests (docs/MASTER_PLAN.md Phase 9).
 *
 * The Phase 9 parse worker runs `parseGpx` with the compact tokenizer
 * XmlIo (lib/gpx/worker-xml.ts) because workers have no DOMParser. These
 * tests keep that engine honest against the native DOM implementation:
 *
 *   1. CORPUS EQUIVALENCE — every committed fixture (plus generated
 *      synthetic documents, incl. a GloryFit-style undeclared-prefix file)
 *      must parse to a structurally identical outcome through BOTH
 *      implementations: same ok/error shape, same points/flags/ids/issues,
 *      and snapshots that are semantically equal XML (canonicalized).
 *   2. IDENTITY-EXPORT BYTE EQUALITY — exportGpxIdentity over the
 *      DOM-parsed model vs the worker-parsed model must produce the exact
 *      same bytes (the end-to-end proof that snapshot differences, if
 *      any, are purely lexical).
 *   3. TOKENIZER SEMANTICS — namespace resolution, entities, CDATA,
 *      comments/PIs/DOCTYPE, quoted attributes, strictness parity on
 *      malformed documents, textContent, getElementsByTagNameNS, the
 *      serialize contract (in-scope namespace materialization), and the
 *      progress callback.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { generateSyntheticGpx } from "@/features/gpx/fixtures/generators";
import { createDomXmlIo } from "@/lib/utils/xml";
import {
  createWorkerXmlIo,
  tokenizeXml,
  XmlSyntaxError,
} from "@/lib/gpx/worker-xml";
import type { OriginalTrackData, ParseOutcome } from "@/types/domain";

const FIXTURES_DIR = join(
  process.cwd(),
  "src",
  "features",
  "gpx",
  "fixtures",
  "files",
);

// ---------------------------------------------------------------------------
// Canonicalization: semantic XML comparison for snapshot strings
// ---------------------------------------------------------------------------

interface CanonicalNode {
  tag: string;
  ns: string | null;
  attrs: [string, string][];
  text: string;
  children: CanonicalNode[];
}

/** Canonicalize an XML string through the native DOM (jsdom). */
function canonicalizeXml(xml: string): CanonicalNode {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const err = doc.getElementsByTagNameNS("*", "parsererror");
  if (err.length > 0) {
    throw new Error(`snapshot is not well-formed XML: ${xml.slice(0, 120)}`);
  }
  const walk = (el: Element): CanonicalNode => ({
    tag: el.localName,
    ns: el.namespaceURI ?? null,
    attrs: Array.from(el.attributes)
      .map((a) => [a.name, a.value] as [string, string])
      .sort(([a], [b]) => a.localeCompare(b)),
    text: Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3 || n.nodeType === 4) // Text + CDATA
      .map((n) => n.textContent ?? "")
      .join(""),
    children: Array.from(el.children).map(walk),
  });
  if (doc.documentElement === null) throw new Error("empty snapshot");
  return walk(doc.documentElement);
}

/**
 * Normalize a parsed model for comparison: every verbatim snapshot string
 * is replaced by its canonical form (attribute order and namespace-
 * declaration placement stop mattering; semantics must not).
 */
function normalizeModel(data: OriginalTrackData): unknown {
  // The clone's snapshot fields are re-typed to carry canonical nodes —
  // comparison only; never handed back to the app.
  const clone = structuredClone(data) as unknown as Record<string, unknown> & {
    fileMeta: { metadataExtras: unknown[] };
    tracks: { extras: { afterSegmentCount: number; xml: unknown }[] }[];
    segments: {
      extras: { afterPointCount: number; xml: unknown }[];
      points: {
        raw: { children: ({ kind: string; xml?: unknown; text?: unknown })[] };
      }[];
    }[];
    waypoints: { rawXml: unknown; name?: string }[];
    routes: { rawXml: unknown; name?: string }[];
  };
  const canon = (xml: string): CanonicalNode => {
    try {
      return canonicalizeXml(xml);
    } catch (err) {
      throw new Error(
        `snapshot failed canonicalization: ${String(err)}\n${xml.slice(0, 200)}`,
      );
    }
  };
  clone.fileMeta.metadataExtras = clone.fileMeta.metadataExtras.map((x) =>
    canon(x as string),
  );
  clone.rootExtras = ((clone.rootExtras as unknown[]) ?? []).map((x) =>
    canon(x as string),
  );
  for (const track of clone.tracks) {
    track.extras = track.extras.map((e) => ({
      afterSegmentCount: e.afterSegmentCount,
      xml: canon(e.xml as string),
    }));
  }
  for (const segment of clone.segments) {
    segment.extras = segment.extras.map((e) => ({
      afterPointCount: e.afterPointCount,
      xml: canon(e.xml as string),
    }));
    for (const point of segment.points) {
      point.raw.children = point.raw.children.map((c) =>
        c.kind === "extra"
          ? { kind: "extra" as const, xml: canon(c.xml as string) }
          : c,
      );
    }
  }
  for (const wpt of clone.waypoints) wpt.rawXml = canon(wpt.rawXml as string);
  for (const rte of clone.routes) rte.rawXml = canon(rte.rawXml as string);
  return clone;
}

// ---------------------------------------------------------------------------
// 1 + 2 — corpus equivalence and export byte-equality
// ---------------------------------------------------------------------------

const fixtureNames = readdirSync(FIXTURES_DIR).filter((f) =>
  f.endsWith(".gpx"),
);

describe("worker XmlIo corpus equivalence", () => {
  it("has a non-empty committed corpus", () => {
    expect(fixtureNames.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of fixtureNames) {
    it(`fixture ${name}: identical outcome through both engines`, () => {
      const text = readFileSync(join(FIXTURES_DIR, name), "utf8");
      expectBothEnginesAgree(text, name);
    });
  }

  it("synthetic 500-point document: identical outcome through both engines", () => {
    const text = generateSyntheticGpx({ pointCount: 500, seed: 7 });
    expectBothEnginesAgree(text, "synthetic-500");
  });

  it("synthetic document with extensions: identical outcome", () => {
    // Vendor-style extensions inside trkpts (the GloryFit/Strava shape).
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Extension Test" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Ext run</name><trkseg>
    <trkpt lat="52.5200" lon="13.4050"><ele>41.2</ele><time>2024-05-01T07:00:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>142</gpxtpx:hr><gpxtpx:cad>81</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lat="52.5201" lon="13.4051"><ele>41.3</ele><time>2024-05-01T07:00:01Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>144</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;
    expectBothEnginesAgree(text, "extensions");
  });

  it("undeclared-prefix recovery works identically (GloryFit shape)", () => {
    // Prefix used, never declared — both engines must reject, the
    // recovery must repair identically, and the re-export must agree.
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GloryFit" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>GF walk</name><trkseg>
<trkpt lat="1.0" lon="2.0"><time>2024-05-01T07:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>99</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
<trkpt lat="1.001" lon="2.001"><time>2024-05-01T07:00:01Z</time></trkpt>
</trkseg></trk></gpx>`;
    expectBothEnginesAgree(text, "undeclared-gpxtpx");
  });
});

function expectBothEnginesAgree(text: string, label: string): void {
  const domOutcome: ParseOutcome = parseGpx(text, createDomXmlIo());
  const workerOutcome: ParseOutcome = parseGpx(text, createWorkerXmlIo());

  // Same ok/error shape.
  expect(workerOutcome.ok, `${label}: ok flag`).toBe(domOutcome.ok);
  if (!domOutcome.ok || !workerOutcome.ok) {
    const domErr = domOutcome.ok ? null : domOutcome.error;
    const workerErr = workerOutcome.ok ? null : workerOutcome.error;
    expect(workerErr?.kind, `${label}: error kind`).toBe(domErr?.kind);
    return;
  }

  // Structurally identical models (snapshots canonicalized).
  expect(normalizeModel(workerOutcome.data)).toEqual(
    normalizeModel(domOutcome.data),
  );

  // End-to-end: byte-identical identity export.
  const domExport = exportGpxIdentity(domOutcome.data, createDomXmlIo());
  const workerExport = exportGpxIdentity(workerOutcome.data, createDomXmlIo());
  expect(workerExport, `${label}: identity export bytes`).toBe(domExport);
}

// ---------------------------------------------------------------------------
// 3 — tokenizer semantics
// ---------------------------------------------------------------------------

describe("worker XML tokenizer", () => {
  it("resolves namespaces: default, prefixed, nested shadowing", () => {
    const doc = tokenizeXml(
      `<a xmlns="urn:a" xmlns:p="urn:p"><b/><p:c xmlns="urn:b"><d/></p:c><e xmlns:p="urn:p2"><p:f/></e></a>`,
    );
    const root = doc.documentElement!;
    expect(root.namespaceURI).toBe("urn:a");
    expect(root.children[0].namespaceURI).toBe("urn:a");
    expect(root.children[1].namespaceURI).toBe("urn:p");
    expect(root.children[1].children[0].namespaceURI).toBe("urn:b");
    expect(root.children[2].children[0].namespaceURI).toBe("urn:p2");
    expect(root.localName).toBe("a");
    expect(root.children[1].localName).toBe("c");
    expect(root.children[1].tagName).toBe("p:c");
  });

  it("decodes entities in text and attributes (incl. character refs)", () => {
    const doc = tokenizeXml(
      `<gpx version="1&amp;1" note="a&gt;b"><name>Caf&#233; &lt;run&gt; &quot;q&quot; &apos;s&apos;</name></gpx>`,
    );
    const root = doc.documentElement!;
    expect(root.getAttribute("version")).toBe("1&1");
    expect(root.getAttribute("note")).toBe("a>b");
    expect(root.children[0].textContent).toBe(`Café <run> "q" 's'`);
  });

  it("keeps CDATA verbatim as text and accepts comments/PIs/DOCTYPE", () => {
    const doc = tokenizeXml(
      `<?xml version="1.0"?><!-- lead --><?pi data?><!DOCTYPE gpx SYSTEM "x.dtd"><gpx><![CDATA[raw <&> text]]></gpx>`,
    );
    expect(doc.documentElement!.textContent).toBe("raw <&> text");
  });

  it("textContent concatenates the whole subtree (DOM semantics)", () => {
    const doc = tokenizeXml(`<a>1<b>2<c>3</c></b>4</a>`);
    expect(doc.documentElement!.textContent).toBe("1234");
  });

  it("getElementsByTagNameNS: specific, wildcard, subtree scoping, order", () => {
    const doc = tokenizeXml(
      `<r xmlns="urn:r" xmlns:x="urn:x"><x:t/><t/><x:t/></r>`,
    );
    const all = doc.getElementsByTagNameNS("*", "t");
    expect(all).toHaveLength(3);
    expect(doc.getElementsByTagNameNS("urn:x", "t")).toHaveLength(2);
    expect(doc.getElementsByTagNameNS("urn:r", "t")).toHaveLength(1);
    const root = doc.documentElement!;
    expect(root.getElementsByTagNameNS("urn:x", "t")).toHaveLength(2);
    // Document order.
    expect(all.map((e) => e.namespaceURI)).toEqual([
      "urn:x",
      "urn:r",
      "urn:x",
    ]);
  });

  it("single-quoted attributes and '>' inside values are legal", () => {
    const doc = tokenizeXml(`<a b='1' c="x>y">ok</a>`);
    expect(doc.documentElement!.getAttribute("b")).toBe("1");
    expect(doc.documentElement!.getAttribute("c")).toBe("x>y");
  });

  it("self-closing elements carry no children", () => {
    const doc = tokenizeXml(`<a><b/><c/></a>`);
    expect(doc.documentElement!.children).toHaveLength(2);
    expect(doc.documentElement!.children[0].children).toHaveLength(0);
  });

  it("throws on mismatched closing tags", () => {
    expect(() => tokenizeXml(`<a><b></a></b>`)).toThrow(XmlSyntaxError);
  });

  it("throws on unclosed elements", () => {
    expect(() => tokenizeXml(`<a><b>`)).toThrow(XmlSyntaxError);
    expect(() => tokenizeXml(`<a>`)).toThrow(XmlSyntaxError);
  });

  it("throws on undeclared prefixes (drives the recovery path)", () => {
    expect(() => tokenizeXml(`<a xmlns:p="urn:p"><p:b/><q:c/></a>`)).toThrow(
      /undeclared namespace prefix "q"/,
    );
  });

  it("throws on duplicate attributes", () => {
    expect(() => tokenizeXml(`<a x="1" x="2"/>`)).toThrow(/duplicate/);
  });

  it("throws on content outside the root element", () => {
    expect(() => tokenizeXml(`stray<a/>`)).toThrow(XmlSyntaxError);
    expect(() => tokenizeXml(`<a/><b/>`)).toThrow(
      /content is not allowed after the root element/,
    );
  });

  it("throws on invalid entity references", () => {
    expect(() => tokenizeXml(`<a>1 & 2</a>`)).toThrow(/entity/);
    expect(() => tokenizeXml(`<a>&bogus;</a>`)).toThrow(/entity/);
    expect(() => tokenizeXml(`<a>&#;</a>`)).toThrow(/entity/);
  });

  it("throws on raw ']]>' in text and '--' in comments", () => {
    expect(() => tokenizeXml(`<a>]]&gt;</a>`)).not.toThrow();
    expect(() => tokenizeXml(`<a>x]]>y</a>`)).toThrow();
    expect(() => tokenizeXml(`<!-- a -- b --><a/>`)).toThrow();
  });

  it("throws on '<' inside attribute values", () => {
    expect(() => tokenizeXml(`<a x="1 < 2"/>`)).toThrow();
  });

  it("errors carry 1-based line and column", () => {
    try {
      tokenizeXml(`<a>\n<b></a></b>`);
      expect.unreachable("must throw");
    } catch (err) {
      expect(err).toBeInstanceOf(XmlSyntaxError);
      const e = err as XmlSyntaxError;
      expect(e.line).toBe(2);
      expect(e.column).toBeGreaterThan(0);
    }
  });

  it("serialize materializes in-scope namespaces on the subtree root", () => {
    const io = createWorkerXmlIo();
    const doc = io.parse(
      `<a xmlns="urn:a" xmlns:p="urn:p"><p:b><c/></p:b></a>`,
    ) as unknown as {
      documentElement: { children: { children: { namespaceURI: string | null }[] }[] };
    };
    const inner = doc.documentElement.children[0];
    const snapshot = io.serialize(inner as never);
    // The serialized subtree must re-declare what it inherited…
    expect(snapshot).toContain('xmlns:p="urn:p"');
    // …and re-parse to the same namespaces (round-trip).
    const reparsed = io.parse(`<wrap xmlns="urn:w">${snapshot}</wrap>`) as unknown as {
      documentElement: { children: { children: { namespaceURI: string | null }[] }[] };
    };
    const b = reparsed.documentElement.children[0]!;
    expect(b.children[0]!.namespaceURI).toBe("urn:a");
  });

  it("serialize escapes text and attribute values", () => {
    const io = createWorkerXmlIo();
    const doc = io.parse(
      `<a note="1&lt;2 &amp; 3&quot;"><name>a &lt; b &amp; c</name></a>`,
    ) as unknown as { documentElement: unknown };
    const xml = io.serialize(doc.documentElement as never);
    expect(xml).toBe(`<a note="1&lt;2 &amp; 3&quot;"><name>a &lt; b &amp; c</name></a>`);
  });

  it("reports progress over large documents and reaches the total", () => {
    const text = generateSyntheticGpx({ pointCount: 20_000, seed: 3 });
    const seen: number[] = [];
    const doc = tokenizeXml(text, {
      onProgress: (consumed, total) => {
        expect(total).toBeGreaterThan(500_000);
        seen.push(consumed);
      },
    });
    expect(doc.documentElement).not.toBeNull();
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Monotonic and lands exactly on the total.
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
    expect(seen[seen.length - 1]).toBe(
      text.charCodeAt(0) === 0xfeff ? text.length - 1 : text.length,
    );
  });

  it("tolerates a UTF-8 BOM", () => {
    const doc = tokenizeXml(`\uFEFF<a/>`);
    expect(doc.documentElement!.localName).toBe("a");
  });
});
