/**
 * useHeatmap (Phase 25 §25.1 — docs/plans/v3/
 * phase-25-heatmap-personal-segments.md): the map toolbar's heatmap
 * toggle and the layer data behind it.
 *
 * The strips are DERIVED, PAID-ONCE data: the lazy backfill pass
 * (features/library/backfill.ts — the same parse + merge the index
 * runs on) decimates every file-backed session once and persists the
 * result in the `heatmap` store, so the first toggle on a big shelf
 * pays the parse and every later toggle is a store read. Toggling is
 * never a re-parse of the shelf unless a session is genuinely new.
 *
 * OFF is off: the overlay drops to null and the controller hides the
 * layer (absent = never). The preference is deliberately NOT
 * persisted — honoring a remembered "on" would re-arm the backfill at
 * app load, and the library's lazy-by-design rule (§24.1) forbids
 * exactly that.
 *
 * Phase 25 — Heatmap & personal segments. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveSessionArtifacts,
  readFileSessionRecord,
} from "@/features/library/backfill";
import {
  readHeatmapStrips as validateStrips,
  type HeatmapStrips,
} from "@/features/heatmap/strips";
import {
  heatmapCollection,
  type HeatmapLayerData,
  type HeatmapTrackPart,
} from "@/lib/map/geojson";
import {
  heatmapStripsKeys,
  readHeatmapStrips,
  writeHeatmapStrips,
  writeLibraryIndex,
} from "@/lib/storage/sessionStore";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";
import type { SavedSessionsBinding } from "@/hooks/use-saved-sessions";

/** The binding the repair map's toolbar + legend render. */
export interface HeatmapBinding {
  /** The toggle's state (the toolbar's aria-pressed + the legend row). */
  on: boolean;
  /** A backfill pass is running (the toolbar's indexing hint). */
  pending: boolean;
  /** Sessions contributing geometry (the honest count, 0 when off). */
  sessionCount: number;
  /** Total decimated points in the wash (0 when off). */
  pointCount: number;
  /** The map layer's data — null while off OR while pending. */
  overlay: HeatmapLayerData | null;
  /** Flip the toggle (idempotent, announced). */
  toggle: () => void;
}

export function useHeatmap(
  sessions: SavedSessionsBinding,
): HeatmapBinding {
  const { t } = useI18n();
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(false);
  const [overlay, setOverlay] = useState<HeatmapLayerData | null>(null);
  /** One backfill pass at a time — toggles never double-run. */
  const runningRef = useRef(false);

  /**
   * Derive + persist strips for any file-backed row that lacks them
   * (a fresh save, or a shelf backfilled by a pre-Phase-25 build).
   * Planned routes never enter (not recordings); rows that fail to
   * re-parse simply stay off the wash — the library tab carries their
   * "couldn't re-read" sentence, this surface stays quiet.
   */
  const ensureStrips = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPending(true);
    try {
      const rows = sessions.rows.filter(
        (row) => row.source !== undefined && readFileSessionRecord(row) !== null,
      );
      const have = new Set(await heatmapStripsKeys());
      const todo = rows.filter((row) => !have.has(row.id));
      for (const entry of todo) {
        const artifacts = await deriveSessionArtifacts(entry);
        if (artifacts === null) continue;
        await writeHeatmapStrips(entry.id, artifacts.strips);
        if (artifacts.index !== null) {
          // The index rides along for free — one parse, both artifacts
          // (the use-library backfill does the same in its direction).
          await writeLibraryIndex(entry.id, artifacts.index);
        }
      }
    } finally {
      runningRef.current = false;
      setPending(false);
    }
  }, [sessions.rows]);

  // Build (or drop) the overlay. Re-runs when the shelf changes while
  // on — the strips are cached, so this is a store read + one
  // collection build, not a re-parse.
  useEffect(() => {
    if (!on) {
      setOverlay(null);
      return;
    }
    let alive = true;
    void (async () => {
      await ensureStrips();
      if (!alive) return;
      const keys = await heatmapStripsKeys();
      const parts: HeatmapTrackPart[] = [];
      for (const key of keys) {
        const raw = await readHeatmapStrips(key);
        const strips: HeatmapStrips | null = validateStrips(raw);
        if (strips !== null && strips.lonLat.length > 0) {
          parts.push({ sessionId: key, lonLat: strips.lonLat });
        }
      }
      if (!alive) return;
      setOverlay(heatmapCollection(parts));
    })();
    return () => {
      alive = false;
    };
  }, [on, sessions.rows, ensureStrips]);

  const toggle = useCallback(() => {
    setOn((current) => {
      const next = !current;
      announce(
        next
          ? t("hook.heatmap.enabled")
          : t("hook.heatmap.disabled"),
      );
      return next;
    });
  }, [t]);

  const sessionCount = overlay?.features.length ?? 0;
  const pointCount = useMemo(
    () =>
      overlay?.features.reduce(
        (sum, feature) => sum + feature.geometry.coordinates.length,
        0,
      ) ?? 0,
    [overlay],
  );

  return {
    on,
    pending,
    sessionCount,
    pointCount,
    overlay: on ? overlay : null,
    toggle,
  };
}
