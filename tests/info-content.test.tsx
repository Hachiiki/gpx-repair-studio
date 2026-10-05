// @vitest-environment jsdom
/**
 * Unit tests — the About / "Privacy & Data" content (Phase 11).
 *
 * The pinning discipline (info-content.tsx's header): the privacy
 * pane names providers and hosts, so these tests pin that copy to the
 * REAL constants — lib/map/styles.ts, features/elevation/*, and
 * features/reconstruction/roadFollow.ts. A provider or endpoint
 * change that forgets the disclosure page fails here, not in
 * production. The version shown in About is pinned to package.json.
 *
 * Also covers the InfoDialog host (tab switching, pane rendering,
 * close intent, arrow-key traversal) and the SiteFooter links.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAttributions,
  getEgressRows,
  PrivacyPane,
  AboutPane,
} from "@/components/layout/info-content";
import { APP_VERSION } from "@/components/layout/app-version";
import { InfoDialog, type InfoPane } from "@/components/layout/info-dialog";
import { SiteFooter } from "@/components/layout/site-footer";
import { MAP_TILE_PROVIDERS } from "@/lib/map/styles";
import { OPEN_METEO_HOST } from "@/features/elevation/openmeteo";
import { enTranslator } from "@/hooks/use-i18n";

afterEach(() => cleanup());

/* ------------------------------------------------------------------ */
/* Copy pinning — the disclosure must match the code                  */
/* ------------------------------------------------------------------ */

describe("privacy copy is pinned to the real providers", () => {
  it("names every user-selectable tile provider's real host", () => {
    const text = getEgressRows(enTranslator)
      .map((r) => `${r.destination} ${r.hosts}`)
      .join(" ");
    for (const provider of Object.values(MAP_TILE_PROVIDERS)) {
      if (!provider.attribution) continue;
      // Only the tile sources with real URLs must appear.
      const urls = JSON.stringify(provider.style).match(/https:\/\/[^"/]+/g) ?? [];
      for (const url of urls) {
        expect(text).toContain(url.replace("https://", ""));
      }
    }
  });

  it("names the Open-Meteo elevation host exactly", () => {
    expect(
      getEgressRows(enTranslator).some((r) => r.hosts.includes(OPEN_METEO_HOST)),
    ).toBe(true);
  });

  it("names the routing endpoints exactly (OSRM + Valhalla)", () => {
    const hosts = getEgressRows(enTranslator)
      .map((r) => r.hosts)
      .join(" ");
    expect(hosts).toContain("router.project-osrm.org");
    expect(hosts).toContain("valhalla1.openstreetmap.de");
  });

  it("lists exactly three egress rows — no silent additions", () => {
    expect(getEgressRows(enTranslator)).toHaveLength(3);
  });

  it("the offline section matches the real offline fallback", () => {
    render(<PrivacyPane />);
    // The plain-background fallback (BLANK_STYLE) is real; the route
    // still renders on it. The copy must teach exactly that.
    expect(
      screen.getByText(/falls back to a plain background/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/still render on it/i)).toBeInTheDocument();
  });

  it("names both on-device storage keys exactly", () => {
    render(<PrivacyPane />);
    expect(screen.getByText("gpx-repair-studio.settings.v1")).toBeInTheDocument();
    expect(screen.getByText("gpx-repair-studio.sessions")).toBeInTheDocument();
  });

  it("discloses the Phase 22 caches with their real storage names", () => {
    render(<PrivacyPane />);
    // The elevation terrain store (Phase 22.3).
    expect(
      screen.getByText("gpx-repair-studio.elevation"),
    ).toBeInTheDocument();
    // The service worker's three caches (Phase 22.2), named together.
    expect(
      screen.getByText("gpx-repair-studio.precache / .runtime / .tiles"),
    ).toBeInTheDocument();
    // Both Clear buttons exist.
    expect(
      screen.getByTestId("privacy-elevation-clear"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("privacy-offline-clear")).toBeInTheDocument();
  });

  it("the offline section still teaches the tile-less fallback", () => {
    render(<PrivacyPane />);
    expect(
      screen.getByText(/falls back to a plain background/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/still render on it/i)).toBeInTheDocument();
    // Phase 22: the app itself now opens offline after the first visit.
    expect(
      screen.getByText(/opens with the network off/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/mountains included/i)).toBeInTheDocument();
  });
});

describe("about copy is pinned to the real credits", () => {
  it("carries the elevation attribution verbatim", async () => {
    const { OpenMeteoProvider } = await import(
      "@/features/elevation/openmeteo"
    );
    const provider = new OpenMeteoProvider({
      fetch: vi.fn(),
      now: vi.fn(() => 0),
      sleep: vi.fn(),
    });
    expect(
      getAttributions(enTranslator).some((a) => a.name.includes("Open-Meteo")),
    ).toBe(true);
    expect(
      getAttributions(enTranslator).find((a) =>
        a.name.includes("Copernicus"),
      )?.credit,
    ).toContain("© Open-Meteo.com");
    expect(provider.attribution).toContain("Open-Meteo");
  });

  it("credits MapLibre, OpenFreeMap/OSM, and the fonts", () => {
    const names = getAttributions(enTranslator)
      .map((a) => a.name)
      .join(" ");
    expect(names).toContain("MapLibre");
    expect(names).toContain("OpenFreeMap");
    expect(names).toContain("OSRM");
    expect(names).toContain("Montserrat");
  });

  it("the version matches package.json (release bump guard)", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    );
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("AboutPane shows the version line", () => {
    render(<AboutPane />);
    expect(screen.getByTestId("about-version")).toHaveTextContent(
      `Version ${APP_VERSION}`,
    );
  });
});

/* ------------------------------------------------------------------ */
/* InfoDialog — the host                                               */
/* ------------------------------------------------------------------ */

describe("InfoDialog", () => {
  it("renders nothing while closed", () => {
    const onPaneChange = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <InfoDialog pane={null} onPaneChange={onPaneChange} onClose={onClose} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens on the privacy pane with the full disclosure", () => {
    render(
      <InfoDialog
        pane="privacy"
        onPaneChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("privacy-pane")).toBeInTheDocument();
    expect(screen.getByTestId("privacy-egress-table")).toBeInTheDocument();
    expect(screen.getByTestId("info-tab-privacy")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opens on the about pane with attributions", () => {
    render(
      <InfoDialog pane="about" onPaneChange={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId("about-pane")).toBeInTheDocument();
    expect(screen.getAllByTestId("about-attribution-row").length).toBe(
      getAttributions(enTranslator).length,
    );
  });

  it("tab clicks switch panes without closing", () => {
    const onPaneChange = vi.fn();
    const onClose = vi.fn();
    render(
      <InfoDialog
        pane="about"
        onPaneChange={onPaneChange}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("info-tab-privacy"));
    expect(onPaneChange).toHaveBeenCalledWith("privacy");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("arrow keys walk the tablist", () => {
    // State-driven: onPaneChange feeds the pane back in, like the shell.
    function StatefulInfoDialog() {
      const [pane, setPane] = useState<InfoPane>("about");
      return (
        <InfoDialog
          pane={pane}
          onPaneChange={setPane}
          onClose={() => setPane("about")}
        />
      );
    }
    render(<StatefulInfoDialog />);
    const tablist = screen.getByRole("tablist");
    expect(screen.getByTestId("about-pane")).toBeInTheDocument();
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByTestId("privacy-pane")).toBeInTheDocument();
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByTestId("about-pane")).toBeInTheDocument();
    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByTestId("privacy-pane")).toBeInTheDocument();
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByTestId("about-pane")).toBeInTheDocument();
    // An unhandled key changes nothing.
    fireEvent.keyDown(tablist, { key: "Enter" });
    expect(screen.getByTestId("about-pane")).toBeInTheDocument();
  });

  it("wires tab aria-controls to the open panel", () => {
    render(
      <InfoDialog pane="privacy" onPaneChange={vi.fn()} onClose={vi.fn()} />,
    );
    const tab = screen.getByTestId("info-tab-privacy");
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
  });
});

/* ------------------------------------------------------------------ */
/* SiteFooter                                                          */
/* ------------------------------------------------------------------ */

describe("SiteFooter", () => {
  it("carries the local-first line and both doors", () => {
    const onOpenInfo = vi.fn();
    render(
      <SiteFooter
        onOpenInfo={onOpenInfo}
        onOpenHelp={vi.fn()}
        routerConsent="unknown"
        routerHostsLabel="router.project-osrm.org"
        onOpenRouterConsent={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/All processing happens in your browser/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("footer-about")).toBeInTheDocument();
    expect(screen.getByTestId("footer-privacy")).toBeInTheDocument();
  });

  it("dispatches the right pane per link", () => {
    const onOpenInfo = vi.fn();
    render(
      <SiteFooter
        onOpenInfo={onOpenInfo}
        onOpenHelp={vi.fn()}
        routerConsent="unknown"
        routerHostsLabel="router.project-osrm.org"
        onOpenRouterConsent={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("footer-about"));
    expect(onOpenInfo).toHaveBeenCalledWith("about");
    fireEvent.click(screen.getByTestId("footer-privacy"));
    expect(onOpenInfo).toHaveBeenCalledWith("privacy");
  });
});
