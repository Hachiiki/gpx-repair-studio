// @vitest-environment jsdom
/**
 * Portable LIBRARY bundles (Phase 24 §24.1): the multi-session
 * `.gpxrepair-library.json` — build/read round trip, format routing
 * (the import door accepts both markers), and the honesty rules
 * (newer versions refused, drifted records discarded).
 */
import { describe, expect, it } from "vitest";
import {
  PORTABLE_LIBRARY_FORMAT,
  portableLibraryFileName,
  readPortableLibrary,
  readPortableSession,
  serializePortableLibrary,
  sniffPortableFormat,
} from "@/lib/storage/portable-session";
import type { StoredSessionRecord } from "@/lib/storage/session-record";

const fileRecord = (): StoredFileRecord => ({
  schemaVersion: 2,
  kind: "file",
  section: "repair",
  savedAt: 1,
  fileName: "ride.gpx",
  gapThresholds: { timeGapMs: 120_000, speedAnomalyKmh: 25, speedDtGuardMs: 10_000 },
  reconstructions: {},
  skippedGapIds: [],
  manualSpans: [],
  fileTiming: { startMs: null, totalDurationMs: null },
  roadLegs: {},
  workingEdits: [],
});
type StoredFileRecord = Extract<StoredSessionRecord, { kind: "file" }>;

const createRecord = (): Extract<StoredSessionRecord, { kind: "create" }> => ({
  schemaVersion: 2,
  kind: "create",
  section: "create",
  savedAt: 1,
  stats: {
    distanceKm: 10,
    movingTimeMin: 40,
    startLat: 0,
    startLon: 0,
  } as never,
  reconstruction: {
    gapId: "manual",
    vertices: [{ id: "v1" as never, lat: 0, lon: 0 }],
    resampleSpacingM: "off",
    geometryRevision: 1,
    timeStrategy: { kind: "none" },
  },
  roadLegs: [],
  spacingM: "off",
  matchDistance: false,
  phase: "draw",
});

const gpxBlob = new Blob(
  [
    `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg></trkseg></trk></gpx>`,
  ],
  { type: "application/gpx+xml" },
);

describe("portable library bundles", () => {
  it("round-trips multiple sessions with their names and bytes", async () => {
    const json = await serializePortableLibrary([
      {
        name: "Morning ride",
        record: fileRecord(),
        source: { name: "ride.gpx", type: "application/gpx+xml", blob: gpxBlob },
      },
      {
        name: "Evening run",
        record: { ...fileRecord(), fileName: "run.gpx", section: "recovery" },
        source: { name: "run.gpx", type: "application/gpx+xml", blob: gpxBlob },
      },
    ]);
    expect(sniffPortableFormat(json)).toBe(PORTABLE_LIBRARY_FORMAT);

    const result = readPortableLibrary(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]!.name).toBe("Morning ride");
    expect(result.sessions[0]!.source?.name).toBe("ride.gpx");
    // The bytes ride verbatim (text encoding for XML).
    expect(await result.sessions[0]!.source!.blob.text()).toContain(
      "<gpx",
    );
    expect(result.sessions[1]!.name).toBe("Evening run");
    expect(result.sessions[1]!.record.section).toBe("recovery");
  });

  it("the single-session reader still reads a single-session file", () => {
    const single = JSON.stringify({
      format: "gpxrepair-session",
      version: 1,
      exportedAt: 1,
      session: fileRecord(),
      source: {
        name: "ride.gpx",
        type: "application/gpx+xml",
        encoding: "text",
        data: `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg></trkseg></trk></gpx>`,
      },
    });
    expect(sniffPortableFormat(single)).toBe("gpxrepair-session");
    expect(readPortableSession(single).ok).toBe(true);
    // The library reader refuses it (wrong marker) — routing is the
    // caller's job via the sniffer.
    expect(readPortableLibrary(single).ok).toBe(false);
  });

  it("a newer bundle version is refused, never partially read", () => {
    const newer = JSON.stringify({
      format: PORTABLE_LIBRARY_FORMAT,
      version: 99,
      exportedAt: 1,
      sessions: [],
    });
    const result = readPortableLibrary(newer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: "newer-version", version: 99 });
  });

  it("foreign JSON, bad sessions, and bad sources are typed errors", () => {
    expect(readPortableLibrary("not json").ok).toBe(false);
    expect(
      readPortableLibrary(
        JSON.stringify({ format: "something-else", version: 1 }),
      ).ok,
    ).toBe(false);
    // A session entry whose record drifted.
    expect(
      readPortableLibrary(
        JSON.stringify({
          format: PORTABLE_LIBRARY_FORMAT,
          version: 1,
          exportedAt: 1,
          sessions: [{ name: "x", session: { nope: true } }],
        }),
      ).ok,
    ).toBe(false);
    // A file-backed entry without a readable source.
    expect(
      readPortableLibrary(
        JSON.stringify({
          format: PORTABLE_LIBRARY_FORMAT,
          version: 1,
          exportedAt: 1,
          sessions: [{ name: "x", session: fileRecord() }],
        }),
      ).ok,
    ).toBe(false);
  });

  it("empty and non-JSON text sniff to null (the door routes on)", () => {
    expect(sniffPortableFormat("{}")).toBeNull();
    expect(sniffPortableFormat("nope")).toBeNull();
  });

  it("the download name is the one convention", () => {
    expect(portableLibraryFileName()).toBe("library.gpxrepair.json");
  });
});
