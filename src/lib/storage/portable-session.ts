/**
 * Portable session files (Phase 18 — docs/MASTER_PLAN.md §EE 18.3): the
 * versioned `.gpxrepair.json` document that carries a whole working
 * session — the original file's bytes, the working-copy overrides, the
 * reconstructions, the view — between browsers and devices.
 *
 * No accounts, ever: the file IS the session. Build it from one
 * section's captured record (the same `StoredSessionRecord` Phase 10
 * persists to IndexedDB — one capture layer, two homes) plus the
 * original file; open it by validating, re-parsing the embedded bytes
 * through the real pipeline, and hydrating the stores (the restore path
 * in `hooks/use-session-recovery.ts` — the same code an IndexedDB
 * restore takes).
 *
 * Shape (version 1):
 *
 *   {
 *     "format": "gpxrepair-session",
 *     "version": 1,
 *     "exportedAt": 1730000000000,
 *     "session": { …the StoredSessionRecord (schemaVersion 2)… },
 *     "view": "repair" | "share",            // repair sessions only
 *     "source": {                            // file-backed sessions only
 *       "name": "ride.gpx",
 *       "type": "application/gpx+xml",
 *       "encoding": "text" | "base64",
 *       "data": "…xml text…" | "…base64…"
 *     }
 *   }
 *
 * Honesty rules:
 *   - the ORIGINAL BYTES ride along verbatim (XML as UTF-8 text —
 *     smaller than base64; binary FIT base64-encoded) so a reopened
 *     session re-parses exactly what was uploaded, never a re-serialization;
 *   - the version is a CEILING on read (the records' "discard, never
 *     guess" rule): a newer document is refused with a typed error,
 *     never partially interpreted;
 *   - create/plan sessions have no source (their record is the whole
 *     session); merge stays excluded by the Phase 10 decision gate.
 *
 * Phase 18 — Batch & portable sessions. Pure TypeScript given the
 * byte/text codecs (TextEncoder/TextDecoder are host globals available
 * in browsers, workers, and Node — the same seam parse-client uses).
 */

import {
  readSessionRecord,
  SESSION_RECORD_SCHEMA_VERSION,
  type StoredSessionRecord,
} from "@/lib/storage/session-record";

/** The portable document's format marker. */
export const PORTABLE_SESSION_FORMAT = "gpxrepair-session";

/** Bump when the document shape changes; the read side keeps a ceiling. */
export const PORTABLE_SESSION_VERSION = 1;

/** The read-side ceiling: newer documents are discarded, never guessed. */
const MAX_READABLE_PORTABLE_VERSION = PORTABLE_SESSION_VERSION;

/** The original file's bytes as carried inside the document. */
export interface PortableSessionSource {
  name: string;
  type: string;
  encoding: "text" | "base64";
  data: string;
}

/** The document itself (exactly what the JSON holds). */
export interface PortableSessionFile {
  format: typeof PORTABLE_SESSION_FORMAT;
  version: typeof PORTABLE_SESSION_VERSION;
  exportedAt: number;
  session: StoredSessionRecord;
  /** The repair session's workspace view (repair/share). */
  view?: "repair" | "share";
  /** The original bytes (file-backed sessions: repair + recovery). */
  source?: PortableSessionSource;
}

/** What `readPortableSession` hands back on success. */
export interface ReadPortableSession {
  record: StoredSessionRecord;
  view: "repair" | "share";
  /** The original bytes rebuilt as a Blob (file-backed sessions only). */
  source: { name: string; type: string; blob: Blob } | null;
}

/** Typed read failures — plain sentences, never raw exceptions. */
export type PortableSessionError =
  | { kind: "not-json" }
  | { kind: "wrong-format" }
  | { kind: "newer-version"; version: number }
  | { kind: "bad-session" }
  | { kind: "bad-source" };

export type ReadPortableSessionResult =
  | { ok: true; file: ReadPortableSession }
  | { ok: false; error: PortableSessionError };

// ---------------------------------------------------------------------------
// Base64 (pure — no btoa/atob host dependency, chunk-safe by construction)
// ---------------------------------------------------------------------------

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 with padding; deterministic for equal inputs. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out +=
      b1 === undefined
        ? "="
        : B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/** Inverse of `bytesToBase64`; returns null on any non-alphabet char. */
export function base64ToBytes(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, "");
  if (clean.length % 4 !== 0) return null;
  const values = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (ch === "=") {
      // Padding only at the end, in known positions.
      if (i < clean.length - 2) return null;
      continue;
    }
    const value = B64_ALPHABET.indexOf(ch);
    if (value < 0) return null;
    values[i] = value;
  }
  const byteLength =
    Math.floor((clean.length * 3) / 4) -
    (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0);
  const out = new Uint8Array(byteLength);
  let outIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      ((values[i] ?? 0) << 18) |
      ((values[i + 1] ?? 0) << 12) |
      ((values[i + 2] ?? 0) << 6) |
      (values[i + 3] ?? 0);
    if (outIndex < byteLength) out[outIndex++] = (n >> 16) & 0xff;
    if (outIndex < byteLength) out[outIndex++] = (n >> 8) & 0xff;
    if (outIndex < byteLength) out[outIndex++] = n & 0xff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build (state → document)
// ---------------------------------------------------------------------------

const UTF8_ENCODER = new TextEncoder();

/**
 * Decide the encoding for the source bytes: XML-looking UTF-8 rides as
 * text (a `.gpx`/`.tcx` document starts with `<`, possibly after a BOM
 * or stray whitespace); anything else (binary FIT) goes base64.
 * Deterministic — never a guess about content beyond the first byte.
 */
function pickEncoding(bytes: Uint8Array): "text" | "base64" {
  let start = 0;
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3;
  }
  while (start < bytes.length) {
    const b = bytes[start]!;
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
      start++;
      continue;
    }
    return b === 0x3c /* "<" */ ? "text" : "base64";
  }
  return "base64"; // whitespace-only — nothing to sniff; keep it opaque
}

/**
 * Build the portable document for one session's record. The source
 * bytes are NOT embedded here — `serializePortableSession` owns the
 * async blob→bytes half; this stays the sync, record-shaped half (the
 * caller may keep the doc around and serialize at download time).
 */
export function buildPortableSession(
  record: StoredSessionRecord,
  options: {
    view?: "repair" | "share";
  } = {},
  exportedAt: number = Date.now(),
): PortableSessionFile {
  const doc: PortableSessionFile = {
    format: PORTABLE_SESSION_FORMAT,
    version: PORTABLE_SESSION_VERSION,
    exportedAt,
    session: record,
  };
  if (options.view !== undefined) doc.view = options.view;
  return doc;
}

/**
 * Serialize the document to its `.gpxrepair.json` text. The source
 * bytes are encoded HERE (the async half — blob → bytes), because the
 * caller holds the blob and this module stays sync elsewhere.
 */
export async function serializePortableSession(
  doc: PortableSessionFile,
  source?: { name: string; type: string; blob: Blob },
): Promise<string> {
  const out: PortableSessionFile = { ...doc };
  if (source !== undefined) {
    const bytes = new Uint8Array(await source.blob.arrayBuffer());
    const encoding = pickEncoding(bytes);
    out.source = {
      name: source.name,
      type: source.type,
      encoding,
      data:
        encoding === "text"
          ? new TextDecoder("utf-8").decode(bytes)
          : bytesToBase64(bytes),
    };
  }
  // 2-space indent: the document is meant to be diffable and inspectable.
  return JSON.stringify(out, null, 2);
}

// ---------------------------------------------------------------------------
// Read (document → session)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validate and decode a `.gpxrepair.json` text. Never throws: every
 * failure is a typed error the caller renders as a plain sentence.
 */
export function readPortableSession(json: string): ReadPortableSessionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: { kind: "not-json" } };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: { kind: "wrong-format" } };
  }
  if (parsed.format !== PORTABLE_SESSION_FORMAT) {
    return { ok: false, error: { kind: "wrong-format" } };
  }
  const version = parsed.version;
  if (typeof version !== "number" || !Number.isFinite(version) || version < 1) {
    return { ok: false, error: { kind: "wrong-format" } };
  }
  if (version > MAX_READABLE_PORTABLE_VERSION) {
    return { ok: false, error: { kind: "newer-version", version } };
  }
  if (typeof parsed.exportedAt !== "number") {
    return { ok: false, error: { kind: "wrong-format" } };
  }

  // The session record goes through the SAME validator IndexedDB
  // records pass (schema ceiling included — one rule, two homes).
  const record = readSessionRecord(parsed.session);
  if (record === null) {
    return { ok: false, error: { kind: "bad-session" } };
  }

  const view =
    parsed.view === "share" ? "share" : "repair";

  // File-backed kinds must carry a readable source to be restorable.
  let source: { name: string; type: string; blob: Blob } | null = null;
  if (record.kind === "file") {
    const raw = parsed.source;
    if (
      !isRecord(raw) ||
      typeof raw.name !== "string" ||
      typeof raw.type !== "string" ||
      (raw.encoding !== "text" && raw.encoding !== "base64") ||
      typeof raw.data !== "string" ||
      raw.data.length === 0
    ) {
      return { ok: false, error: { kind: "bad-source" } };
    }
    let bytes: Uint8Array;
    if (raw.encoding === "text") {
      bytes = UTF8_ENCODER.encode(raw.data);
    } else {
      const decoded = base64ToBytes(raw.data);
      if (decoded === null) {
        return { ok: false, error: { kind: "bad-source" } };
      }
      bytes = decoded;
    }
    source = {
      name: raw.name,
      type: raw.type || "application/gpx+xml",
      blob: new Blob([bytes.slice().buffer], {
        type: raw.type || "application/gpx+xml",
      }),
    };
  }

  return {
    ok: true,
    file: { record, view, source },
  };
}

/** The document's file name for a download (one convention, one place). */
export function portableSessionFileName(sessionName: string): string {
  const stem = sessionName.replace(/\.(gpx|tcx|fit|xml|json)$/i, "");
  const safe = stem.trim().length > 0 ? stem.trim() : "session";
  return `${safe}.gpxrepair.json`;
}

// ---------------------------------------------------------------------------
// Portable LIBRARY bundles (Phase 24 §24.1) — the multi-select export:
// many sessions, one `.gpxrepair-library.json`. Same per-session parts
// (record + verbatim source bytes), wrapped in an array; the import
// door accepts both formats by their `format` marker.
// ---------------------------------------------------------------------------

/** The library bundle's format marker. */
export const PORTABLE_LIBRARY_FORMAT = "gpxrepair-library";

/** Bump when the bundle shape changes; the read side keeps a ceiling. */
export const PORTABLE_LIBRARY_VERSION = 1;

const MAX_READABLE_LIBRARY_VERSION = PORTABLE_LIBRARY_VERSION;

/** One bundled session (exactly the per-session portable parts). */
export interface PortableLibraryEntry {
  /** The shelf entry's name (a bundle is shelf-shaped, not file-shaped). */
  name: string;
  record: StoredSessionRecord;
  view?: "repair" | "share";
  source?: PortableSessionSource;
}

/** The bundle document itself. */
export interface PortableLibraryFile {
  format: typeof PORTABLE_LIBRARY_FORMAT;
  version: typeof PORTABLE_LIBRARY_VERSION;
  exportedAt: number;
  sessions: readonly PortableLibraryEntry[];
}

/** What `readPortableLibrary` hands back per entry. */
export interface ReadPortableLibraryEntry {
  name: string;
  record: StoredSessionRecord;
  view: "repair" | "share";
  source: { name: string; type: string; blob: Blob } | null;
}

export type ReadPortableLibraryResult =
  | { ok: true; sessions: readonly ReadPortableLibraryEntry[] }
  | { ok: false; error: PortableSessionError };

/** The bundle's file name for a download. */
export function portableLibraryFileName(): string {
  return "library.gpxrepair.json";
}

/**
 * Serialize a whole shelf selection into the bundle text. The async
 * half mirrors `serializePortableSession`: each entry's source bytes
 * are encoded here (text when XML-looking, base64 otherwise).
 */
export async function serializePortableLibrary(
  entries: readonly {
    name: string;
    record: StoredSessionRecord;
    view?: "repair" | "share";
    source?: { name: string; type: string; blob: Blob };
  }[],
  exportedAt: number = Date.now(),
): Promise<string> {
  const sessions: PortableLibraryEntry[] = [];
  for (const entry of entries) {
    const serialized: PortableLibraryEntry = {
      name: entry.name,
      record: entry.record,
      ...(entry.view !== undefined ? { view: entry.view } : {}),
    };
    if (entry.source !== undefined) {
      const bytes = new Uint8Array(await entry.source.blob.arrayBuffer());
      const encoding = pickEncoding(bytes);
      serialized.source = {
        name: entry.source.name,
        type: entry.source.type,
        encoding,
        data:
          encoding === "text"
            ? new TextDecoder("utf-8").decode(bytes)
            : bytesToBase64(bytes),
      };
    }
    sessions.push(serialized);
  }
  const doc: PortableLibraryFile = {
    format: PORTABLE_LIBRARY_FORMAT,
    version: PORTABLE_LIBRARY_VERSION,
    exportedAt,
    sessions,
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Validate and decode a `.gpxrepair-library.json` text. Never throws;
 * every failure is the same typed error vocabulary the single-session
 * reader uses. A bundle whose format marker is the single-session one
 * is NOT an error the caller can't handle — use `sniffPortableFormat`
 * to route before calling either reader.
 */
export function readPortableLibrary(json: string): ReadPortableLibraryResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: { kind: "not-json" } };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: { kind: "wrong-format" } };
  }
  if (parsed.format !== PORTABLE_LIBRARY_FORMAT) {
    return { ok: false, error: { kind: "wrong-format" } };
  }
  const version = parsed.version;
  if (
    typeof version !== "number" ||
    !Number.isFinite(version) ||
    version < 1
  ) {
    return { ok: false, error: { kind: "wrong-format" } };
  }
  if (version > MAX_READABLE_LIBRARY_VERSION) {
    return { ok: false, error: { kind: "newer-version", version } };
  }
  if (typeof parsed.exportedAt !== "number" || !Array.isArray(parsed.sessions)) {
    return { ok: false, error: { kind: "wrong-format" } };
  }

  const sessions: ReadPortableLibraryEntry[] = [];
  for (const raw of parsed.sessions) {
    if (!isRecord(raw) || typeof raw.name !== "string" || raw.name.length === 0) {
      return { ok: false, error: { kind: "bad-session" } };
    }
    const record = readSessionRecord(raw.record);
    if (record === null) {
      return { ok: false, error: { kind: "bad-session" } };
    }
    const view = raw.view === "share" ? "share" : "repair";
    let source: { name: string; type: string; blob: Blob } | null = null;
    if (record.kind === "file") {
      const src = raw.source;
      if (
        !isRecord(src) ||
        typeof src.name !== "string" ||
        typeof src.type !== "string" ||
        (src.encoding !== "text" && src.encoding !== "base64") ||
        typeof src.data !== "string" ||
        src.data.length === 0
      ) {
        return { ok: false, error: { kind: "bad-source" } };
      }
      let bytes: Uint8Array;
      if (src.encoding === "text") {
        bytes = UTF8_ENCODER.encode(src.data);
      } else {
        const decoded = base64ToBytes(src.data);
        if (decoded === null) {
          return { ok: false, error: { kind: "bad-source" } };
        }
        bytes = decoded;
      }
      source = {
        name: src.name,
        type: src.type || "application/gpx+xml",
        blob: new Blob([bytes.slice().buffer], {
          type: src.type || "application/gpx+xml",
        }),
      };
    }
    sessions.push({ name: raw.name, record, view, source });
  }
  return { ok: true, sessions };
}

/**
 * Which portable format is this JSON? Routes the import door: the
 * single-session reader or the library reader. Null when the text is
 * not JSON or carries no recognizable marker (the readers' own typed
 * errors take over from there).
 */
export function sniffPortableFormat(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.format !== "string") return null;
  if (
    parsed.format === PORTABLE_SESSION_FORMAT ||
    parsed.format === PORTABLE_LIBRARY_FORMAT
  ) {
    return parsed.format;
  }
  return null;
}

/** The session-record schema this build writes (exported for docs/tests). */
export { SESSION_RECORD_SCHEMA_VERSION };
