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
  },
});
