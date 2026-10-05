import type { Metadata } from "next";
import { Archivo, Big_Shoulders, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegistrar } from "@/components/layout/sw-registrar";

/*
 * Field Plot type system (Task 33):
 *   Archivo       — the UI voice (bodies, labels, controls)
 *   Big Shoulders — the display voice (wordmark, headings, stat numerals)
 *   IBM Plex Mono — the data voice (coordinates, ids, readouts)
 * Montserrat stays self-hosted in globals.css for one job only: the
 * share card's canvas painter (see src/lib/share/*), which addresses the
 * family by literal name and must not change.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "GPX Repair Studio",
  description:
    "Repair and reconstruct incomplete GPX running activities — locally in your browser. No GPX data ever leaves your device.",
  keywords: ["GPX", "GPS repair", "running", "route reconstruction", "local-first"],
  // The tab icon is the app/icon.svg file convention — the same route mark
  // as public/logo.svg (navbar), served from its OWN url. Favicons are
  // cached by url and survive hard refreshes; a previous release pointed
  // at /logo.svg and browsers kept showing the pre-route glyph forever.
  // The convention route evicts that cache by construction.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${bigShoulders.variable} ${plexMono.variable}`}
    >
      <head>
        {/*
         * Phase 22 — the dual theme-color pair. The manifest itself
         * cannot switch on the OS theme, so it carries the light
         * values; these two metas follow prefers-color-scheme and set
         * the standalone-window / mobile-toolbar chrome to the same
         * --background the app paints (hexes are the exact sRGB render
         * of globals.css's oklch values, printed by
         * scripts/generate-pwa-icons.mjs). An explicit in-app theme
         * choice still honors the OS query at the window chrome — the
         * only place localStorage cannot reach before paint.
         */}
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#F1F1F2"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#151516"
        />
        {/*
         * Phase 12 — the pre-paint theme script. It reads the same raw
         * localStorage key src/state/theme-store.ts writes (kept in sync
         * by tests/theme.test.ts) and sets the .dark class + color-scheme
         * BEFORE the first paint, so a dark-theme user never sees a
         * light flash. suppressHydrationWarning on <html> above absorbs
         * the class the script adds ahead of React. This is the classic
         * hand-rolled next-themes pattern — no dependency, no flash.
         *
         * Phase 21 — the same script also stamps <html lang> from the
         * locale key (?lang= beats storage, mirroring
         * src/i18n/locale.ts's resolution order), so assistive tech
         * hears the right language from the first accessible paint.
         * The prerendered TEXT is still English (the static export's
         * build locale); React settles the translated copy right after
         * hydration through useSyncExternalStore's designed snapshot
         * swap — no mismatch errors, at most one English frame.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("gpx-repair-studio.theme.v1");var p=s==="light"||s==="dark"||s==="system"?s:"system";var d=p==="dark"||(p==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}try{var q=new URLSearchParams(window.location.search).get("lang");var l=q==="en"||q==="zh-CN"||q==="pseudo"?q:null;if(!l){var v=localStorage.getItem("gpx-repair-studio.locale.v1");if(v==="en"||v==="zh-CN")l=v;}if(l)document.documentElement.setAttribute("lang",l==="pseudo"?"en":l);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
        {/*
         * Phase 22 — the offline boot: service-worker registration,
         * the asks-before-reloading update toast, and the persistent
         * elevation cache's hydrate/flush lifecycle. Renders nothing.
         */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
