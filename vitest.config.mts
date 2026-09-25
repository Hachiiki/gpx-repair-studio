import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration — unit/component tests for domain modules.
 *
 * - Resolves the `@/*` path alias exactly like the app's tsconfig.
 * - Tests may live next to domain code (as sibling .test.ts files) or in
 *   tests/ (project-level architecture tests).
 * - Node environment: domain modules are pure TypeScript (no DOM needed).
 *   Component tests added in later phases can override with
 *   `// @vitest-environment jsdom` per file or via a projects setup.
 */
export default defineConfig({
  // Vitest must never run the app's PostCSS/Tailwind pipeline (component
  // tests import maplibre-gl's stylesheet, which is a build-time concern
  // only). An inline empty postcss config also stops Vite from trying to
  // load postcss.config.mjs, whose Tailwind 4 plugin it cannot parse.
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // maplibre-gl's stylesheet is a build-time concern; alias it to a
      // stub so component tests don't drag the PostCSS pipeline in.
      "maplibre-gl/dist/maplibre-gl.css": path.resolve(
        process.cwd(),
        "tests/helpers/empty-stub.css",
      ),
    },
  },
  test: {
    environment: "node",
    // Component tests import maplibre-gl's stylesheet (a build-time
    // concern); vitest must not drag the app's PostCSS/Tailwind pipeline
    // into unit runs — replace all CSS with empty modules.
    css: false,
    // .test.ts = domain/architecture tests (node); .test.tsx = RTL
    // component tests (each carries a `// @vitest-environment jsdom`
    // docblock, Phase 2+).
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      // Phase 1 acceptance (docs/MASTER_PLAN.md §C-3): >= 90% line coverage on
      // domain modules. Scope measurement to the domain surface; fixture data
      // files (.gpx) are not code. Phase 2 extends the scope with
      // features/statistics and the format utility.
      include: [
        "src/types/**",
        "src/lib/geo/**",
        "src/features/gpx/**",
        "src/features/statistics/**",
        // Task 20: the share card's pure joins (content derivation).
        "src/features/share/**",
        // Task 20: the share card's pure layout math + artwork data
        // (render.ts/fonts.ts are browser-only, E2E covered — like the
        // MapLibre controller, they stay out of the scope).
        "src/lib/share/layout.ts",
        "src/lib/share/artwork.ts",
        // Phase 4: the pure reconstruction domain (draw model, resample,
        // snap). The editor store is app-layer state exercised by its own
        // test file; the MapLibre controller stays browser-only (E2E).
        "src/features/reconstruction/**",
        "src/lib/utils/xml.ts",
        "src/lib/utils/format.ts",
        // Phase 3: the pure map modules (provider registry, GeoJSON
        // builders). The MapLibre controller itself is browser-only
        // (WebGL) and covered by E2E, so it stays out of the scope.
        "src/lib/map/styles.ts",
        "src/lib/map/geojson.ts",
      ],
      exclude: ["src/features/gpx/fixtures/files/**"],
      thresholds: {
        lines: 90,
      },
    },
  },
});
