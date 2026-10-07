/**
 * useSegments (Phase 25 §25.2–25.4 — docs/plans/v3/
 * phase-25-heatmap-personal-segments.md): the personal-segments
 * controller — the stored segments, the effort matcher's lazy pass
 * over the shelf, and the two map-authoring doors (pick a stretch of
 * the loaded track, or draw one freehand).
 *
 * ONE derivation path: efforts re-run through the same parse → merge
 * walk the library index uses (features/library/backfill.ts), then
 * the pure matcher (features/segments/matcher.ts). Persisted efforts
 * carry the shelf fingerprint they were computed under; a drifted
 * fingerprint means "recompute", never "guess why it changed".
 *
 * The authoring doors ride the controller's own interaction sessions
 * (startPickSession "pair" / startDrawSession) under the one-pick-mode
 * rule: opening a draft closes any open gap editor first, exactly as
 * surgery does. The draft is app-shell state (chip + name dialog);
 * Esc cancels either door.
 *
 * Phase 25 — Heatmap & personal segments. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mergeSessionEntry,
  readFileSessionRecord,
} from "@/features/library/backfill";
import {
  SEGMENT_DRIFT_TOLERANCE_M,
  segmentEffortRows,
  segmentWalkTracks,
  shelfFingerprint,
  type SegmentAnchors,
  type SegmentEffortRow,
} from "@/features/segments/matcher";
import {
  readSegmentRow,
  segmentView,
  SEGMENT_SCHEMA_VERSION,
  type SegmentRow,
  type SegmentView,
} from "@/features/segments/record";

// App-layer facade re-export (components may not import feature
// internals — the ESLint boundary): the tab renders SegmentView rows.
export type { SegmentView, SegmentRow } from "@/features/segments/record";
import { MAX_VERTICES } from "@/features/reconstruction/drawModel";
import { simplifyStroke } from "@/features/reconstruction/stroke";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import {
  deleteSegment,
  listSegments,
  writeSegment,
} from "@/lib/storage/sessionStore";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";
import { activeReconstruction, useEditorStore } from "@/state/editor-store";
import type { MapBinding } from "@/hooks/use-map-controller";
import type { GpxSession } from "@/hooks/use-gpx-session";
import type { SavedSessionsBinding } from "@/hooks/use-saved-sessions";
import type { MapController } from "@/lib/map/mapController";
import type {
  DrawVertex,
  LatLon,
  PointId,
  VertexId,
} from "@/types/domain";

/** The draft's phases (drives the map chip + the name dialog). */
export type SegmentDraft =
  | { phase: "pick" }
  | { phase: "draw"; vertices: readonly DrawVertex[]; distanceM: number }
  | {
      phase: "naming";
      source: "stretch" | "drawn";
      start: { lat: number; lon: number };
      end: { lat: number; lon: number };
      lengthM: number;
    };

/** The binding the Segments tab, the map chip, and the name dialog render. */
export interface SegmentsBinding {
  segments: readonly SegmentView[];
  /** A matching pass is running (the progress disclosure). */
  matching: boolean;
  /** How many sessions the running pass has matched (done / total). */
  matchDone: number;
  matchTotal: number;
  /** The map-authoring draft (null = no door open). */
  draft: SegmentDraft | null;
  /** A parsed repair session exists (both doors need the map). */
  canAuthor: boolean;
  /** The drift tolerance, meters (disclosed verbatim in the rules). */
  driftToleranceM: number;
  beginStretchPick: () => void;
  beginDraw: () => void;
  cancelDraft: () => void;
  confirmDrawn: () => void;
  saveDraft: (name: string) => Promise<boolean>;
  deleteSegment: (id: string) => void;
  rematch: () => void;
  /** Derive + persist efforts for any fingerprint-stale segment (lazy). */
  ensureEfforts: () => void;
}

/** Generate a segment id without depending on crypto.randomUUID. */
function generateSegmentId(): string {
  const uuid =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function" &&
    crypto.randomUUID();
  if (uuid) return uuid;
  return `seg${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Every usable point of the working view, in document order (pick targets). */
function buildStretchTargets(
  working: NonNullable<GpxSession["workingData"]>,
): Parameters<MapController["startPickSession"]>[0]["targets"] {
  const targets: {
    pointId: PointId;
    lat: number;
    lon: number;
    trackIndex: number;
  }[] = [];
  for (const segment of working.segments) {
    for (const point of segment.points) {
      if (!isUsableStatsPoint(point)) continue;
      targets.push({
        pointId: point.id,
        lat: point.lat,
        lon: point.lon,
        trackIndex: segment.trackIndex,
      });
    }
  }
  return targets;
}

/**
 * Resolve a picked point pair into the draft's anchors: document order
 * fixed, the along-track distance measured over the same track's
 * points (the pick session enforces one trackIndex).
 */
function stretchFromPair(
  working: NonNullable<GpxSession["workingData"]>,
  a: PointId,
  b: PointId,
): { start: LatLon; end: LatLon; lengthM: number } | null {
  const byId = new Map<PointId, { lat: number; lon: number }>();
  for (const segment of working.segments) {
    for (const point of segment.points) {
      byId.set(point.id, { lat: point.lat, lon: point.lon });
    }
  }
  const first = byId.get(a);
  const second = byId.get(b);
  if (first === undefined || second === undefined) return null;

  // Document order: walk every point once, remember where each id sat.
  const order = new Map<PointId, number>();
  let cursor = 0;
  for (const segment of working.segments) {
    for (const point of segment.points) {
      order.set(point.id, cursor++);
    }
  }
  const start = order.get(a)! <= order.get(b)! ? first : second;
  const end = order.get(a)! <= order.get(b)! ? second : first;

  // Along-track length between the anchors — over USABLE points only,
  // the same population the matcher walks (a flagged teleport point
  // must not inflate the reference length, or the matcher's own
  // along-track window would reject the very stretch that was picked).
  let lengthM = 0;
  let seenStart = false;
  let prev: { lat: number; lon: number } | null = null;
  const startId = order.get(a)! <= order.get(b)! ? a : b;
  const endId = order.get(a)! <= order.get(b)! ? b : a;
  for (const segment of working.segments) {
    for (const point of segment.points) {
      if (!isUsableStatsPoint(point)) continue;
      if (point.id === startId) {
        seenStart = true;
        prev = { lat: point.lat, lon: point.lon };
        continue;
      }
      if (!seenStart || prev === null) continue;
      const legM = geodesicDistanceMeters(prev, point);
      if (Number.isFinite(legM) && legM > 0) lengthM += legM;
      prev = { lat: point.lat, lon: point.lon };
      if (point.id === endId) return { start, end, lengthM };
    }
  }
  return { start, end, lengthM };
}

/** Geodesic chain length of the draft's vertices. */
function chainDistanceM(vertices: readonly DrawVertex[]): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i += 1) {
    const legM = geodesicDistanceMeters(vertices[i - 1]!, vertices[i]!);
    if (Number.isFinite(legM) && legM > 0) total += legM;
  }
  return total;
}

export function useSegments(
  session: GpxSession,
  map: MapBinding,
  sessions: SavedSessionsBinding,
): SegmentsBinding {
  const { t } = useI18n();
  const [segments, setSegments] = useState<readonly SegmentView[]>([]);
  const [draft, setDraft] = useState<SegmentDraft | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchDone, setMatchDone] = useState(0);
  const [matchTotal, setMatchTotal] = useState(0);
  /** One pass at a time — dialog re-opens never double-run. */
  const runningRef = useRef(false);
  /** Fresh ids for draft vertices (length-based ids collide on delete). */
  const vertexIdRef = useRef(0);

  const reloadSegments = useCallback(async () => {
    const rows: SegmentView[] = [];
    for (const raw of await listSegments()) {
      const row = readSegmentRow(raw);
      if (row !== null) rows.push(segmentView(row));
    }
    rows.sort((a, b) => a.row.createdAt - b.row.createdAt);
    setSegments(rows);
  }, []);

  useEffect(() => {
    void reloadSegments();
  }, [reloadSegments]);

  // -- the matcher pass (lazy, fingerprint-gated) ----------------------------

  const runMatchPass = useCallback(
    async (force: boolean, override?: readonly SegmentView[]) => {
      if (runningRef.current) return;
      const current = override ?? segments;
      const rows = sessions.rows.filter(
        (row) => row.source !== undefined && readFileSessionRecord(row) !== null,
      );
      const fingerprint = shelfFingerprint(rows);
      const stale = current.filter(
        (view) =>
          force ||
          view.row.efforts === undefined ||
          view.row.efforts.fingerprint !== fingerprint,
      );
      if (stale.length === 0) return;

      runningRef.current = true;
      setMatching(true);
      setMatchDone(0);
      setMatchTotal(rows.length);
      try {
        // (sessionId → rows) for every stale segment, accumulated as the
        // shelf is walked ONE session at a time (the parse is the cost).
        const collected = new Map<string, SegmentEffortRow[]>();
        for (const view of stale) collected.set(view.row.id, []);
        for (const entry of rows) {
          const merge = await mergeSessionEntry(entry);
          if (merge !== null) {
            const tracks = segmentWalkTracks(merge);
            let activityStartMs: number | null = null;
            outer: for (const track of tracks) {
              for (const point of track) {
                if (point.time !== null && !point.recon) {
                  activityStartMs = point.time;
                  break outer;
                }
              }
            }
            for (const view of stale) {
              const anchors: SegmentAnchors = {
                start: view.row.start,
                end: view.row.end,
                lengthM: view.row.lengthM,
              };
              collected.get(view.row.id)!.push(
                ...segmentEffortRows(
                  entry.id,
                  entry.name,
                  tracks,
                  anchors,
                  activityStartMs,
                ),
              );
            }
          }
          setMatchDone((done) => done + 1);
        }
        const computedAt = Date.now();
        for (const view of stale) {
          const next: SegmentRow = {
            ...view.row,
            efforts: {
              fingerprint,
              computedAt,
              rows: collected.get(view.row.id) ?? [],
            },
          };
          await writeSegment(next);
        }
        await reloadSegments();
      } finally {
        runningRef.current = false;
        setMatching(false);
      }
    },
    [sessions.rows, segments, reloadSegments],
  );

  const ensureEfforts = useCallback(() => {
    void runMatchPass(false);
  }, [runMatchPass]);

  const rematch = useCallback(() => {
    void runMatchPass(true);
  }, [runMatchPass]);

  // -- the authoring doors ----------------------------------------------------

  const closeEditorForPick = useCallback(() => {
    // The one-pick-mode rule (use-surgery's beginPick discipline): a
    // segment draft owns the map's interaction, so any open gap editor
    // or armed editor pick mode steps aside first.
    const editor = useEditorStore.getState();
    if (editor.pickMode !== null) editor.cancelPickMode();
    if (activeReconstruction(editor) !== null) editor.closeEditor();
  }, []);

  const beginStretchPick = useCallback(() => {
    closeEditorForPick();
    setDraft({ phase: "pick" });
  }, [closeEditorForPick]);

  const beginDraw = useCallback(() => {
    closeEditorForPick();
    setDraft({ phase: "draw", vertices: [], distanceM: 0 });
  }, [closeEditorForPick]);

  const cancelDraft = useCallback(() => {
    setDraft(null);
  }, []);

  const confirmDrawn = useCallback(() => {
    setDraft((current) => {
      if (current === null || current.phase !== "draw") return current;
      if (current.vertices.length < 2) return current;
      const first = current.vertices[0]!;
      const last = current.vertices[current.vertices.length - 1]!;
      return {
        phase: "naming",
        source: "drawn",
        start: { lat: first.lat, lon: first.lon },
        end: { lat: last.lat, lon: last.lon },
        lengthM: current.distanceM,
      };
    });
  }, []);

  const saveDraft = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0 || draft === null || draft.phase !== "naming") {
        return false;
      }
      const row: SegmentRow = {
        schemaVersion: SEGMENT_SCHEMA_VERSION,
        id: generateSegmentId(),
        name: trimmed,
        createdAt: Date.now(),
        source: draft.source,
        start: draft.start,
        end: draft.end,
        lengthM: draft.lengthM,
      };
      const wrote = await writeSegment(row);
      setDraft(null);
      if (!wrote) {
        announce(t("hook.segments.saveFailed"));
        return false;
      }
      await reloadSegments();
      announce(t("hook.segments.saved", { name: trimmed }));
      // The new segment has no efforts yet — the pass picks it up now,
      // with the row list passed explicitly (the state closure still
      // holds the pre-save segments until the next render).
      void runMatchPass(false, [...segments, segmentView(row)]);
      return true;
    },
    [draft, segments, reloadSegments, runMatchPass, t],
  );

  const deleteSegmentById = useCallback(
    async (id: string) => {
      const done = await deleteSegment(id);
      if (done) {
        await reloadSegments();
        announce(t("hook.segments.deleted"));
      }
    },
    [reloadSegments, t],
  );

  // Drive the controller's "pair" pick session while the stretch door
  // is open (targets from the WORKING view — the same population
  // surgery picks from).
  useEffect(() => {
    if (draft === null || draft.phase !== "pick") return;
    const controller = map.getController();
    if (!controller || !session.workingData) return;
    controller.startPickSession({
      mode: "pair",
      targets: buildStretchTargets(session.workingData),
      callbacks: {
        onSpanPicked: (a: PointId, b: PointId) => {
          const stretch = session.workingData
            ? stretchFromPair(session.workingData, a, b)
            : null;
          if (stretch === null) {
            announce(t("hook.segments.pickFailed"));
            setDraft(null);
            return;
          }
          setDraft({
            phase: "naming",
            source: "stretch",
            start: stretch.start,
            end: stretch.end,
            lengthM: stretch.lengthM,
          });
        },
        onAnchorPicked: () => undefined,
        onCancel: () => setDraft(null),
      },
    });
    return () => controller.endPickSession();
  }, [draft, map.getController, session.workingData, t]);

  // Drive the controller's draw session while the draw door is open
  // (anchor-less, exactly like the plan section's editor: the first
  // click IS the chain's start). The session STARTS once per draft;
  // the hook's vertex list is the source of truth and is PUSHED to
  // the controller after every edit (startDrawSession would wipe the
  // chain if re-run per vertex — the plan hook's own discipline).
  const drawActive = draft !== null && draft.phase === "draw";
  const drawSessionRef = useRef(false);
  useEffect(() => {
    const controller = map.getController();
    if (!controller) return;
    if (drawActive && !drawSessionRef.current) {
      drawSessionRef.current = true;
      const pushVertices = (
        updater: (
          current: readonly DrawVertex[],
        ) => readonly DrawVertex[],
      ) => {
        setDraft((current) => {
          if (current === null || current.phase !== "draw") return current;
          const vertices = updater(current.vertices);
          return {
            phase: "draw",
            vertices,
            distanceM: chainDistanceM(vertices),
          };
        });
      };
      controller.startDrawSession({
        gapId: "segment/draft",
        anchors: { before: null, after: null },
        vertices: [],
        snap: null,
        chainJoin: null,
        closingJoin: null,
        callbacks: {
          onVertexAdd: (position) =>
            pushVertices((current) => [
              ...current,
              {
                id: `segv-${vertexIdRef.current++}` as VertexId,
                lat: position.lat,
                lon: position.lon,
              },
            ]),
          onVertexMove: (vertexId, position) =>
            pushVertices((current) =>
              current.map((vertex) =>
                vertex.id === vertexId
                  ? { ...vertex, lat: position.lat, lon: position.lon }
                  : vertex,
              ),
            ),
          onVertexInsert: (index, position) =>
            pushVertices((current) => {
              const next = [...current];
              next.splice(index, 0, {
                id: `segv-${vertexIdRef.current++}` as VertexId,
                lat: position.lat,
                lon: position.lon,
              });
              return next;
            }),
          onVertexDelete: (vertexId) =>
            pushVertices((current) =>
              current.filter((vertex) => vertex.id !== vertexId),
            ),
          onStrokeCommit: (points) => {
            const nodes = simplifyStroke(points, {
              routing: false,
              budget: MAX_VERTICES,
            });
            if (nodes.length === 0) return;
            pushVertices((current) => {
              const room = Math.max(0, MAX_VERTICES - current.length);
              const add = nodes.slice(0, room).map((node) => ({
                id: `segv-${vertexIdRef.current++}` as VertexId,
                lat: node.lat,
                lon: node.lon,
              }));
              return [...current, ...add];
            });
          },
        },
      });
      controller.setPointerMode("draw");
    } else if (!drawActive && drawSessionRef.current) {
      drawSessionRef.current = false;
      controller.endDrawSession();
    }
  }, [drawActive, map.getController]);

  // Push every authoritative vertex change into the controller (the
  // same store-is-truth flow the plan editor uses).
  useEffect(() => {
    if (!drawActive) return;
    const vertices =
      draft !== null && draft.phase === "draw" ? draft.vertices : [];
    map.getController()?.updateDrawSession(vertices);
  }, [draft, drawActive, map.getController]);

  // Esc cancels either door (the pick session owns its own Esc; the
  // draw session does not — this listener covers both drafts' exit).
  useEffect(() => {
    if (draft === null || draft.phase === "naming") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      setDraft(null);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [draft]);

  const canAuthor = session.status === "parsed";

  return useMemo(
    () => ({
      segments,
      matching,
      matchDone,
      matchTotal,
      draft,
      canAuthor,
      driftToleranceM: SEGMENT_DRIFT_TOLERANCE_M,
      beginStretchPick,
      beginDraw,
      cancelDraft,
      confirmDrawn,
      saveDraft,
      deleteSegment: deleteSegmentById,
      rematch,
      ensureEfforts,
    }),
    [
      segments,
      matching,
      matchDone,
      matchTotal,
      draft,
      canAuthor,
      beginStretchPick,
      beginDraw,
      cancelDraft,
      confirmDrawn,
      saveDraft,
      deleteSegmentById,
      rematch,
      ensureEfforts,
    ],
  );
}
