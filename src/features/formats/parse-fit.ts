/**
 * FIT → the GPX-shaped model (docs/MASTER_PLAN.md §EE 14.3).
 *
 * Maps the reader's recovered messages onto the domain model with the
 * same honesty rules as the TCX import:
 *
 *   - **Session → track.** A single-session file (the overwhelming
 *     majority) becomes one track. Multisport files partition their
 *     records by the sessions' start times — every record lands in the
 *     session whose time window contains it; timeless records stay in
 *     the stream-current bucket (never re-ordered, never invented).
 *   - **Records → ONE segment per session.** Laps are time splits, not
 *     GPS breaks — cutting geometry at lap boundaries would fabricate
 *     gaps that never existed. The lap count is disclosed as a note
 *     instead (Phase 15's splits engine is where laps pay off).
 *   - **Course files** (file_id.type 6): one track from the records,
 *     course points → waypoints (self-contained synthesized `<wpt>`).
 *   - **Position-less records** (pause/indoor) are skipped and counted;
 *     reader recovery warnings (CRC mismatch, truncated tail) surface as
 *     warning issues — recovered data is real, and so is the disclosure.
 *   - hr/cad/watts ride as read-only `metrics` + the synthesized
 *     `gpxtpx` extension (§EE non-goal: no editing surface).
 *
 * Phase 14 — Formats in & out. Pure TypeScript.
 */

import type {
  FileMeta,
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  ParseOutcome,
  TrackMeta,
  TrackPointMetrics,
  ValidationIssue,
  Waypoint,
} from "@/types/domain";
import { pointId, segmentId } from "@/types/ids";
import { deepFreeze } from "../gpx/deepFreeze";
import { readFitFile, type FitFileData, type FitRecord } from "./fit/reader";
import { synthRawCapture, synthWaypointXml, validMetricValue } from "./convert";

/** FIT file_id.type enum values we shape differently. */
const FIT_FILE_TYPE_COURSE = 6;

/** sport enum → honest label (the profile's common subset). */
const SPORT_LABELS: Readonly<Record<number, string>> = {
  0: "Activity",
  1: "Running",
  2: "Cycling",
  3: "Transition",
  4: "Fitness equipment",
  5: "Swimming",
  6: "Basketball",
  7: "Soccer",
  8: "Tennis",
  9: "American football",
  10: "Training",
  11: "Walking",
  12: "Cross country skiing",
  13: "Alpine skiing",
  14: "Snowboarding",
  15: "Rowing",
  16: "Mountaineering",
  17: "Hiking",
  25: "Virtual activity",
  26: "Elliptical",
};

const MANUFACTURER_LABELS: Readonly<Record<number, string>> = {
  0: "FIT development unit",
  1: "Garmin",
  2: "Garmin",
  6: "Dynastream",
  7: "Dynastream",
  38: "Strava",
  255: "FIT development unit",
  262: "Zwift",
};

function sportLabel(sport: number | undefined): string {
  return (sport !== undefined ? SPORT_LABELS[sport] : undefined) ?? "Activity";
}

function manufacturerLabel(manufacturer: number | undefined): string {
  return (
    (manufacturer !== undefined ? MANUFACTURER_LABELS[manufacturer] : undefined) ??
    (manufacturer !== undefined
      ? `FIT device (manufacturer ${manufacturer})`
      : "GPX Repair Studio (FIT import)")
  );
}

function metricsOf(record: FitRecord): TrackPointMetrics | undefined {
  const hr = validMetricValue(record.hr, 300);
  const cad = validMetricValue(record.cad, 255);
  const watts = validMetricValue(record.watts, 3000);
  return hr !== undefined || cad !== undefined || watts !== undefined
    ? {
        ...(hr !== undefined ? { hr } : {}),
        ...(cad !== undefined ? { cad } : {}),
        ...(watts !== undefined ? { watts } : {}),
      }
    : undefined;
}

function recordToPoint(record: FitRecord, seg: ReturnType<typeof segmentId>, index: number): OriginalTrackPoint {
  const metrics = metricsOf(record);
  return {
    source: "original",
    id: pointId(seg, index),
    lat: record.lat ?? Number.NaN,
    lon: record.lon ?? Number.NaN,
    ...(record.ele !== undefined ? { ele: record.ele } : {}),
    ...(record.timestampMs !== undefined ? { time: record.timestampMs } : {}),
    flags: [],
    raw: synthRawCapture({
      lat: record.lat ?? Number.NaN,
      lon: record.lon ?? Number.NaN,
      ele: record.ele,
      time: record.timestampMs,
      metrics,
    }),
    ...(metrics !== undefined ? { metrics } : {}),
  };
}

/**
 * Partition positioned records by session start times (multisport): the
 * bucket index advances when a record's time reaches the next session's
 * start. Timeless records stay in the stream-current bucket.
 */
function partitionBySessions(
  records: readonly FitRecord[],
  starts: readonly number[],
): FitRecord[][] {
  if (starts.length <= 1) return [records.slice()];
  const buckets: FitRecord[][] = starts.map(() => []);
  let bucket = 0;
  for (const record of records) {
    while (
      bucket + 1 < starts.length &&
      record.timestampMs !== undefined &&
      record.timestampMs >= starts[bucket + 1]
    ) {
      bucket += 1;
    }
    buckets[bucket].push(record);
  }
  return buckets;
}

export function parseFit(bytes: Uint8Array): ParseOutcome {
  const outcome = readFitFile(bytes);
  if (!outcome.ok) return { ok: false, error: outcome.error };
  const fit: FitFileData = outcome.data;

  const issues: ValidationIssue[] = [];
  const tracks: TrackMeta[] = [];
  const segments: OriginalSegment[] = [];
  const waypoints: Waypoint[] = [];

  let skippedRecords = 0;
  let metricsPoints = 0;
  let totalRecords = 0;

  const isCourse = fit.fileType === FIT_FILE_TYPE_COURSE;

  if (isCourse) {
    // --- Course file: one track from the records + course-point waypoints
    const name = fit.courseNames[0] ?? "Course";
    tracks.push({ trackIndex: 0, name, extras: [] });
    const seg = segmentId(0, 0);
    const points: OriginalTrackPoint[] = [];
    for (const record of fit.records) {
      totalRecords += 1;
      if (record.lat === undefined || record.lon === undefined) {
        skippedRecords += 1;
        continue;
      }
      if (record.hr !== undefined || record.cad !== undefined || record.watts !== undefined) {
        metricsPoints += 1;
      }
      points.push(recordToPoint(record, seg, points.length));
    }
    segments.push({ id: seg, trackIndex: 0, points, extras: [] });

    for (const cp of fit.coursePoints) {
      if (cp.lat === undefined || cp.lon === undefined) {
        skippedRecords += 1;
        continue;
      }
      waypoints.push({
        rawXml: synthWaypointXml({
          lat: cp.lat,
          lon: cp.lon,
          ...(cp.timestampMs !== undefined ? { time: cp.timestampMs } : {}),
          ...(cp.name !== undefined ? { name: cp.name } : {}),
        }),
        ...(cp.name !== undefined ? { name: cp.name } : {}),
      });
    }
  } else {
    // --- Activity-style file: sessions → tracks, records → one segment each
    const starts = fit.sessions
      .map((s) => s.startTimeMs)
      .filter((t): t is number => t !== undefined);
    const hasStarts = starts.length === fit.sessions.length && starts.length > 0;
    const buckets = partitionBySessions(fit.records, hasStarts ? starts : []);

    const groups =
      fit.sessions.length > 0
        ? fit.sessions.map((session, i) => ({
            sport: session.sport,
            records: buckets[Math.min(i, buckets.length - 1)] ?? [],
          }))
        : [{ sport: undefined, records: buckets[0] ?? [] }];

    groups.forEach((group, trackIndex) => {
      const label = sportLabel(group.sport);
      tracks.push({
        trackIndex,
        name: groups.length > 1 ? `${label} ${trackIndex + 1}` : label,
        extras: [],
      });
      const seg = segmentId(trackIndex, 0);
      const points: OriginalTrackPoint[] = [];
      for (const record of group.records) {
        totalRecords += 1;
        if (record.lat === undefined || record.lon === undefined) {
          skippedRecords += 1;
          continue;
        }
        if (record.hr !== undefined || record.cad !== undefined || record.watts !== undefined) {
          metricsPoints += 1;
        }
        points.push(recordToPoint(record, seg, points.length));
      }
      segments.push({ id: seg, trackIndex, points, extras: [] });
    });
  }

  // --- Conversion disclosures ----------------------------------------------
  if (tracks.length === 0) {
    issues.push({
      kind: "conversion-note",
      severity: "info",
      message: "No sessions or courses found in this FIT file.",
    });
  } else {
    issues.push({
      kind: "conversion-note",
      severity: "info",
      message:
        `Imported from FIT — ${tracks.length} track${tracks.length === 1 ? "" : "s"}, ` +
        `${totalRecords} record${totalRecords === 1 ? "" : "s"}; every recorded value is preserved.`,
    });
  }
  if (fit.laps.length > 0) {
    issues.push({
      kind: "conversion-note",
      severity: "info",
      message:
        `${fit.laps.length} lap${fit.laps.length === 1 ? "" : "s"} present — laps are time ` +
        `splits, so the track stays continuous (no gap is invented at a lap boundary).`,
    });
  }
  if (skippedRecords > 0) {
    issues.push({
      kind: "conversion-note",
      severity: "warning",
      message:
        `${skippedRecords} record${skippedRecords === 1 ? "" : "s"} without position ` +
        `skipped — pause/indoor records carry no coordinates.`,
    });
  }
  if (metricsPoints > 0) {
    issues.push({
      kind: "conversion-note",
      severity: "info",
      message:
        `Heart rate / cadence / power on ${metricsPoints} point${metricsPoints === 1 ? "" : "s"} ` +
        `imported as read-only passthrough.`,
    });
  }
  for (const warning of fit.warnings) {
    issues.push({
      kind: "conversion-note",
      severity: "warning",
      message: warning,
    });
  }

  // --- File metadata ---------------------------------------------------------
  const firstTrack = tracks[0];
  const creator = manufacturerLabel(fit.manufacturer);
  const fileMeta: FileMeta = {
    version: "1.1",
    creator,
    ...(firstTrack?.name !== undefined ? { name: firstTrack.name } : {}),
    ...(fit.timeCreatedMs !== undefined ? { time: fit.timeCreatedMs } : {}),
    raw: {
      version: "1.1",
      creator,
      ...(fit.timeCreatedMs !== undefined
        ? { metadataTime: new Date(fit.timeCreatedMs).toISOString() }
        : {}),
    },
    metadataExtras: [],
  };

  const data: OriginalTrackData = {
    tracks,
    segments,
    waypoints,
    routes: [],
    rootExtras: [],
    fileMeta,
    issues,
  };
  return { ok: true, data: deepFreeze(data) };
}
