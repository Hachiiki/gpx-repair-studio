/**
 * useSessionRecovery — Phase 10's orchestration hook (docs/MASTER_PLAN.md
 * Phase 10): the debounced IndexedDB autosave of in-progress work and the
 * restore/discard flow behind the landing page's prompt.
 *
 * Composition (this hook owns WHEN, the modules it calls own WHAT):
 *   - capture/validate/hydrate: `lib/storage/session-record.ts` (pure);
 *   - IndexedDB reads/writes: `lib/storage/sessionStore.ts` (guarded);
 *   - restore reuses the REAL pipelines — `loadGpxFile` /
 *     `loadRecoveryFile` (worker parse, progress UI, announcements, the
 *     error surface) — so a restored session is byte-for-byte an
 *     ordinary upload, then the store `hydrate` actions adopt the work.
 *
 * Autosave contract:
 *   - one subscription per SECTION over its stores (zustand's vanilla
 *     subscribe — no React renders involved);
 *   - a cheap signature per section decides "something material
 *     changed": vertex counts + geometry revisions + settings + spans +
 *     skips + timing + resolved road legs + thresholds + phase/stats;
 *   - 800 ms debounce; a pending save is flushed on pagehide/hidden so
 *     mobile tab kills lose at most the debounce window;
 *   - the WORK predicate keeps the prompt honest: a repair record exists
 *     only once >= 1 vertex / manual span / skip mark / file-timing entry
 *     exists (a bare upload restores nothing worth a prompt); create and
 *     plan records need >= 1 drawn vertex;
 *   - undoing back to "no work" DELETES the record — restoring undone
 *     work would be a lie;
 *   - a section's records are deleted the moment its session is replaced
 *     (new upload → loading) or reset ("Start over" lands here through
 *     the store resets — one source of truth, no shell wiring);
 *   - the file BLOB is written once per session (name+size keyed; the
 *     bytes never change) — geometry autosaves stay tens of KB even for
 *     a 250k-point file.
 *
 * Restore also seeds the shared road router's cache from the stored legs,
 * so a restored road-followed line renders identically and an editor
 * reopen issues ZERO new routing requests.
 *
 * Everything degrades silently: with IndexedDB blocked/unavailable the
 * hook's operations are no-ops and the app behaves exactly as before.
 *
 * Phase 10 — Session Recovery. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureCreateSession,
  captureFileSession,
  capturePlanSession,
  hydrateCreateSession,
  hydrateFileSession,
  hydratePlanSession,
  readSessionRecord,
  describeSessionRecord,
  type SessionRecordDescriptor,
} from "@/lib/storage/session-record";
import {
  deleteSessionSection,
  readSessionFile,
  readSessionState,
  writeSessionFile,
  writeSessionState,
  SESSION_SECTIONS,
  type SessionSection,
} from "@/lib/storage/sessionStore";
import { announce } from "@/lib/announcements";
import { getRoadRouter } from "@/hooks/use-draw-editor";
import { loadGpxFile } from "@/hooks/use-gpx-session";
import { loadRecoveryFile } from "@/hooks/use-recovery-session";
import { useSessionStore } from "@/state/session-store";
import { useEditorStore } from "@/state/editor-store";
import { useRecoveryStore } from "@/state/recovery-store";
import { useCreateStore } from "@/state/create-store";
import { usePlanStore } from "@/state/plan-store";
import { useUiStore } from "@/state/ui-store";
import type { GapThresholds } from "@/features/gpx/detectGaps";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import type {
  GapId,
  ManualSpan,
  Reconstruction,
  RoadLeg,
} from "@/types/domain";

/** One restorable session as the prompt renders it. */
export type SessionOffer = SessionRecordDescriptor;

/** The dev/test bridge's read-only state (e2e waits on it). */
export interface SessionRecoveryTestState {
  available: boolean;
  offers: number;
  saved: Record<string, number>;
  pending: boolean;
}

declare global {
  interface Window {
    /** Test bridge — attached outside production builds only. */
    __gpxrSessionRecovery?: {
      getTestState(): SessionRecoveryTestState;
    };
  }
}

/** What the landing's restore prompt consumes. */
export interface SessionRecoveryController {
  offers: readonly SessionOffer[];
  /** The section currently being restored (its row shows progress). */
  restoring: SessionSection | null;
  restore: (section: SessionSection) => void;
  discard: (section: SessionSection) => void;
  clearAll: () => void;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

// ---------------------------------------------------------------------------
// Signatures (cheap change detection — recomputed on every store event)
// ---------------------------------------------------------------------------

/** The editor-shaped slice repair and recovery share. */
interface EditorLike {
  reconstructions: Readonly<Record<string, Reconstruction>>;
  skippedGapIds: readonly GapId[];
  manualSpans: readonly ManualSpan[];
  fileTiming: FileTimingContext;
  roadLegs: Readonly<Record<string, readonly RoadLeg[]>>;
}

function editorSignature(editor: EditorLike): string {
  const reconParts = Object.entries(editor.reconstructions).map(
    ([gapId, recon]) =>
      `${gapId}=${recon.vertices.length}:${recon.geometryRevision}:${recon.resampleSpacingM}:${recon.pathStyle ?? ""}:${recon.timeStrategy.kind}:${
        recon.timeStrategy.kind === "manual-duration"
          ? recon.timeStrategy.durationMs
          : ""
      }`,
  );
  const legParts = Object.entries(editor.roadLegs).map(
    ([gapId, legs]) => `${gapId}:${legs.length}`,
  );
  return [
    reconParts.join(","),
    editor.skippedGapIds.length,
    editor.manualSpans.map((span) => span.id).join(","),
    editor.fileTiming.startMs ?? "",
    editor.fileTiming.totalDurationMs ?? "",
    legParts.join(";"),
  ].join("|");
}

function repairSignature(): string {
  const session = useSessionStore.getState();
  const editor = useEditorStore.getState();
  const thresholds = useUiStore.getState().gapThresholds;
  return [
    session.status,
    session.fileName ?? "",
    editorSignature(editor),
    thresholds.timeGapMs,
    thresholds.speedAnomalyKmh,
    thresholds.speedDtGuardMs,
  ].join("¦");
}

function recoverySignature(): string {
  const store = useRecoveryStore.getState();
  const thresholds = useUiStore.getState().gapThresholds;
  return [
    store.status,
    store.fileName ?? "",
    editorSignature(store),
    thresholds.timeGapMs,
    thresholds.speedAnomalyKmh,
    thresholds.speedDtGuardMs,
  ].join("¦");
}

function createSignature(): string {
  const store = useCreateStore.getState();
  return [
    store.phase,
    store.stats
      ? `${store.stats.distanceM}:${store.stats.durationMs}:${store.stats.paceMsPerKm}:${store.stats.startMs}`
      : "",
    store.reconstruction.vertices.length,
    store.reconstruction.geometryRevision,
    store.reconstruction.resampleSpacingM,
    store.reconstruction.pathStyle ?? "",
    store.spacingM,
    store.matchDistance ? 1 : 0,
    store.roadLegs.length,
  ].join("|");
}

function planSignature(): string {
  const store = usePlanStore.getState();
  return [
    store.phase,
    store.plannedTimeMs ?? "",
    store.reconstruction.vertices.length,
    store.reconstruction.geometryRevision,
    store.reconstruction.pathStyle ?? "",
    store.roadLegs.length,
  ].join("|");
}

// ---------------------------------------------------------------------------
// Work predicates (is there anything worth recovering?)
// ---------------------------------------------------------------------------

function fileSessionHasWork(editor: EditorLike): boolean {
  if (editor.manualSpans.length > 0 || editor.skippedGapIds.length > 0) {
    return true;
  }
  if (
    editor.fileTiming.startMs !== null ||
    editor.fileTiming.totalDurationMs !== null
  ) {
    return true;
  }
  for (const recon of Object.values(editor.reconstructions)) {
    if (recon.vertices.length > 0) return true;
  }
  return false;
}

function repairHasWork(): boolean {
  const session = useSessionStore.getState();
  return session.status === "parsed" && fileSessionHasWork(useEditorStore.getState());
}

function recoveryHasWork(): boolean {
  const store = useRecoveryStore.getState();
  return store.status === "parsed" && fileSessionHasWork(store);
}

function createHasWork(): boolean {
  // Stats, not phase: "Back to statistics" KEEPS the session (stats and
  // route survive) while the form is showing — only a reset clears stats.
  const store = useCreateStore.getState();
  return store.stats !== null && store.reconstruction.vertices.length > 0;
}

function planHasWork(): boolean {
  const store = usePlanStore.getState();
  return store.phase === "studio" && store.reconstruction.vertices.length > 0;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useSessionRecovery(): SessionRecoveryController {
  const [offers, setOffers] = useState<SessionOffer[]>([]);
  const [restoring, setRestoring] = useState<SessionSection | null>(null);

  /** Mirror of `offers` for the dev bridge (closures must not go stale). */
  const offersRef = useRef<SessionOffer[]>([]);
  offersRef.current = offers;

  /** Last signature evaluated per section (saved OR deliberately none). */
  const lastSignature = useRef<Partial<Record<SessionSection, string>>>({});
  /**
   * "A record for this section exists in storage, as far as this page
   * knows" — set by the mount scan and every successful save, cleared by
   * every delete. Deletes are issued only through it, so a visitor who
   * never draws never gets an (empty) database created at all — the
   * privacy posture of §M-1 extends to storage hygiene.
   */
  const knownRecord = useRef<Partial<Record<SessionSection, boolean>>>({});
  /** Debounce timers per section (a timer IS a pending action). */
  const timers = useRef<
    Partial<Record<SessionSection, ReturnType<typeof setTimeout>>>
  >({});
  /** The blob already persisted per section, keyed by name|size. */
  const savedFileKey = useRef<Partial<Record<SessionSection, string>>>({});
  /** True while a restore is applying — autosave stands down. */
  const restoringRef = useRef(false);
  /** savedAt per section, for the dev test bridge. */
  const savedAtRef = useRef<Partial<Record<SessionSection, number>>>({});

  // -- capture + persist (called from the debounce flush) ---------------------

  const persistFileSession = useCallback(
    async (section: "repair" | "recovery"): Promise<void> => {
      const session =
        section === "repair"
          ? useSessionStore.getState()
          : useRecoveryStore.getState();
      const source = session.sourceFile;
      if (!source) return; // no bytes, no recovery — never a phantom record
      const key = `${source.name}|${source.size}`;
      if (savedFileKey.current[section] !== key) {
        const written = await writeSessionFile(section, {
          name: source.name,
          type: source.type || "application/gpx+xml",
          blob: source,
        });
        if (!written) return; // too big / storage dead — no state record either
        savedFileKey.current[section] = key;
      }
      const savedAt = Date.now();
      const thresholds = useUiStore.getState().gapThresholds;
      const record =
        section === "repair"
          ? captureFileSession(
              {
                section,
                fileName: session.fileName ?? source.name,
                gapThresholds: thresholds,
                reconstructions: useEditorStore.getState().reconstructions,
                skippedGapIds: useEditorStore.getState().skippedGapIds,
                manualSpans: useEditorStore.getState().manualSpans,
                fileTiming: useEditorStore.getState().fileTiming,
                roadLegs: useEditorStore.getState().roadLegs,
              },
              savedAt,
            )
          : captureFileSession(
              {
                section,
                fileName: session.fileName ?? source.name,
                gapThresholds: thresholds,
                reconstructions: useRecoveryStore.getState().reconstructions,
                skippedGapIds: useRecoveryStore.getState().skippedGapIds,
                manualSpans: useRecoveryStore.getState().manualSpans,
                fileTiming: useRecoveryStore.getState().fileTiming,
                roadLegs: useRecoveryStore.getState().roadLegs,
              },
              savedAt,
            );
      if (await writeSessionState(section, record)) {
        savedAtRef.current[section] = savedAt;
        knownRecord.current[section] = true;
      }
    },
    [],
  );

  const persistCreateSession = useCallback(async (): Promise<void> => {
    const store = useCreateStore.getState();
    const savedAt = Date.now();
    const record = captureCreateSession(
      {
        stats: store.stats!,
        reconstruction: store.reconstruction,
        roadLegs: store.roadLegs,
        spacingM: store.spacingM,
        matchDistance: store.matchDistance,
        phase: store.phase === "review" ? "review" : "draw",
      },
      savedAt,
    );
    if (await writeSessionState("create", record)) {
      savedAtRef.current.create = savedAt;
      knownRecord.current.create = true;
    }
  }, []);

  const persistPlanSession = useCallback(async (): Promise<void> => {
    const store = usePlanStore.getState();
    const savedAt = Date.now();
    const record = capturePlanSession(
      {
        plannedTimeMs: store.plannedTimeMs,
        reconstruction: store.reconstruction,
        roadLegs: store.roadLegs,
      },
      savedAt,
    );
    if (await writeSessionState("plan", record)) {
      savedAtRef.current.plan = savedAt;
      knownRecord.current.plan = true;
    }
  }, []);

  // -- the scheduler -----------------------------------------------------------

  /** Fire-and-forget delete, tracked so idle sections never touch IDB. */
  const dropRecord = useCallback((section: SessionSection) => {
    if (!knownRecord.current[section]) return;
    knownRecord.current[section] = false;
    void deleteSessionSection(section);
  }, []);

  const evaluate = useCallback(
    (section: SessionSection, signature: string, hasWork: boolean) => {
      if (restoringRef.current) return;
      if (lastSignature.current[section] === signature) return;
      lastSignature.current[section] = signature;
      const existing = timers.current[section];
      if (existing) clearTimeout(existing);
      // A section with no recoverable work has no record — undoing back
      // to nothing must remove what an earlier save left behind.
      const timer = setTimeout(
        () => {
          delete timers.current[section];
          if (hasWork) {
            void (section === "repair" || section === "recovery"
              ? persistFileSession(section)
              : section === "create"
                ? persistCreateSession()
                : persistPlanSession());
          } else {
            dropRecord(section);
          }
        },
        AUTOSAVE_DEBOUNCE_MS,
      );
      timers.current[section] = timer;
    },
    [persistFileSession, persistCreateSession, persistPlanSession, dropRecord],
  );

  // -- mount: offers scan + subscriptions + bridge + flush ---------------------

  useEffect(() => {
    let cancelled = false;

    // The prompt's offers: every section whose stored record validates.
    void (async () => {
      const found: SessionOffer[] = [];
      for (const section of SESSION_SECTIONS) {
        const record = readSessionRecord(await readSessionState(section));
        if (record) {
          found.push(describeSessionRecord(record));
          knownRecord.current[section] = true;
        }
      }
      if (!cancelled && found.length > 0) setOffers(found);
    })();

    const subscriptions: (() => void)[] = [];

    // Repair: session + editor + thresholds.
    subscriptions.push(
      useSessionStore.subscribe((state, prev) => {
        if (state.status === "loading" && prev.status !== "loading") {
          // A new upload replaces the session — its record goes now.
          dropRecord("repair");
          savedFileKey.current.repair = undefined;
          lastSignature.current.repair = undefined;
        } else if (state.status === "idle" && prev.status !== "idle") {
          // "Start over" / reset.
          dropRecord("repair");
          savedFileKey.current.repair = undefined;
          lastSignature.current.repair = undefined;
        }
        evaluate("repair", repairSignature(), repairHasWork());
      }),
      useEditorStore.subscribe(() => {
        evaluate("repair", repairSignature(), repairHasWork());
      }),
      useUiStore.subscribe(() => {
        evaluate("repair", repairSignature(), repairHasWork());
      }),
    );

    // Recovery: its store carries both slices.
    subscriptions.push(
      useRecoveryStore.subscribe((state, prev) => {
        if (state.status === "loading" && prev.status !== "loading") {
          dropRecord("recovery");
          savedFileKey.current.recovery = undefined;
          lastSignature.current.recovery = undefined;
        } else if (state.status === "idle" && prev.status !== "idle") {
          dropRecord("recovery");
          savedFileKey.current.recovery = undefined;
          lastSignature.current.recovery = undefined;
        }
        evaluate("recovery", recoverySignature(), recoveryHasWork());
      }),
      useUiStore.subscribe(() => {
        evaluate("recovery", recoverySignature(), recoveryHasWork());
      }),
    );

    // Create: "form" with no stats is the reset destination (backToForm
    // KEEPS the session — stats survive — so only the stats-less form
    // transition deletes the record).
    subscriptions.push(
      useCreateStore.subscribe((state, prev) => {
        if (
          state.phase === "form" &&
          state.stats === null &&
          (prev.phase !== "form" || prev.stats !== null)
        ) {
          dropRecord("create");
          lastSignature.current.create = undefined;
        }
        evaluate("create", createSignature(), createHasWork());
      }),
    );

    // Plan: idle is only ever the reset destination.
    subscriptions.push(
      usePlanStore.subscribe((state, prev) => {
        if (state.phase === "idle" && prev.phase === "studio") {
          dropRecord("plan");
          lastSignature.current.plan = undefined;
        }
        evaluate("plan", planSignature(), planHasWork());
      }),
    );

    // Flush a pending save when the page goes away — the best-effort
    // answer to mobile tab kills (small puts usually complete).
    const runNow = (section: SessionSection) => {
      // Exactly what the pending timer would have done, decided against
      // the CURRENT state (the debounce's whole point was to wait for
      // exactly this moment).
      if (section === "repair") {
        if (repairHasWork()) void persistFileSession("repair");
        else dropRecord("repair");
      } else if (section === "recovery") {
        if (recoveryHasWork()) void persistFileSession("recovery");
        else dropRecord("recovery");
      } else if (section === "create") {
        if (createHasWork()) void persistCreateSession();
        else dropRecord("create");
      } else {
        if (planHasWork()) void persistPlanSession();
        else dropRecord("plan");
      }
    };
    const onHide = (event: Event) => {
      if (
        event.type === "pagehide" ||
        document.visibilityState === "hidden"
      ) {
        for (const section of SESSION_SECTIONS) {
          if (timers.current[section]) {
            clearTimeout(timers.current[section]);
            delete timers.current[section];
            runNow(section);
          }
        }
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);

    // Dev/test bridge (the __gpxMapController pattern): deterministic
    // e2e waits for the debounced save without sleeping fixed ms.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { __gpxrSessionRecovery?: unknown }).__gpxrSessionRecovery = {
        getTestState: () => ({
          available: typeof indexedDB !== "undefined",
          offers: offersRef.current.length,
          saved: { ...savedAtRef.current },
          pending: Object.keys(timers.current).length > 0,
        }),
      };
    }

    return () => {
      cancelled = true;
      for (const section of SESSION_SECTIONS) {
        const timer = timers.current[section];
        if (timer) {
          clearTimeout(timer);
          delete timers.current[section];
        }
      }
      for (const unsubscribe of subscriptions) unsubscribe();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (typeof window !== "undefined") {
        delete (window as unknown as { __gpxrSessionRecovery?: unknown })
          .__gpxrSessionRecovery;
      }
    };
    // The subscriptions close over stable callbacks only (refs + pure
    // functions); offers state is intentionally NOT a dependency.
  }, []);

  // -- restore / discard / clear ------------------------------------------------

  const removeOffer = useCallback((section: SessionSection) => {
    setOffers((current) => current.filter((offer) => offer.section !== section));
  }, []);

  const restore = useCallback(
    (section: SessionSection) => {
      if (restoringRef.current) return;
      restoringRef.current = true;
      setRestoring(section);
      void (async () => {
        try {
          if (section === "repair" || section === "recovery") {
            const [rawRecord, file] = await Promise.all([
              readSessionState(section),
              readSessionFile(section),
            ]);
            const record = readSessionRecord(rawRecord);
            if (!record || record.kind !== "file" || !file) {
              // Corrupt or incomplete — the honest answer is to drop it.
              await deleteSessionSection(section);
              removeOffer(section);
              return;
            }
            // The gaps must re-detect with the thresholds the session
            // used (part of the session's meaning).
            useUiStore.getState().setGapThresholds(record.gapThresholds);
            const rebuilt = new File([file.blob], file.name, {
              type: file.type || "application/gpx+xml",
            });
            if (section === "repair") {
              await loadGpxFile(rebuilt);
              useSessionStore.getState().setView("repair");
            } else {
              await loadRecoveryFile(rebuilt);
            }
            const sessionStore =
              section === "repair"
                ? useSessionStore.getState()
                : useRecoveryStore.getState();
            if (sessionStore.status !== "parsed") {
              // The bytes no longer parse — the record is dead weight.
              await deleteSessionSection(section);
              removeOffer(section);
              return;
            }
            const hydration = hydrateFileSession(record);
            if (section === "repair") {
              useEditorStore.getState().hydrate(hydration);
            } else {
              useRecoveryStore.getState().hydrate(hydration);
            }
            // Seed the router cache so a reopened editor re-hits its
            // legs instead of re-asking the network (WYSIWYG restore).
            const router = getRoadRouter();
            for (const [gapId, legs] of Object.entries(record.roadLegs)) {
              const style = record.reconstructions[gapId]?.pathStyle;
              if ((style === "car" || style === "foot") && legs.length > 0) {
                router.seedCache(style, legs);
              }
            }
            // NOTE: no savedFileKey bookkeeping here — the beginLoad above
            // already dropped the old record (blob included), so the
            // re-persist below MUST rewrite the blob. Restoring twice in a
            // row is therefore always safe.
            announce(
              section === "repair"
                ? "Previous repair session restored."
                : "Previous recovery session restored.",
            );
          } else if (section === "create") {
            const record = readSessionRecord(await readSessionState("create"));
            if (!record || record.kind !== "create") {
              await deleteSessionSection("create");
              removeOffer("create");
              return;
            }
            useCreateStore.getState().hydrate(hydrateCreateSession(record));
            const style = record.reconstruction.pathStyle;
            if (
              (style === "car" || style === "foot") &&
              record.roadLegs.length > 0
            ) {
              getRoadRouter().seedCache(style, record.roadLegs);
            }
            announce("Previous create session restored.");
          } else {
            const record = readSessionRecord(await readSessionState("plan"));
            if (!record || record.kind !== "plan") {
              await deleteSessionSection("plan");
              removeOffer("plan");
              return;
            }
            usePlanStore.getState().hydrate(hydratePlanSession(record));
            const style = record.reconstruction.pathStyle;
            if (
              (style === "car" || style === "foot") &&
              record.roadLegs.length > 0
            ) {
              getRoadRouter().seedCache(style, record.roadLegs);
            }
            announce("Previous plan restored.");
          }
          removeOffer(section);
          /*
           * The restore's beginLoad deleted the old record (correctly —
           * a session was replaced); re-persist what just came back so
           * ANOTHER reload still finds it. The signature adoption below
           * keeps the autosave from immediately re-saving the same state.
           */
          if (section === "repair" || section === "recovery") {
            await persistFileSession(section);
          } else if (section === "create") {
            await persistCreateSession();
          } else {
            await persistPlanSession();
          }
        } finally {
          restoringRef.current = false;
          setRestoring(null);
          // The applied state IS what storage holds — adopt its signature
          // so the first store event after a restore is not a re-save.
          lastSignature.current[section] =
            section === "repair"
              ? repairSignature()
              : section === "recovery"
                ? recoverySignature()
                : section === "create"
                  ? createSignature()
                  : planSignature();
        }
      })();
    },
    [removeOffer, persistFileSession, persistCreateSession, persistPlanSession],
  );

  const discard = useCallback(
    (section: SessionSection) => {
      knownRecord.current[section] = false;
      void (async () => {
        await deleteSessionSection(section);
        removeOffer(section);
      })();
    },
    [removeOffer],
  );

  const clearAll = useCallback(() => {
    for (const section of SESSION_SECTIONS) {
      knownRecord.current[section] = false;
    }
    void (async () => {
      for (const section of SESSION_SECTIONS) {
        await deleteSessionSection(section);
      }
      setOffers([]);
    })();
  }, []);

  return { offers, restoring, restore, discard, clearAll };
}
