/**
 * Synthetic JPEG builder — the TEST-side fixture factory (Phase 26).
 *
 * Deliberately an INDEPENDENT implementation of TIFF/EXIF writing:
 * the app's engine (features/photos/jpeg.ts) never touches this code,
 * so a round-trip (builder → injectGps → readGps) is a real
 * cross-check between two writers, not a tautology. The layouts it
 * produces are intentionally varied — little/big endian, with/without
 * APP0, XMP APP1 alongside the Exif APP1, sub-IFDs, IFD1 thumbnails,
 * maker-note-sized blobs — the shapes real camera files take.
 *
 * Test infrastructure only — never imported by app code.
 */

/** What the EXIF APP1 of a synthetic JPEG carries. */
export interface SyntheticExifSpec {
  endian?: "II" | "MM";
  make?: string;
  model?: string;
  orientation?: number;
  /** "YYYY:MM:DD HH:MM:SS" exactly as a camera writes it. */
  dateTimeOriginal?: string;
  /** A pre-existing GPS block (lat/lon decimal degrees). */
  gps?: { lat: number; lon: number };
  /** An UNDEFINED blob > 4 bytes (the maker-note offset test). */
  bigUndefinedTag?: { tag: number; bytes: Uint8Array };
  /** Append an IFD1 (thumbnail IFD) after the GPS/Exif IFDs. */
  thumbnailIfd?: boolean;
}

export interface SyntheticJpegSpec {
  /** Lead with an APP0/JFIF segment (the DCF placement). */
  app0?: boolean;
  exif?: SyntheticExifSpec;
  /** An XMP APP1 AFTER the Exif APP1 (non-Exif APP1s must be skipped). */
  xmpApp1?: boolean;
}

class W {
  private bytes: number[] = [];
  constructor(private readonly little: boolean) {}
  get length(): number {
    return this.bytes.length;
  }
  u8(v: number): this {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number): this {
    if (this.little) this.bytes.push(v & 0xff, (v >>> 8) & 0xff);
    else this.bytes.push((v >>> 8) & 0xff, v & 0xff);
    return this;
  }
  u32(v: number): this {
    const b = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    this.bytes.push(...(this.little ? [b[3]!, b[2]!, b[1]!, b[0]!] : b));
    return this;
  }
  raw(bytes: Uint8Array): this {
    for (const b of bytes) this.bytes.push(b);
    return this;
  }
  ascii(text: string): this {
    for (const ch of text) this.bytes.push(ch.charCodeAt(0) & 0xff);
    return this;
  }
  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** One IFD entry while laying the synthetic TIFF out. */
interface EntrySpec {
  tag: number;
  type: number;
  count: number;
  /** ≤4 bytes inline; >4 bytes goes to the payload area. */
  data: Uint8Array;
}

/** An entry whose payload-area offset has been assigned. */
interface OffsetEntry extends EntrySpec {
  offset?: number;
}

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

/** Build a standalone TIFF blob for the Exif APP1 payload. */
export function buildSyntheticTiff(spec: SyntheticExifSpec): Uint8Array {
  const little = (spec.endian ?? "II") === "II";
  const ifd0: EntrySpec[] = [];
  const exifIfd: EntrySpec[] = [];
  const gpsIfd: EntrySpec[] = [];
  const ifd1: EntrySpec[] = [{ tag: 0x0103, type: 3, count: 1, data: Uint8Array.from([6, 0]) }];

  const asciiEntry = (tag: number, text: string): EntrySpec => ({
    tag,
    type: 2,
    count: text.length + 1,
    data: Uint8Array.from([...text].map((ch) => ch.charCodeAt(0) & 0xff).concat([0])),
  });

  if (spec.make !== undefined) ifd0.push(asciiEntry(0x010f, spec.make));
  if (spec.model !== undefined) ifd0.push(asciiEntry(0x0110, spec.model));
  if (spec.orientation !== undefined) {
    const inline = new Uint8Array(4);
    if (little) inline.set([spec.orientation & 0xff, (spec.orientation >>> 8) & 0xff]);
    else inline.set([(spec.orientation >>> 8) & 0xff, spec.orientation & 0xff]);
    ifd0.push({ tag: 0x0112, type: 3, count: 1, data: inline });
  }
  const hasExifIfd =
    spec.dateTimeOriginal !== undefined || spec.bigUndefinedTag !== undefined;
  if (spec.dateTimeOriginal !== undefined) {
    exifIfd.push(asciiEntry(0x9003, spec.dateTimeOriginal));
  }
  if (spec.bigUndefinedTag !== undefined) {
    exifIfd.push({
      tag: spec.bigUndefinedTag.tag,
      type: 7,
      count: spec.bigUndefinedTag.bytes.length,
      data: spec.bigUndefinedTag.bytes,
    });
  }
  if (spec.gps !== undefined) {
    // The fixture writer uses its OWN DMS denominator (1/10_000 s) —
    // deliberately different from the engine's, proving the reader
    // honors whatever a camera chose.
    const dms = (value: number): Uint8Array => {
      const abs = Math.abs(value);
      const deg = Math.floor(abs);
      const minF = (abs - deg) * 60;
      const min = Math.floor(minF);
      const secNum = Math.round((minF - min) * 60 * 10_000);
      return new W(little)
        .u32(deg).u32(1)
        .u32(min).u32(1)
        .u32(secNum).u32(10_000)
        .toBytes();
    };
    gpsIfd.push({ tag: 0x0000, type: 1, count: 4, data: Uint8Array.from([2, 3, 0, 0]) });
    gpsIfd.push({
      tag: 0x0001,
      type: 2,
      count: 2,
      data: Uint8Array.from([spec.gps.lat >= 0 ? 0x4e : 0x53, 0]),
    });
    gpsIfd.push({ tag: 0x0002, type: 5, count: 3, data: dms(spec.gps.lat) });
    gpsIfd.push({
      tag: 0x0003,
      type: 2,
      count: 2,
      data: Uint8Array.from([spec.gps.lon >= 0 ? 0x45 : 0x57, 0]),
    });
    gpsIfd.push({ tag: 0x0004, type: 5, count: 3, data: dms(spec.gps.lon) });
  }

  ifd0.sort((a, b) => a.tag - b.tag);
  exifIfd.sort((a, b) => a.tag - b.tag);
  gpsIfd.sort((a, b) => a.tag - b.tag);

  // Pointer entries join once the sub-IFD positions are known.
  if (hasExifIfd) ifd0.push({ tag: 0x8769, type: 4, count: 1, data: new Uint8Array(4) });
  if (gpsIfd.length > 0) ifd0.push({ tag: 0x8825, type: 4, count: 1, data: new Uint8Array(4) });
  ifd0.sort((a, b) => a.tag - b.tag);

  const ifdSize = (entries: EntrySpec[]): number => 2 + 12 * entries.length + 4;

  // Layout: header(8) → IFD0 → exif? → gps? → IFD1? → payloads.
  let cursor = 8;
  const ifd0At = cursor;
  cursor += ifdSize(ifd0);
  const exifAt = hasExifIfd ? cursor : -1;
  if (hasExifIfd) cursor += ifdSize(exifIfd);
  const gpsAt = gpsIfd.length > 0 ? cursor : -1;
  if (gpsIfd.length > 0) cursor += ifdSize(gpsIfd);
  const ifd1At = spec.thumbnailIfd ? cursor : -1;
  if (spec.thumbnailIfd) cursor += ifdSize(ifd1);
  const payloadAt = cursor;

  // Assign payload offsets.
  let payloadCursor = payloadAt;
  const assign = (entries: OffsetEntry[]): void => {
    for (const entry of entries) {
      if (entry.data.length > 4) {
        entry.offset = payloadCursor;
        payloadCursor += entry.data.length;
        if (payloadCursor % 2 === 1) payloadCursor += 1;
      }
    }
  };
  assign(ifd0);
  assign(exifIfd);
  assign(gpsIfd);
  assign(ifd1);
  // Patch the pointer entries (their 4-byte data IS the offset).
  for (const entry of ifd0) {
    if (entry.tag === 0x8769) entry.data = new W(little).u32(exifAt).toBytes();
    if (entry.tag === 0x8825) entry.data = new W(little).u32(gpsAt).toBytes();
  }

  const out = new W(little);
  // Header: byte order + magic + IFD0 offset.
  out.u8(little ? 0x49 : 0x4d).u8(little ? 0x49 : 0x4d);
  out.u16(0x2a);
  out.u32(ifd0At);
  const writeIfd = (entries: OffsetEntry[], nextIfd: number): void => {
    out.u16(entries.length);
    for (const entry of entries) {
      out.u16(entry.tag).u16(entry.type).u32(entry.count);
      if (entry.data.length > 4) out.u32(entry.offset!);
      else {
        const inline = new Uint8Array(4);
        inline.set(entry.data, 0);
        out.raw(inline);
      }
    }
    out.u32(nextIfd);
  };
  writeIfd(ifd0, spec.thumbnailIfd ? ifd1At : 0);
  if (hasExifIfd) writeIfd(exifIfd, 0);
  if (gpsIfd.length > 0) writeIfd(gpsIfd, 0);
  if (spec.thumbnailIfd) writeIfd(ifd1, 0);
  // Payloads (word-aligned).
  const writePayloads = (entries: OffsetEntry[]): void => {
    for (const entry of entries) {
      if (entry.data.length > 4) {
        if (out.length % 2 === 1) out.u8(0);
        out.raw(entry.data);
      }
    }
  };
  writePayloads(ifd0);
  writePayloads(exifIfd);
  writePayloads(gpsIfd);
  writePayloads(ifd1);
  return out.toBytes();
}

/** A JPEG segment: FF <code> <len BE> <payload>. */
function segment(code: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = code;
  out[2] = (payload.length + 2) >> 8;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}

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

/** Build a synthetic JPEG with the requested metadata shapes. */
export function buildSyntheticJpeg(spec: SyntheticJpegSpec = {}): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.from([0xff, 0xd8])];
  if (spec.app0) {
    // APP0/JFIF: "JFIF\0" + version 1.01 + units/density + thumbnail 0×0.
    parts.push(
      segment(
        0xe0,
        Uint8Array.from([
          0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
          0x00, 0x00,
        ]),
      ),
    );
  }
  if (spec.exif) {
    const tiff = buildSyntheticTiff(spec.exif);
    const payload = concat(
      Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]),
      tiff,
    );
    parts.push(segment(0xe1, payload));
  }
  if (spec.xmpApp1) {
    const xmp = new TextEncoder().encode(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">standard XMP</x:xmpmeta>',
    );
    parts.push(
      segment(
        0xe1,
        concat(
          new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\u0000"),
          xmp,
        ),
      ),
    );
  }
  // A comment + a fake quantization table + SOF + SOS + entropy + EOI.
  parts.push(
    segment(0xfe, new TextEncoder().encode("synthetic fixture")),
    segment(0xdb, new Uint8Array(67).fill(0x11)),
    segment(
      0xc0,
      Uint8Array.from([0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x22, 0x00]),
    ),
    Uint8Array.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    new Uint8Array(64).fill(0xa5),
    Uint8Array.from([0xff, 0xd9]),
  );
  return concat(...parts);
}

/** Magic-byte factories for the refusal goldens. */
export const FIXTURE_MAGIC = {
  heic(): Uint8Array {
    const out = new Uint8Array(24);
    out.set([0x00, 0x00, 0x00, 0x18], 0);
    out.set(new TextEncoder().encode("ftypheic"), 4);
    return out;
  },
  avif(): Uint8Array {
    const out = new Uint8Array(24);
    out.set([0x00, 0x00, 0x00, 0x18], 0);
    out.set(new TextEncoder().encode("ftypavif"), 4);
    return out;
  },
  cr2(): Uint8Array {
    const out = new Uint8Array(32);
    out.set([0x49, 0x49, 0x2a, 0x00], 0);
    out.set(new TextEncoder().encode("CR"), 8);
    return out;
  },
  nef(): Uint8Array {
    const out = new Uint8Array(32);
    out.set([0x49, 0x49, 0x2a, 0x00], 0);
    return out;
  },
  orf(): Uint8Array {
    const out = new Uint8Array(32);
    out.set(new TextEncoder().encode("IIRO"), 0);
    return out;
  },
  raf(): Uint8Array {
    const out = new Uint8Array(32);
    out.set(new TextEncoder().encode("FUJIFILMCCD-RAW "), 0);
    return out;
  },
  png(): Uint8Array {
    const out = new Uint8Array(24);
    out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    return out;
  },
  webp(): Uint8Array {
    const out = new Uint8Array(24);
    out.set(new TextEncoder().encode("RIFF"), 0);
    out.set(new TextEncoder().encode("WEBP"), 8);
    return out;
  },
};
