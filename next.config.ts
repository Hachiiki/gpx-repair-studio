import type { NextConfig } from "next";

/**
 * GPX Repair Studio — Next.js configuration.
 *
 * This application is deliberately serverless / local-first (see docs/MASTER_PLAN.md,
 * Section M): the Next.js server only serves the application bundle. All GPX parsing,
 * reconstruction, calculations, and export run client-side in the browser.
 *
 * `output` remains "standalone" to honor this sandbox's deployment contract
 * (the environment's build/start scripts expect a standalone server output).
 * Static-exportability (`output: "export"`) is verified in an isolated build copy in
 * Phase 0 and permanently guarded by tests/architecture.test.ts, which enforces:
 *   - no API routes (src/app/api/** must not exist),
 *   - no server actions ("use server") anywhere in src/,
 * so the codebase stays export-clean regardless of the deployment target.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  // Quality guards: type errors must fail builds (no silent ignores).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
