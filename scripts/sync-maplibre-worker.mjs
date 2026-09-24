#!/usr/bin/env node
/**
 * Sync the MapLibre GL worker assets into `public/vendor/`.
 *
 * MapLibre GL v6 resolves its web worker at runtime via a URL relative to
 * `import.meta.url` (dist/maplibre-gl.mjs → `./maplibre-gl-worker.mjs`).
 * That sibling file is not reachable once a bundler (Turbopack/webpack)
 * processes the package, so the app pins the worker explicitly with
 * `setWorkerUrl("/vendor/maplibre-gl-worker.mjs")` (see
 * src/lib/map/mapController.ts) and serves copies of the worker files as
 * static assets.
 *
 * This script keeps those copies in lock-step with the installed package:
 *   - copies `dist/maplibre-gl-worker.mjs` and `dist/maplibre-gl-shared.mjs`
 *     (the worker's only import) into `public/vendor/`;
 *   - writes `public/vendor/maplibre-gl-worker.manifest.json` recording the
 *     package version and SHA-256 of each file.
 *
 * The manifest is asserted by `tests/map-styles.test.ts` (public copy must
 * match `node_modules` byte-for-byte), so a dependency upgrade that forgets
 * to re-run this script fails the test suite, not the map at runtime.
 *
 * Run via `bun run sync:maplibre-worker` (also a postinstall hook).
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const pkg = require("maplibre-gl/package.json");
const distDir = join(projectRoot, "node_modules", "maplibre-gl", "dist");
const vendorDir = join(projectRoot, "public", "vendor");

/** Worker entry + its only sibling import — keep in sync with the package. */
const WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(vendorDir, { recursive: true });

const manifest = {
  package: "maplibre-gl",
  version: pkg.version,
  files: {},
};

for (const name of WORKER_FILES) {
  const source = join(distDir, name);
  const target = join(vendorDir, name);
  const bytes = readFileSync(source);
  copyFileSync(source, target);
  manifest.files[name] = createHash("sha256").update(bytes).digest("hex");
  console.log(
    `synced ${name} (${(bytes.length / 1024).toFixed(0)} KB, maplibre-gl ${pkg.version})`,
  );
}

writeFileSync(
  join(vendorDir, "maplibre-gl-worker.manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(
  `wrote public/vendor/maplibre-gl-worker.manifest.json (maplibre-gl ${pkg.version})`,
);
