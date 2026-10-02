/**
 * Track-file format detection (docs/MASTER_PLAN.md §EE 14.1).
 *
 * The single intake decision point: given the raw bytes (and the file name
 * as a secondary signal), decide whether this is GPX, TCX, or FIT — before
 * any parser runs. Magic bytes lead; the extension only breaks ties and
 * never overrides the bytes.
 *
 * Detection rules:
 *   - FIT: bytes 8..11 are the literal ".FIT" of the file header (the
 *     FIT protocol's fixed magic). A header size other than 12/14 is
 *     rejected as unknown (honesty over guessing).
 *   - XML family: skip a UTF-8/UTF-16 BOM, whitespace, an optional XML
 *     declaration / comments / DOCTYPE, then read the root element's
 *     name: "gpx" → GPX, "TrainingCenterDatabase" → TCX. The DOM path
 *     and the Phase 9 worker path see the same decision.
 *   - Anything else: unknown, with a short human reason for the typed
 *     error copy (no throwing, no guessing).
 *
 * Phase 14 — Formats in & out. Pure TypeScript: only reads the given view.
 */

/** The track-file formats the intake understands (§EE 14). */
export type TrackFormat = "gpx" | "tcx" | "fit";

export type SniffResult =
  | { format: TrackFormat }
  | { format: "unknown"; reason: string };

/**
 * Find the root element name of an XML document without a parser: skip
 * BOM, whitespace, `<?xml … ?>`, comments, and DOCTYPE; return the first
 * element `Name` after `<`, or `null` when no plausible root shows up
 * before the scan budget — callers treat that as "not XML".
 */
function sniffXmlRoot(bytes: Uint8Array): string | null {
  const length = bytes.length;
  // UTF-16 detection: a BOM means every ASCII char is one payload byte
  // per 2 (the payload byte for BE is at odd offsets, LE at even).
  let step = 1;
  let utf16be = false;
  if (length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    step = 2;
  } else if (length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    step = 2;
    utf16be = true;
  } else if (length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    // UTF-8 BOM: the BOM bytes are tolerated as pre-tag text below.
  }

  // Scan budget: the root element must appear within the first 4 KB.
  const limit = length;
  // `pos` counts PAYLOAD characters (one ASCII char per `step` bytes);
  // for UTF-16 the payload starts after the 2-byte BOM.
  const base = step === 2 ? 2 : 0;
  const at = (pos: number): number => {
    if (step === 2) {
      const idx = base + pos * 2 + (utf16be ? 1 : 0);
      return idx < length ? bytes[idx] : -1;
    }
    return pos < length ? bytes[pos] : -1;
  };

  const charAt = (pos: number): string => {
    const code = at(pos);
    return code < 0 ? "\u0000" : String.fromCharCode(code);
  };

  let budget = 4096; // payload characters examined
  let pos = 0;
  let inTag = false;
  let name = "";
  while (pos < limit && budget > 0) {
    budget -= 1;
    const c = charAt(pos);
    if (!inTag) {
      if (c === "<") {
        inTag = true;
        name = "";
      }
      // Whitespace and stray text before the first tag are tolerated.
    } else {
      if (c === "?" || c === "!") {
        // Preamble construct: <?xml…?>, <!--…-->, or <!DOCTYPE…>.
        // Skip to the matching terminator, then go back outside.
        if (c === "?") {
          while (pos < limit && !(charAt(pos) === "?" && charAt(pos + 1) === ">")) pos += 1;
        } else if (charAt(pos + 1) === "-") {
          while (
            pos < limit &&
            !(charAt(pos) === "-" && charAt(pos + 1) === "-" && charAt(pos + 2) === ">")
          ) {
            pos += 1;
          }
        } else {
          while (pos < limit && charAt(pos) !== ">") pos += 1;
        }
        inTag = false;
      } else if (/[A-Za-z_:]/.test(c)) {
        name += c;
      } else {
        // Space, ">", "/" — the element name is complete.
        if (name !== "") return name;
        inTag = c === ">";
      }
    }
    pos += 1;
  }
  return name !== "" ? name : null;
}

/**
 * Decide the format of a track file from its first bytes plus its name.
 *
 * @param bytes the raw file bytes (a Uint8Array view is enough; the
 *              sniffer never decodes the whole document)
 * @param fileName the upload's name — the extension can steer a text
 *                 file whose root sniff failed, but never overrides the
 *                 bytes
 */
export function sniffTrackFormat(
  bytes: Uint8Array,
  fileName: string,
): SniffResult {
  const length = bytes.length;

  if (length === 0) {
    return { format: "unknown", reason: "the file is empty" };
  }

  // --- FIT: the fixed 8..11 ".FIT" magic (header is 12 or 14 bytes) -----
  if (
    length >= 12 &&
    bytes[8] === 0x2e && // "."
    bytes[9] === 0x46 && // "F"
    bytes[10] === 0x49 && // "I"
    bytes[11] === 0x54 // "T"
  ) {
    const headerSize = bytes[0];
    if (headerSize === 12 || headerSize === 14) {
      return { format: "fit" };
    }
    return {
      format: "unknown",
      reason: `a ".FIT" signature with an impossible header size (${headerSize})`,
    };
  }

  // --- XML family: root element name ------------------------------------
  const root = sniffXmlRoot(bytes);
  if (root === "gpx") return { format: "gpx" };
  if (root === "TrainingCenterDatabase") return { format: "tcx" };

  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  if (root !== null) {
    // XML with an unexpected root: steer track-named files to their
    // parser — its typed error names the actual root ("Expected a <gpx>
    // root element but found <html>"), which beats a generic "unknown".
    if (ext === "gpx" || ext === "xml") return { format: "gpx" };
    if (ext === "tcx") return { format: "tcx" };
    return {
      format: "unknown",
      reason: `an XML root element named <${root}>`,
    };
  }

  // No XML root found: text or binary. The extension steers text files
  // into the XML parsers (their typed errors are precise); binary stays
  // unknown.
  const first = bytes[0];
  const looksTextual =
    (first >= 0x20 && first <= 0x7e) ||
    first === 0x0a ||
    first === 0x0d ||
    first === 0x09 ||
    first === 0xef; // UTF-8 BOM start
  if (looksTextual && (ext === "tcx" || ext === "gpx" || ext === "xml")) {
    return ext === "tcx" ? { format: "tcx" } : { format: "gpx" };
  }
  if (looksTextual) {
    return { format: "unknown", reason: "unrecognized text content" };
  }
  return {
    format: "unknown",
    reason: "unrecognized binary content",
  };
}
