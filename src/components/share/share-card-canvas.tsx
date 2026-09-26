/**
 * ShareCardCanvas — the reusable Strava-style share card component
 * (docs/MASTER_PLAN.md §O — Task 20, layout per Task 23).
 *
 * Props are the spec's contract: the route polyline plus the three
 * pre-formatted stat values. The component owns the 1080×1920 canvas
 * (solid #000000 background — the hairline ring is preview-only
 * chrome so the black card reads against the dark stage; the PNG
 * export is ring-free) and repaints whenever the props change —
 * after awaiting the card's Montserrat faces, so the preview is
 * always what the PNG export will contain (same painter, same
 * scale-1 spec; the export only raises the backing resolution).
 *
 * Pure presentation: no session knowledge, no stats logic — any caller
 * can render a card from a polyline and three strings. The painting
 * itself lives in lib/share/render.ts (one implementation); this file
 * is the React binding only.
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { loadShareCardFonts } from "@/lib/share/fonts";
import {
  paintShareCardCanvas,
  type ShareCardSpec,
} from "@/lib/share/render";
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from "@/lib/share/layout";
import type { LatLon } from "@/types/domain";

export interface ShareCardCanvasProps {
  /**
   * The route, as polylines of geographic points. Multiple polylines
   * render as independent strokes (multi-track files, gap-split
   * pieces, re-imported repairs) — never connected with invented legs.
   */
  routePolyline: readonly (readonly LatLon[])[];
  /** The Distance column's value ("21.12 km"). */
  distance: string;
  /** The Pace column's value ("5:00 /km"). */
  pace: string;
  /** The Time column's value ("1h 45m"). */
  time: string;
  /** Accessible description; defaults to one built from the trio. */
  ariaLabel?: string;
}

export function ShareCardCanvas({
  routePolyline,
  distance,
  pace,
  time,
  ariaLabel,
}: ShareCardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // The spec is derived from props only — stable identity for the
  // paint effect below.
  const spec: ShareCardSpec = useMemo(
    () => ({ routePolyline, distance, pace, time }),
    [routePolyline, distance, pace, time],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void (async () => {
      // Idempotent (FontFaceSet): resolves immediately once loaded,
      // fetches on first paint. Without a FontFaceSet (SSR/jsdom) it
      // resolves false and the painter uses the fallback face.
      await loadShareCardFonts();
      if (!cancelled) paintShareCardCanvas(canvas, spec, { scale: 1 });
    })();
    return () => {
      cancelled = true;
    };
  }, [spec]);

  const label =
    ariaLabel ??
    `Share card: route plot with distance ${distance}, pace ${pace}, time ${time}`;

  return (
    <canvas
      ref={canvasRef}
      width={SHARE_CARD_WIDTH}
      height={SHARE_CARD_HEIGHT}
      role="img"
      aria-label={label}
      data-testid="share-card-canvas"
      className="block h-full w-auto max-w-full ring-1 ring-white/10"
    />
  );
}
