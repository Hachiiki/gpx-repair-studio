"use client";

/**
 * useRoadSnap (§EE 17.3) — the shared "Snap to road" state machine for
 * the two reconstruction editors (repair + recovery studios).
 *
 * One deliberate machine, owned here so both sections behave
 * identically; the section hooks supply the section-specific halves:
 *
 *   - `chain()` — the active line's full node list (near anchor →
 *     vertices → far anchor) plus the gap id and a referentially
 *     stable identity token (the store's vertices array), read at
 *     call time;
 *   - `apply(plan)` — commits the `set-line` command through the
 *     section's own store (vertex-id allocator + history), seeds the
 *     new pairs' legs into the side table and the router cache;
 *   - `currentLegs()` — the side table, for the preview save/restore.
 *
 * The preview rides the EXISTING renderer: the routed slices are
 * written into the gap's roadLegs side table (the previous legs are
 * saved and restored on cancel), so the map, the distance badge, and
 * the closing preview all show the road path through the same
 * WYSIWYG join every road-followed line uses — no new map surface.
 *
 * The preview is keyed to the chain that produced it. Staleness is
 * DERIVED at render (the preview context lives in state, the chain is
 * a pure closure read of the parent's fresh values) — a vertex edit,
 * drag, or gap switch exposes idle on the very render that moved on;
 * the side-table restore is a STORE write in the follow-up effect
 * (never local setState — the react-hooks discipline the rest of the
 * app follows).
 *
 * Consent (§EE 17.2) gates the request — `start()` opens the consent
 * dialog instead of routing when this session has not granted it; the
 * hard fetch-level gate lives in `getRoadRouter()` regardless.
 *
 * Phase 17 — Road snapping, opt-in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "@/lib/announcements";
import { getRoadRouter, requestRouterConsent } from "@/hooks/road-router";
import { useUiStore } from "@/state/ui-store";
import {
  planSnapApply,
  requestWaypoints,
  sliceRoutedPolyline,
  snapPreviewNumbers,
  snapProfileLabel,
  type RoadSnapPreviewNumbers,
} from "@/features/reconstruction/snapEngine";
import type { RoutableRoadMode } from "@/features/reconstruction/roadFollow";
import type { GapId, LatLon, RoadLeg } from "@/types/domain";

export type { RoadSnapPreviewNumbers } from "@/features/reconstruction/snapEngine";

/** The user-visible machine states. */
export type RoadSnapState = "idle" | "pending" | "preview" | "failed";

/** What the section hook must supply (see the header). */
export interface RoadSnapAdapter {
  /**
   * The active chain (null when no editor is open): the full node
   * list plus `token` — a referentially stable identity for that
   * exact chain (the store's vertices array), so the machine can
   * detect a moved-on line without deep comparison. A pure closure
   * read of the parent's render values.
   */
  chain: () => {
    gapId: GapId;
    nodes: readonly LatLon[];
    token: unknown;
  } | null;
  /** The gap's current side-table legs (rendering + restore source). */
  currentLegs: (gapId: GapId) => readonly RoadLeg[];
  /** Replace the gap's side-table legs (preview writes, restores). */
  setLegs: (gapId: GapId, legs: readonly RoadLeg[]) => void;
  /**
   * Commit the apply: ONE `set-line` command (waypoints + profile
   * style), then seed `legs` into the side table and the router
   * cache. Returns false when the command was refused (no-op).
   */
  apply: (
    waypoints: readonly { lat: number; lon: number }[],
    legs: readonly RoadLeg[],
    profile: RoutableRoadMode,
  ) => boolean;
  /**
   * §EE 17.3 + the per-segment fix: tell the section's store whether
   * the whole-line preview is on screen — the joins render the routed
   * slices for EVERY pair while it is (the preview replaces the
   * line, overriding the placed segments' own styles).
   */
  setPreviewActive: (active: boolean) => void;
  /** Open the consent dialog (§EE 17.2 — never route without it). */
  requestConsent: () => void;
}

/** The snap fields a draw binding gains (flat, like the rest). */
export interface RoadSnapBinding {
  /** The snap machine's user-visible state. */
  snapState: RoadSnapState;
  /** The preview's honest numbers (null outside preview). */
  snapPreviewNumbers: RoadSnapPreviewNumbers | null;
  /** §EE 17.2: the consent request (opens the dialog, never routes). */
  requestConsent: () => void;
  /** Begin a snap (consent-gated; profile defaults to "car"). */
  startRoadSnap: (profile?: RoutableRoadMode) => void;
  /** Drop the preview and restore the line as drawn. */
  cancelRoadSnap: () => void;
  /** Commit the preview as ONE undoable command. */
  applyRoadSnap: () => void;
}

/** The live preview context (state, so render can derive staleness). */
interface PreviewContext {
  gapId: GapId;
  token: unknown;
  nodes: readonly LatLon[];
  savedLegs: readonly RoadLeg[];
  routed: { coordinates: [number, number][]; routeDistanceM: number };
  profile: RoutableRoadMode;
}

interface VisiblePreview {
  state: RoadSnapState;
  numbers: RoadSnapPreviewNumbers;
  context: PreviewContext;
}

export function useRoadSnap(adapter: RoadSnapAdapter): RoadSnapBinding {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState<VisiblePreview | null>(null);

  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  });

  // The chain as of THIS render (a pure closure read — the parent
  // re-renders on every vertex/style/gap change, so this is always
  // current). Staleness derives here; no refs are read during render.
  const chainNow = adapter.chain();

  /** Drop the preview and put the saved legs back (idempotent). */
  const restore = useCallback((context: PreviewContext | null) => {
    setVisible(null);
    if (context) {
      adapterRef.current.setLegs(context.gapId, [...context.savedLegs]);
    }
    // The whole-line rendering override leaves with the preview —
    // placed segments render under their own styles again.
    adapterRef.current.setPreviewActive(false);
  }, []);

  // The side-table half of invalidation: when the chain that produced
  // the preview is gone, the saved legs go back. A STORE write in an
  // effect (the leg effects' own pattern) — the visible half is the
  // render derivation above, so no local setState ever runs here; the
  // stale context simply stays (tiny) until the next snap action.
  useEffect(() => {
    if (visible === null) return;
    const chain = adapterRef.current.chain();
    if (
      chain !== null &&
      chain.gapId === visible.context.gapId &&
      chain.token === visible.context.token
    ) {
      return;
    }
    adapterRef.current.setLegs(visible.context.gapId, [
      ...visible.context.savedLegs,
    ]);
  }, [visible, chainNow?.gapId, chainNow?.token]);

  const start = useCallback(
    (profile?: RoutableRoadMode) => {
      const live = adapterRef.current;
      const chain = live.chain();
      if (!chain || chain.nodes.length < 2) return;
      // §EE 17.2 — the UX gate: without this session's consent the
      // dialog opens INSTEAD of any request (the fetch-level gate
      // underneath makes it doubly impossible).
      if (useUiStore.getState().routerConsent !== "granted") {
        live.requestConsent();
        return;
      }
      const mode: RoutableRoadMode = profile ?? "car";
      restore(null);
      setFailed(false);
      setPending(true);
      announce(`Finding the ${snapProfileLabel(mode)} for your line…`);
      const waypoints = requestWaypoints(chain.nodes);
      void getRoadRouter()
        .routePolyline(mode, waypoints)
        .then((routed) => {
          // The chain may have moved on while the request was in
          // flight (a drag, an undo) — a stale preview never lands.
          const now = live.chain();
          if (
            !now ||
            now.gapId !== chain.gapId ||
            now.token !== chain.token
          ) {
            setPending(false);
            return;
          }
          setPending(false);
          if (!routed) {
            setFailed(true);
            announce(
              "Road snapping is unavailable right now — your line stays as you drew it.",
            );
            return;
          }
          // Re-slice for the FULL node chain (the request may have
          // carried the reduced waypoint set).
          const legs = sliceRoutedPolyline(chain.nodes, routed.coordinates);
          if (!legs) {
            setFailed(true);
            announce(
              "The routing service could not match your line — it stays as you drew it.",
            );
            return;
          }
          const saved = [...live.currentLegs(chain.gapId)];
          const context: PreviewContext = {
            gapId: chain.gapId,
            token: chain.token,
            nodes: chain.nodes,
            savedLegs: saved,
            routed,
            profile: mode,
          };
          // The preview IS the side-table write: the rendered chain,
          // the badge, and the closing preview all show the road path
          // — for EVERY segment, whatever style it was drawn with
          // (the whole-line override flag makes the styled join show
          // the routed slices).
          live.setLegs(chain.gapId, legs);
          live.setPreviewActive(true);
          setVisible({
            state: "preview",
            numbers: snapPreviewNumbers(chain.nodes, saved, legs),
            context,
          });
          announce(
            `Road preview ready — ${Math.round(
              Math.abs(routed.routeDistanceM),
            ).toLocaleString()} m on the road.`,
          );
        });
    },
    [restore],
  );

  const cancel = useCallback(() => {
    const context = visible?.context ?? null;
    restore(context);
    setFailed(false);
    if (context) {
      announce("Road preview cancelled — your line is back as you drew it.");
    }
  }, [restore, visible]);

  const apply = useCallback(() => {
    if (visible === null) return;
    const context = visible.context;
    const live = adapterRef.current;
    // The stale guard (event time): the preview must belong to the
    // chain on screen — a moved-on line is never overwritten.
    const chain = live.chain();
    if (
      !chain ||
      chain.gapId !== context.gapId ||
      chain.token !== context.token
    ) {
      restore(context);
      return;
    }
    const plan = planSnapApply(context.routed.coordinates);
    if (!plan) {
      restore(context);
      setFailed(true);
      return;
    }
    const applied = live.apply(plan.waypoints, plan.legs, context.profile);
    setVisible(null);
    // The preview's whole-line rendering leaves with the apply — the
    // applied vertices carry the profile as their own legStyle, so
    // the styled join keeps showing exactly this geometry.
    live.setPreviewActive(false);
    setFailed(!applied);
    if (applied) {
      announce(
        `Line snapped to the ${snapProfileLabel(context.profile)} — undo to get your drawing back.`,
      );
    }
  }, [restore, visible]);

  // The exposed state: derived staleness wins — a preview that no
  // longer belongs to the chain on screen reads as idle, immediately.
  const stale =
    visible !== null &&
    (chainNow === null ||
      chainNow.gapId !== visible.context.gapId ||
      chainNow.token !== visible.context.token);
  const snapState: RoadSnapState = stale
    ? "idle"
    : pending
      ? "pending"
      : failed
        ? "failed"
        : visible === null
          ? "idle"
          : "preview";

  return {
    snapState,
    snapPreviewNumbers: stale ? null : (visible?.numbers ?? null),
    requestConsent: requestRouterConsent,
    startRoadSnap: start,
    cancelRoadSnap: cancel,
    applyRoadSnap: apply,
  };
}

/** The binding's snap fields' defaults (sections without the engine). */
export const IDLE_SNAP_BINDING: RoadSnapBinding = {
  snapState: "idle",
  snapPreviewNumbers: null,
  requestConsent: requestRouterConsent,
  startRoadSnap: () => undefined,
  cancelRoadSnap: () => undefined,
  applyRoadSnap: () => undefined,
};
