// @vitest-environment jsdom
/**
 * Unit tests — portable session files (lib/storage/portable-session.ts,
 * Phase 18 §EE 18.3). The plan's verification: "session round-trip
 * fidelity goldens".
 *
 *   - build → serialize (with the original bytes) → read returns the
 *     record VERBATIM and the source bytes byte-identical (XML rides
 *     as text, binary as base64);
 *   - the version is a CEILING: a newer document reads back a typed
 *     "newer-version", never a guess;
 *   - every malformed shape reads back its typed error (not-json,
 *     wrong-format, bad-session, bad-source);
 *   - the base64 codec round-trips every length edge (pure, no btoa).
 */

import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  buildPortableSession,
  bytesToBase64,
  portableSessionFileName,
  PORTABLE_SESSION_FORMAT,
  readPortableSession,
  serializePortableSession,
} from "@/lib/storage/portable-session";
import {
  captureFileSession,
  readSessionRecord,
  SESSION_RECORD_SCHEMA_VERSION,
  type StoredFileSession,
} from "@/lib/storage/session-record";
import { DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";
import { parseFixture } from "./helpers/gpxTestUtils";

/** A captured repair record over a real fixture (the capture layer's own shape). */
function fileRecord(): StoredFileSession {
  return captureFileSession(
    {
      section: "repair",
      fileName: "ride.gpx",
      gapThresholds: { ...DEFAULT_GAP_THRESHOLDS },
      reconstructions: {},
      skippedGapIds: [],
      manualSpans: [],
      fileTiming: { startMs: null, totalDurationMs: null },
      roadLegs: {},
      workingEdits: [],
    },
    1_700_000_000_000,
  );
}

describe("portable session — round-trip fidelity", () => {
  it("carries the record verbatim and the source bytes byte-identical (text)", async () => {
    // The REAL fixture bytes for the fidelity check (an XML document).
    const sourceBytes = new TextEncoder().encode(
      '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>',
    );
    const blob = new Blob([sourceBytes]);

    const doc = buildPortableSession(
      fileRecord(),
      { view: "share" },
      1_700_000_000_001,
    );
    const json = await serializePortableSession(doc, {
      name: "ride.gpx",
      type: "application/gpx+xml",
      blob,
    });

    const result = readPortableSession(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.view).toBe("share");
    expect(result.file.source?.name).toBe("ride.gpx");

    // The record round-trips through the SAME validator (deep equal).
    expect(result.file.record).toEqual(fileRecord());
    // …and is a valid session record by the storage layer's own rule.
    expect(readSessionRecord(result.file.record)).not.toBeNull();

    // The bytes come back byte-identical (XML rode as text).
    const roundTripped = new Uint8Array(
      await result.file.source!.blob.arrayBuffer(),
    );
    expect(Array.from(roundTripped)).toEqual(Array.from(sourceBytes));
  });

  it("embeds the format marker, version, and the current record schema", async () => {
    const doc = buildPortableSession(fileRecord(), {}, 5);
    const json = await serializePortableSession(doc);
    const parsed = JSON.parse(json) as {
      format: string;
      version: number;
      session: { schemaVersion: number };
    };
    expect(parsed.format).toBe(PORTABLE_SESSION_FORMAT);
    expect(parsed.version).toBe(1);
    expect(parsed.session.schemaVersion).toBe(SESSION_RECORD_SCHEMA_VERSION);
  });

  it("names the download after the session (one convention)", () => {
    expect(portableSessionFileName("ride.gpx")).toBe("ride.gpxrepair.json");
    expect(portableSessionFileName("trip.json")).toBe("trip.gpxrepair.json");
    expect(portableSessionFileName("  ")).toBe("session.gpxrepair.json");
  });
});

describe("portable session — the read-side ceiling (discard, never guess)", () => {
  it("refuses a newer version with the typed error", async () => {
    const json = await serializePortableSession(
      buildPortableSession(fileRecord(), {}),
    );
    const newer = JSON.parse(json) as Record<string, unknown>;
    newer.version = 99;
    const result = readPortableSession(JSON.stringify(newer));
    expect(result).toEqual({
      ok: false,
      error: { kind: "newer-version", version: 99 },
    });
  });

  it("refuses non-JSON and foreign documents with typed errors", () => {
    expect(readPortableSession("not json {")).toEqual({
      ok: false,
      error: { kind: "not-json" },
    });
    expect(readPortableSession('{"hello": "world"}')).toEqual({
      ok: false,
      error: { kind: "wrong-format" },
    });
    expect(
      readPortableSession(
        JSON.stringify({ format: "someone-elses-session", version: 1 }),
      ),
    ).toEqual({ ok: false, error: { kind: "wrong-format" } });
  });

  it("refuses an unreadable session record (the storage layer's own validator)", async () => {
    const json = await serializePortableSession(buildPortableSession(fileRecord(), {}));
    const tampered = JSON.parse(json) as Record<string, unknown>;
    tampered.session = { schemaVersion: 1 };
    expect(readPortableSession(JSON.stringify(tampered))).toEqual({
      ok: false,
      error: { kind: "bad-session" },
    });
  });

  it("refuses a file-backed record whose source is missing or unreadable", async () => {
    const json = await serializePortableSession(buildPortableSession(fileRecord(), {}));
    const noSource = JSON.parse(json) as Record<string, unknown>;
    delete noSource.source;
    expect(readPortableSession(JSON.stringify(noSource))).toEqual({
      ok: false,
      error: { kind: "bad-source" },
    });

    const badSource = JSON.parse(json) as Record<string, unknown>;
    badSource.source = { name: "x", type: "t", encoding: "base64", data: "!!!" };
    expect(readPortableSession(JSON.stringify(badSource))).toEqual({
      ok: false,
      error: { kind: "bad-source" },
    });
  });

  it("binary sources ride base64 and come back byte-identical", async () => {
    // Arbitrary binary (a FIT-like header) — NOT valid UTF-8 text.
    const bytes = new Uint8Array([0x02, 0x00, 0xf0, 0x9f, 0x01, 0x44, 0xff, 0x00]);
    const blob = new Blob([bytes]);
    const json = await serializePortableSession(
      buildPortableSession(fileRecord(), {}),
      { name: "run.fit", type: "application/octet-stream", blob },
    );
    const parsed = JSON.parse(json) as { source: { encoding: string } };
    expect(parsed.source.encoding).toBe("base64");

    const result = readPortableSession(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = new Uint8Array(await result.file.source!.blob.arrayBuffer());
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });
});

describe("base64 codec (pure)", () => {
  it("round-trips every length edge (0–3 mod 4)", () => {
    for (let len = 0; len <= 67; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + len) % 256;
      const encoded = bytesToBase64(bytes);
      expect(encoded.length % 4).toBe(0);
      const decoded = base64ToBytes(encoded);
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!)).toEqual(Array.from(bytes));
    }
  });

  it("rejects non-alphabet input and bad padding", () => {
    expect(base64ToBytes("!!!!")).toBeNull();
    expect(base64ToBytes("abc")).toBeNull(); // not a multiple of 4
    expect(base64ToBytes("a=bc")).toBeNull(); // padding mid-stream
    expect(base64ToBytes("AAAA====")).toBeNull(); // double padding misplace
  });

  it("matches the standard alphabet (RFC 4648 test vectors)", () => {
    expect(bytesToBase64(new TextEncoder().encode("f"))).toBe("Zg==");
    expect(bytesToBase64(new TextEncoder().encode("fo"))).toBe("Zm8=");
    expect(bytesToBase64(new TextEncoder().encode("foo"))).toBe("Zm9v");
    expect(bytesToBase64(new TextEncoder().encode("foob"))).toBe("Zm9vYg==");
    expect(bytesToBase64(new TextEncoder().encode("fooba"))).toBe("Zm9vYmE=");
    expect(bytesToBase64(new TextEncoder().encode("foobar"))).toBe("Zm9vYmFy");
  });
});
