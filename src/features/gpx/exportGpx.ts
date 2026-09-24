/**
 * GPX exporter — identity round-trip (docs/MASTER_PLAN.md §H-7, Phase 1
 * scope).
 *
 * **Identity export**: re-emit the *original* data verbatim. Every original
 * point's `lat`/`lon` attribute values and `<ele>`/`<time>` texts are
 * written from the verbatim capture taken at parse time — the
 * original-data-untouched invariant (§H "non-negotiable"): repair only ever
 * *inserts*; recorded values are never rewritten. Waypoints, routes, and
 * non-standard elements (root/track/segment/point extras) are re-emitted
 * from their serialized snapshots with namespaces intact.
 *
 * Scope limits (by design, later phases):
 *   - No reconstruction insertion (Phase 7 merge/export), no `gpxr`
 *     provenance markers in output — the vocabulary is defined in
 *     `provenanceSchema.ts` but intentionally unused here.
 *   - No pretty-printing (Phase 7 polish): output is compact, single-line,
 *     with the XML declaration and LF line endings per §H-7.
 *
 * Known normalizations (documented, semantics-preserving — none touch point
 * values):
 *   - The document is emitted in the canonical GPX schema layout:
 *     `metadata?, wpt*, rte*, trk*` (root extras last); within `<trk>`:
 *     name/desc/type first, then segments with anchored extras; within
 *     `<metadata>`: name, time, then extras. Input documents that violated
 *     schema order are normalized to it.
 *   - No-namespace inputs are emitted in their version's canonical GPX
 *     namespace; prefixed-namespace inputs become default-namespace.
 *   - CDATA sections re-serialize as escaped text; XML comments and
 *     processing instructions inside tracks/segments/points are not kept.
 *
 * The XML machinery arrives via an injected `XmlIo` (lib/utils/xml.ts) —
 * no DOM globals here (domain purity).
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript given the injected adapter.
 */

import type {
  AnchoredExtra,
  OriginalTrackData,
  OriginalTrackPoint,
  OriginalSegment,
  TrackExtra,
  TrackMeta,
} from "@/types/domain";
import { GPX_NAMESPACE_10, GPX_NAMESPACE_11 } from "./parse";
import type { XmlIo } from "@/lib/utils/xml";

/** Standard output declaration (§H-7). */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Serialize the model back to GPX, re-emitting every original value
 * verbatim. Deterministic: same model → same bytes.
 */
export function exportGpxIdentity(
  data: OriginalTrackData,
  io: XmlIo,
): string {
  const ns =
    data.fileMeta.version === "1.1" ? GPX_NAMESPACE_11 : GPX_NAMESPACE_10;
  const doc = io.createDocument(ns, "gpx");
  const root = doc.documentElement;

  // --- Root attributes (verbatim; absent creator stays absent) ----------
  root.setAttribute("version", data.fileMeta.raw.version);
  if (data.fileMeta.raw.creator !== undefined) {
    root.setAttribute("creator", data.fileMeta.raw.creator);
  }

  // --- File-level metadata ----------------------------------------------
  // GPX 1.1 wraps name/time in <metadata>; GPX 1.0 keeps them at root.
  const hasFileMeta =
    data.fileMeta.name !== undefined ||
    data.fileMeta.raw.metadataTime !== undefined ||
    data.fileMeta.metadataExtras.length > 0;

  if (hasFileMeta) {
    const container =
      data.fileMeta.version === "1.1"
        ? doc.createElementNS(ns, "metadata")
        : root;
    if (data.fileMeta.name !== undefined) {
      appendTextElement(doc, container, ns, "name", data.fileMeta.name);
    }
    if (data.fileMeta.raw.metadataTime !== undefined) {
      appendTextElement(
        doc,
        container,
        ns,
        "time",
        data.fileMeta.raw.metadataTime,
      );
    }
    for (const extra of data.fileMeta.metadataExtras) {
      container.appendChild(importFragment(doc, io, extra, "metadata extra"));
    }
    if (container !== root) root.appendChild(container);
  }

  // --- Waypoints & routes: verbatim snapshots ----------------------------
  for (const waypoint of data.waypoints) {
    root.appendChild(importFragment(doc, io, waypoint.rawXml, "wpt"));
  }
  for (const route of data.routes) {
    root.appendChild(importFragment(doc, io, route.rawXml, "rte"));
  }

  // --- Tracks -------------------------------------------------------------
  for (const meta of data.tracks) {
    appendTrack(doc, root, ns, data, meta, io);
  }

  // --- Root extras (schema puts them last) --------------------------------
  for (const extra of data.rootExtras) {
    root.appendChild(importFragment(doc, io, extra, "root extra"));
  }

  return `${XML_DECLARATION}\n${io.serialize(root)}\n`;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function appendTextElement(
  doc: Document,
  parent: Element,
  ns: string,
  name: string,
  text: string,
): void {
  const el = doc.createElementNS(ns, name);
  el.appendChild(doc.createTextNode(text));
  parent.appendChild(el);
}

/**
 * Parse a stored verbatim snapshot and import it (deep) into the target
 * document. Snapshots were produced by the serializer, so a parse failure
 * is an internal invariant violation — surfaced loudly, never swallowed.
 */
function importFragment(
  doc: Document,
  io: XmlIo,
  xml: string,
  what: string,
): Node {
  const parsed = io.parse(xml);
  if (
    parsed.documentElement === null ||
    parsed.getElementsByTagNameNS("*", "parsererror").length > 0
  ) {
    throw new Error(
      `exportGpxIdentity: stored ${what} snapshot failed to re-parse ` +
        "(internal invariant violation)",
    );
  }
  return doc.importNode(parsed.documentElement, true);
}

function appendAnchoredExtras(
  doc: Document,
  parent: Element,
  io: XmlIo,
  extras: readonly AnchoredExtra[],
  afterPointCount: number,
): void {
  for (const extra of extras) {
    if (extra.afterPointCount === afterPointCount) {
      parent.appendChild(importFragment(doc, io, extra.xml, "trkseg extra"));
    }
  }
}

function appendTrackExtras(
  doc: Document,
  parent: Element,
  io: XmlIo,
  extras: readonly TrackExtra[],
  afterSegmentCount: number,
): void {
  for (const extra of extras) {
    if (extra.afterSegmentCount === afterSegmentCount) {
      parent.appendChild(importFragment(doc, io, extra.xml, "trk extra"));
    }
  }
}

function appendTrack(
  doc: Document,
  root: Element,
  ns: string,
  data: OriginalTrackData,
  meta: TrackMeta,
  io: XmlIo,
): void {
  const trk = doc.createElementNS(ns, "trk");
  if (meta.name !== undefined) {
    appendTextElement(doc, trk, ns, "name", meta.name);
  }
  if (meta.desc !== undefined) {
    appendTextElement(doc, trk, ns, "desc", meta.desc);
  }
  if (meta.type !== undefined) {
    appendTextElement(doc, trk, ns, "type", meta.type);
  }

  const segments = data.segments.filter(
    (s) => s.trackIndex === meta.trackIndex,
  );
  appendTrackExtras(doc, trk, io, meta.extras, 0);
  segments.forEach((segment, index) => {
    appendSegment(doc, trk, ns, segment, io);
    appendTrackExtras(doc, trk, io, meta.extras, index + 1);
  });

  root.appendChild(trk);
}

function appendSegment(
  doc: Document,
  trk: Element,
  ns: string,
  segment: OriginalSegment,
  io: XmlIo,
): void {
  const segEl = doc.createElementNS(ns, "trkseg");
  appendAnchoredExtras(doc, segEl, io, segment.extras, 0);
  segment.points.forEach((point, index) => {
    appendPoint(doc, segEl, ns, point, io);
    appendAnchoredExtras(doc, segEl, io, segment.extras, index + 1);
  });
  trk.appendChild(segEl);
}

function appendPoint(
  doc: Document,
  segEl: Element,
  ns: string,
  point: OriginalTrackPoint,
  io: XmlIo,
): void {
  const ptEl = doc.createElementNS(ns, "trkpt");
  // Verbatim attribute values — THE byte-identity invariant (§H).
  if (point.raw.lat !== null) ptEl.setAttribute("lat", point.raw.lat);
  if (point.raw.lon !== null) ptEl.setAttribute("lon", point.raw.lon);

  for (const child of point.raw.children) {
    if (child.kind === "ele" || child.kind === "time") {
      appendTextElement(doc, ptEl, ns, child.kind, child.text);
    } else {
      ptEl.appendChild(importFragment(doc, io, child.xml, "trkpt extra"));
    }
  }
  segEl.appendChild(ptEl);
}
