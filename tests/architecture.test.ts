import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Phase 0 architecture guards.
 *
 * These tests permanently enforce the baseline invariants established in
 * Phase 0 of the master plan (docs/MASTER_PLAN.md):
 *
 *   1. The app is serverless: no API routes, no server actions.
 *   2. No database wiring ever sneaks back in (no prisma dep, no db scripts).
 *   3. Quality gates stay on: strict TS (noImplicitAny), build-time type
 *      checking enabled, React strict mode enabled.
 *
 * They fail the suite when a future change violates the local-first,
 * serverless architecture — before review has to.
 */

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Recursively collect file paths under `dir` matching `extensions`. */
function collectFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("serverless architecture invariant", () => {
  it("has no API routes (src/app/api must not exist)", () => {
    expect(
      existsSync(path.join(projectRoot, "src/app/api")),
      "src/app/api exists — the app must stay serverless (no backend routes)",
    ).toBe(false);
  });

  it("has no server actions in src/", () => {
    const offenders = collectFiles(path.join(projectRoot, "src"), [
      ".ts",
      ".tsx",
    ]).filter((file) =>
      readFileSync(file, "utf8").includes('"use server"'),
    );
    expect(
      offenders,
      `server actions found in: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("has no prisma/database wiring in package.json", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    expect(deps).not.toHaveProperty("prisma");
    expect(deps).not.toHaveProperty("@prisma/client");

    const dbScripts = Object.keys(pkg.scripts ?? {}).filter((script) =>
      script.startsWith("db:"),
    );
    expect(dbScripts, "database scripts must not return").toEqual([]);
  });
});

describe("quality gates", () => {
  it("keeps strict TypeScript (noImplicitAny is not disabled)", () => {
    const tsconfig = readFileSync(
      path.join(projectRoot, "tsconfig.json"),
      "utf8",
    );
    expect(tsconfig).not.toMatch(/"noImplicitAny"\s*:\s*false/);
    expect(tsconfig).toMatch(/"strict"\s*:\s*true/);
  });

  it("does not ignore TypeScript build errors", () => {
    const nextConfig = readFileSync(
      path.join(projectRoot, "next.config.ts"),
      "utf8",
    );
    expect(nextConfig).not.toMatch(/ignoreBuildErrors"\s*:\s*true/);
  });

  it("keeps React strict mode enabled", () => {
    const nextConfig = readFileSync(
      path.join(projectRoot, "next.config.ts"),
      "utf8",
    );
    expect(nextConfig).not.toMatch(/reactStrictMode"\s*:\s*false/);
  });
});
