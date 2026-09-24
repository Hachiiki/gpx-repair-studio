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
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Phase 1 acceptance (docs/MASTER_PLAN.md §C-3): >= 90% line coverage on
      // domain modules. Scope measurement to the domain surface; fixture data
      // files (.gpx) are not code.
      include: [
        "src/types/**",
        "src/lib/geo/**",
        "src/features/gpx/**",
        "src/lib/utils/xml.ts",
      ],
      exclude: ["src/features/gpx/fixtures/files/**"],
      thresholds: {
        lines: 90,
      },
    },
  },
});
