/**
 * TCX parser — Garmin TrainingCenterDatabase → the GPX-shaped model
 * (docs/MASTER_PLAN.md §EE 14.2).
 *
 * Design contract (mirrors parseGpx where the formats rhyme):
 *
 *   - **Namespace-tolerant, structure-aware.** Lookup is by `localName`
 *     through explicit navigation (`TrainingCenterDatabase → Activities →
 *     Activity → Lap → Track → Trackpoint`, and `Courses → Course`), so
 *     the standard v2 namespace, prefixed forms, and no-namespace files
 *     all parse. Runs under the same injected `XmlIo` as the GPX parser —
 *     DOMParser in tests/browser, the Phase 9 worker tokenizer for large
 *     files.
 *   - **Hard failures are typed.** Malformed XML → `malformed-xml`; a
 *     non-`<TrainingCenterDatabase>` root → `not-a-tcx-document`.
 *   - **Structure mapping.** Activity → `<trk>` (name = Id, type =
 *     Sport, desc = Notes); every `<Track>` → one `<trkseg>` (a Track
 *     element is a genuine recording break in TCX). Laps do NOT create
 *     segments — they are time splits, and cutting geometry at them
 *     would fabricate gaps. Course → `<trk>`; CoursePoint → `<wpt>`
 *     (self-contained synthesized snapshot).
 *   - **Value honesty.** Position-less trackpoints (indoor/pause
 *     records) are skipped and counted — the GPX model cannot represent
 *     a point without coordinates and inventing (0,0) would be a lie.
 *     Unparseable times drop their epoch value (flagged); garbage
 *     lat/lon/ele keep the point with parse-time flags exactly like the
 *     GPX parser. Recorded `DistanceMeters` is deliberately NOT
 *     imported — distance is always recomputed from geometry.
 *   - **hr/cad/watts passthrough.** `HeartRateBpm/Value`, `Cadence`,
 *     `Watts` ride as read-only `metrics` + a synthesized
 *     `gpxtpx:TrackPointExtension` raw child, so a GPX re-export carries
 *     them in the standard vocabulary. No editing surface exists (§EE
 *     non-goal).
 *   - **Immutability.** The returned model is deep-frozen outside
 *     production, exactly like a GPX parse.
 *
 * Phase 14 — Formats in & out. Pure TypeScript given the injected adapter.
 */

import type {
  FileMeta,
  GpxParseError,
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  ParseOutcome,
  PointAnomaly,
  TrackMeta,
  TrackPointMetrics,
  ValidationIssue,
  Waypoint,
} from "@/types/domain";
import { pointId, segmentId } from "@/types/ids";
import type { XmlIo } from "@/lib/utils/xml";
import { deepFreeze } from "../gpx/deepFreeze";
import { extractParserError } from "../gpx/parse";
import {
  childrenByLocalName,
  firstChildByLocalName,
  parseFiniteNumber,
  parseStrictEpochMs,
  trimmedTextOfFirstChild,
} from "../gpx/xml-walk";
import { synthRawCapture, synthWaypointXml, validMetricValue } from "./convert";

// ---------------------------------------------------------------------------
// One Trackpoint → one recorded point
// ---------------------------------------------------------------------------

interface TcxPointResult {
  /** null = position-less record (indoor/pause) — skipped by the caller. */
  point: OriginalTrackPoint | null;
}

function parseTcxTrackpoint(
  tp: Element,
  seg: ReturnType<typeof segmentId>,
  index: number,
): TcxPointResult {
  const flags: PointAnomaly[] = [];

  // --- Position (absent → skip the record entirely) ----------------------
  const position = firstChildByLocalName(tp, "Position");
  const latText =
    position === undefined ? undefined : trimmedTextOfFirstChild(position, "LatitudeDegrees");
  const lonText =
    position === undefined ? undefined : trimmedTextOfFirstChild(position, "LongitudeDegrees");
  if (position === undefined || (latText === undefined && lonText === undefined)) {
    return { point: null };
  }
  const lat = parseFiniteNumber(latText) ?? Number.NaN;
  const lon = parseFiniteNumber(lonText) ?? Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) flags.push("invalid-coord");

  // --- Altitude ----------------------------------------------------------
  const eleText = trimmedTextOfFirstChild(tp, "AltitudeMeters");
  const ele = eleText !== undefined ? parseFiniteNumber(eleText) : undefined;
  if (eleText !== undefined && ele === undefined) flags.push("invalid-ele");

  // --- Time (strict ISO-8601-with-tz, same rule as GPX <time>) -----------
  const timeText = trimmedTextOfFirstChild(tp, "Time");
  const time = parseStrictEpochMs(timeText);
  if (timeText !== undefined && time === undefined) flags.push("unreliable-time");

  // --- Physiology passthrough (read-only) --------------------------------
  const hr = validMetricValue(
    parseFiniteNumber(trimmedTextOfFirstChild(firstChildByLocalName(tp, "HeartRateBpm"), "Value")),
    300,
  );
  const cad = validMetricValue(parseFiniteNumber(trimmedTextOfFirstChild(tp, "Cadence")), 255);
  const watts = validMetricValue(parseFiniteNumber(trimmedTextOfFirstChild(tp, "Watts")), 3000);
  const metrics: TrackPointMetrics | undefined =
    hr !== undefined || cad !== undefined || watts !== undefined
      ? {
          ...(hr !== undefined ? { hr } : {}),
          ...(cad !== undefined ? { cad } : {}),
          ...(watts !== undefined ? { watts } : {}),
        }
      : undefined;

  const point: OriginalTrackPoint = {
    source: "original",
    id: pointId(seg, index),
    lat,
    lon,
    ...(ele !== undefined ? { ele } : {}),
    ...(time !== undefined ? { time } : {}),
    flags,
    raw: synthRawCapture({ lat, lon, ele, time, metrics }),
    ...(metrics !== undefined ? { metrics } : {}),
  };
  return { point };
}

// ---------------------------------------------------------------------------
// One <Track> → one segment (a genuine recording break in TCX)
// ---------------------------------------------------------------------------

interface TrackWalk {
  segments: OriginalSegment[];
  skipped: number;
  total: number;
  metricsPoints: number;
}

function walkTcxTracks(
  tracks: Element[],
  trackIndex: number,
  startIndex: number,
): TrackWalk {
  const segments: OriginalSegment[] = [];
  let skipped = 0;
  let total = 0;
  let metricsPoints = 0;
  let segmentIndex = startIndex;

  for (const track of tracks) {
    const seg = segmentId(trackIndex, segmentIndex);
    const points: OriginalTrackPoint[] = [];
    for (const tp of childrenByLocalName(track, "Trackpoint")) {
      total += 1;
      const { point } = parseTcxTrackpoint(tp, seg, points.length);
      if (point === null) {
        skipped += 1;
        continue;
      }
      if (point.metrics !== undefined) metricsPoints += 1;
      points.push(point);
    }
    segments.push({ id: seg, trackIndex, points, extras: [] });
    segmentIndex += 1;
  }
  return { segments, skipped, total, metricsPoints };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

export function parseTcx(xml: string, io: XmlIo): ParseOutcome {
  let doc: Document;
  try {
    doc = io.parse(xml);
  } catch (err) {
    // A throwing io is the documented platform alternative to a
    // <parsererror> document (the Phase 9 tokenizer does this).
    return {
      ok: false,
      error: {
        kind: "malformed-xml",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const parserError = extractParserError(doc);
  if (parserError !== null) return { ok: false, error: parserError };

  const root = doc.documentElement;
  if (root === null || root.localName !== "TrainingCenterDatabase") {
    return {
      ok: false,
      error: {
        kind: "not-a-tcx-document",
        rootElement: root?.localName ?? null,
      },
    };
  }

  const issues: ValidationIssue[] = [];
  const tracks: TrackMeta[] = [];
  const segments: OriginalSegment[] = [];
  const waypoints: Waypoint[] = [];

  let totalPoints = 0;
  let skippedPoints = 0;
  let metricsPoints = 0;
  let trackIndex = 0;

  // --- Activities → tracks ------------------------------------------------
  const activitiesEl = firstChildByLocalName(root, "Activities");
  for (const activity of childrenByLocalName(activitiesEl, "Activity")) {
    const name = trimmedTextOfFirstChild(activity, "Id") ?? `Activity ${trackIndex + 1}`;
    const sport = activity.getAttribute("Sport") ?? undefined;
    const notes = trimmedTextOfFirstChild(activity, "Notes");

    tracks.push({
      trackIndex,
      ...(name !== undefined ? { name } : {}),
      ...(notes !== undefined ? { desc: notes } : {}),
      ...(sport !== undefined ? { type: sport } : {}),
      extras: [],
    });

    const laps = childrenByLocalName(activity, "Lap");
    const lapTracks: Element[] = [];
    for (const lap of laps) {
      lapTracks.push(...childrenByLocalName(lap, "Track"));
    }
    const walk = walkTcxTracks(lapTracks, trackIndex, 0);
    segments.push(...walk.segments);
    totalPoints += walk.total;
    skippedPoints += walk.skipped;
    metricsPoints += walk.metricsPoints;
    trackIndex += 1;
  }

  // --- Courses → tracks + course-point waypoints ---------------------------
  const coursesEl = firstChildByLocalName(root, "Courses");
  for (const course of childrenByLocalName(coursesEl, "Course")) {
    const name = trimmedTextOfFirstChild(course, "Name") ?? `Course ${trackIndex + 1}`;
    tracks.push({ trackIndex, name, extras: [] });

    // Course tracks live inside <Lap> exactly like activity tracks
    // (the TCX 2 schema wraps both in the same Lap → Track shape).
    const courseTracks: Element[] = [];
    for (const lap of childrenByLocalName(course, "Lap")) {
      courseTracks.push(...childrenByLocalName(lap, "Track"));
    }
    // Defensive: a Course → Track without a Lap is tolerated too.
    courseTracks.push(...childrenByLocalName(course, "Track"));
    const walk = walkTcxTracks(courseTracks, trackIndex, 0);
    segments.push(...walk.segments);
    totalPoints += walk.total;
    skippedPoints += walk.skipped;
    metricsPoints += walk.metricsPoints;

    for (const cp of childrenByLocalName(course, "CoursePoint")) {
      const position = firstChildByLocalName(cp, "Position");
      const lat = parseFiniteNumber(
        position === undefined ? undefined : trimmedTextOfFirstChild(position, "LatitudeDegrees"),
      );
      const lon = parseFiniteNumber(
        position === undefined ? undefined : trimmedTextOfFirstChild(position, "LongitudeDegrees"),
      );
      if (lat === undefined || lon === undefined) {
        skippedPoints += 1;
        continue;
      }
      const ele = parseFiniteNumber(trimmedTextOfFirstChild(cp, "AltitudeMeters"));
      const cpName = trimmedTextOfFirstChild(cp, "Name");
      const time = parseStrictEpochMs(trimmedTextOfFirstChild(cp, "Time"));
      waypoints.push({
        rawXml: synthWaypointXml({
          lat,
          lon,
          ...(ele !== undefined ? { ele } : {}),
          ...(cpName !== undefined ? { name: cpName } : {}),
          ...(time !== undefined ? { time } : {}),
        }),
        ...(cpName !== undefined ? { name: cpName } : {}),
      });
    }
    trackIndex += 1;
  }

  // --- Conversion disclosures (info issues — the honest trail) ------------
  if (tracks.length === 0) {
    issues.push({
      kind: "conversion-note",
      severity: "info",
      message: "No activities or courses found in this TCX file.",
    });
  } else {
    issues.push({
      kind: "conversion-note",
      severity: "info",
      message:
        `Imported from TCX — ${tracks.length} track${tracks.length === 1 ? "" : "s"}, ` +
        `${totalPoints} trackpoints; every recorded value is preserved.`,
    });
  }
  if (skippedPoints > 0) {
    issues.push({
      kind: "conversion-note",
      severity: "warning",
      message:
        `${skippedPoints} trackpoint${skippedPoints === 1 ? "" : "s"} without position ` +
        `skipped — indoor/pause records carry no coordinates.`,
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

  // --- File metadata -------------------------------------------------------
  const authorEl = firstChildByLocalName(root, "Author");
  const authorName = trimmedTextOfFirstChild(authorEl, "Name");
  const firstTrack = tracks[0];
  const fileMeta: FileMeta = {
    version: "1.1",
    creator: authorName ?? "GPX Repair Studio (TCX import)",
    ...(firstTrack?.name !== undefined ? { name: firstTrack.name } : {}),
    raw: {
      version: "1.1",
      creator: authorName ?? "GPX Repair Studio (TCX import)",
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

// Re-export for the pipeline's error surfacing (typed, never thrown).
export type { GpxParseError };
