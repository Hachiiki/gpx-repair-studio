import type { Metadata } from "next";
import { Archivo, Big_Shoulders, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
         * Phase 12 — the pre-paint theme script. It reads the same raw
         * localStorage key src/state/theme-store.ts writes (kept in sync
         * by tests/theme.test.ts) and sets the .dark class + color-scheme
         * BEFORE the first paint, so a dark-theme user never sees a
         * light flash. suppressHydrationWarning on <html> above absorbs
         * the class the script adds ahead of React. This is the classic
         * hand-rolled next-themes pattern — no dependency, no flash.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("gpx-repair-studio.theme.v1");var p=s==="light"||s==="dark"||s==="system"?s:"system";var d=p==="dark"||(p==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
