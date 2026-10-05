/**
 * InfoContent (Phase 11) — the "Privacy & Data" and "About" panes.
 *
 * The §M-3 disclosure, in full: the exact egress table (§M-2, updated
 * for the shipped road-follow pens — the plan's original two-row table
 * predates Tasks 44–50), what works offline, how to switch every
 * provider, and exactly what this device stores (Phase 10's IndexedDB
 * sessions + the settings key). Plus the About pane's attribution for
 * the open data and software the app is built on.
 *
 * Copy discipline — the same contract the landing teaches with: every
 * claim here describes shipped behavior, pinned to the code by tests
 * (tests/info-content.test.tsx asserts the provider names/hosts this
 * page names match the constants in lib/map/styles.ts,
 * features/elevation, and features/reconstruction/roadFollow.ts, so a
 * provider change that forgets this page fails the suite).
 *
 * Pure presentation, no props — the InfoDialog hosts it.
 */

"use client";

import { useState } from "react";
import { APP_VERSION } from "@/components/layout/app-version";
import { Button } from "@/components/ui/button";
import { useRouterSettings } from "@/hooks/road-router";
import { useOfflineCaches } from "@/hooks/use-offline-caches";
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";

/* ------------------------------------------------------------------ */
/* Privacy & Data                                                      */
/* ------------------------------------------------------------------ */

/**
 * The egress table's rows — the complete list of what ever leaves the
 * browser (§M-2). Exported for the pinning tests.
 */
export interface EgressRow {
  /** What the user does that triggers it. */
  trigger: string;
  /** The service(s) contacted — display names. */
  destination: string;
  /** The exact hosts — pinned to source constants by tests. */
  hosts: string;
  /** What is actually sent, and what is deliberately never sent. */
  payload: string;
}

/**
 * The egress table's rows — the complete list of what ever leaves the
 * browser (§M-2). Resolved per locale through the translator;
 * exported for the pinning tests. The `hosts` column is technical
 * (pinned to source constants by tests) and stays literal.
 */
export function getEgressRows(t: TranslatorArg): readonly EgressRow[] {
  return [
    {
      trigger: t("info.privacy.egress.tiles.trigger"),
      destination: t("info.privacy.egress.tiles.destination"),
      hosts: "tiles.openfreemap.org · tile.openstreetmap.org",
      payload: t("info.privacy.egress.tiles.payload"),
    },
    {
      trigger: t("info.privacy.egress.road.trigger"),
      destination: t("info.privacy.egress.road.destination"),
      hosts: "router.project-osrm.org · valhalla1.openstreetmap.de",
      payload: t("info.privacy.egress.road.payload"),
    },
    {
      trigger: t("info.privacy.egress.elevation.trigger"),
      destination: t("info.privacy.egress.elevation.destination"),
      hosts: "api.open-meteo.com",
      payload: t("info.privacy.egress.elevation.payload"),
    },
  ];
}

export function PrivacyPane() {
  const { t } = useI18n();
  const egressRows = getEgressRows(t);
  return (
    <div className="space-y-6" data-testid="privacy-pane">
      {/* The promise — §M-1. */}
      <section className="space-y-2">
        <h3 className="text-[17px] font-bold tracking-tight">
          {t("info.privacy.promise.title")}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {t("info.privacy.promise.body")}
        </p>
      </section>

      {/* The egress table — §M-2, the complete list. */}
      <section className="space-y-2" aria-labelledby="privacy-egress-heading">
        <h3
          id="privacy-egress-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          {t("info.privacy.egress.title")}
        </h3>
        <div className="overflow-x-auto rounded-[10px] border-[1.5px] border-ink">
          <table
            className="w-full border-collapse text-left"
            data-testid="privacy-egress-table"
          >
            <thead>
              <tr className="border-b-[1.5px] border-ink bg-ink/[0.04]">
                <th
                  scope="col"
                  className="w-[38%] px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-shade"
                >
                  {t("info.privacy.egress.whenWhere")}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-shade"
                >
                  {t("info.privacy.egress.whatSent")}
                </th>
              </tr>
            </thead>
            <tbody>
              {egressRows.map((row) => (
                <tr
                  key={row.trigger}
                  className="border-b-[1.5px] border-ink/10 align-top last:border-b-0"
                >
                  <td className="px-3 py-2.5">
                    <p className="text-[12.5px] font-semibold leading-snug">
                      {row.trigger}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                      {row.destination}
                    </p>
                    <p className="mt-1 font-mono text-[11px] tracking-[0.01em] text-shade">
                      {row.hosts}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {row.payload}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {t("info.privacy.egress.footnote")}
        </p>
      </section>

      {/* Offline behavior. */}
      <section className="space-y-2" aria-labelledby="privacy-offline-heading">
        <h3
          id="privacy-offline-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          {t("info.privacy.offline.title")}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {t("info.privacy.offline.body")}
        </p>
      </section>

      {/* Provider switching. */}
      <section className="space-y-2" aria-labelledby="privacy-providers-heading">
        <h3
          id="privacy-providers-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          {t("info.privacy.providers.title")}
        </h3>
        <ul role="list" className="space-y-1.5">
          <li className="text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              {t("info.privacy.providers.basemapLabel")}
            </span>{" "}
            {t("info.privacy.providers.basemapBody")}
          </li>
          <li className="text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              {t("info.privacy.providers.roadLabel")}
            </span>{" "}
            {t("info.privacy.providers.roadBody")}
          </li>
          <li className="text-[13.5px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              {t("info.privacy.providers.elevationLabel")}
            </span>{" "}
            {t("info.privacy.providers.elevationBody")}
          </li>
        </ul>
        {/*
         * §EE 17.1 — the routing provider setting itself: one URL,
         * validated honestly, applied/reset right here where the
         * disclosure lives. Remembered as a preference; consent stays
         * separate and per-session.
         */}
        <RouterSettingsControl />
      </section>

      {/* Storage on this device — the Phase 10 disclosure in full. */}
      <section className="space-y-2" aria-labelledby="privacy-storage-heading">
        <h3
          id="privacy-storage-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          {t("info.privacy.storage.title")}
        </h3>
        <ul role="list" className="space-y-2">
          <li
            className="rounded-[10px] border-[1.5px] border-ink/15 p-3"
            data-testid="privacy-storage-settings"
          >
            <p className="text-[13px] font-semibold">
              {t("info.privacy.storage.settingsTitle")}
            </p>
            {/* Storage key names shown VERBATIM (machine values) */}
            <p className="mt-1 font-mono text-[11px] text-shade">
              {"gpx-repair-studio.settings.v1"}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {t("info.privacy.storage.settingsBody")}
            </p>
          </li>
          <li
            className="rounded-[10px] border-[1.5px] border-ink/15 p-3"
            data-testid="privacy-storage-sessions"
          >
            <p className="text-[13px] font-semibold">
              {t("info.privacy.storage.sessionsTitle")}
            </p>
            <p className="mt-1 font-mono text-[11px] text-shade">
              {"gpx-repair-studio.sessions"}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {t("info.privacy.storage.sessionsBody")}
            </p>
          </li>
        </ul>
        {/*
         * §EE 22.3 — the Phase 22 caches: persisted elevation terrain
         * and the service worker's offline copies, each disclosed and
         * each clearable right here, where the storage disclosure
         * lives. The controls are one hook; the rows are copy.
         */}
        <OfflineCachesControl />
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {t("info.privacy.storage.footnote")}
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Offline caches control (§EE 22.3)                                    */
/* ------------------------------------------------------------------ */

/**
 * The two Phase 22 cache rows — persisted elevation terrain and the
 * service worker's offline app/tile copies — each with its live
 * count (when the platform allows one) and its Clear button. Uses the
 * RouterSettingsControl's saved/error pattern: inline role=status
 * confirmations, no toasts, no reloads.
 */
function OfflineCachesControl() {
  const { t } = useI18n();
  const cachesState = useOfflineCaches();

  return (
    <ul role="list" className="space-y-2" data-testid="privacy-storage-caches">
      <li className="rounded-[10px] border-[1.5px] border-ink/15 p-3">
        <p className="text-[13px] font-semibold">
          {t("info.privacy.storage.elevationTitle")}
        </p>
        <p className="mt-1 font-mono text-[11px] text-shade">
          {"gpx-repair-studio.elevation"}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {t("info.privacy.storage.elevationBody")}
        </p>
        <p
          className="mt-1 font-mono text-[11px] text-shade"
          data-testid="privacy-elevation-count"
        >
          {cachesState.elevationCount === null
            ? t("info.privacy.storage.unavailable")
            : t("info.privacy.storage.elevationCount", {
                count: cachesState.elevationCount.toLocaleString(),
              })}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[12px] text-muted-foreground"
            data-testid="privacy-elevation-clear"
            disabled={cachesState.clearing || cachesState.elevationCount === 0}
            onClick={cachesState.clearElevation}
          >
            {t("info.privacy.storage.elevationClear")}
          </Button>
          {cachesState.elevationClearedCount !== null && (
            <p
              className="text-[11.5px] font-medium text-muted-foreground"
              data-testid="privacy-elevation-cleared"
              role="status"
            >
              {t("info.privacy.storage.elevationCleared", {
                count: cachesState.elevationClearedCount.toLocaleString(),
              })}
            </p>
          )}
        </div>
      </li>
      <li className="rounded-[10px] border-[1.5px] border-ink/15 p-3">
        <p className="text-[13px] font-semibold">
          {t("info.privacy.storage.offlineTitle")}
        </p>
        <p className="mt-1 font-mono text-[11px] text-shade">
          {"gpx-repair-studio.precache / .runtime / .tiles"}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {t("info.privacy.storage.offlineBody")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[12px] text-muted-foreground"
            data-testid="privacy-offline-clear"
            disabled={cachesState.clearing}
            onClick={cachesState.clearOffline}
          >
            {t("info.privacy.storage.offlineClear")}
          </Button>
          {cachesState.offlineCleared && (
            <p
              className="text-[11.5px] font-medium text-muted-foreground"
              data-testid="privacy-offline-cleared"
              role="status"
            >
              {t("info.privacy.storage.offlineCleared")}
            </p>
          )}
        </div>
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

/**
 * The open-data / open-software credits, resolved per locale through
 * the translator — exported for the pinning tests. The `name` column
 * is third-party product names (locale-invariant, like the wordmark);
 * the credit lines are copy.
 */
export function getAttributions(
  t: TranslatorArg,
): readonly { name: string; credit: string }[] {
  return [
    {
      name: "MapLibre GL JS",
      credit: t("info.about.credit.mapLibre"),
    },
    {
      name: "OpenFreeMap & OpenStreetMap",
      credit: t("info.about.credit.tiles"),
    },
    {
      name: "OSRM & Valhalla",
      credit: t("info.about.credit.routing"),
    },
    {
      name: "Open-Meteo — Copernicus DEM GLO-90",
      credit: t("info.about.credit.elevation"),
    },
    {
      name: "Archivo, Big Shoulders, IBM Plex Mono & Montserrat",
      credit: t("info.about.credit.fonts"),
    },
  ];
}

export function AboutPane() {
  const { t } = useI18n();
  const attributions = getAttributions(t);
  return (
    <div className="space-y-6" data-testid="about-pane">
      <section className="space-y-2">
        <h3 className="text-[17px] font-bold tracking-tight">
          {t("info.about.title")}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {t("info.about.p1")}
        </p>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {t("info.about.p2Prefix")}{" "}
          <span className="font-semibold text-foreground">
            {t("info.about.p2Principle")}
          </span>
          {t("info.about.p2Rest")}
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="about-attribution-heading">
        <h3
          id="about-attribution-heading"
          className="text-[17px] font-bold tracking-tight"
        >
          {t("info.about.attributionsTitle")}
        </h3>
        <ul role="list" className="space-y-2.5">
          {attributions.map((entry) => (
            <li
              key={entry.name}
              data-testid="about-attribution-row"
              className="border-l-[1.5px] border-ink/20 pl-3"
            >
              <p className="text-[13px] font-semibold leading-snug">
                {entry.name}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {entry.credit}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p
        className="border-t-[1.5px] border-ink/15 pt-4 font-mono text-[11px] tracking-[0.04em] text-shade"
        data-testid="about-version"
      >
        {t("info.about.version", { version: APP_VERSION })}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Router settings (§EE 17.1)                                          */
/* ------------------------------------------------------------------ */

/**
 * RouterSettingsControl — the routing provider setting, one URL.
 *
 * Point it at any OSRM-compatible routing server (a self-hosted
 * osrm-routed, or any service speaking the same /route/v1 API) and
 * BOTH path styles plus Snap-to-road route there instead of the public
 * demo servers. The URL is a preference (remembered); the consent to
 * contact ANY router stays per-session and separate — this control
 * never enables anything by itself.
 *
 * The self-hosting pointer stays one line here; the README carries
 * the full instructions.
 */
function RouterSettingsControl() {
  const { t } = useI18n();
  const settings = useRouterSettings();
  const [draft, setDraft] = useState(settings.current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = (settings.current ?? "") !== draft.trim();

  return (
    <div
      className="mt-2 grid gap-2 rounded-[10px] border-[1.5px] border-ink/15 bg-ink/[0.02] p-3"
      data-testid="router-settings"
    >
      <p className="text-[12.5px] font-semibold text-foreground">
        {t("info.privacy.router.title")}
      </p>
      <label className="grid gap-1 text-[12px] text-muted-foreground">
        {t("info.privacy.router.label")}
        <input
          type="url"
          inputMode="url"
          spellCheck={false}
          className="h-8 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2.5 font-mono text-[11.5px] text-foreground transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
          data-testid="router-url-input"
          /* An example URL — the machine format, not copy */
          placeholder={"https://osrm.example.com"}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
            setSaved(false);
          }}
        />
      </label>
      {error && (
        <p
          className="text-[11.5px] font-medium text-destructive"
          data-testid="router-url-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {saved && !error && (
        <p
          className="text-[11.5px] font-medium text-muted-foreground"
          data-testid="router-url-saved"
          role="status"
        >
          {t("info.privacy.router.saved")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-7 text-[12px]"
          data-testid="router-url-apply"
          disabled={!dirty}
          onClick={() => {
            const verdict = settings.validate(draft);
            if (!verdict.ok) {
              setError(t(verdict.reasonKey));
              return;
            }
            settings.apply(draft);
            setDraft(verdict.value ?? "");
            setError(null);
            setSaved(true);
          }}
        >
          {t("info.privacy.router.save")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[12px] text-muted-foreground"
          data-testid="router-url-reset"
          disabled={settings.current === null && draft.trim() === ""}
          onClick={() => {
            settings.reset();
            setDraft("");
            setError(null);
            setSaved(false);
          }}
        >
          {t("info.privacy.router.reset")}
        </Button>
      </div>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {t("info.privacy.router.note")}
      </p>
    </div>
  );
}
