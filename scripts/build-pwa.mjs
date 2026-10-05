/**
 * build-pwa.mjs — Phase 22.2 (§EE 22.2), the build-time half.
 *
 * Runs AFTER `next build` has produced the standalone output and the
 * package.json build step has copied static/ and public/ into
 * .next/standalone/. It writes two generated files into
 * .next/standalone/public/ (which the standalone server serves at the
 * site root — never committed, always regenerated):
 *
 *   precache-manifest.json — every URL the service worker must fetch
 *     at install: all /_next/static/** chunks (content-hashed), every
 *     public/ asset (logo, PWA icons, fonts, the maplibre worker,
 *     share-card art), plus the app shell "/" and the two route
 *     artifacts /manifest.webmanifest and /icon.svg.
 *
 *   sw.js — the repo's public/sw.js with the real build id appended
 *     (`self.BUILD_ID = "<sha256[:16]>"`). The id changes whenever the
 *     manifest contents change, so every deploy changes the served
 *     sw.js bytes — which is the ONLY signal a browser uses to detect
 *     that an update exists. Without this, deploys would ship new
 *     chunks nobody would ever precache.
 *
 * Run: node scripts/build-pwa.mjs   (wired into `npm run build`)
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next", "standalone");
const STANDALONE_PUBLIC = path.join(STANDALONE, "public");

/** Collect files under a directory as URL paths (posix, rooted). */
async function walk(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      out.push("/" + path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function main() {
  const staticDir = path.join(STANDALONE, ".next", "static");
  const staticUrls = (await walk(staticDir)).map((rel) => "/_next/static" + rel);

  // Everything in public/ — but NOT the repo's sw.js placeholder copy
  // (the versioned one below replaces it) and not robots.txt (crawlers
  // only; the worker never needs it offline).
  const publicUrls = (await walk(STANDALONE_PUBLIC)).filter(
    (url) => url !== "/sw.js" && url !== "/robots.txt",
  );

  // Route artifacts + the app shell itself.
  const routeUrls = ["/", "/manifest.webmanifest", "/icon.svg"];

  const urls = [...new Set([...staticUrls, ...publicUrls, ...routeUrls])].sort();

  if (staticUrls.length === 0) {
    throw new Error(
      "no static chunks under .next/standalone/.next/static — run the full build step first",
    );
  }

  // The build id: a digest of the asset LIST (any chunk change, any
  // added/removed public file, any route change → new id → new bytes).
  const buildId = createHash("sha256").update(JSON.stringify(urls)).digest("hex").slice(0, 16);

  const manifest = {
    buildId,
    generatedAt: new Date().toISOString(),
    urls,
  };
  await writeFile(
    path.join(STANDALONE_PUBLIC, "precache-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  const source = await readFile(path.join(ROOT, "public", "sw.js"), "utf8");
  const versioned = `${source}\n/* build-pwa.mjs — the real build id (see scripts/build-pwa.mjs). */\nself.BUILD_ID = ${JSON.stringify(buildId)};\n`;
  await writeFile(path.join(STANDALONE_PUBLIC, "sw.js"), versioned, "utf8");

  console.log(
    `build-pwa: ${urls.length} precache URLs (${staticUrls.length} chunks, ` +
      `${publicUrls.length} public, ${routeUrls.length} routes) — build id ${buildId}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
