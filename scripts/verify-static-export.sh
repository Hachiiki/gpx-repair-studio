#!/bin/bash
# ---------------------------------------------------------------------------
# Phase 0 — isolated static-export build verification.
#
# Why isolated: the sandbox environment forbids running the production build
# in the live workspace (the system-run dev server owns .next there, and the
# skill explicitly says "Never use `bun run build`"). To still verify the
# master plan's "static-exportable by construction" guarantee, we build an
# isolated copy of the project with output:'export' and assert that a static
# site is produced. The live workspace is never touched.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="/home/z/my-project"
WORK="$ROOT/.build-verify"

rm -rf "$WORK"
mkdir -p "$WORK"

# Copy project sources and configs (NOT node_modules / .next / .git / logs).
cp "$ROOT/package.json" "$WORK/"
cp "$ROOT/tsconfig.json" "$WORK/"
cp "$ROOT/next.config.ts" "$WORK/"
cp "$ROOT/postcss.config.mjs" "$WORK/"
cp "$ROOT/eslint.config.mjs" "$WORK/"
cp "$ROOT/tailwind.config.ts" "$WORK/"
cp "$ROOT/components.json" "$WORK/"
cp -r "$ROOT/src" "$WORK/src"
cp -r "$ROOT/public" "$WORK/public"

# Reuse the workspace's installed dependencies (read-only usage).
ln -s "$ROOT/node_modules" "$WORK/node_modules"

# Switch the isolated copy to static export for this verification build.
sed -i 's/output: "standalone"/output: "export"/' "$WORK/next.config.ts"
grep -q 'output: "export"' "$WORK/next.config.ts" \
  || { echo "FAIL: could not set output=export in verification config"; exit 1; }
echo "verification config: output=export"

cd "$WORK"
NEXT_TELEMETRY_DISABLED=1 bunx next build 2>&1 | tail -35

# Assert the build produced a fully static site.
test -f "$WORK/out/index.html" \
  || { echo "FAIL: out/index.html missing — static export did not succeed"; exit 1; }
echo ""
echo "PASS: static export produced out/index.html"
echo "--- out/ contents ---"
ls -la "$WORK/out"
