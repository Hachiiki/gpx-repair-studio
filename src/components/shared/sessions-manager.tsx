/**
 * SessionsManagerDialog (Phase 18 — §EE 18.3/18.4) — the named-session
 * shelf: one dialog, four doors.
 *
 *   - SAVE: name the current section's work (the same capture + WORK
 *     predicate the autosave uses — nothing nameable, nothing to save);
 *   - THE SHELF: every named session with its section, date, and
 *     actions — Open (the one restore path), Rename (inline), Export
 *     (a portable .gpxrepair.json download), Delete (a confirm);
 *   - IMPORT: a .gpxrepair.json from disk onto the shelf;
 *   - OPEN A SESSION FILE: the same picker with "straight into the
 *     app" — 18.3's open-from-file door.
 *
 * The dialog is honest about storage: when IndexedDB is blocked the
 * shelf says so in one sentence and every control stays visible but
 * explains itself.
 */

"use client";

import { useId, useRef, useState } from "react";
import {
  BookmarkPlus,
  Download,
  FileJson,
  FolderOpen,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  activeSessionSection,
  hasNameableSession,
  savedSessionSectionLabel,
  type SavedSessionsBinding,
} from "@/hooks/use-saved-sessions";
import { formatDateTime } from "@/lib/utils/format";
import type { SavedSessionRow } from "@/hooks/use-saved-sessions";

export interface SessionsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SavedSessionsBinding;
}

export function SessionsManagerDialog({
  open,
  onOpenChange,
  sessions,
}: SessionsManagerDialogProps) {
  const saveInputId = useId();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const [saveName, setSaveName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  /** The last import outcome line (kept until the next action). */
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    onOpenChange(false);
    setSaveName("");
    setRenaming(null);
    setConfirmingDelete(null);
    setNotice(null);
  };

  const save = async () => {
    const done = await sessions.saveCurrent(saveName);
    if (done) {
      setSaveName("");
      setNotice(null);
    }
  };

  const importFile = async (file: File | undefined, openNow: boolean) => {
    if (!file) return;
    const outcome = await sessions.importPortableFile(file, openNow);
    if (outcome.status === "opened") {
      close();
      return;
    }
    if (outcome.status === "error") {
      setNotice(outcome.message);
    } else {
      setNotice(`Imported — "${outcome.name}" is on the shelf.`);
    }
  };

  // What the save row says about the current work (recomputed at render;
  // the predicate is cheap and store-backed).
  const nameable = hasNameableSession();
  const activeSection = activeSessionSection();

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        data-testid="sessions-manager"
        className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
      >
        <DialogTitle className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <BookmarkPlus className="size-4 text-signal" aria-hidden="true" />
          Your sessions
        </DialogTitle>
        <DialogDescription className="text-[13px] leading-relaxed">
          Sessions live in this browser only — no accounts, nothing sent
          anywhere. A session file (.gpxrepair.json) carries the whole
          thing: the original recording, every fix, every drawn repair.
        </DialogDescription>

        {/* SAVE — the current work under a name. */}
        <section aria-label="Save the current session" className="grid gap-2">
          <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <Save className="size-3.5" aria-hidden="true" />
            Save what you are working on
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={saveInputId} className="sr-only">
              Session name
            </label>
            <input
              id={saveInputId}
              type="text"
              value={saveName}
              data-testid="sessions-save-name"
              disabled={!nameable}
              placeholder={
                nameable
                  ? `Name this ${activeSection !== null ? savedSessionSectionLabel(activeSection).toLowerCase() : ""} session…`
                  : "Nothing to save yet — draw or fix something first"
              }
              onChange={(event) => setSaveName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
              className="h-9 min-w-0 flex-1 rounded-[7px] border-[1.25px] border-ink/25 bg-card px-3 text-[13px] transition-colors placeholder:text-muted-foreground/70 hover:border-ink/45 focus:border-signal focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Button
              type="button"
              size="sm"
              data-testid="sessions-save-button"
              disabled={!nameable || saveName.trim().length === 0}
              onClick={() => void save()}
            >
              Save session
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="sessions-export-current"
              disabled={!nameable}
              onClick={() => void sessions.exportCurrent()}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Export file
            </Button>
          </div>
          {notice !== null && (
            <p
              role="status"
              data-testid="sessions-notice"
              className="text-[12px] leading-relaxed text-muted-foreground"
            >
              {notice}
            </p>
          )}
        </section>

        {/* THE SHELF — the named sessions. */}
        <section aria-label="Saved sessions" className="grid gap-2">
          <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <FolderOpen className="size-3.5" aria-hidden="true" />
            On this device
          </h3>
          {!sessions.available && (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Session storage is unavailable (blocked or private mode) —
              save and export still work, but nothing persists here.
            </p>
          )}
          {sessions.available && sessions.hasScanned && sessions.rows.length === 0 && (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              No saved sessions yet. Save one above, or import a session
              file below.
            </p>
          )}
          {sessions.rows.length > 0 && (
            <ul className="grid gap-1.5" data-testid="sessions-list">
              {sessions.rows.map((row) => (
                <ShelfRow
                  key={row.id}
                  row={row}
                  renaming={
                    renaming?.id === row.id ? renaming.name : null
                  }
                  confirmingDelete={confirmingDelete === row.id}
                  onRenameStart={() =>
                    setRenaming({ id: row.id, name: row.name })
                  }
                  onRenameChange={(name) =>
                    setRenaming({ id: row.id, name })
                  }
                  onRenameCommit={() => {
                    if (renaming !== null) {
                      void sessions.renameRow(row.id, renaming.name);
                    }
                    setRenaming(null);
                  }}
                  onRenameCancel={() => setRenaming(null)}
                  onDelete={() =>
                    setConfirmingDelete((current) =>
                      current === row.id ? null : row.id,
                    )
                  }
                  onDeleteConfirm={() => {
                    void sessions.deleteRow(row.id);
                    setConfirmingDelete(null);
                  }}
                  onDeleteCancel={() => setConfirmingDelete(null)}
                  onExport={() => void sessions.exportRow(row.id)}
                  onOpen={() => {
                    void sessions.openRow(row.id).then((opened) => {
                      if (opened) close();
                    });
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        {/* IMPORT + OPEN — the portable file doors. */}
        <section aria-label="Session files" className="grid gap-2">
          <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <FileJson className="size-3.5" aria-hidden="true" />
            Session files
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="sessions-import-button"
              onClick={() => importInputRef.current?.click()}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Import to the shelf
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="sessions-open-file-button"
              onClick={() => openInputRef.current?.click()}
            >
              <FolderOpen className="size-3.5" aria-hidden="true" />
              Open a session file
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,.gpxrepair.json,application/json"
              className="sr-only"
              data-testid="sessions-import-input"
              onChange={(event) => {
                void importFile(event.target.files?.[0], false);
                event.target.value = "";
              }}
            />
            <input
              ref={openInputRef}
              type="file"
              accept=".json,.gpxrepair.json,application/json"
              className="sr-only"
              data-testid="sessions-open-input"
              onChange={(event) => {
                void importFile(event.target.files?.[0], true);
                event.target.value = "";
              }}
            />
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            "Open a session file" loads it straight into the app — the
            current session is replaced, exactly like uploading a new
            file.
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}

/** One shelf row: name, section, date, and the four actions. */
function ShelfRow({
  row,
  renaming,
  confirmingDelete,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
  onExport,
  onOpen,
}: {
  row: SavedSessionRow;
  renaming: string | null;
  confirmingDelete: boolean;
  onRenameStart: () => void;
  onRenameChange: (name: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onExport: () => void;
  onOpen: () => void;
}) {
  return (
    <li
      data-testid="sessions-row"
      className="grid gap-1.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="outline">
          {savedSessionSectionLabel(row.section)}
        </StatusBadge>
        {renaming !== null ? (
          <>
            <label className="sr-only" htmlFor={`rename-${row.id}`}>
              New name for {row.name}
            </label>
            <input
              id={`rename-${row.id}`}
              type="text"
              value={renaming}
              data-testid="sessions-rename-input"
              onChange={(event) => onRenameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRenameCommit();
                if (event.key === "Escape") onRenameCancel();
              }}
              autoFocus
              className="h-8 min-w-0 flex-1 rounded-[7px] border-[1.25px] border-signal bg-card px-2.5 text-[13px] focus:outline-none"
            />
            <Button
              type="button"
              size="sm"
              data-testid="sessions-rename-commit"
              disabled={renaming.trim().length === 0}
              onClick={onRenameCommit}
            >
              Rename
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRenameCancel}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span
              className="min-w-0 flex-1 truncate text-[13.5px] font-semibold"
              title={row.name}
            >
              {row.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-testid="sessions-rename-button"
                aria-label={`Rename ${row.name}`}
                className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                onClick={onRenameStart}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="sessions-export-button"
                aria-label={`Export ${row.name} as a session file`}
                className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                onClick={onExport}
              >
                <Download className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="sessions-delete-button"
                aria-label={`Delete ${row.name}`}
                className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Updated {formatDateTime(row.updatedAt)}
      </p>
      {confirmingDelete ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[7px] border-[1.25px] border-signal bg-signal/[0.05] px-2.5 py-1.5">
          <span className="text-[12px] font-semibold text-ink">
            Delete this session?
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            data-testid="sessions-delete-confirm"
            onClick={onDeleteConfirm}
          >
            Delete
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDeleteCancel}
          >
            Keep
          </Button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="sessions-open-button"
          className="w-fit rounded-[5px] px-2 py-1 text-[12.5px] font-bold text-signal-ink transition-colors hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
          onClick={onOpen}
        >
          <FolderOpen className="mr-1.5 inline size-3.5" aria-hidden="true" />
          Open this session
        </button>
      )}
    </li>
  );
}
