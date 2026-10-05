import type { MetadataRoute } from "next";

/**
 * The web app manifest (Phase 22.1 — §EE 22.1): what the browser needs
 * to offer "Install app" and run it standalone, away from a tab.
 *
 * Served by Next's metadata route convention at /manifest.webmanifest
 * (works under output: "standalone" — it is just a route).
 *
 * The colors are the EXACT sRGB render of globals.css's --background
 * oklch values (computed once by scripts/generate-pwa-icons.mjs):
 * the manifest itself cannot switch on the OS theme, so it carries
 * the light values, and layout.tsx ships the pair of
 * prefers-color-scheme <meta name="theme-color"> tags — together both
 * themes are covered.
 *
 * Icons are the same route mark as the favicon (public/logo.svg),
 * rasterized deterministically by scripts/generate-pwa-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GPX Repair Studio",
    short_name: "GPX Repair",
    description:
      "Repair and reconstruct incomplete GPX running activities — locally in your browser. No GPX data ever leaves your device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F1F1F2",
    theme_color: "#F1F1F2",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
