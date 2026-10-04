/**
 * UndoRedoBar — the command-stack controls of the draw editor (Phase 4):
 * undo / redo / clear-all, with honest disabled states.
 *
 * Pure presentation: intents out, no store or domain imports. The labels
 * include the stack depth so screen-reader users can gauge history state.
 */

import { Button } from "@/components/ui/button";
import { Eraser, Redo2, Undo2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

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
  const { t } = useI18n();
  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label={t("undoRedo.groupAria")}
      data-testid="undo-redo-bar"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        disabled={!canUndo}
        onClick={onUndo}
        aria-label={
          canUndo
            ? undoCount === 1
              ? t("undoRedo.undoOne", { count: undoCount })
              : t("undoRedo.undoMany", { count: undoCount })
            : t("undoRedo.undoEmpty")
        }
        data-testid="undo-button"
      >
        <Undo2 className="size-3.5" aria-hidden="true" />
        {t("undoRedo.undo")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        disabled={!canRedo}
        onClick={onRedo}
        aria-label={
          canRedo
            ? redoCount === 1
              ? t("undoRedo.redoOne", { count: redoCount })
              : t("undoRedo.redoMany", { count: redoCount })
            : t("undoRedo.redoEmpty")
        }
        data-testid="redo-button"
      >
        <Redo2 className="size-3.5" aria-hidden="true" />
        {t("undoRedo.redo")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        disabled={!canClear}
        onClick={onClear}
        aria-label={t("undoRedo.clearAria")}
        data-testid="clear-button"
      >
        <Eraser className="size-3.5" aria-hidden="true" />
        {t("undoRedo.clear")}
      </Button>
    </div>
  );
}
