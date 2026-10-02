/**
 * Format sniffer tests (Phase 14 — §EE 14.1).
 *
 * The sniff matrix: magic bytes lead, the extension only steers text
 * files whose root could not be sniffed, and nothing is ever guessed.
 */

import { describe, expect, it } from "vitest";
import { sniffTrackFormat } from "@/features/formats/sniff";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const GPX_HEAD =
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="T" ` +
  `xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg></trkseg></trk></gpx>`;

const TCX_HEAD =
  `<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase ` +
  `xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"></TrainingCenterDatabase>`;

/** A minimal 12-byte-header FIT skeleton with the ".FIT" magic. */
function fitSkeleton(headerSize = 12): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes[0] = headerSize;
  bytes[1] = 0x10;
  bytes[2] = 0x00;
  bytes[3] = 0x08;
  new DataView(bytes.buffer).setUint32(4, 10, true);
  bytes[8] = 0x2e;
  bytes[9] = 0x46;
  bytes[10] = 0x49;
  bytes[11] = 0x54;
  return bytes;
}

describe("sniffTrackFormat", () => {
  it("recognizes GPX by the <gpx> root", () => {
    expect(sniffTrackFormat(bytesOf(GPX_HEAD), "a.gpx")).toEqual({ format: "gpx" });
  });

  it("recognizes TCX by the <TrainingCenterDatabase> root", () => {
    expect(sniffTrackFormat(bytesOf(TCX_HEAD), "a.tcx")).toEqual({ format: "tcx" });
  });

  it("skips a UTF-8 BOM before the XML root", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf(GPX_HEAD)]);
    expect(sniffTrackFormat(withBom, "a.gpx")).toEqual({ format: "gpx" });
  });

  it("skips comments and DOCTYPE before the XML root", () => {
    const doc = `<!-- exported 2024 -->\n<?xml version="1.0"?>\n` + GPX_HEAD;
    expect(sniffTrackFormat(bytesOf(doc), "a.gpx")).toEqual({ format: "gpx" });
  });

  it("tolerates leading whitespace before the declaration", () => {
    expect(sniffTrackFormat(bytesOf("\n  " + TCX_HEAD), "a.tcx")).toEqual({
      format: "tcx",
    });
  });

  it("recognizes UTF-16LE GPX documents", () => {
    const text = GPX_HEAD;
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16[0] = 0xff;
    utf16[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) {
      utf16[2 + i * 2] = text.charCodeAt(i) & 0xff;
    }
    expect(sniffTrackFormat(utf16, "a.gpx")).toEqual({ format: "gpx" });
  });

  it("recognizes FIT by the .FIT magic at bytes 8..11", () => {
    expect(sniffTrackFormat(fitSkeleton(), "a.fit")).toEqual({ format: "fit" });
    expect(sniffTrackFormat(fitSkeleton(14), "a.fit")).toEqual({ format: "fit" });
  });

  it("rejects a .FIT signature with an impossible header size", () => {
    const result = sniffTrackFormat(fitSkeleton(13), "a.fit");
    expect(result.format).toBe("unknown");
    expect(result).toHaveProperty("reason");
  });

  it("routes track-named XML with an unexpected root to the parser (precise error)", () => {
    // The GPX parser's not-a-gpx-document error names the actual root —
    // better than a generic "unknown", so the sniffer defers to it.
    expect(sniffTrackFormat(bytesOf("<html><body/></html>"), "a.gpx")).toEqual({
      format: "gpx",
    });
    expect(sniffTrackFormat(bytesOf("<html><body/></html>"), "a.tcx")).toEqual({
      format: "tcx",
    });
  });

  it("reports non-track XML with an unexpected root as unknown", () => {
    const result = sniffTrackFormat(bytesOf("<html><body/></html>"), "a.html");
    expect(result.format).toBe("unknown");
    if (result.format === "unknown") {
      expect(result.reason).toContain("html");
    }
  });

  it("steers textual unknowns by extension when the root cannot be sniffed", () => {
    // Text that never produces a root element (e.g. a CSV someone renamed).
    expect(sniffTrackFormat(bytesOf("lat,lon\n1,2\n"), "a.tcx")).toEqual({
      format: "tcx",
    });
    expect(sniffTrackFormat(bytesOf("lat,lon\n1,2\n"), "a.gpx")).toEqual({
      format: "gpx",
    });
  });

  it("reports binary garbage as unknown", () => {
    const result = sniffTrackFormat(new Uint8Array([0x00, 0x01, 0x02, 0x03]), "a.fit");
    expect(result.format).toBe("unknown");
  });

  it("reports the empty file as unknown", () => {
    const result = sniffTrackFormat(new Uint8Array(0), "a.gpx");
    expect(result.format).toBe("unknown");
    if (result.format === "unknown") {
      expect(result.reason).toContain("empty");
    }
  });

  it("never lets the extension override the FIT magic", () => {
    expect(sniffTrackFormat(fitSkeleton(), "renamed.gpx")).toEqual({ format: "fit" });
  });

  it("never lets the extension override an XML root", () => {
    expect(sniffTrackFormat(bytesOf(GPX_HEAD), "renamed.tcx")).toEqual({
      format: "gpx",
    });
  });
});
