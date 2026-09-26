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
 *   - Reconstruction insertion and `gpxr` provenance markers are Phase 7
 *     scope — implemented by `exportGpxRepaired` below (Mode A
 *     structure-preserving, Mode B merged). The identity exporter above
 *     stays marker-free by contract.
 *
 * Phase 7 additions (`exportGpxRepaired`):
 *   - Repairs force GPX 1.1 (the `<extensions>` vocabulary requires it —
 *     a documented upgrade, disclosed in the export dialog); a repair-free
 *     export keeps the original version and namespace verbatim, and Mode A
 *     then reduces byte-for-byte to the identity export.
 *   - With repairs: `creator="GPX Repair Studio"`, a metadata `<desc>`
 *     repair note, per-point `<gpxr:reconstructed>` markers, per-track
 *     `<gpxr:summary>`.
 *   - Original points are re-emitted from their verbatim captures in both
 *     modes — the §H non-negotiable invariant holds for repairs too.
 *   - Segment extras (rare vendor children) are re-anchored to their
 *     piece-local positions in Mode A and to their recomputed merged
 *     positions in Mode B.
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
 *   - Documents recovered from undeclared namespace prefixes (parse-time
 *     `undeclared-namespace` warning) re-export with the recovery bindings
 *     materialized explicitly on the affected extension elements.
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
  ReconstructedPoint,
  TrackExtra,
  TrackMeta,
} from "@/types/domain";
import type {
  MergeResult,
  MergedRun,
  MergedTrack,
} from "@/features/reconstruction/merge";
import {
  buildReconstructedExtension,
  buildSummaryExtension,
} from "./provenanceSchema";
import { GPX_NAMESPACE_10, GPX_NAMESPACE_11 } from "./parse";
import { formatDistanceMeters } from "@/lib/utils/format";
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

// ---------------------------------------------------------------------------
// Repaired export (Phase 7 — §H-7)
// ---------------------------------------------------------------------------

/** How reconstructed points join the original structure (§H-7). */
export type ExportMode = "structure-preserving" | "merged";

/** User-facing export settings (the pre-export dialog's controls). */
export interface ExportSettings {
  mode: ExportMode;
  prettyPrint: boolean;
}

/** Coordinate formatting: 7 decimals (~1 cm), xsd:decimal-safe. */
function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(7);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

/** xsd:dateTime, UTC, milliseconds only when non-zero. */
function formatTimestamp(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  return iso.endsWith(".000Z") ? iso.slice(0, -5) + "Z" : iso;
}

/** The metadata repair note (only emitted when repairs exist). */
function repairNote(merge: MergeResult, originalCreator?: string): string {
  const parts = [
    `Repaired with GPX Repair Studio — ${merge.repairCount} gap` +
      `${merge.repairCount === 1 ? "" : "s"} reconstructed, ` +
      `${formatDistanceMeters(merge.reconstructedDistanceM)} added.`,
    "Reconstructed points carry gpxr markers; recorded values are untouched.",
  ];
  // Phase 6: DEM attribution for repairs with estimated elevation
  // (§K-2 — embedded in metadata, shown in-app beside the values).
  if (merge.elevatedRepairCount > 0 && merge.elevationProviders.length > 0) {
    parts.push(
      `Elevation of reconstructed points estimated from ${merge.elevationProviders.join(", ")}.`,
    );
  }
  if (originalCreator !== undefined) {
    parts.push(`Original creator: ${originalCreator}.`);
  }
  return parts.join(" ");
}

/** One re-anchored segment extra: piece-local position + snapshot. */
interface AnchoredExtraPlacement {
  /** Emit after this many points of the target `<trkseg>`. */
  localCount: number;
  xml: string;
}

/**
 * Re-anchor a segment's extras onto one recorded run (a contiguous slice).
 * An extra anchored after `k` points of the ORIGINAL segment follows
 * original point `k−1`, so it belongs to the piece containing that point;
 * `k === 0` (before any point) belongs to the first piece only.
 */
function placeExtras(
  segment: OriginalSegment,
  startIndex: number,
  endIndex: number,
): AnchoredExtraPlacement[] {
  const placements: AnchoredExtraPlacement[] = [];
  for (const extra of segment.extras) {
    const k = extra.afterPointCount;
    if (k === 0) {
      if (startIndex === 0) placements.push({ localCount: 0, xml: extra.xml });
    } else if (k >= startIndex + 1 && k <= endIndex + 1) {
      placements.push({ localCount: k - startIndex, xml: extra.xml });
    }
  }
  return placements;
}

function appendReconstructedPoint(
  doc: Document,
  segEl: Element,
  ns: string,
  point: ReconstructedPoint,
): void {
  const ptEl = doc.createElementNS(ns, "trkpt");
  ptEl.setAttribute("lat", formatCoordinate(point.lat));
  ptEl.setAttribute("lon", formatCoordinate(point.lon));
  if (point.ele !== undefined) {
    appendTextElement(doc, ptEl, ns, "ele", String(point.ele.value));
  }
  if (point.time !== undefined) {
    appendTextElement(doc, ptEl, ns, "time", formatTimestamp(point.time.value));
  }
  // The provenance marker is the whole point of a repaired export — every
  // reconstructed point carries one, so our re-import (and any curious
  // consumer) can tell repairs from recordings.
  const extensions = doc.createElementNS(ns, "extensions");
  extensions.appendChild(
    buildReconstructedExtension(doc, {
      ...(point.time !== undefined ? { timeMethod: point.time.method } : {}),
      ...(point.ele !== undefined ? { eleMethod: point.ele.method } : {}),
    }),
  );
  ptEl.appendChild(extensions);
  segEl.appendChild(ptEl);
}

/** Emit a recorded run as one `<trkseg>` (Mode A) with re-anchored extras. */
function appendRecordedRunAsSegment(
  doc: Document,
  trk: Element,
  ns: string,
  run: Extract<MergedRun, { kind: "recorded" }>,
  segment: OriginalSegment,
  io: XmlIo,
): void {
  const segEl = doc.createElementNS(ns, "trkseg");
  // Extras are anchored at fixed point counts; walk points and extras in
  // lockstep by local count.
  const byCount = new Map<number, string[]>();
  for (const placement of placeExtras(segment, run.startIndex, run.endIndex)) {
    const list = byCount.get(placement.localCount) ?? [];
    list.push(placement.xml);
    byCount.set(placement.localCount, list);
  }
  run.points.forEach((point, index) => {
    for (const xml of byCount.get(index) ?? []) {
      segEl.appendChild(importFragment(doc, io, xml, "trkseg extra"));
    }
    appendPoint(doc, segEl, ns, point, io);
  });
  // Extras anchored after the LAST point of the piece (k = endIndex + 1).
  for (const xml of byCount.get(run.points.length) ?? []) {
    segEl.appendChild(importFragment(doc, io, xml, "trkseg extra"));
  }
  trk.appendChild(segEl);
}

/**
 * Serialize the repaired model (§H-7). Mode A emits each merged run as its
 * own `<trkseg>` — the original structure is preserved and reconstructed
 * interiors appear as their own segments at the gap positions; Mode B
 * concatenates each track into one continuous `<trkseg>` with repairs
 * interleaved. Original point values are re-emitted verbatim in both modes.
 *
 * Deterministic: same (data, merge, settings) → same bytes.
 */
export function exportGpxRepaired(
  data: OriginalTrackData,
  merge: MergeResult,
  settings: ExportSettings,
  io: XmlIo,
): string {
  const hasRepairs = merge.repairCount > 0;
  const version = hasRepairs ? "1.1" : data.fileMeta.version;
  const ns = version === "1.1" ? GPX_NAMESPACE_11 : GPX_NAMESPACE_10;
  const doc = io.createDocument(ns, "gpx");
  const root = doc.documentElement;

  root.setAttribute("version", version);
  if (hasRepairs) {
    root.setAttribute("creator", "GPX Repair Studio");
  } else if (data.fileMeta.raw.creator !== undefined) {
    root.setAttribute("creator", data.fileMeta.raw.creator);
  }

  // --- File-level metadata (identity layout + the repair note) -----------
  const note = hasRepairs
    ? repairNote(merge, data.fileMeta.raw.creator)
    : undefined;
  const hasFileMeta =
    data.fileMeta.name !== undefined ||
    data.fileMeta.raw.metadataTime !== undefined ||
    data.fileMeta.metadataExtras.length > 0 ||
    note !== undefined;

  if (hasFileMeta) {
    const container =
      version === "1.1" ? doc.createElementNS(ns, "metadata") : root;
    if (data.fileMeta.name !== undefined) {
      appendTextElement(doc, container, ns, "name", data.fileMeta.name);
    }
    if (note !== undefined) {
      appendTextElement(doc, container, ns, "desc", note);
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

  // --- Tracks (run-based) -------------------------------------------------
  for (const meta of data.tracks) {
    const merged =
      merge.tracks.find((t) => t.trackIndex === meta.trackIndex) ?? null;
    appendMergedTrack(doc, root, ns, data, meta, merged, settings, io);
  }

  // --- Root extras (schema puts them last) --------------------------------
  for (const extra of data.rootExtras) {
    root.appendChild(importFragment(doc, io, extra, "root extra"));
  }

  const body = settings.prettyPrint
    ? prettySerialize(root, io)
    : io.serialize(root);
  return `${XML_DECLARATION}\n${body}\n`;
}

function appendMergedTrack(
  doc: Document,
  root: Element,
  ns: string,
  data: OriginalTrackData,
  meta: TrackMeta,
  merged: MergedTrack | null,
  settings: ExportSettings,
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

  // Track extras anchored before any segment keep their position; the
  // gpxr summary (when this track carries repairs) sits right before the
  // first segment — schema order for <extensions> inside <trk>.
  if (merged !== null && merged.repairCount > 0) {
    const extensions = doc.createElementNS(ns, "extensions");
    extensions.appendChild(
      buildSummaryExtension(doc, {
        reconstructedDistanceM: Math.round(merged.reconstructedDistanceM),
        gapCount: merged.repairCount,
      }),
    );
    trk.appendChild(extensions);
  }

  const runs =
    merged?.runs ??
    // No merged view (defensive — merge always covers every track): the
    // identity fallback emits the original segments as whole runs.
    (data.segments
      .filter((s) => s.trackIndex === meta.trackIndex)
      .map((segment) => ({
        kind: "recorded" as const,
        segmentId: segment.id,
        startIndex: 0,
        endIndex: segment.points.length - 1,
        points: segment.points,
      })));

  if (settings.mode === "merged") {
    // Track extras anchored before any segment precede the merged
    // `<trkseg>`; the rest follow it (all original segments collapsed
    // into one — documented Mode B normalization).
    for (const extra of meta.extras) {
      if (extra.afterSegmentCount === 0) {
        trk.appendChild(importFragment(doc, io, extra.xml, "trk extra"));
      }
    }
    appendMergedSegment(doc, trk, ns, runs, data, io);
    for (const extra of meta.extras) {
      if (extra.afterSegmentCount >= 1) {
        trk.appendChild(importFragment(doc, io, extra.xml, "trk extra"));
      }
    }
  } else {
    // The structure-preserving walker fires every track extra at its
    // original segment boundary (extras(0) included, before segment 0).
    appendStructurePreservingSegments(doc, trk, ns, runs, data, meta, io);
  }

  root.appendChild(trk);
}

/**
 * Mode A: every run is its own `<trkseg>`. Track extras fire at the
 * original segment boundaries — an extra anchored after `k` segments is
 * emitted just before the first run of original segment `k`, so a
 * repair-free export reproduces the identity layout exactly.
 */
function appendStructurePreservingSegments(
  doc: Document,
  trk: Element,
  ns: string,
  runs: readonly MergedRun[],
  data: OriginalTrackData,
  meta: TrackMeta,
  io: XmlIo,
): void {
  const segmentById = new Map(data.segments.map((s) => [s.id, s]));
  // Ordinal of each segment within its track (for extras anchoring).
  const ordinalById = new Map<string, number>();
  for (const segment of data.segments) {
    if (segment.trackIndex !== meta.trackIndex) continue;
    const perTrack = ordinalById.size;
    ordinalById.set(segment.id, perTrack);
  }

  const fireExtras = (afterSegmentCount: number) => {
    for (const extra of meta.extras) {
      if (extra.afterSegmentCount === afterSegmentCount) {
        trk.appendChild(importFragment(doc, io, extra.xml, "trk extra"));
      }
    }
  };

  let lastOrdinal = -1;
  for (const run of runs) {
    if (run.kind === "reconstructed") {
      // Interiors between original segments emit before the next recorded
      // run's extras — geometry first, invisible vendor extras after.
      const reconSeg = doc.createElementNS(ns, "trkseg");
      for (const point of run.points) {
        appendReconstructedPoint(doc, reconSeg, ns, point);
      }
      trk.appendChild(reconSeg);
      continue;
    }
    const ordinal = ordinalById.get(run.segmentId) ?? 0;
    if (ordinal > lastOrdinal) {
      // Fire the extras of every completed segment ordinal, then advance.
      for (let k = lastOrdinal + 1; k <= ordinal; k += 1) {
        fireExtras(k);
      }
      lastOrdinal = ordinal;
    }
    const segment = segmentById.get(run.segmentId);
    if (segment === undefined) continue;
    appendRecordedRunAsSegment(doc, trk, ns, run, segment, io);
  }
  // Trailing extras: anchored beyond the last original segment.
  for (let k = lastOrdinal + 1; ; k += 1) {
    if (!meta.extras.some((e) => e.afterSegmentCount === k)) break;
    fireExtras(k);
  }
}

/**
 * Mode B: one continuous `<trkseg>` per track — recorded points verbatim
 * with reconstructed interiors interleaved, segment extras re-anchored to
 * their recomputed merged positions.
 */
function appendMergedSegment(
  doc: Document,
  trk: Element,
  ns: string,
  runs: readonly MergedRun[],
  data: OriginalTrackData,
  io: XmlIo,
): void {
  const segmentById = new Map(data.segments.map((s) => [s.id, s]));
  const segEl = doc.createElementNS(ns, "trkseg");

  // Re-anchor every segment's extras to merged positions first.
  const placements: { position: number; xml: string }[] = [];
  let position = 0;
  for (const run of runs) {
    if (run.kind === "reconstructed") {
      position += run.points.length;
      continue;
    }
    const segment = segmentById.get(run.segmentId);
    if (segment !== undefined) {
      for (const placement of placeExtras(segment, run.startIndex, run.endIndex)) {
        placements.push({
          position: position + placement.localCount,
          xml: placement.xml,
        });
      }
    }
    position += run.points.length;
  }
  placements.sort((a, b) => a.position - b.position);

  const byPosition = new Map<number, string[]>();
  for (const placement of placements) {
    const list = byPosition.get(placement.position) ?? [];
    list.push(placement.xml);
    byPosition.set(placement.position, list);
  }

  let emitted = 0;
  for (const run of runs) {
    if (run.kind === "reconstructed") {
      for (const point of run.points) {
        for (const xml of byPosition.get(emitted) ?? []) {
          segEl.appendChild(importFragment(doc, io, xml, "trkseg extra"));
        }
        appendReconstructedPoint(doc, segEl, ns, point);
        emitted += 1;
      }
    } else {
      for (const point of run.points) {
        for (const xml of byPosition.get(emitted) ?? []) {
          segEl.appendChild(importFragment(doc, io, xml, "trkseg extra"));
        }
        appendPoint(doc, segEl, ns, point, io);
        emitted += 1;
      }
    }
  }
  for (const xml of byPosition.get(emitted) ?? []) {
    segEl.appendChild(importFragment(doc, io, xml, "trkseg extra"));
  }

  trk.appendChild(segEl);
}

// ---------------------------------------------------------------------------
// Pretty-printing (§H-7 optional)
// ---------------------------------------------------------------------------

/**
 * Indent a document in place for human-readable output. Only elements
 * whose children are all elements get re-indented — mixed content (text +
 * elements) is left untouched, so nothing semantic ever changes. The
 * re-indented document serializes through the injected `XmlIo` like any
 * other.
 */
function prettySerialize(root: Element, io: XmlIo): string {
  indentElement(root, "");
  return io.serialize(root);
}

function indentElement(element: Element, indent: string): void {
  const doc = element.ownerDocument;
  if (doc === null) return;
  const children = Array.from(element.childNodes);
  const hasElement = children.some((node) => node.nodeType === 1);
  if (!hasElement) return;
  const hasText = children.some(
    (node) => node.nodeType === 3 && (node.nodeValue ?? "").trim() !== "",
  );
  if (hasText) return;

  // Drop existing whitespace-only text nodes (re-indent from scratch).
  for (const node of children) {
    if (node.nodeType === 3 && (node.nodeValue ?? "").trim() === "") {
      element.removeChild(node);
    }
  }
  const childIndent = indent + "  ";
  for (const child of Array.from(element.children)) {
    element.insertBefore(doc.createTextNode(`\n${childIndent}`), child);
    indentElement(child, childIndent);
  }
  element.appendChild(doc.createTextNode(`\n${indent}`));
}
