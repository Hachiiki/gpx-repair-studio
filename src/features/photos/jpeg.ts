/**
 * JPEG + EXIF GPS engine (Phase 26 — docs/plans/v3/
 * phase-26-photo-geotagging.md §26.2/§26.3): sniff what a photo
 * actually is, read the camera's clock out of EXIF, and write a GPS
 * block back into the JPEG bytes — all pure TypeScript, all on-device.
 *
 * Honesty rules this engine enforces:
 *   - only JPEG is written (§26.3): HEIC/RAW/PNG/WebP are REFUSED with
 *     the format named — never silently re-encoded, never guessed at;
 *   - the input bytes are NEVER mutated: `injectGps` returns a fresh
 *     buffer (Save As is the default; the original is untouchable by
 *     construction, and the property tests pin it);
 *   - an existing GPS block is replaced openly (the old block is left
 *     in place as orphaned bytes — nothing else in the file moves);
 *   - every other EXIF tag survives byte-for-byte: when a GPS pointer
 *     must be ADDED, the IFD0 entry table grows by 12 bytes and every
 *     offset at or after the insertion point is walked and rebased —
 *     including sub-IFD pointers and MakerNotes value offsets (the
 *     one known limit, shared with every JS EXIF writer: a maker note
 *     whose INTERNAL pointers are absolute TIFF offsets can still
 *     drift; the manifest says GPS was added, so the edit is never a
 *     secret).
 *
 * Pure domain module: Uint8Array in, Uint8Array out — no DOM, no
 * framework (the §F boundary rules).
 *
 * Phase 26 — Photo geotagging. Pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Public vocabulary
// ---------------------------------------------------------------------------

/** Why a photo cannot be geotagged (§26.3 — the reason is always stated). */
export type RefusedFormat =
  | "heic" // Apple/camera ISO Media container (HEIC/HEIF/AVIF…)
  | "raw" // TIFF-based camera RAW (CR2/NEF/ARW/DNG/ORF/RW2/PEF…)
  | "fujifilm-raf" // Fujifilm's own RAW container
  | "png" // no EXIF GPS in mainstream PNG tooling
  | "webp" // EXIF-in-WebP is not written here
  | "unknown"; // not a recognized image

/** What the sniffing pass decided a file is. */
export type PhotoImageKind =
  | { kind: "jpeg" }
  | { kind: "refused"; format: RefusedFormat; detail: string };

/** What `readExifSummary` found (null = the JPEG carries no EXIF at all). */
export interface ExifSummary {
  /** DateTimeOriginal exactly as stored ("YYYY:MM:DD HH:MM:SS"). */
  dateTimeOriginal: string | null;
  /** The file already carries a GPS block (§26.3's replacement note). */
  hasGps: boolean;
}

/** The position fix written into a photo's GPS IFD. */
export interface GpsFix {
  lat: number;
  lon: number;
  /** Meters above sea level (negative = below; omitted = not written). */
  ele?: number;
  /** UTC epoch ms — becomes GPSTimeStamp/GPSDateStamp (the fix's clock). */
  timeMs: number;
}

/** What `readGps` parsed back out (the round-trip proof). */
export interface ReadGps {
  lat: number;
  lon: number;
  ele: number | null;
  timeMs: number | null;
}

// ---------------------------------------------------------------------------
// Sniffing (§26.3)
// ---------------------------------------------------------------------------

/** ASCII bytes at [start, start+len). */
function asciiAt(bytes: Uint8Array, start: number, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += String.fromCharCode(bytes[start + i]!);
  return out;
}

/**
 * Decide what a file is from its magic bytes. Deliberately
 * conservative: anything not positively a JPEG is refused with the
 * format named — the list is a vocabulary, not a converter.
 */
export function sniffImageKind(bytes: Uint8Array): PhotoImageKind {
  if (bytes.length < 12) {
    return {
      kind: "refused",
      format: "unknown",
      detail: "too small to be a photo",
    };
  }
  // JPEG: SOI + a valid marker follows.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "jpeg" };
  }
  // ISO Media family (ftyp box): HEIC/HEIF/HEIX/AVIF/camera brands.
  if (asciiAt(bytes, 4, 4) === "ftyp") {
    const brand = asciiAt(bytes, 8, 4).trim().toLowerCase();
    if (brand === "avif" || brand === "avis") {
      return {
        kind: "refused",
        format: "heic",
        detail: "AVIF (ISO Media container)",
      };
    }
    return {
      kind: "refused",
      format: "heic",
      detail: brand ? `HEIC/HEIF (brand “${brand}”)` : "HEIC/HEIF container",
    };
  }
  // Fujifilm RAF has its own magic.
  if (asciiAt(bytes, 0, 8) === "FUJIFILM") {
    return { kind: "refused", format: "fujifilm-raf", detail: "Fujifilm RAF" };
  }
  // TIFF-based: every camera RAW (CR2/NEF/ARW/DNG/PEF) shares the magic.
  const tiffMagic =
    (bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a);
  // ORF ("IIRO") and RW2 ("IIU\0") bend the TIFF magic.
  const orfMagic = asciiAt(bytes, 0, 4) === "IIRO";
  const rw2Magic =
    bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x55 && bytes[3] === 0x00;
  if (tiffMagic || orfMagic || rw2Magic) {
    let name = "TIFF-based RAW";
    if (tiffMagic && asciiAt(bytes, 8, 2) === "CR") name = "Canon CR2";
    else if (orfMagic) name = "Olympus ORF";
    else if (rw2Magic) name = "Panasonic RW2";
    return { kind: "refused", format: "raw", detail: name };
  }
  // PNG.
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return {
      kind: "refused",
      format: "png",
      detail: "PNG (no EXIF GPS in mainstream tools)",
    };
  }
  // WebP (RIFF…WEBP).
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return {
      kind: "refused",
      format: "webp",
      detail: "WebP (EXIF not written here)",
    };
  }
  return { kind: "refused", format: "unknown", detail: "unrecognized bytes" };
}

// ---------------------------------------------------------------------------
// JPEG segment walk + TIFF parsing
// ---------------------------------------------------------------------------

/** One APP1 "Exif\0\0" segment's placement inside the file. */
interface ExifSegment {
  /** Segment start (the 0xFF marker byte). */
  start: number;
  /** First byte after the segment (start + 2 + length). */
  end: number;
  /** TIFF data start (after FF E1 <len> "Exif\0\0"). */
  dataStart: number;
}

/** Locate the FIRST APP1 segment whose payload starts with "Exif\0\0". */
function findExifSegment(bytes: Uint8Array): ExifSegment | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null; // desynchronized — no EXIF
    const code = bytes[i + 1]!;
    // Standalone markers carry no length.
    if (code === 0x01 || (code >= 0xd0 && code <= 0xd7)) {
      i += 2;
      continue;
    }
    if (code === 0xd9) return null; // EOI without SOS — degenerate
    if (code === 0xda) return null; // SOS: metadata ended, no EXIF found
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) return null; // corrupt
    if (
      code === 0xe1 &&
      len >= 8 &&
      asciiAt(bytes, i + 4, 6) === "Exif\u0000\u0000"
    ) {
      return { start: i, end: i + 2 + len, dataStart: i + 10 };
    }
    i += 2 + len;
  }
  return null;
}

/** TIFF field types → byte sizes (the finite IFD vocabulary). */
const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

/** One parsed IFD entry (raw — interpretation is the caller's). */
interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** The 4-byte value field's inline bytes (copied out). */
  inline: Uint8Array;
  /** Absolute data offset when count×size > 4, else null. */
  dataOffset: number | null;
}

/** A parsed TIFF blob: endianness + IFD reader. */
class TiffReader {
  readonly little: boolean;
  private readonly view: DataView;

  constructor(private readonly data: Uint8Array) {
    this.little = data[0] === 0x49;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  u16(offset: number): number {
    return this.view.getUint16(offset, this.little);
  }

  u32(offset: number): number {
    return this.view.getUint32(offset, this.little);
  }

  /** Parse one IFD's entries at an absolute TIFF offset. */
  entries(ifdOffset: number): IfdEntry[] {
    if (ifdOffset < 8 || ifdOffset + 2 > this.data.length) return [];
    const count = this.u16(ifdOffset);
    const out: IfdEntry[] = [];
    for (let i = 0; i < count; i++) {
      const at = ifdOffset + 2 + 12 * i;
      if (at + 12 > this.data.length) break;
      const type = this.u16(at + 2);
      const entryCount = this.u32(at + 4);
      const size = (TYPE_SIZE[type] ?? 1) * entryCount;
      out.push({
        tag: this.u16(at),
        type,
        count: entryCount,
        inline: this.data.slice(at + 8, at + 12),
        dataOffset: size > 4 ? this.u32(at + 8) : null,
      });
    }
    return out;
  }

  /** Read an entry's bytes (inline or at its data offset). */
  valueBytes(entry: IfdEntry): Uint8Array | null {
    const size = (TYPE_SIZE[entry.type] ?? 1) * entry.count;
    if (size <= 4) {
      return entry.inline.slice(0, Math.max(0, size));
    }
    if (entry.dataOffset === null) return null;
    if (entry.dataOffset + size > this.data.length) return null;
    return this.data.slice(entry.dataOffset, entry.dataOffset + size);
  }

  /** Read one RATIONAL (num/den) at a payload offset. */
  rational(at: number): number | null {
    if (at < 0 || at + 8 > this.data.length) return null;
    const num = this.u32(at);
    const den = this.u32(at + 4);
    if (den === 0) return null;
    return num / den;
  }

  /** ASCII value, NUL-trimmed. */
  ascii(entry: IfdEntry): string | null {
    const raw = this.valueBytes(entry);
    if (raw === null) return null;
    let out = "";
    for (const byte of raw) {
      if (byte === 0) break;
      out += String.fromCharCode(byte);
    }
    return out;
  }

  /** The inline LONG an entry carries (pointer entries). */
  inlineU32(entry: IfdEntry): number {
    return new DataView(
      entry.inline.buffer,
      entry.inline.byteOffset,
      4,
    ).getUint32(0, this.little);
  }

  /** First IFD's offset (after the 8-byte header). */
  ifd0(): number {
    return this.u32(4);
  }
}

// Tag ids this engine cares about.
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_INTEROP_POINTER = 0xa005;
const TAG_DATETIME_ORIGINAL = 0x9003;

/**
 * Summarize a JPEG's EXIF: the camera clock (DateTimeOriginal — the
 * Exif sub-IFD per the standard, IFD0 as a tolerated fallback) and
 * whether a GPS block already exists. Null when there is no EXIF APP1.
 */
export function readExifSummary(bytes: Uint8Array): ExifSummary | null {
  const seg = findExifSegment(bytes);
  if (seg === null) return null;
  const tiff = bytes.subarray(seg.dataStart, seg.end);
  if (tiff.length < 8) return null;
  const reader = new TiffReader(tiff);
  const ifd0 = reader.entries(reader.ifd0());
  const exifPointer = ifd0.find(
    (entry) => entry.tag === TAG_EXIF_IFD_POINTER && entry.type === 4,
  );
  const exifIfd =
    exifPointer !== undefined ? reader.entries(reader.inlineU32(exifPointer)) : [];
  const candidates = [...exifIfd, ...ifd0];
  const dt = candidates.find((entry) => entry.tag === TAG_DATETIME_ORIGINAL);
  const gpsPointer = ifd0.find(
    (entry) => entry.tag === TAG_GPS_IFD_POINTER && entry.type === 4,
  );
  const hasGps =
    gpsPointer !== undefined &&
    readGpsFromTiff(reader, reader.inlineU32(gpsPointer)) !== null;
  return {
    dateTimeOriginal: dt !== undefined ? (reader.ascii(dt) ?? null) : null,
    hasGps,
  };
}

/** Parse "YYYY:MM:DD HH:MM:SS" into naive epoch ms (UTC fields). */
export function parseExifDateTime(raw: string): number | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  // Reject e.g. Feb 31 (Date.UTC normalizes instead of failing).
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** The inverse of parseExifDateTime (round-trip tests pin the pair). */
export function formatExifDateTime(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}:${p2(d.getUTCMonth() + 1)}:${p2(d.getUTCDate())} ` +
    `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`
  );
}

// ---------------------------------------------------------------------------
// GPS reading (the round-trip proof)
// ---------------------------------------------------------------------------

/** GPS tag ids. */
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;
const TAG_GPS_ALT_REF = 0x0005;
const TAG_GPS_ALT = 0x0006;
const TAG_GPS_TIME_STAMP = 0x0007;
const TAG_GPS_DATE_STAMP = 0x001b;

/** GPS DMS rationals → decimal degrees (sign from the ref tag). */
function dmsToDecimal(
  reader: TiffReader,
  entry: IfdEntry,
  negative: boolean,
): number | null {
  if (entry.dataOffset === null) return null;
  const deg = reader.rational(entry.dataOffset);
  const min = reader.rational(entry.dataOffset + 8);
  const sec = reader.rational(entry.dataOffset + 16);
  if (deg === null || min === null || sec === null) return null;
  const value = deg + min / 60 + sec / 3600;
  return negative ? -value : value;
}

/** Parse the GPS IFD a TIFF's IFD0 points at (offset validation inside). */
function readGpsFromTiff(reader: TiffReader, gpsOffset: number): ReadGps | null {
  const entries = reader.entries(gpsOffset);
  if (entries.length === 0) return null;
  const byTag = new Map(entries.map((entry) => [entry.tag, entry]));
  const latEntry = byTag.get(TAG_GPS_LAT);
  const lonEntry = byTag.get(TAG_GPS_LON);
  if (!latEntry || !lonEntry) return null;
  const latRef = byTag.get(TAG_GPS_LAT_REF);
  const lonRef = byTag.get(TAG_GPS_LON_REF);
  const lat = dmsToDecimal(
    reader,
    latEntry,
    latRef !== undefined && reader.ascii(latRef)?.startsWith("S") === true,
  );
  const lon = dmsToDecimal(
    reader,
    lonEntry,
    lonRef !== undefined && reader.ascii(lonRef)?.startsWith("W") === true,
  );
  if (lat === null || lon === null) return null;
  const altEntry = byTag.get(TAG_GPS_ALT);
  const alt =
    altEntry && altEntry.dataOffset !== null
      ? reader.rational(altEntry.dataOffset)
      : null;
  const altRef = byTag.get(TAG_GPS_ALT_REF);
  const belowSea = altRef !== undefined && altRef.inline[0] === 1;
  // GPSTimeStamp (3 rationals) + GPSDateStamp ("YYYY:MM:DD") = UTC.
  let timeMs: number | null = null;
  const tsEntry = byTag.get(TAG_GPS_TIME_STAMP);
  const dateEntry = byTag.get(TAG_GPS_DATE_STAMP);
  if (tsEntry && tsEntry.dataOffset !== null && dateEntry) {
    const h = reader.rational(tsEntry.dataOffset);
    const m = reader.rational(tsEntry.dataOffset + 8);
    const s = reader.rational(tsEntry.dataOffset + 16);
    const dateRaw = reader.ascii(dateEntry);
    if (h !== null && m !== null && s !== null && dateRaw) {
      const parsed = parseExifDateTime(
        `${dateRaw} ${pad2(h)}:${pad2(m)}:${pad2(s)}`,
      );
      if (parsed !== null) timeMs = parsed;
    }
  }
  return {
    lat,
    lon,
    ele: alt === null ? null : belowSea ? -alt : alt,
    timeMs,
  };
}

function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, "0");
}

/** Read the GPS block out of a JPEG (null = none / unparseable). */
export function readGps(bytes: Uint8Array): ReadGps | null {
  const seg = findExifSegment(bytes);
  if (seg === null) return null;
  const tiff = bytes.subarray(seg.dataStart, seg.end);
  if (tiff.length < 8) return null;
  const reader = new TiffReader(tiff);
  const ifd0 = reader.entries(reader.ifd0());
  const pointer = ifd0.find(
    (entry) => entry.tag === TAG_GPS_IFD_POINTER && entry.type === 4,
  );
  if (!pointer) return null;
  return readGpsFromTiff(reader, reader.inlineU32(pointer));
}

// ---------------------------------------------------------------------------
// GPS writing (§26.2 — the on-device write-back)
// ---------------------------------------------------------------------------

/**
 * The DMS second-fraction denominator: 1/1_000_000 s ≈ 0.03 mm of
 * ground — far past any GPS receiver's honesty, so no precision is
 * ever lost to the EXIF encoding itself.
 */
const DMS_SECOND_DEN = 1_000_000;

/** The altitude denominator (centimeter resolution). */
const ALTITUDE_DEN = 100;

/** One GPS IFD entry while building the block: payload after the table. */
interface GpsEntryBuild {
  tag: number;
  type: number;
  count: number;
  /** ≤4 bytes → inline; otherwise written into the payload area. */
  payload: Uint8Array;
}

/** Little/big-endian byte writers over a growable buffer. */
class ByteWriter {
  private bytes: number[] = [];

  constructor(private readonly little: boolean) {}

  get length(): number {
    return this.bytes.length;
  }

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    if (this.little) {
      this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
    } else {
      this.bytes.push((value >>> 8) & 0xff, value & 0xff);
    }
    return this;
  }

  u32(value: number): this {
    const b = [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];
    this.bytes.push(...(this.little ? [b[3]!, b[2]!, b[1]!, b[0]!] : b));
    return this;
  }

  raw(bytes: Uint8Array): this {
    for (const byte of bytes) this.bytes.push(byte);
    return this;
  }

  /** Pad to an even boundary (TIFF's word alignment discipline). */
  pad2(): this {
    if (this.length % 2 === 1) this.bytes.push(0);
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** One rational as 8 bytes (num/den, unsigned 32-bit each). */
function rationalBytes(
  num: number,
  den: number,
  little: boolean,
): Uint8Array {
  return new ByteWriter(little).u32(num).u32(den).toBytes();
}

/** Split |value| into D/M/S rationals (seconds carry only at 60). */
function dmsPayload(value: number, little: boolean): Uint8Array {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  const minutesFloat = (abs - deg) * 60;
  let min = Math.floor(minutesFloat);
  let secNum = Math.round((minutesFloat - min) * 60 * DMS_SECOND_DEN);
  // (minutesFloat - min) ∈ [0, 1) ⇒ seconds ∈ [0, 60) — a carry is
  // never mathematically needed; the guards only defend float
  // extremes, and 60 s === 1 min keeps the value identical anyway.
  if (secNum >= 60 * DMS_SECOND_DEN) {
    secNum -= 60 * DMS_SECOND_DEN;
    min += 1;
  }
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  return new ByteWriter(little)
    .u32(deg)
    .u32(1)
    .u32(min)
    .u32(1)
    .u32(secNum)
    .u32(DMS_SECOND_DEN)
    .toBytes();
}

/**
 * Build the GPS IFD block. `gpsStart` is the block's absolute offset
 * from the TIFF header start — every payload offset is computed
 * against it, so the block is position-independent to splice.
 */
function buildGpsBlock(fix: GpsFix, little: boolean, gpsStart: number): Uint8Array {
  const entries: GpsEntryBuild[] = [];
  // 0x0000 GPSVersionID — BYTE[4], "2.3.0.0" (inline).
  entries.push({
    tag: 0x0000,
    type: 1,
    count: 4,
    payload: Uint8Array.from([2, 3, 0, 0]),
  });
  // 0x0001/0x0003 refs — ASCII[2], inline.
  entries.push({
    tag: 0x0001,
    type: 2,
    count: 2,
    payload: Uint8Array.from([fix.lat >= 0 ? 0x4e : 0x53, 0]), // N / S
  });
  entries.push({ tag: 0x0002, type: 5, count: 3, payload: dmsPayload(fix.lat, little) });
  entries.push({
    tag: 0x0003,
    type: 2,
    count: 2,
    payload: Uint8Array.from([fix.lon >= 0 ? 0x45 : 0x57, 0]), // E / W
  });
  entries.push({ tag: 0x0004, type: 5, count: 3, payload: dmsPayload(fix.lon, little) });
  if (fix.ele !== undefined) {
    entries.push({ tag: 0x0005, type: 1, count: 1, payload: Uint8Array.from([fix.ele < 0 ? 1 : 0]) });
    entries.push({
      tag: 0x0006,
      type: 5,
      count: 1,
      payload: rationalBytes(Math.round(Math.abs(fix.ele) * ALTITUDE_DEN), ALTITUDE_DEN, little),
    });
  }
  // 0x0007 GPSTimeStamp — RATIONAL[3] UTC (the fix's own clock).
  const d = new Date(fix.timeMs);
  entries.push({
    tag: 0x0007,
    type: 5,
    count: 3,
    payload: new ByteWriter(little)
      .u32(d.getUTCHours())
      .u32(1)
      .u32(d.getUTCMinutes())
      .u32(1)
      .u32(d.getUTCSeconds())
      .u32(1)
      .toBytes(),
  });
  // 0x001B GPSDateStamp — ASCII[11] "YYYY:MM:DD\0".
  const dateStamp = `${d.getUTCFullYear()}:${pad2(d.getUTCMonth() + 1)}:${pad2(d.getUTCDate())}\u0000`;
  entries.push({
    tag: 0x001b,
    type: 2,
    count: dateStamp.length,
    payload: Uint8Array.from(
      dateStamp.split("").map((ch) => ch.charCodeAt(0) & 0xff),
    ),
  });
  entries.sort((a, b) => a.tag - b.tag); // TIFF requires tag order.

  // Layout: [count:2][entries×12][next:4][payload…]
  const tableSize = 2 + 12 * entries.length + 4;
  const out = new ByteWriter(little);
  out.u16(entries.length);
  // Payload offsets are ABSOLUTE (gpsStart + local), but the word
  // alignment pad2() pays happens in LOCAL coordinates — a block
  // spliced at an odd gpsStart must still align its own payloads the
  // way it writes them, or every offset after an odd-length payload
  // drifts by one (the double-inject golden caught exactly that).
  let local = tableSize;
  const assigned: { entry: GpsEntryBuild; offset: number }[] = [];
  for (const entry of entries) {
    const size = entry.payload.length;
    if (size <= 4) {
      // Inline: right-sized into the 4-byte value field.
      const inline = new Uint8Array(4);
      inline.set(entry.payload, 0);
      out.u16(entry.tag).u16(entry.type).u32(entry.count).raw(inline);
    } else {
      assigned.push({ entry, offset: gpsStart + local });
      out.u16(entry.tag).u16(entry.type).u32(entry.count).u32(gpsStart + local);
      local += size;
      if (local % 2 === 1) local += 1; // payload stays word-aligned
    }
  }
  out.u32(0); // next-IFD: none
  for (const { entry } of assigned) {
    out.pad2();
    out.raw(entry.payload);
  }
  return out.toBytes();
}

/** Concatenate byte arrays. */
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * A minimal EXIF TIFF for a JPEG that had none: header + IFD0 with
 * exactly one entry — the GPS pointer. (The camera's other metadata
 * can't be lost — there was none.)
 */
function buildMinimalTiff(gpsBlock: Uint8Array): Uint8Array {
  const little = true;
  // Header (8) + IFD0 (2 + 12 + 4) → GPS starts at 26.
  const gpsStart = 8 + 2 + 12 + 4;
  const ifd0 = new ByteWriter(little)
    .u16(1) // one entry
    .u16(TAG_GPS_IFD_POINTER)
    .u16(4) // LONG
    .u32(1)
    .u32(gpsStart)
    .u32(0); // next IFD: none
  return concat(
    new ByteWriter(little).u8(0x49).u8(0x49).u16(0x2a).u32(8).toBytes(),
    ifd0.toBytes(),
    gpsBlock,
  );
}

/**
 * Rebase every offset in the TIFF that lands at/after `splicePos` by
 * +12 (the inserted IFD0 entry), walking IFD0 → its sub-IFDs → IFD1.
 * The inserted GPS-pointer entry itself is skipped (its value is
 * already final). `tiff` is modified IN PLACE (it is a fresh copy the
 * caller built for exactly this).
 */
function rebaseTiffOffsets(tiff: Uint8Array, splicePos: number, little: boolean): void {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const r16 = (at: number) => view.getUint16(at, little);
  const r32 = (at: number) => view.getUint32(at, little);
  const w32 = (at: number, value: number) => view.setUint32(at, value, little);

  const fixIfd = (ifdOffset: number, isIfd0: boolean, depth: number): void => {
    if (depth > 4 || ifdOffset < 8 || ifdOffset + 2 > tiff.length) return;
    const count = r16(ifdOffset);
    let subIfds: number[] = [];
    for (let i = 0; i < count; i++) {
      const at = ifdOffset + 2 + 12 * i;
      if (at + 12 > tiff.length) break;
      const tag = r16(at);
      const type = r16(at + 2);
      const size = (TYPE_SIZE[type] ?? 1) * r32(at + 4);
      // Our inserted GPS pointer is final — never rebase it.
      const isInsertedGps = isIfd0 && tag === TAG_GPS_IFD_POINTER;
      if (!isInsertedGps && size > 4) {
        const valueOffset = r32(at + 8);
        if (valueOffset >= splicePos) w32(at + 8, valueOffset + 12);
      }
      // Sub-IFD pointers are inline LONGs that are also offsets.
      if (
        !isInsertedGps &&
        tag === TAG_EXIF_IFD_POINTER &&
        isIfd0 &&
        type === 4
      ) {
        const sub = r32(at + 8);
        if (sub >= splicePos) w32(at + 8, sub + 12);
        subIfds.push(r32(at + 8));
      }
      if (tag === TAG_INTEROP_POINTER && type === 4 && depth > 0) {
        const sub = r32(at + 8);
        if (sub >= splicePos) w32(at + 8, sub + 12);
        subIfds.push(r32(at + 8));
      }
    }
    for (const sub of subIfds) fixIfd(sub, false, depth + 1);
    if (isIfd0) {
      // IFD0's next-IFD pointer (IFD1 = the thumbnail) shifts too.
      const nextAt = ifdOffset + 2 + 12 * count;
      if (nextAt + 4 <= tiff.length) {
        const next = r32(nextAt);
        if (next !== 0) {
          if (next >= splicePos) w32(nextAt, next + 12);
          fixIfd(r32(nextAt), false, depth + 1);
        }
      }
    }
  };

  fixIfd(r32(4), true, 0);
}

/**
 * Write a GPS block into a JPEG (§26.2). Returns a FRESH buffer —
 * the input is never touched (Save As is the default; in-place edits
 * are the File System Access API's explicit choice, made by the UI).
 *
 * Strategy — nothing that already exists ever MOVES:
 *   - no EXIF: a minimal EXIF APP1 (header + IFD0 + GPS) is inserted
 *     right after SOI (after APP0 when JFIF leads);
 *   - EXIF without GPS: the GPS block is appended at the TIFF's end,
 *     a GPS-pointer entry is inserted into IFD0 in tag order, and the
 *     12-byte insertion is paid for by rebasing every offset at/after
 *     the insertion point (sub-IFD pointers, value offsets, IFD1);
 *   - EXIF with GPS: the new block is appended and the existing
 *     pointer is repointed — the old block stays as orphaned bytes.
 *
 * A JPEG without a segment structure (no SOS found) is refused with
 * null — never a guessed-at write.
 */
export function injectGps(bytes: Uint8Array, fix: GpsFix): Uint8Array | null {
  const seg = findExifSegment(bytes);

  if (seg === null) {
    // Case A — no EXIF: build one, insert it behind the SOI (behind
    // a leading APP0/JFIF when present, the DCF placement).
    const gpsBlock = buildGpsBlock(fix, true, 26);
    const tiff = buildMinimalTiff(gpsBlock);
    const app1Payload = concat(
      Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0]), // "Exif\0\0"
      tiff,
    );
    let insertAt = 2;
    if (
      bytes.length > 4 &&
      bytes[2] === 0xff &&
      bytes[3] === 0xe0
    ) {
      insertAt = 2 + 2 + ((bytes[4]! << 8) | bytes[5]!);
    }
    const header = new ByteWriter(false) // JPEG lengths are ALWAYS big-endian
      .u8(0xff)
      .u8(0xe1)
      .u16(app1Payload.length + 2)
      .toBytes();
    return concat(
      bytes.subarray(0, insertAt),
      header,
      app1Payload,
      bytes.subarray(insertAt),
    );
  }

  // Case B — EXIF exists: work on the TIFF, splice the APP1 back.
  const tiff = bytes.slice(seg.dataStart, seg.end);
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd0Offset = view.getUint32(4, little);
  if (ifd0Offset < 8 || ifd0Offset + 2 > tiff.length) return null;
  const ifd0Count = view.getUint16(ifd0Offset, little);
  const entriesEnd = ifd0Offset + 2 + 12 * ifd0Count;

  const existingPointerAt = (() => {
    for (let i = 0; i < ifd0Count; i++) {
      const at = ifd0Offset + 2 + 12 * i;
      if (view.getUint16(at, little) === TAG_GPS_IFD_POINTER && view.getUint16(at + 2, little) === 4) {
        return at;
      }
    }
    return -1;
  })();

  if (existingPointerAt >= 0) {
    // Case B2 — GPS already present: append + repoint (zero shifts).
    const gpsStart = tiff.length;
    const block = buildGpsBlock(fix, little, gpsStart);
    const next = concat(tiff, block);
    const nextView = new DataView(next.buffer, next.byteOffset, next.byteLength);
    nextView.setUint32(existingPointerAt + 8, gpsStart, little);
    return spliceApp1(bytes, seg, next);
  }

  // Case B1 — EXIF without GPS: insert the pointer entry in tag order.
  const gpsStart = tiff.length + 12;
  const block = buildGpsBlock(fix, little, gpsStart);
  let insertIdx = ifd0Count;
  for (let i = 0; i < ifd0Count; i++) {
    if (view.getUint16(ifd0Offset + 2 + 12 * i, little) > TAG_GPS_IFD_POINTER) {
      insertIdx = i;
      break;
    }
  }
  const splicePos = ifd0Offset + 2 + 12 * insertIdx;
  const entry = new ByteWriter(little)
    .u16(TAG_GPS_IFD_POINTER)
    .u16(4)
    .u32(1)
    .u32(gpsStart)
    .toBytes();
  const next = concat(
    tiff.subarray(0, splicePos),
    entry,
    tiff.subarray(splicePos),
    block,
  );
  // The entry count grows by one, then every offset ≥ splicePos moves.
  const nextView = new DataView(next.buffer, next.byteOffset, next.byteLength);
  nextView.setUint16(ifd0Offset, ifd0Count + 1, little);
  rebaseTiffOffsets(next, splicePos, little);
  return spliceApp1(bytes, seg, next);
}

/** Replace the Exif APP1's payload with a new TIFF, keeping the rest. */
function spliceApp1(bytes: Uint8Array, seg: ExifSegment, tiff: Uint8Array): Uint8Array {
  const payload = concat(
    Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0]), // "Exif\0\0"
    tiff,
  );
  // JPEG segment lengths are ALWAYS big-endian (the TIFF inside keeps
  // its own byte order — two different worlds in one header).
  const header = new ByteWriter(false)
    .u8(0xff)
    .u8(0xe1)
    .u16(payload.length + 2)
    .toBytes();
  return concat(
    bytes.subarray(0, seg.start),
    header,
    payload,
    bytes.subarray(seg.end),
  );
}
