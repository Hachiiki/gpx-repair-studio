/**
 * GPX parser — DOMParser facade → typed, frozen domain model
 * (docs/MASTER_PLAN.md §E-3, §H-2).
 *
 * Design contract:
 *
 *   - **Namespace-tolerant.** Real-world GPX violates the schema regularly:
 *     default namespace (1.1), GPX 1.0 namespace, prefixed namespaces, and
 *     no namespace at all are all accepted. Element lookup is by
 *     `localName` through explicit structure navigation
 *     (`gpx → trk → trkseg → trkpt`), never by deep tag search. When a
 *     document is rejected as malformed AND uses namespace prefixes it
 *     never declares (a real device bug — GloryFit watches emit Garmin-style
 *     `gpxtpx:` extensions with no `xmlns:gpxtpx`), the missing
 *     declarations are injected on the root and the parse retried; the
 *     recovery is always surfaced as an `undeclared-namespace` warning.
 *     If the retry still fails, the ORIGINAL error is reported — recovery
 *     never masks a genuine malformation.
 *   - **Hard failures are typed.** Malformed XML (parsererror document or
 *     throwing parser), a non-`<gpx>` root, or a missing/unknown `version`
 *     produce `{ ok: false, error }`. Everything else is modeled
 *     tolerantly: damaged points are kept with NaN values + anomaly flags,
 *     never silently dropped or corrected.
 *   - **Timestamps** are parsed strictly as ISO-8601 *with* timezone
 *     (xsd:dateTime with offset). Naive or malformed timestamps keep their
 *     raw text, get no epoch value, and are flagged `unreliable-time`.
 *   - **Byte fidelity.** Every original point captures its verbatim source
 *     strings (`lat`/`lon` attribute values, `<ele>`/`<time>` text, all
 *     other children as serialized XML snapshots). Non-standard elements
 *     anywhere (`<wpt>`, `<rte>`, root/track/segment extras) are preserved
 *     as snapshots — the identity exporter (`exportGpx.ts`) re-emits them.
 *     Known limitations (documented, semantic-preserving): XML comments and
 *     processing instructions inside `<trk>`/`<trkseg>`/`<trkpt>` are
 *     dropped; CDATA re-serializes as escaped text; element emission order
 *     normalizes to schema order (name/desc/type before segments).
 *   - **Charset** is the ingest layer's concern (Phase 2); this module
 *     receives an already-decoded string and tolerates a leading BOM.
 *   - **Immutability.** The returned model is deep-frozen outside
 *     production builds (§C-4); production relies on readonly types.
 *
 * The XML machinery arrives via an injected `XmlIo` (lib/utils/xml.ts) —
 * this module never touches DOM globals, keeping the features/ domain
 * purity rules satisfied and the parser testable under jsdom.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript given the injected adapter.
 */

import type {
  AnchoredExtra,
  GpxParseError,
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  ParseOutcome,
  PointAnomaly,
  PointRef,
  RawTrkptChild,
  TrackExtra,
  TrackMeta,
  ValidationIssue,
  Waypoint,
} from "@/types/domain";
import { pointId, segmentId } from "@/types/ids";
import type { XmlIo } from "@/lib/utils/xml";
import { deepFreeze } from "./deepFreeze";

/** GPX 1.1 default namespace. */
export const GPX_NAMESPACE_11 = "http://www.topografix.com/GPX/1/1";
/** GPX 1.0 namespace. */
export const GPX_NAMESPACE_10 = "http://www.topografix.com/GPX/1/0";

/** Strict xsd:dateTime-with-mandatory-timezone shape (GPX §J). */
const ISO_8601_WITH_TZ =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Parse a timestamp strictly as ISO-8601 with timezone; `undefined` when
 * the text is naive, malformed, or semantically invalid (e.g. Feb 30 —
 * `Date.parse` would silently roll such dates over, so ranges are checked
 * explicitly before conversion).
 */
function parseStrictEpochMs(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  const match = ISO_8601_WITH_TZ.exec(trimmed);
  if (match === null) return undefined;

  const [, yearS, monthS, dayS, hourS, minuteS, secondS, sign, offHourS, offMinuteS] = match;
  const year = Number(yearS);
  const month = Number(monthS);
  const day = Number(dayS);

  if (month < 1 || month > 12) return undefined;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  if (day < 1 || day > daysInMonth) return undefined;
  if (Number(hourS) > 23 || Number(minuteS) > 59 || Number(secondS) > 59) {
    return undefined;
  }
  if (sign !== undefined && (Number(offHourS) > 23 || Number(offMinuteS) > 59)) {
    return undefined;
  }

  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? undefined : ms;
}

// ---------------------------------------------------------------------------
// Small DOM helpers (namespace-tolerant, structure-aware)
// ---------------------------------------------------------------------------

/** Direct child elements with the given localName, in document order. */
function childrenByLocalName(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}

/** First direct child element with the given localName, if any. */
function firstChildByLocalName(el: Element, name: string): Element | undefined {
  return Array.from(el.children).find((c) => c.localName === name);
}

/** Trimmed text of the first matching child element; undefined if absent. */
function trimmedTextOfFirstChild(
  el: Element | undefined,
  name: string,
): string | undefined {
  if (el === undefined) return undefined;
  const child = firstChildByLocalName(el, name);
  if (child === undefined) return undefined;
  const text = (child.textContent ?? "").trim();
  return text === "" ? undefined : text;
}

// ---------------------------------------------------------------------------
// Value parsing (NaN-guarded, per §H-2)
// ---------------------------------------------------------------------------

/**
 * Parse a numeric string. `undefined` when absent, blank, or non-finite —
 * callers turn that into an anomaly flag rather than inventing a value.
 */
function parseFiniteNumber(
  text: string | null | undefined,
): number | undefined {
  if (text === null || text === undefined) return undefined;
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// parsererror detection (jsdom: "1:16: msg"; Chrome: "line 2 at column 3";
// Firefox: "Line Number 2, Column 3:")
// ---------------------------------------------------------------------------

function extractParserError(doc: Document): GpxParseError | null {
  let errorEl: Element | null = null;
  const root = doc.documentElement;
  if (root !== null && root.localName === "parsererror") {
    errorEl = root;
  } else {
    const found = doc.getElementsByTagNameNS("*", "parsererror");
    if (found.length > 0) errorEl = found[0];
  }
  if (errorEl === null) return null;

  const text = (errorEl.textContent ?? "").trim();
  let line: number | undefined;
  let column: number | undefined;
  const jsdomStyle = /^(\d+):(\d+):\s*([\s\S]*)$/.exec(text);
  if (jsdomStyle !== null) {
    line = Number(jsdomStyle[1]);
    column = Number(jsdomStyle[2]);
  } else {
    const lineMatch = /line\D*(\d+)/i.exec(text);
    const columnMatch = /column\D*(\d+)/i.exec(text);
    if (lineMatch !== null) line = Number(lineMatch[1]);
    if (columnMatch !== null) column = Number(columnMatch[1]);
  }
  return {
    kind: "malformed-xml",
    message: text === "" ? "XML is not well-formed" : text,
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
  };
}

// ---------------------------------------------------------------------------
// Undeclared-prefix recovery (GloryFit-class device bugs)
// ---------------------------------------------------------------------------

/**
 * Standard bindings for prefixes that real-world devices use without
 * declaring. GloryFit watches (and siblings) clone Garmin's extension
 * schemas verbatim but omit the `xmlns:` declarations, so the prefixes bind
 * to Garmin's canonical URIs — the meaning every other consumer assumes.
 */
const KNOWN_UNDECLARED_PREFIX_BINDINGS: Readonly<Record<string, string>> = {
  gpxtpx: "http://www.garmin.com/xmlschemas/TrackPointExtension/v1",
  gpxx: "http://www.garmin.com/xmlschemas/GpxExtensions/v3",
};

/** Clearly-marked synthetic URN for unknown undeclared prefixes. */
const SYNTHETIC_PREFIX_BASE = "urn:gpx-repair-studio:undeclared-prefix:";

/**
 * Prefixes used in element or attribute names but never declared via
 * `xmlns:prefix` anywhere in the document. The `xml` prefix is pre-declared
 * by the XML spec and never counts.
 */
function findUndeclaredPrefixes(text: string): string[] {
  const used = new Set<string>();
  // Prefixed element names: <prefix:name ...> (opening or closing tags).
  for (const m of text.matchAll(/<\/?\s*([A-Za-z_][\w.-]*):/g)) {
    used.add(m[1]);
  }
  // Prefixed attribute names, scoped to start-tags only (a `<tag …>` span
  // cannot contain a raw `>` outside quotes, so this under-approximates
  // harmlessly on pathological values and never matches text content).
  for (const tag of text.matchAll(/<[A-Za-z_][^>]*>/g)) {
    for (const attr of tag[0].matchAll(/\s([A-Za-z_][\w.-]*):[\w.-]+\s*=/g)) {
      used.add(attr[1]);
    }
  }
  const declared = new Set<string>();
  for (const m of text.matchAll(/xmlns:([A-Za-z_][\w.-]*)\s*=/g)) {
    declared.add(m[1]);
  }
  used.delete("xml");
  return [...used].filter((p) => !declared.has(p)).sort();
}

/**
 * Inject `xmlns:prefix="uri"` declarations into the root element's
 * start-tag (right after the element name). Returns the repaired text, or
 * null when no injectable root start-tag can be located (recovery then
 * simply does not happen and the original error stands).
 */
function injectNamespaceDeclarations(
  text: string,
  bindings: readonly { prefix: string; uri: string }[],
): string | null {
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) return null;
    const next = text[lt + 1];
    if (next === "?" || next === "!") {
      // Skip prolog / comments / doctype to their respective closers.
      const closer = next === "?" ? "?>" : "-->";
      const closeIdx = text.indexOf(closer, lt);
      if (closeIdx === -1) return null;
      i = closeIdx + closer.length;
      continue;
    }
    if (next === "/") {
      i = lt + 1; // stray closing tag before any opening one: keep scanning
      continue;
    }
    // Root start-tag: find its terminating `>` outside quoted values.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < text.length) {
      const c = text[j];
      if (quote !== null) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      j += 1;
    }
    if (j >= text.length) return null;
    // Insertion point: end of the root element's name.
    let k = lt + 1;
    while (k < j && !/[\s/>]/.test(text[k])) k += 1;
    const injected = bindings
      .map((b) => `xmlns:${b.prefix}="${b.uri}"`)
      .join(" ");
    return text.slice(0, k) + " " + injected + text.slice(k);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Element parsers
// ---------------------------------------------------------------------------

/** Parse one `<trkpt>` into the immutable point model, flags included. */
function parseTrackPoint(
  el: Element,
  seg: ReturnType<typeof segmentId>,
  index: number,
  io: XmlIo,
): OriginalTrackPoint {
  const latAttr = el.getAttribute("lat");
  const lonAttr = el.getAttribute("lon");
  const lat = parseFiniteNumber(latAttr);
  const lon = parseFiniteNumber(lonAttr);

  const flags: PointAnomaly[] = [];
  if (lat === undefined || lon === undefined) flags.push("invalid-coord");
  if (lat === 0 && lon === 0) flags.push("zero-coord");

  let ele: number | undefined;
  let time: number | undefined;
  const children: RawTrkptChild[] = [];
  let eleCaptured = false;
  let timeCaptured = false;

  for (const child of Array.from(el.children)) {
    const local = child.localName;
    if (local === "ele" && !eleCaptured) {
      eleCaptured = true;
      const text = child.textContent ?? "";
      children.push({ kind: "ele", text });
      const value = parseFiniteNumber(text);
      if (value === undefined) {
        flags.push("invalid-ele");
      } else {
        ele = value;
      }
    } else if (local === "time" && !timeCaptured) {
      timeCaptured = true;
      const text = child.textContent ?? "";
      children.push({ kind: "time", text });
      const epoch = parseStrictEpochMs(text);
      if (epoch === undefined) {
        flags.push("unreliable-time");
      } else {
        time = epoch;
      }
    } else {
      // Vendor extensions, repeated ele/time, anything else: verbatim.
      children.push({ kind: "extra", xml: io.serialize(child) });
    }
  }

  return {
    source: "original",
    lat: lat ?? NaN,
    lon: lon ?? NaN,
    id: pointId(seg, index),
    ...(ele !== undefined ? { ele } : {}),
    ...(time !== undefined ? { time } : {}),
    flags,
    raw: { lat: latAttr, lon: lonAttr, children },
  };
}

/** Parse `<trk>` metadata (name/desc/type) plus anchored extras. */
function parseTrackMeta(trk: Element, io: XmlIo): Omit<TrackMeta, "trackIndex"> {
  const extras: TrackExtra[] = [];
  let segmentCount = 0;
  for (const child of Array.from(trk.children)) {
    const local = child.localName;
    if (local === "name" || local === "desc" || local === "type") continue;
    if (local === "trkseg") {
      segmentCount += 1;
      continue;
    }
    extras.push({ afterSegmentCount: segmentCount, xml: io.serialize(child) });
  }
  return {
    ...(trimmedTextOfFirstChild(trk, "name") !== undefined
      ? { name: trimmedTextOfFirstChild(trk, "name")! }
      : {}),
    ...(trimmedTextOfFirstChild(trk, "desc") !== undefined
      ? { desc: trimmedTextOfFirstChild(trk, "desc")! }
      : {}),
    ...(trimmedTextOfFirstChild(trk, "type") !== undefined
      ? { type: trimmedTextOfFirstChild(trk, "type")! }
      : {}),
    extras,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a GPX 1.0/1.1 document (as a decoded string) into the frozen typed
 * model, or a typed error. Never throws for user input; only an `XmlIo`
 * that itself throws in violation of its contract can surface an exception.
 */
export function parseGpx(xml: string, io: XmlIo): ParseOutcome {
  // Tolerate a UTF-8 BOM (decoded to U+FEFF) at the start of the string.
  const text = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;

  let doc: Document | null = null;
  let parseError: GpxParseError | null = null;
  try {
    doc = io.parse(text);
  } catch (err) {
    parseError = {
      kind: "malformed-xml",
      message: `XML parser threw: ${(err as Error).message}`,
    };
  }
  if (doc !== null) {
    parseError = extractParserError(doc);
  }

  // Undeclared-prefix recovery: only when the strict parse rejected the
  // document AND the document actually uses prefixes it never declares.
  // A successful recovery is surfaced as a warning; a failed one keeps the
  // original error (recovery must never mask a genuine malformation).
  let prefixRecovery: { prefix: string; uri: string }[] = [];
  if (parseError !== null && parseError.kind === "malformed-xml") {
    const undeclared = findUndeclaredPrefixes(text);
    if (undeclared.length > 0) {
      const bindings = undeclared.map((prefix) => ({
        prefix,
        uri:
          KNOWN_UNDECLARED_PREFIX_BINDINGS[prefix] ??
          SYNTHETIC_PREFIX_BASE + prefix,
      }));
      const repaired = injectNamespaceDeclarations(text, bindings);
      if (repaired !== null) {
        try {
          const retryDoc = io.parse(repaired);
          if (extractParserError(retryDoc) === null) {
            doc = retryDoc;
            parseError = null;
            prefixRecovery = bindings;
          }
        } catch {
          // Recovery attempt itself failed — the original error stands.
        }
      }
    }
  }

  if (parseError !== null || doc === null) {
    return {
      ok: false,
      error:
        parseError ?? { kind: "malformed-xml", message: "XML could not be parsed" },
    };
  }

  const root = doc.documentElement;
  if (root === null || root.localName !== "gpx") {
    return {
      ok: false,
      error: {
        kind: "not-a-gpx-document",
        rootElement: root === null ? null : root.tagName,
      },
    };
  }

  const versionAttr = root.getAttribute("version");
  let version: "1.0" | "1.1";
  if (versionAttr === "1.1") version = "1.1";
  else if (versionAttr === "1.0") version = "1.0";
  else {
    return {
      ok: false,
      error: { kind: "invalid-version", found: versionAttr },
    };
  }

  const creatorAttr = root.getAttribute("creator");

  // File-level metadata: <metadata> (1.1) with GPX 1.0 root-level fallback.
  const metadataEl = firstChildByLocalName(root, "metadata");
  const fileName = trimmedTextOfFirstChild(
    metadataEl ?? root,
    "name",
  );
  const timeSource = firstChildByLocalName(metadataEl ?? root, "time");

  const issues: ValidationIssue[] = [];

  const rawMetadataTime = timeSource?.textContent ?? undefined;
  const fileTime = parseStrictEpochMs(rawMetadataTime);
  if (rawMetadataTime !== undefined && fileTime === undefined) {
    issues.push({
      kind: "unreliable-time",
      severity: "warning",
      message:
        "File-level <time> is not a valid ISO-8601 timestamp with timezone; " +
        "it is preserved verbatim but excluded from time computations.",
    });
  }

  const metadataExtras: string[] =
    metadataEl !== undefined
      ? Array.from(metadataEl.children)
          .filter((c) => c.localName !== "name" && c.localName !== "time")
          .map((c) => io.serialize(c))
      : [];

  // Waypoints and routes: verbatim passthrough snapshots (§H-2).
  const waypoints: Waypoint[] = childrenByLocalName(root, "wpt").map((el) => ({
    rawXml: io.serialize(el),
    ...(trimmedTextOfFirstChild(el, "name") !== undefined
      ? { name: trimmedTextOfFirstChild(el, "name")! }
      : {}),
  }));
  const routes = childrenByLocalName(root, "rte").map((el) => ({
    rawXml: io.serialize(el),
    ...(trimmedTextOfFirstChild(el, "name") !== undefined
      ? { name: trimmedTextOfFirstChild(el, "name")! }
      : {}),
  }));

  // Tracks → segments → points (deterministic ids from document position).
  const tracks: TrackMeta[] = [];
  const segments: OriginalSegment[] = [];
  const invalidCoordRefs: PointRef[] = [];
  const invalidEleRefs: PointRef[] = [];
  const unreliableTimeRefs: PointRef[] = [];

  let trackIndex = 0;
  for (const trk of childrenByLocalName(root, "trk")) {
    tracks.push({ trackIndex, ...parseTrackMeta(trk, io) });

    let segmentIndex = 0;
    for (const trkseg of childrenByLocalName(trk, "trkseg")) {
      const seg = segmentId(trackIndex, segmentIndex);
      const points: OriginalTrackPoint[] = [];
      const extras: AnchoredExtra[] = [];
      for (const child of Array.from(trkseg.children)) {
        if (child.localName === "trkpt") {
          const point = parseTrackPoint(child, seg, points.length, io);
          points.push(point);
          if (point.flags.includes("invalid-coord")) {
            invalidCoordRefs.push({ segmentId: seg, pointId: point.id });
          }
          if (point.flags.includes("invalid-ele")) {
            invalidEleRefs.push({ segmentId: seg, pointId: point.id });
          }
          if (point.flags.includes("unreliable-time")) {
            unreliableTimeRefs.push({ segmentId: seg, pointId: point.id });
          }
        } else {
          extras.push({ afterPointCount: points.length, xml: io.serialize(child) });
        }
      }
      segments.push({ id: seg, trackIndex, points, extras });
      segmentIndex += 1;
    }
    trackIndex += 1;
  }

  // Aggregated parse-time warnings (relational checks belong to validate).
  if (invalidCoordRefs.length > 0) {
    issues.push({
      kind: "invalid-coord",
      severity: "error",
      message: `${invalidCoordRefs.length} track point(s) have missing or non-numeric lat/lon.`,
      points: invalidCoordRefs,
    });
  }
  if (invalidEleRefs.length > 0) {
    issues.push({
      kind: "invalid-ele",
      severity: "warning",
      message: `${invalidEleRefs.length} track point(s) have a non-numeric <ele>.`,
      points: invalidEleRefs,
    });
  }
  if (unreliableTimeRefs.length > 0) {
    issues.push({
      kind: "unreliable-time",
      severity: "warning",
      message:
        `${unreliableTimeRefs.length} track point(s) carry a <time> that is not ` +
        "ISO-8601 with timezone; values are kept verbatim but excluded from " +
        "time computations.",
      points: unreliableTimeRefs,
    });
  }
  if (prefixRecovery.length > 0) {
    const list = prefixRecovery
      .map((b) => `xmlns:${b.prefix}="${b.uri}"`)
      .join(", ");
    issues.push({
      kind: "undeclared-namespace",
      severity: "warning",
      message:
        `This file uses namespace prefix(es) it never declares (a device ` +
        `export bug). They were bound for parsing — ${list}. All recorded ` +
        `values are preserved; re-exports carry the bindings explicitly.`,
    });
  }

  // Root extras: everything the model consumed is excluded, everything else
  // is preserved verbatim (in order) for re-export.
  const rootExtras: string[] = [];
  let metadataSeen = false;
  let rootNameConsumed = false;
  let rootTimeConsumed = false;
  for (const child of Array.from(root.children)) {
    const local = child.localName;
    if (local === "metadata" && !metadataSeen) {
      metadataSeen = true; // only the first <metadata> is consumed
      continue;
    }
    if (local === "name" && metadataEl === undefined && !rootNameConsumed) {
      rootNameConsumed = true; // GPX 1.0-style name, consumed into fileMeta
      continue;
    }
    if (local === "time" && metadataEl === undefined && !rootTimeConsumed) {
      rootTimeConsumed = true; // GPX 1.0-style time, consumed into fileMeta
      continue;
    }
    if (local === "wpt" || local === "rte" || local === "trk") continue;
    rootExtras.push(io.serialize(child));
  }

  const data: OriginalTrackData = {
    tracks,
    segments,
    waypoints,
    routes,
    rootExtras,
    fileMeta: {
      ...(creatorAttr !== null ? { creator: creatorAttr } : {}),
      version,
      ...(fileName !== undefined ? { name: fileName } : {}),
      ...(fileTime !== undefined ? { time: fileTime } : {}),
      raw: {
        version: versionAttr ?? "",
        ...(creatorAttr !== null ? { creator: creatorAttr } : {}),
        ...(rawMetadataTime !== undefined
          ? { metadataTime: rawMetadataTime }
          : {}),
      },
      metadataExtras,
    },
    issues,
  };

  // Deep-freeze outside production (§C-4: dev assertion; prod: readonly types).
  if (process.env.NODE_ENV !== "production") deepFreeze(data);

  return { ok: true, data };
}
