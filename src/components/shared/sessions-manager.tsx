/**
 * SessionsManagerDialog (Phase 18 §EE 18.3/18.4; Phase 24 — the shelf
 * grown into the local training library): one dialog, three tabs.
 *
 *   - SESSIONS: save the current work under a name, the shelf as
 *     LIBRARY CARDS (distance, moving time, pace, gain, avg HR —
 *     §24.1), sort + filter, multi-select bulk delete and the portable
 *     library bundle, the CSV export, and the import/open doors;
 *   - RECORDS (§24.2/24.5): farthest/longest/most gain, the best-
 *     efforts ladder, and the opt-in Riegel predictions;
 *   - TRENDS (§24.3): weekly/monthly volume and the gated
 *     fitness-fatigue line.
 *
 * The dialog is honest about storage: when IndexedDB is blocked the
 * shelf says so in one sentence and every control stays visible but
 * explains itself. Planned routes (create/plan sections) stay on the
 * shelf labeled as planned — they are not recordings and never join
 * records or trends.
 */

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BookmarkPlus,
  Download,
  FileJson,
  Flag,
  FolderOpen,
  LineChart,
  Medal,
  Pencil,
  Save,
  Search,
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
  savedSessionSectionKey,
  savedSessionSectionLabel,
  type SavedSessionsBinding,
} from "@/hooks/use-saved-sessions";
import type { LibraryBinding, LibraryCardRow } from "@/hooks/use-library";
import type { SegmentsBinding } from "@/hooks/use-segments";
import { LibraryRecords } from "@/components/library/library-records";
import { LibraryTrends } from "@/components/library/library-trends";
import { LibrarySegments } from "@/components/library/library-segments";
import {
  formatDateTime,
  formatDistanceForUnit,
  formatDurationMs,
  formatElevationMeters,
  formatPace,
} from "@/lib/utils/format";
import { useUiStore } from "@/state/ui-store";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type ManagerTab = "sessions" | "records" | "trends" | "segments";
type SortMode = "recent" | "oldest" | "name" | "distance" | "duration";

export interface SessionsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SavedSessionsBinding;
  library: LibraryBinding;
  /** Phase 25 — the personal segments controller (the fourth tab). */
  segments: SegmentsBinding;
}

export function SessionsManagerDialog({
  open,
  onOpenChange,
  sessions,
  library,
  segments,
}: SessionsManagerDialogProps) {
  const { t } = useI18n();
  const paceUnit = useUiStore((s) => s.paceUnit);
  const saveInputId = useId();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<ManagerTab>("sessions");
  const [saveName, setSaveName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The library view's own state (§24.1): filter, sort, selection.
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  // Opening the library surfaces pays the (idempotent) backfill —
  // never at app load, one row at a time (use-library's contract).
  useEffect(() => {
    if (open) library.ensureIndexes();
  }, [open, library]);

  // Rows whose id survived a rename/delete stay selected; gone ids
  // drop — DERIVED at render (never an effect), so a delete can never
  // leave a stale id selected.
  const visibleCards = useMemo(
    () => sortCards(filterCards(library.cards, filter), sort),
    [library.cards, filter, sort],
  );
  const liveSelection = useMemo(() => {
    const alive = new Set(visibleCards.map((c) => c.id));
    const next = new Set([...selected].filter((id) => alive.has(id)));
    return next.size === selected.size ? selected : next;
  }, [visibleCards, selected]);

  const close = () => {
    onOpenChange(false);
    setSaveName("");
    setRenaming(null);
    setConfirmingDelete(null);
    setNotice(null);
    setFilter("");
    setSort("recent");
    setSelected(new Set());
    setConfirmingBulkDelete(false);
    setTab("sessions");
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
    } else if (outcome.status === "imported-library") {
      setNotice(
        t("hook.savedSessions.importedLibrary", { count: outcome.count }),
      );
    } else {
      setNotice(t("shared.sessions.importedNotice", { name: outcome.name }));
    }
  };

  const bulkDelete = async () => {
    const done = await sessions.deleteRows([...liveSelection]);
    setConfirmingBulkDelete(false);
    if (done) setSelected(new Set());
  };

  const nameable = hasNameableSession();
  const activeSection = activeSessionSection();
  const allVisibleSelected =
    visibleCards.length > 0 &&
    visibleCards.every((card) => liveSelection.has(card.id));

  const tabButton = (id: ManagerTab, labelKey: string, ariaKey: string, icon: React.ReactNode) => (
    <button
      type="button"
      data-testid={`library-tab-${id}`}
      aria-pressed={tab === id}
      aria-label={t(ariaKey)}
      className={cn(
        "flex items-center gap-1.5 rounded-[7px] border-[1.25px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-2",
        tab === id
          ? "border-ink bg-ink/[0.06] text-ink"
          : "border-ink/25 text-muted-foreground hover:border-ink/50 hover:text-foreground",
      )}
      onClick={() => setTab(id)}
    >
      {icon}
      {t(labelKey)}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        data-testid="sessions-manager"
        className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogTitle className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <BookmarkPlus className="size-4 text-signal" aria-hidden="true" />
          {t("shared.sessions.title")}
        </DialogTitle>
        <DialogDescription className="text-[13px] leading-relaxed">
          {t("shared.sessions.description")}
        </DialogDescription>

        {/* The four doors: the shelf, the records, the trends, the segments. */}
        <div
          role="group"
          aria-label={t("library.tab.sessionsAria")}
          className="flex flex-wrap gap-1.5"
        >
          {tabButton(
            "sessions",
            "library.tab.sessions",
            "library.tab.sessionsAria",
            <FolderOpen className="size-3.5" aria-hidden="true" />,
          )}
          {tabButton(
            "records",
            "library.tab.records",
            "library.tab.recordsAria",
            <Medal className="size-3.5" aria-hidden="true" />,
          )}
          {tabButton(
            "trends",
            "library.tab.trends",
            "library.tab.trendsAria",
            <LineChart className="size-3.5" aria-hidden="true" />,
          )}
          {tabButton(
            "segments",
            "library.tab.segments",
            "library.tab.segmentsAria",
            <Flag className="size-3.5" aria-hidden="true" />,
          )}
        </div>

        {tab === "sessions" && (
          <>
            {/* SAVE — the current work under a name. */}
            <section
              aria-label={t("shared.sessions.saveSectionAria")}
              className="grid gap-2"
            >
              <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <Save className="size-3.5" aria-hidden="true" />
                {t("shared.sessions.saveHeading")}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={saveInputId} className="sr-only">
                  {t("shared.sessions.nameLabel")}
                </label>
                <input
                  id={saveInputId}
                  type="text"
                  value={saveName}
                  data-testid="sessions-save-name"
                  disabled={!nameable}
                  placeholder={
                    nameable
                      ? t("shared.sessions.savePlaceholder", {
                          section:
                            activeSection !== null
                              ? savedSessionSectionLabel(activeSection).toLowerCase()
                              : "",
                        })
                      : t("shared.sessions.savePlaceholderEmpty")
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
                  {t("shared.sessions.saveButton")}
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
                  {t("shared.sessions.exportCurrent")}
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

            {/* THE LIBRARY — the shelf as cards (§24.1). */}
            <section
              aria-label={t("shared.sessions.shelfSectionAria")}
              className="grid gap-2"
            >
              <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <FolderOpen className="size-3.5" aria-hidden="true" />
                {t("shared.sessions.shelfHeading")}
              </h3>
              {!sessions.available && (
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {t("shared.sessions.unavailable")}
                </p>
              )}
              {sessions.available && sessions.hasScanned && sessions.rows.length === 0 && (
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {t("shared.sessions.empty")}
                </p>
              )}
              {sessions.rows.length > 0 && (
                <>
                  {/* Sort + filter + select-all + CSV. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="library-filter"
                      className="sr-only"
                    >
                      {t("library.filter.label")}
                    </label>
                    <Search
                      className="size-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      id="library-filter"
                      type="search"
                      value={filter}
                      data-testid="library-filter"
                      placeholder={t("library.filter.placeholder")}
                      onChange={(event) => setFilter(event.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-[7px] border-[1.25px] border-ink/25 bg-card px-2.5 text-[12.5px] transition-colors placeholder:text-muted-foreground/70 focus:border-signal focus:outline-none"
                    />
                    <label htmlFor="library-sort" className="sr-only">
                      {t("library.sort.label")}
                    </label>
                    <select
                      id="library-sort"
                      data-testid="library-sort"
                      value={sort}
                      onChange={(event) =>
                        setSort(event.target.value as SortMode)
                      }
                      className="h-8 rounded-[7px] border-[1.25px] border-ink/25 bg-card px-2 text-[12.5px] focus:border-signal focus:outline-none"
                    >
                      <option value="recent">{t("library.sort.recent")}</option>
                      <option value="oldest">{t("library.sort.oldest")}</option>
                      <option value="name">{t("library.sort.name")}</option>
                      <option value="distance">{t("library.sort.distance")}</option>
                      <option value="duration">{t("library.sort.duration")}</option>
                    </select>
                    <label
                      className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"
                      data-testid="library-select-all"
                    >
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        aria-label={t("library.selectAllAria")}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? new Set(visibleCards.map((c) => c.id))
                              : new Set(),
                          )
                        }
                        className="size-3.5 accent-[var(--signal)]"
                      />
                      {t("library.selectAll")}
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="library-export-csv"
                      onClick={() => library.exportCsv()}
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      {t("library.csv.button")}
                    </Button>
                  </div>

                  {(library.backfilling || library.pendingCount > 0) && (
                    <p
                      role="status"
                      data-testid="library-indexing"
                      className="text-[11.5px] text-muted-foreground"
                    >
                      {t("library.indexing", {
                        count:
                          library.pendingCount > 0
                            ? library.pendingCount
                            : library.cards.length,
                      })}
                    </p>
                  )}

                  {/* The bulk bar (multi-select, §24.1). */}
                  {liveSelection.size > 0 && (
                    <div
                      data-testid="library-bulk-bar"
                      className="flex flex-wrap items-center gap-2 rounded-[8px] border-[1.25px] border-signal bg-signal/[0.05] px-2.5 py-1.5"
                    >
                      <span className="text-[12px] font-semibold text-ink">
                        {t("library.bulk.count", { count: liveSelection.size })}
                      </span>
                      {confirmingBulkDelete ? (
                        <>
                          <span className="text-[12px]">
                            {t("library.bulk.deleteConfirm", {
                              count: liveSelection.size,
                            })}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            data-testid="library-bulk-delete-confirm"
                            onClick={() => void bulkDelete()}
                          >
                            {t("library.bulk.deleteYes")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmingBulkDelete(false)}
                          >
                            {t("library.bulk.deleteNo")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            data-testid="library-bulk-delete"
                            onClick={() => setConfirmingBulkDelete(true)}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            {t("library.bulk.delete")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-testid="library-bulk-export"
                            onClick={() =>
                              void sessions.exportRows([...liveSelection])
                            }
                          >
                            <Download className="size-3.5" aria-hidden="true" />
                            {t("library.bulk.export")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  <ul className="grid gap-1.5" data-testid="sessions-list">
                    {visibleCards.map((card) => (
                      <LibraryCard
                        key={card.id}
                        card={card}
                        paceUnit={paceUnit}
                        renaming={
                          renaming?.id === card.id ? renaming.name : null
                        }
                        confirmingDelete={confirmingDelete === card.id}
                        checked={liveSelection.has(card.id)}
                        onToggle={(next) =>
                          setSelected((current) => {
                            const updated = new Set(current);
                            if (next) updated.add(card.id);
                            else updated.delete(card.id);
                            return updated;
                          })
                        }
                        onRenameStart={() =>
                          setRenaming({ id: card.id, name: card.name })
                        }
                        onRenameChange={(name) =>
                          setRenaming({ id: card.id, name })
                        }
                        onRenameCommit={() => {
                          if (renaming !== null) {
                            void sessions.renameRow(card.id, renaming.name);
                          }
                          setRenaming(null);
                        }}
                        onRenameCancel={() => setRenaming(null)}
                        onDelete={() =>
                          setConfirmingDelete((current) =>
                            current === card.id ? null : card.id,
                          )
                        }
                        onDeleteConfirm={() => {
                          void sessions.deleteRow(card.id);
                          setConfirmingDelete(null);
                        }}
                        onDeleteCancel={() => setConfirmingDelete(null)}
                        onExport={() => void sessions.exportRow(card.id)}
                        onOpen={() => {
                          void sessions.openRow(card.id).then((opened) => {
                            if (opened) close();
                          });
                        }}
                      />
                    ))}
                    {visibleCards.length === 0 && filter.trim().length > 0 && (
                      <li className="text-[12.5px] text-muted-foreground">
                        {t("library.filter.placeholder")}
                      </li>
                    )}
                  </ul>
                </>
              )}
            </section>

            {/* IMPORT + OPEN — the portable file doors. */}
            <section
              aria-label={t("shared.sessions.filesSectionAria")}
              className="grid gap-2"
            >
              <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <FileJson className="size-3.5" aria-hidden="true" />
                {t("shared.sessions.filesHeading")}
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
                  {t("shared.sessions.importButton")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="sessions-open-file-button"
                  onClick={() => openInputRef.current?.click()}
                >
                  <FolderOpen className="size-3.5" aria-hidden="true" />
                  {t("shared.sessions.openFileButton")}
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
                {t("shared.sessions.openFileNote")}
              </p>
            </section>
          </>
        )}

        {tab === "records" && (
          <LibraryRecords records={library.records} paceUnit={paceUnit} />
        )}
        {tab === "trends" && (
          <LibraryTrends
            volumeWeek={library.volumeWeek}
            volumeMonth={library.volumeMonth}
            fitness={library.fitness}
            paceUnit={paceUnit}
          />
        )}
        {tab === "segments" && (
          <LibrarySegments
            segments={segments}
            paceUnit={paceUnit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// The library card (§24.1): the shelf row grown into a card
// ---------------------------------------------------------------------------

function LibraryCard({
  card,
  paceUnit,
  renaming,
  confirmingDelete,
  checked,
  onToggle,
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
  card: LibraryCardRow;
  paceUnit: "km" | "mi";
  renaming: string | null;
  confirmingDelete: boolean;
  checked: boolean;
  onToggle: (next: boolean) => void;
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
  const { t } = useI18n();
  const index = card.index;

  const stats: string[] = [];
  if (index !== null) {
    stats.push(formatDistanceForUnit(index.distanceM, paceUnit));
    stats.push(formatDurationMs(index.movingTimeMs));
    if (index.movingTimeMs > 0 && index.distanceM > 0) {
      stats.push(
        formatPace(index.movingTimeMs, index.distanceM, paceUnit),
      );
    }
    if (index.gainM !== null) stats.push(formatElevationMeters(index.gainM));
    if (index.avgHrBpm !== null) {
      stats.push(t("library.card.avgHr") + ` ${Math.round(index.avgHrBpm)}`);
    }
  }

  return (
    <li
      data-testid="sessions-row"
      className="grid gap-1.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          data-testid="library-card-select"
          aria-label={t("library.selectAria", { name: card.name })}
          onChange={(event) => onToggle(event.target.checked)}
          className="size-3.5 shrink-0 accent-[var(--signal)]"
        />
        <StatusBadge tone="outline">{t(savedSessionSectionKey(card.section))}</StatusBadge>
        {renaming !== null ? (
          <>
            <label className="sr-only" htmlFor={`rename-${card.id}`}>
              {t("shared.sessions.renameLabel", { name: card.name })}
            </label>
            <input
              id={`rename-${card.id}`}
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
              {t("shared.sessions.renameCommit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRenameCancel}
            >
              {t("shared.sessions.renameCancel")}
            </Button>
          </>
        ) : (
          <>
            <span
              className="min-w-0 flex-1 truncate text-[13.5px] font-semibold"
              title={card.name}
            >
              {card.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-testid="sessions-rename-button"
                aria-label={t("shared.sessions.renameAria", { name: card.name })}
                className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                onClick={onRenameStart}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="sessions-export-button"
                aria-label={t("shared.sessions.exportAria", { name: card.name })}
                className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                onClick={onExport}
              >
                <Download className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="sessions-delete-button"
                aria-label={t("shared.sessions.deleteAria", { name: card.name })}
                className="rounded-[5px] p-1.5 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* The card's numbers (§24.1) — or its honest status. */}
      {card.status === "indexed" && index !== null ? (
        <div data-testid="library-card-stats" className="grid gap-0.5">
          <p className="font-mono text-[11.5px] tabular-nums text-ink">
            {stats.join(" · ")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("library.card.activityDate")}:{" "}
            {index.activityStartMs === null
              ? "—"
              : formatDateTime(index.activityStartMs)}
            {index.reconstructedDistanceM > 0
              ? ` · ${t("library.card.repaired", {
                  distance: formatDistanceForUnit(
                    index.reconstructedDistanceM,
                    paceUnit,
                  ),
                })}`
              : ""}
          </p>
        </div>
      ) : card.status === "planned" ? (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("library.card.planned")}
        </p>
      ) : card.status === "failed" ? (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("library.card.failed")}
        </p>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          {t("library.card.pending")}
        </p>
      )}

      <p className="text-[11.5px] text-muted-foreground">
        {t("shared.sessions.updated", { date: formatDateTime(card.updatedAt) })}
      </p>
      {confirmingDelete ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[7px] border-[1.25px] border-signal bg-signal/[0.05] px-2.5 py-1.5">
          <span className="text-[12px] font-semibold text-ink">
            {t("shared.sessions.deleteConfirm")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            data-testid="sessions-delete-confirm"
            onClick={onDeleteConfirm}
          >
            {t("shared.sessions.deleteButton")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDeleteCancel}
          >
            {t("shared.sessions.keepButton")}
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
          {t("shared.sessions.openButton")}
        </button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Filter + sort (§24.1) — pure helpers
// ---------------------------------------------------------------------------

function filterCards(
  cards: readonly LibraryCardRow[],
  filter: string,
): LibraryCardRow[] {
  const needle = filter.trim().toLowerCase();
  if (needle.length === 0) return [...cards];
  return cards.filter((card) =>
    card.name.toLowerCase().includes(needle),
  );
}

function sortCards(cards: LibraryCardRow[], sort: SortMode): LibraryCardRow[] {
  const byDate = (a: LibraryCardRow, b: LibraryCardRow) =>
    b.updatedAt - a.updatedAt;
  switch (sort) {
    case "oldest":
      return [...cards].sort((a, b) => a.updatedAt - b.updatedAt);
    case "name":
      return [...cards].sort((a, b) => a.name.localeCompare(b.name));
    case "distance":
      return [...cards].sort(
        (a, b) => (b.index?.distanceM ?? -1) - (a.index?.distanceM ?? -1),
      );
    case "duration":
      return [...cards].sort(
        (a, b) =>
          (b.index?.movingTimeMs ?? -1) - (a.index?.movingTimeMs ?? -1),
      );
    case "recent":
    default:
      return [...cards].sort(byDate);
  }
}
