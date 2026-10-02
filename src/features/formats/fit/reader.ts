/**
 * Minimal FIT reader — the binary half of §EE 14.3.
 *
 * A hand-rolled, dependency-free reader for Garmin's FIT container (the
 * in-phase decision recorded in docs/MASTER_PLAN.md §EE/§HH: the vetted
 * `fit-file-parser` alternative drags a ~440 KB profile table and a
 * Browserify `buffer` polyfill into the browser bundle; FIT's
 * definition-driven design makes a reading decoder genuinely small).
 *
 * Protocol scope (FIT Protocol Rev 2.x, reading only — writing is a
 * non-goal):
 *   - File header (12 or 14 bytes, ".FIT" magic, optional header CRC) and
 *     the trailing file CRC (CRC-16/CCITT, poly 0x1021, init 0).
 *   - Normal record headers (definition/data, local message numbers
 *     0..15, developer-data definitions skipped per field count) and
 *     compressed-timestamp headers (local numbers 0..3, 32 s window).
 *   - Big- and little-endian definition architectures (DataView).
 *   - Base types: enum/uint/sint 8-32, float 32/64, string, byte, and
 *     the zero-terminated integer variants — invalid values become
 *     `undefined`, never garbage.
 *
 * Repair-tool semantics (the deliberate deviations from a strict reader,
 * both disclosed as warnings on the outcome):
 *   - A CRC mismatch does NOT abort the read — the messages are still
 *     definition-driven and self-checking, so the data is recovered and
 *     the mismatch is reported.
 *   - A truncated or desynchronized tail stops the read at the last good
 *     message; whatever decoded cleanly is kept.
 *   - A file with no recoverable positioned record and no course point
 *     is a typed `malformed-fitness-file` error.
 *
 * The only profile knowledge embedded is the field-number table for the
 * seven messages a track file needs (file_id, record, lap, session,
 * activity, course, course_point); everything else is skipped by
 * definition. Numbers verified against the FIT SDK profile via the
 * generated lookup of the reference implementation.
 *
 * Phase 14 — Formats in & out. Pure TypeScript: DataView + TextDecoder
 * only (both available in workers, browsers, and Node ≥ 11).
 */

import type { GpxParseError } from "@/types/domain";

// ---------------------------------------------------------------------------
// Profile constants (FIT SDK Global Profile — the fields we consume)
// ---------------------------------------------------------------------------

/** FIT epoch: 1989-12-31T00:00:00Z in Unix seconds. */
export const FIT_EPOCH_SECONDS = 631065600;

/** Global message numbers (FIT profile "mesg_num"). */
const MSG = {
  fileId: 0,
  lap: 19,
  record: 20,
  event: 21,
  course: 31,
  coursePoint: 32,
  activity: 34,
  session: 18,
} as const;

/** Field numbers inside the messages we read. */
const FILE_ID_FIELDS = {
  type: 0,
  manufacturer: 1,
  timeCreated: 4,
} as const;
const RECORD_FIELDS = {
  timestamp: 253,
  positionLat: 0,
  positionLong: 1,
  altitude: 2,
  heartRate: 3,
  cadence: 4,
  power: 7,
  enhancedAltitude: 78,
} as const;
const LAP_FIELDS = { timestamp: 253, startTime: 2 } as const;
const SESSION_FIELDS = { timestamp: 253, startTime: 2, sport: 5 } as const;
const COURSE_FIELDS = { sport: 4, name: 5 } as const;
const COURSE_POINT_FIELDS = {
  timestamp: 1,
  positionLat: 2,
  positionLong: 3,
  type: 5,
  name: 6,
} as const;
const ACTIVITY_FIELDS = { timestamp: 253 } as const;

/** Semicircles → degrees (180 / 2^31). */
const SEMICIRCLES_TO_DEGREES = 180 / 0x80000000;

// ---------------------------------------------------------------------------
// Base types
// ---------------------------------------------------------------------------

interface BaseType {
  size: number;
  kind: "u" | "s" | "f" | "str" | "bytes";
  /** Raw invalid marker (already in the type's own width). */
  invalid?: number;
}

/**
 * Base types, keyed by the base-type byte's LOW 5 BITS (the high bit is
 * the little-endian marker for multi-byte types; bit 5 is reserved).
 * FIT type ids: 0 enum, 1 sint8, 2 uint8, 3 sint16, 4 uint16, 5 sint32,
 * 6 uint32, 7 string, 8 float32, 9 float64, 10 uint8z, 11 uint16z,
 * 12 uint32z, 13 byte.
 */
const BASE_TYPES: Readonly<Record<number, BaseType>> = {
  0x00: { size: 1, kind: "u", invalid: 0xff }, // enum
  0x01: { size: 1, kind: "s", invalid: 0x7f }, // sint8
  0x02: { size: 1, kind: "u", invalid: 0xff }, // uint8
  0x03: { size: 2, kind: "s", invalid: 0x7fff }, // sint16
  0x04: { size: 2, kind: "u", invalid: 0xffff }, // uint16
  0x05: { size: 4, kind: "s", invalid: 0x7fffffff }, // sint32
  0x06: { size: 4, kind: "u", invalid: 0xffffffff }, // uint32
  0x07: { size: 0, kind: "str" }, // string (NUL-terminated)
  0x08: { size: 4, kind: "f" }, // float32 (NaN = invalid)
  0x09: { size: 8, kind: "f" }, // float64 (NaN = invalid)
  0x0a: { size: 1, kind: "u", invalid: 0x00 }, // uint8z
  0x0b: { size: 2, kind: "u", invalid: 0x0000 }, // uint16z
  0x0c: { size: 4, kind: "u", invalid: 0x00000000 }, // uint32z
  0x0d: { size: 0, kind: "bytes" }, // byte array
};

// ---------------------------------------------------------------------------
// Reader outcome model
// ---------------------------------------------------------------------------

/** One record message, decoded and unit-converted. */
export interface FitRecord {
  timestampMs?: number;
  /** Degrees; undefined when this record carried no position. */
  lat?: number;
  lon?: number;
  /** Meters; undefined when absent/invalid. */
  ele?: number;
  hr?: number;
  cad?: number;
  watts?: number;
}

export interface FitLap {
  startTimeMs?: number;
}

export interface FitSession {
  startTimeMs?: number;
  /** Raw sport enum (1 = running, 2 = cycling, …). */
  sport?: number;
}

export interface FitCoursePoint {
  name?: string;
  lat?: number;
  lon?: number;
  timestampMs?: number;
}

/** Everything the reader recovered from one FIT file. */
export interface FitFileData {
  /** file_id.type enum (4 = activity, 6 = course, …). */
  fileType?: number;
  manufacturer?: number;
  timeCreatedMs?: number;
  records: FitRecord[];
  laps: FitLap[];
  sessions: FitSession[];
  courseNames: string[];
  coursePoints: FitCoursePoint[];
  /** Human-readable recovery disclosures (CRC mismatch, truncation, …). */
  warnings: string[];
}

export type FitReadOutcome =
  | { ok: true; data: FitFileData }
  | { ok: false; error: GpxParseError };

// ---------------------------------------------------------------------------
// Definition message bookkeeping
// ---------------------------------------------------------------------------

interface FieldDef {
  fieldNumber: number;
  size: number;
  baseType: number;
}

interface MessageDef {
  globalMessageNumber: number;
  architecture: 0 | 1; // 0 = LE, 1 = BE
  fields: FieldDef[];
  /** Total data bytes per message (standard + developer fields). */
  messageSize: number;
  /** Developer field sizes (skipped on read, still advance the cursor). */
  devSizes: number[];
}

// ---------------------------------------------------------------------------
// CRC-16/CCITT (FIT: poly 0x1021, init 0, no reflection, no xorout)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    table[i] = crc & 0xffff;
  }
  return table;
})();

function fitCrc16(bytes: Uint8Array, from: number, to: number): number {
  let crc = 0;
  for (let i = from; i < to; i += 1) {
    crc = ((crc << 8) & 0xffff) ^ CRC_TABLE[((crc >> 8) ^ bytes[i]) & 0xff];
  }
  return crc & 0xffff;
}

// ---------------------------------------------------------------------------
// Value decoding
// ---------------------------------------------------------------------------

/** Decode one field instance (first element of an array field). */
function decodeValue(
  view: DataView,
  offset: number,
  def: FieldDef,
  littleEndian: boolean,
): { value: number | string | undefined } {
  const base = BASE_TYPES[def.baseType & 0x1f];
  if (base === undefined || base.kind === "bytes") return { value: undefined };
  if (def.size < base.size) return { value: undefined };

  switch (base.kind) {
    case "u": {
      let raw: number;
      if (base.size === 1) raw = view.getUint8(offset);
      else if (base.size === 2) raw = view.getUint16(offset, littleEndian);
      else if (base.size === 4) raw = view.getUint32(offset, littleEndian);
      else return { value: undefined };
      if (base.invalid !== undefined && raw === base.invalid) return { value: undefined };
      return { value: raw };
    }
    case "s": {
      let raw: number;
      if (base.size === 1) raw = view.getInt8(offset);
      else if (base.size === 2) raw = view.getInt16(offset, littleEndian);
      else if (base.size === 4) raw = view.getInt32(offset, littleEndian);
      else return { value: undefined };
      if (base.invalid !== undefined && raw === base.invalid) return { value: undefined };
      return { value: raw };
    }
    case "f": {
      const raw =
        base.size === 4
          ? view.getFloat32(offset, littleEndian)
          : view.getFloat64(offset, littleEndian);
      return { value: Number.isNaN(raw) ? undefined : raw };
    }
    case "str": {
      // NUL-terminated within the declared size; UTF-8.
      let end = offset;
      const stop = offset + def.size;
      while (end < stop && view.getUint8(end) !== 0x00) end += 1;
      const slice = new Uint8Array(view.buffer, view.byteOffset + offset, end - offset);
      try {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
        return { value: text === "" ? undefined : text };
      } catch {
        return { value: undefined };
      }
    }
    default:
      return { value: undefined };
  }
}

/** Semicircles → degrees. */
function semicirclesToDegrees(raw: number): number {
  return raw * SEMICIRCLES_TO_DEGREES;
}

/** FIT epoch seconds → epoch milliseconds. */
function fitSecondsToMs(raw: number): number {
  return (raw + FIT_EPOCH_SECONDS) * 1000;
}

/** uint16 raw with scale/offset → meters (legacy + enhanced altitude). */
function altitudeToMeters(raw: number): number {
  return raw / 5 - 500;
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

/**
 * Read one FIT file. Never throws for malformed input — the outcome is
 * typed: a hard container error, or recovered data with warnings.
 */
export function readFitFile(bytes: Uint8Array): FitReadOutcome {
  const length = bytes.length;
  const warnings: string[] = [];

  // --- Header -------------------------------------------------------------
  if (length < 12) {
    return {
      ok: false,
      error: {
        kind: "malformed-fitness-file",
        message: `file is only ${length} bytes; a FIT header alone is 12`,
      },
    };
  }
  const headerSize = bytes[0];
  if (headerSize !== 12 && headerSize !== 14) {
    return {
      ok: false,
      error: {
        kind: "malformed-fitness-file",
        message: `invalid header size ${headerSize} (expected 12 or 14)`,
      },
    };
  }
  if (
    bytes[8] !== 0x2e ||
    bytes[9] !== 0x46 ||
    bytes[10] !== 0x49 ||
    bytes[11] !== 0x54
  ) {
    return {
      ok: false,
      error: { kind: "malformed-fitness-file", message: 'missing the ".FIT" signature' },
    };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataSize = view.getUint32(4, true);
  if (headerSize === 14) {
    const headerCrc = view.getUint16(12, true);
    const computed = fitCrc16(bytes, 0, 12);
    if (headerCrc !== computed) {
      warnings.push(
        `Header CRC mismatch (stored 0x${headerCrc.toString(16)}, computed 0x${computed.toString(16)}) — reading continued.`,
      );
    }
  }

  // --- File CRC (advisory for a repair tool) ------------------------------
  if (length >= 14) {
    const fileCrc = view.getUint16(length - 2, true);
    const computed = fitCrc16(bytes, 0, length - 2);
    if (fileCrc !== computed) {
      warnings.push(
        `File CRC mismatch (stored 0x${fileCrc.toString(16)}, computed 0x${computed.toString(16)}) — the file may be corrupt or truncated; readable data was recovered.`,
      );
    }
  }

  // --- Message walk ---------------------------------------------------------
  const defs = new Map<number, MessageDef>();
  const records: FitRecord[] = [];
  const laps: FitLap[] = [];
  const sessions: FitSession[] = [];
  const courseNames: string[] = [];
  const coursePoints: FitCoursePoint[] = [];
  let fileType: number | undefined;
  let manufacturer: number | undefined;
  let timeCreatedMs: number | undefined;
  let lastTimestampSeconds: number | undefined;

  const end = Math.max(headerSize, length - 2);
  let cursor = headerSize;

  const truncated = (): FitReadOutcome => {
    warnings.push(
      `Data ended mid-message at byte ${cursor} — the tail (incl. the file CRC) is missing; ${records.length} record${records.length === 1 ? "" : "s"} recovered.`,
    );
    return finish();
  };

  const finish = (): FitReadOutcome => {
    const positioned =
      records.filter((r) => r.lat !== undefined && r.lon !== undefined).length +
      coursePoints.filter((cp) => cp.lat !== undefined && cp.lon !== undefined).length;
    if (positioned === 0) {
      return {
        ok: false,
        error: {
          kind: "malformed-fitness-file",
          message:
            records.length === 0 && coursePoints.length === 0
              ? "no data messages could be decoded"
              : "no positioned record or course point could be decoded",
        },
      };
    }
    return {
      ok: true,
      data: {
        fileType,
        manufacturer,
        timeCreatedMs,
        records,
        laps,
        sessions,
        courseNames,
        coursePoints,
        warnings,
      },
    };
  };

  while (cursor < end) {
    const headerByte = bytes[cursor];
    cursor += 1;

    // --- Compressed-timestamp data message --------------------------------
    if ((headerByte & 0x80) !== 0) {
      const local = (headerByte & 0x60) >> 5;
      const offset = headerByte & 0x1f;
      const def = defs.get(local);
      if (def === undefined) {
        warnings.push(
          `Stopped at byte ${cursor - 1}: a compressed header references undefined local message ${local}.`,
        );
        return finish();
      }
      if (cursor + def.messageSize > end) return truncated();
      if (lastTimestampSeconds !== undefined) {
        const low = lastTimestampSeconds % 32;
        let ts = lastTimestampSeconds - low + offset;
        if (offset < low) ts += 32;
        lastTimestampSeconds = ts;
      }
      // Only compressed headers imply a timestamp: the message itself
      // carries no field 253, so the header-derived time IS the record's
      // time. Normal messages below never inherit one (no invented times).
      readDataMessage(view, cursor, def, lastTimestampSeconds);
      cursor += def.messageSize;
      continue;
    }

    const local = headerByte & 0x0f;
    const isData = (headerByte & 0x40) !== 0;
    const hasDevFields = (headerByte & 0x20) !== 0;

    // --- Definition message -------------------------------------------------
    if (!isData) {
      if (cursor + 6 > end) return truncated();
      const architecture = view.getUint8(cursor + 1) as 0 | 1;
      if (architecture > 1) {
        warnings.push(
          `Stopped at byte ${cursor - 1}: unknown definition architecture ${architecture}.`,
        );
        return finish();
      }
      const littleEndian = architecture === 0;
      const globalMessageNumber = view.getUint16(cursor + 2, littleEndian);
      const fieldCount = view.getUint8(cursor + 4);
      const fieldsStart = cursor + 5;
      if (fieldsStart + fieldCount * 3 > end) return truncated();
      const fields: FieldDef[] = [];
      for (let i = 0; i < fieldCount; i += 1) {
        fields.push({
          fieldNumber: view.getUint8(fieldsStart + i * 3),
          size: view.getUint8(fieldsStart + i * 3 + 1),
          baseType: view.getUint8(fieldsStart + i * 3 + 2),
        });
      }
      cursor = fieldsStart + fieldCount * 3;
      const devSizes: number[] = [];
      if (hasDevFields) {
        if (cursor + 1 > end) return truncated();
        const devCount = view.getUint8(cursor);
        cursor += 1;
        if (cursor + devCount * 3 > end) return truncated();
        for (let i = 0; i < devCount; i += 1) {
          devSizes.push(view.getUint8(cursor + i * 3 + 1));
        }
        cursor += devCount * 3;
      }
      const messageSize =
        fields.reduce((sum, f) => sum + f.size, 0) +
        devSizes.reduce((sum, s) => sum + s, 0);
      defs.set(local, {
        globalMessageNumber,
        architecture,
        fields,
        messageSize,
        devSizes,
      });
      continue;
    }

    // --- Data message ---------------------------------------------------------
    const def = defs.get(local);
    if (def === undefined) {
      warnings.push(
        `Stopped at byte ${cursor - 1}: a data message references undefined local message ${local} — the stream is desynchronized.`,
      );
      return finish();
    }
    if (cursor + def.messageSize > end) return truncated();
    const timestampSeconds = readDataMessage(view, cursor, def, undefined);
    if (timestampSeconds !== undefined) lastTimestampSeconds = timestampSeconds;
    cursor += def.messageSize;
  }

  return finish();

  // ------------------------------------------------------------------------
  /** Read one data message at `offset`; returns its (possibly compressed) timestamp seconds. */
  function readDataMessage(
    v: DataView,
    offset: number,
    def: MessageDef,
    fallbackTimestampSeconds: number | undefined,
  ): number | undefined {
    const littleEndian = def.architecture === 0;
    let fieldCursor = offset;

    // Collect (fieldNumber → decoded value) for this message.
    const values = new Map<number, number | string | undefined>();
    for (const field of def.fields) {
      const { value } = decodeValue(v, fieldCursor, field, littleEndian);
      if (value !== undefined && !values.has(field.fieldNumber)) {
        values.set(field.fieldNumber, value);
      }
      fieldCursor += field.size;
    }
    // Developer fields advance nothing here — the caller already moved by
    // messageSize; the sizes overlap is intentional (fields consumed above).

    switch (def.globalMessageNumber) {
      case MSG.fileId: {
        const type = values.get(FILE_ID_FIELDS.type);
        if (typeof type === "number") fileType = type;
        const man = values.get(FILE_ID_FIELDS.manufacturer);
        if (typeof man === "number") manufacturer = man;
        const created = values.get(FILE_ID_FIELDS.timeCreated);
        if (typeof created === "number") timeCreatedMs = fitSecondsToMs(created);
        return undefined;
      }
      case MSG.record: {
        const ts = values.get(RECORD_FIELDS.timestamp);
        const record: FitRecord = {};
        const latSemi = values.get(RECORD_FIELDS.positionLat);
        const lonSemi = values.get(RECORD_FIELDS.positionLong);
        if (typeof latSemi === "number") record.lat = semicirclesToDegrees(latSemi);
        if (typeof lonSemi === "number") record.lon = semicirclesToDegrees(lonSemi);
        const enhanced = values.get(RECORD_FIELDS.enhancedAltitude);
        const legacy = values.get(RECORD_FIELDS.altitude);
        if (typeof enhanced === "number") record.ele = altitudeToMeters(enhanced);
        else if (typeof legacy === "number") record.ele = altitudeToMeters(legacy);
        const hr = values.get(RECORD_FIELDS.heartRate);
        if (typeof hr === "number") record.hr = hr;
        const cad = values.get(RECORD_FIELDS.cadence);
        if (typeof cad === "number") record.cad = cad;
        const power = values.get(RECORD_FIELDS.power);
        if (typeof power === "number") record.watts = power;
        // Compressed headers carry the authoritative time: the fallback
        // (header-derived) wins even when a stale field 253 lingers in
        // the payload (some writers keep the full definition).
        let seconds: number | undefined =
          fallbackTimestampSeconds ??
          (typeof ts === "number" ? ts : undefined);
        records.push(record);
        if (seconds !== undefined && seconds !== 0xffffffff) {
          record.timestampMs = fitSecondsToMs(seconds);
          return seconds;
        }
        return undefined;
      }
      case MSG.lap: {
        const start = values.get(LAP_FIELDS.startTime);
        laps.push(
          typeof start === "number"
            ? { startTimeMs: fitSecondsToMs(start) }
            : {},
        );
        const ts = values.get(LAP_FIELDS.timestamp);
        return typeof ts === "number" ? ts : undefined;
      }
      case MSG.session: {
        const start = values.get(SESSION_FIELDS.startTime);
        const sport = values.get(SESSION_FIELDS.sport);
        sessions.push({
          ...(typeof start === "number" ? { startTimeMs: fitSecondsToMs(start) } : {}),
          ...(typeof sport === "number" ? { sport } : {}),
        });
        const ts = values.get(SESSION_FIELDS.timestamp);
        return typeof ts === "number" ? ts : undefined;
      }
      case MSG.course: {
        const name = values.get(COURSE_FIELDS.name);
        if (typeof name === "string") courseNames.push(name);
        return undefined;
      }
      case MSG.coursePoint: {
        const latSemi = values.get(COURSE_POINT_FIELDS.positionLat);
        const lonSemi = values.get(COURSE_POINT_FIELDS.positionLong);
        const name = values.get(COURSE_POINT_FIELDS.name);
        const ts = values.get(COURSE_POINT_FIELDS.timestamp);
        coursePoints.push({
          ...(typeof latSemi === "number" ? { lat: semicirclesToDegrees(latSemi) } : {}),
          ...(typeof lonSemi === "number" ? { lon: semicirclesToDegrees(lonSemi) } : {}),
          ...(typeof name === "string" ? { name } : {}),
          ...(typeof ts === "number" ? { timestampMs: fitSecondsToMs(ts) } : {}),
        });
        return undefined;
      }
      case MSG.activity: {
        const ts = values.get(ACTIVITY_FIELDS.timestamp);
        return typeof ts === "number" ? ts : undefined;
      }
      default:
        return undefined;
    }
  }
}
