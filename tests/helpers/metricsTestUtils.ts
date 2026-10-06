/**
 * Phase 23 test utilities — synthetic TCX tracks that carry
 * hr/cad/watts (the only intake that records metrics, §EE 14), parsed
 * through the REAL TCX parser and merged through the REAL repair
 * pipeline, so the zone/GAP/calorie engines are tested against the
 * same populations the app computes.
 *
 * Geometry: the equator-line convention of tests/splits.test.ts —
 * equal Δlon steps give bitwise-equal geodesic legs, so hand-computed
 * goldens are exact.
 */

import { parseTcx } from "@/features/formats/parse-tcx";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { createDomXmlIo } from "@/lib/utils/xml";
import type { MergeResult } from "@/features/reconstruction/merge";
import type { OriginalTrackData } from "@/types/domain";

export const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};

export interface TcxPoint {
  lat: number;
  lon: number;
  ele?: number;
  /** Epoch ms. */
  time?: number;
  hr?: number;
  cad?: number;
  watts?: number;
}

const BASE_MS = Date.parse("2024-05-01T07:00:00Z");

/** A one-activity, one-track TCX with the given points. */
export function tcxXml(points: readonly TcxPoint[]): string {
  const body = points
    .map((p, i) => {
      const children: string[] = [];
      if (p.time !== undefined) {
        children.push(`<Time>${new Date(BASE_MS + p.time).toISOString()}</Time>`);
      }
      children.push(
        `<Position><LatitudeDegrees>${p.lat.toFixed(6)}</LatitudeDegrees>` +
          `<LongitudeDegrees>${p.lon.toFixed(6)}</LongitudeDegrees></Position>`,
      );
      if (p.ele !== undefined) children.push(`<AltitudeMeters>${p.ele}</AltitudeMeters>`);
      if (p.hr !== undefined) children.push(`<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>`);
      if (p.cad !== undefined) children.push(`<Cadence>${p.cad}</Cadence>`);
      if (p.watts !== undefined) children.push(`<Watts>${p.watts}</Watts>`);
      return `<Trackpoint>${children.join("")}</Trackpoint>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n` +
    `<Activities><Activity Sport="Biking"><Id>2024-05-01T07:00:00.000Z</Id>\n` +
    `<Lap StartTime="2024-05-01T07:00:00.000Z"><Track>${body}</Track></Lap>\n` +
    `</Activity></Activities>\n</TrainingCenterDatabase>\n`
  );
}

/** Parse + merge a synthetic TCX (no repairs — recorded runs only). */
export function metricsMerge(points: readonly TcxPoint[]): MergeResult {
  const result = parseTcx(tcxXml(points), createDomXmlIo());
  if (!result.ok) {
    throw new Error(`synthetic TCX failed to parse: ${JSON.stringify(result.error)}`);
  }
  return mergeRepairs(result.data as OriginalTrackData, [], TIMED);
}

/** The parsed model (for direct assertions on the passthrough). */
export function parseTcxPoints(points: readonly TcxPoint[]): OriginalTrackData {
  const result = parseTcx(tcxXml(points), createDomXmlIo());
  if (!result.ok) {
    throw new Error(`synthetic TCX failed to parse: ${JSON.stringify(result.error)}`);
  }
  return result.data as OriginalTrackData;
}
