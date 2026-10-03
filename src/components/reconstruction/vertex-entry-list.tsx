/**
 * VertexEntryList (Phase 16) — the numeric-entry surface of the draw
 * editor (§EE 16.2): the keyboard-only repair milestone.
 *
 * Closes the v1-documented a11y limitation (the canvas was the one
 * mouse surface): points can now be ADDED, INSERTED, and MOVED by
 * typing lat/lng, and NUDGED with the arrow keys at a configurable
 * step (Shift = ×10). Every action is a command — undoable like a
 * drag; a nudge run is one undo step.
 *
 * Validation is the honest-error kind everywhere (§EE 16.3): bounds
 * are named, >7-decimal inputs are rounded with a disclosed note,
 * and nothing is guessed silently.
 *
 * Pure presentation: the DrawEditorBinding's entry intents in,
 * commands out — no store, domain, or map imports.
 */

"use client";

import { Fragment, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X } from "lucide-react";
import {
  NUDGE_STEP_CHOICES,
  nudgeDelta,
  parseLatitude,
  parseLongitude,
  type NudgeStepM,
} from "@/hooks/use-draw-editor";
import { interpolateLatLon } from "@/lib/geo/geodesy";
import type { DrawVertex, VertexId } from "@/types/domain";

/** The binding subset this list needs (satisfied by DrawEditorBinding). */
export interface VertexEntryBinding {
  vertices: readonly DrawVertex[];
  vertexCount: number;
  maxVertices: number;
  atVertexCap: boolean;
  nudgeStepM: NudgeStepM;
  setNudgeStepM: (step: NudgeStepM) => void;
  addVertexAt: (lat: number, lon: number) => void;
  insertVertexAt: (index: number, lat: number, lon: number) => void;
  moveVertexTo: (vertexId: VertexId, lat: number, lon: number) => void;
  nudgeVertex: (vertexId: VertexId, dLat: number, dLon: number) => void;
  deleteVertex: (vertexId: VertexId) => void;
}

const INPUT_CLASS =
  "h-7 w-full min-w-0 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-1.5 font-mono text-[11px] tabular-nums transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none";

const ERROR_CLASS = "text-[11px] font-medium text-signal-ink";

// ---------------------------------------------------------------------------
// One coordinate pair as a small form (add + insert share it)
// ---------------------------------------------------------------------------

function CoordForm({
  label,
  initialLat,
  initialLon,
  submitLabel,
  disabled,
  testId,
  variant = "append",
  onSubmit,
}: {
  label: string;
  initialLat?: number;
  initialLon?: number;
  submitLabel: string;
  disabled?: boolean;
  testId: string;
  /** "inline": a row's insert form — indented + signal-accented so it
   * reads as belonging to the row above, distinct from the append
   * form below the list (the VLM-probed hierarchy fix). */
  variant?: "append" | "inline";
  onSubmit: (lat: number, lon: number) => void;
}) {
  const [lat, setLat] = useState(
    initialLat !== undefined ? String(initialLat) : "",
  );
  const [lon, setLon] = useState(
    initialLon !== undefined ? String(initialLon) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [rounded, setRounded] = useState(false);
  const latRef = useRef<HTMLInputElement | null>(null);

  const submit = () => {
    const latResult = parseLatitude(lat);
    if (!latResult.ok) {
      setError(latResult.error);
      return;
    }
    const lonResult = parseLongitude(lon);
    if (!lonResult.ok) {
      setError(lonResult.error);
      return;
    }
    setError(null);
    setRounded(latResult.rounded || lonResult.rounded);
    onSubmit(latResult.value, lonResult.value);
    setLat("");
    setLon("");
    latRef.current?.focus();
  };

  return (
    <div
      className={
        variant === "inline"
          ? "ml-3 grid gap-1.5 rounded-[6px] border border-l-[3px] border-ink/15 border-l-signal/70 bg-ink/[0.03] px-2 py-2"
          : "grid gap-1.5 rounded-[6px] border border-ink/15 bg-ink/[0.03] px-2 py-2"
      }
      data-testid={testId}
    >
      <p className="text-[11px] font-semibold text-ink">{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="grid gap-0.5 text-[10.5px] font-semibold text-muted-foreground">
          Latitude
          <input
            ref={latRef}
            type="text"
            inputMode="decimal"
            className={INPUT_CLASS}
            data-testid={`${testId}-lat`}
            aria-label={`${label} — latitude`}
            aria-invalid={error !== null}
            value={lat}
            placeholder="52.5206"
            onChange={(event) => {
              setLat(event.target.value);
              setError(null);
              setRounded(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
        <label className="grid gap-0.5 text-[10.5px] font-semibold text-muted-foreground">
          Longitude
          <input
            type="text"
            inputMode="decimal"
            className={INPUT_CLASS}
            data-testid={`${testId}-lon`}
            aria-label={`${label} — longitude`}
            aria-invalid={error !== null}
            value={lon}
            placeholder="13.4055"
            onChange={(event) => {
              setLon(event.target.value);
              setError(null);
              setRounded(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
      </div>
      {error !== null && (
        <p className={ERROR_CLASS} role="alert" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
      {error === null && rounded && (
        <p className="text-[10.5px] text-muted-foreground">
          More than 7 decimals — rounded to 7 (about a centimeter, the
          export precision).
        </p>
      )}
      <Button
        type="button"
        size="sm"
        className="h-7 justify-self-start px-2.5 text-[11.5px]"
        data-testid={`${testId}-button`}
        disabled={disabled}
        onClick={submit}
      >
        <Plus className="size-3" aria-hidden="true" />
        {submitLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One editable vertex row
// ---------------------------------------------------------------------------

function VertexRow({
  vertex,
  index,
  nudgeStepM,
  onMove,
  onNudge,
  onDelete,
  onToggleInsert,
  insertOpen,
}: {
  vertex: DrawVertex;
  index: number;
  nudgeStepM: NudgeStepM;
  onMove: (vertexId: VertexId, lat: number, lon: number) => void;
  onNudge: (vertexId: VertexId, dLat: number, dLon: number) => void;
  onDelete: (vertexId: VertexId) => void;
  onToggleInsert: (index: number) => void;
  insertOpen: boolean;
}) {
  /*
   * The typing OVERRIDE: the fields show the user's text only while
   * it was typed against the vertex's CURRENT values — an external
   * move (nudge, undo, a map drag) drops the override and the
   * canonical values show again. Derived at render, no syncing
   * effect (the react-hooks/set-state-in-effect rule).
   */
  const [edit, setEdit] = useState<{
    base: { lat: number; lon: number };
    lat: string;
    lon: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live =
    edit !== null &&
    edit.base.lat === vertex.lat &&
    edit.base.lon === vertex.lon;
  const latText = live && edit !== null ? edit.lat : String(vertex.lat);
  const lonText = live && edit !== null ? edit.lon : String(vertex.lon);

  // An external move also clears a stale error (conditional render-time
  // state adjustment — the same React-documented pattern).
  if (error !== null && !live) {
    setError(null);
  }

  const typeLat = (text: string) => {
    setEdit({
      base: { lat: vertex.lat, lon: vertex.lon },
      lat: text,
      lon: lonText,
    });
    setError(null);
  };

  const typeLon = (text: string) => {
    setEdit({
      base: { lat: vertex.lat, lon: vertex.lon },
      lat: latText,
      lon: text,
    });
    setError(null);
  };

  const commit = (revert = false) => {
    if (revert) {
      setEdit(null);
      setError(null);
      return;
    }
    const latResult = parseLatitude(latText);
    if (!latResult.ok) {
      setError(latResult.error);
      return;
    }
    const lonResult = parseLongitude(lonText);
    if (!lonResult.ok) {
      setError(lonResult.error);
      return;
    }
    setError(null);
    if (latResult.value !== vertex.lat || lonResult.value !== vertex.lon) {
      onMove(vertex.id, latResult.value, lonResult.value);
      setEdit(null); // the canonical values take over on the next render
    }
  };

  // The nudge handle: focus it and the arrow keys walk the point.
  const onHandleKey = (event: React.KeyboardEvent) => {
    let dNorth = 0;
    let dEast = 0;
    switch (event.key) {
      case "ArrowUp":
        dNorth = 1;
        break;
      case "ArrowDown":
        dNorth = -1;
        break;
      case "ArrowRight":
        dEast = 1;
        break;
      case "ArrowLeft":
        dEast = -1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const step = event.shiftKey ? nudgeStepM * 10 : nudgeStepM;
    const { dLat, dLon } = nudgeDelta(vertex.lat, step, dNorth, dEast);
    onNudge(vertex.id, dLat, dLon);
  };

  return (
    <li
      className="grid gap-1 rounded-[6px] border border-ink/10 bg-card px-2 py-1.5 transition-colors hover:bg-ink/[0.04]"
      data-testid="vertex-row"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="grid size-[18px] shrink-0 cursor-grab place-items-center rounded-[4px] bg-ink/[0.06] text-[10px] font-bold text-shade transition-colors hover:bg-ink/[0.12] focus-visible:outline-2 focus-visible:outline-signal"
          aria-label={`Nudge point ${index + 1} — arrow keys move it by ${nudgeStepM} m, Shift for ten times that`}
          title={`Arrow keys nudge this point by ${nudgeStepM} m (Shift = ×10). Up/down = latitude, left/right = longitude.`}
          data-testid="vertex-nudge-handle"
          onKeyDown={onHandleKey}
        >
          {index + 1}
        </button>
        <label className="grid min-w-0 flex-1 gap-0" aria-label={`Point ${index + 1} latitude`}>
          <span className="sr-only">Point {index + 1} latitude</span>
          <input
            type="text"
            inputMode="decimal"
            className={INPUT_CLASS}
            data-testid="vertex-lat-input"
            aria-invalid={error !== null}
            value={latText}
            onChange={(event) => typeLat(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                commit(true);
              }
            }}
            onBlur={() => commit()}
          />
        </label>
        <label className="grid min-w-0 flex-1 gap-0" aria-label={`Point ${index + 1} longitude`}>
          <span className="sr-only">Point {index + 1} longitude</span>
          <input
            type="text"
            inputMode="decimal"
            className={INPUT_CLASS}
            data-testid="vertex-lon-input"
            aria-invalid={error !== null}
            value={lonText}
            onChange={(event) => typeLon(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                commit(true);
              }
            }}
            onBlur={() => commit()}
          />
        </label>
        {vertex.snappedTo !== undefined && (
          <span
            className="shrink-0 rounded-[3px] border-[1.25px] border-signal bg-signal/10 px-1 py-px text-[9.5px] font-semibold text-ink"
            title={`Snapped to recorded point ${vertex.snappedTo} — typing or nudging releases the snap`}
          >
            snapped
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
          aria-label={`Insert a point after point ${index + 1}`}
          aria-expanded={insertOpen}
          data-testid="vertex-insert-toggle"
          onClick={() => onToggleInsert(index)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
          aria-label={`Delete point ${index + 1}`}
          data-testid="delete-vertex-button"
          onClick={() => onDelete(vertex.id)}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      {error !== null && (
        <p className={ERROR_CLASS} role="alert" data-testid="vertex-row-error">
          {error}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export function VertexEntryList({ entry }: { entry: VertexEntryBinding }) {
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const { vertices, nudgeStepM } = entry;

  // The insert form's midpoint prefill: between this vertex and the
  // next (a smart default — the user adjusts from the middle).
  const insertPrefill = (index: number): { lat: number; lon: number } | null => {
    const current = vertices[index];
    const next = vertices[index + 1];
    if (!current || !next) return null;
    return interpolateLatLon(current, next, 0.5);
  };

  return (
    <div className="grid gap-1.5" data-testid="vertex-entry-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Drawn points — drag them on the map, or type: every field here
          is the keyboard twin of the canvas.
        </p>
        <label
          className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold"
          title="How far one arrow-key press moves a focused point"
        >
          Nudge step
          <select
            className="h-7 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-1.5 text-[11px] font-normal transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
            data-testid="nudge-step-select"
            value={String(nudgeStepM)}
            onChange={(event) =>
              entry.setNudgeStepM(Number(event.target.value) as NudgeStepM)
            }
          >
            {NUDGE_STEP_CHOICES.map((step) => (
              <option key={step} value={String(step)}>
                {step} m
              </option>
            ))}
          </select>
        </label>
      </div>

      <ScrollArea className="max-h-52 -mx-2">
        <ul className="grid gap-0.5 px-2">
          {vertices.map((vertex, index) => (
            <Fragment key={vertex.id}>
              <VertexRow
                vertex={vertex}
                index={index}
                nudgeStepM={nudgeStepM}
                onMove={entry.moveVertexTo}
                onNudge={entry.nudgeVertex}
                onDelete={entry.deleteVertex}
                onToggleInsert={(at) =>
                  setInsertAt((current) => (current === at ? null : at))
                }
                insertOpen={insertAt === index}
              />
              {insertAt === index && (
                <li className="list-none">
                  <CoordForm
                    label={`Insert after point ${index + 1}`}
                    initialLat={insertPrefill(index)?.lat}
                    initialLon={insertPrefill(index)?.lon}
                    submitLabel="Insert point"
                    disabled={entry.atVertexCap}
                    testId="vertex-insert-form"
                    variant="inline"
                    onSubmit={(lat, lon) => {
                      entry.insertVertexAt(index + 1, lat, lon);
                      setInsertAt(null);
                    }}
                  />
                </li>
              )}
            </Fragment>
          ))}
        </ul>
      </ScrollArea>

      {/* The append form — always offered while under the cap. */}
      {entry.atVertexCap ? (
        <p
          className="rounded-md border border-signal/40 bg-signal/5 px-3 py-2 text-[11.5px] text-ink"
          role="status"
        >
          Point limit reached ({entry.maxVertices}) — the line is as
          dense as this tool allows.
        </p>
      ) : (
        <CoordForm
          label="Add a point by coordinates"
          submitLabel="Add point"
          testId="vertex-add-form"
          onSubmit={(lat, lon) => entry.addVertexAt(lat, lon)}
        />
      )}
    </div>
  );
}
