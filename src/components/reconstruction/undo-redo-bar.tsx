/**
 * UndoRedoBar — the command-stack controls of the draw editor (Phase 4):
 * undo / redo / clear-all, with honest disabled states.
 *
 * Pure presentation: intents out, no store or domain imports. The labels
 * include the stack depth so screen-reader users can gauge history state.
 */

import { Button } from "@/components/ui/button";
import { Eraser, Redo2, Undo2 } from "lucide-react";

export interface UndoRedoBarProps {
  canUndo: boolean;
  canRedo: boolean;
  /** Vertex ops recorded on the undo stack (for the labels). */
  undoCount: number;
  redoCount: number;
  /** Clear-all only makes sense with vertices present. */
  canClear: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export function UndoRedoBar({
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  canClear,
  onUndo,
  onRedo,
  onClear,
}: UndoRedoBarProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Drawing history"
      data-testid="undo-redo-bar"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        disabled={!canUndo}
        onClick={onUndo}
        aria-label={canUndo ? `Undo (${undoCount} step${undoCount === 1 ? "" : "s"})` : "Undo (nothing to undo)"}
        data-testid="undo-button"
      >
        <Undo2 className="size-3.5" aria-hidden="true" />
        Undo
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        disabled={!canRedo}
        onClick={onRedo}
        aria-label={canRedo ? `Redo (${redoCount} step${redoCount === 1 ? "" : "s"})` : "Redo (nothing to redo)"}
        data-testid="redo-button"
      >
        <Redo2 className="size-3.5" aria-hidden="true" />
        Redo
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        disabled={!canClear}
        onClick={onClear}
        aria-label="Clear all drawn points"
        data-testid="clear-button"
      >
        <Eraser className="size-3.5" aria-hidden="true" />
        Clear
      </Button>
    </div>
  );
}
