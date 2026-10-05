/**
 * Prod-server helper for the Phase 22 e2e specs (§EE 22.4).
 *
 * The rest of the suite runs against the sandbox's dev server on
 * :3000 — but a service worker must never control a dev build, so the
 * offline/update specs boot the PRODUCTION standalone server on their
 * own port instead (the playwright config deliberately configures no
 * webServer; this is the same self-managed pattern, scoped to these
 * specs).
 *
 * Requires `npm run build` to have produced .next/standalone first —
 * call `requireProdBuild()` from each test body so the specs skip
 * with instructions instead of failing when it is missing.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SERVER_PATH = join(process.cwd(), ".next", "standalone", "server.js");

/** Whether a production build exists to serve. */
export function prodBuildAvailable(): boolean {
  return existsSync(SERVER_PATH);
}

export interface ProdServer {
  origin: string;
  stop(): Promise<void>;
}

/**
 * Boot the standalone server on a chosen port and resolve once it
 * answers. Kills cleanly on stop(); a crash mid-test rejects the
 * in-flight wait so the failure names the server.
 */
export async function startProdServer(port: number): Promise<ProdServer> {
  if (!prodBuildAvailable()) {
    throw new Error("no production build — run `npm run build` first");
  }
  const child: ChildProcess = spawn(process.execPath, [SERVER_PATH], {
    env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let exited: Promise<void> | null = null;
  child.on("exit", () => {
    exited ??= Promise.resolve();
  });
  const origin = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + 30_000;
  for (;;) {
    if (exited !== null) throw new Error("production server exited during boot");
    try {
      const response = await fetch(`${origin}/`, { redirect: "manual" });
      if (response.status < 500) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error(`production server did not answer on ${origin}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    origin,
    stop() {
      return new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        // A stubborn server never blocks the suite for more than 5 s.
        setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000).unref();
      });
    },
  };
}

/**
 * The dev-suite's storageState seeds tour flags for :3000 only; the
 * prod origin differs, so specs install the same seed for THEIR origin
 * before any load (plus the same inits the config seeds).
 */
export function seedToursForProdOrigin(): string {
  const toolTours = JSON.stringify({
    repair: "seen",
    share: "seen",
    recovery: "seen",
    create: "seen",
    merge: "seen",
    plan: "seen",
    batch: "seen",
  });
  return `
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem("gpx-repair-studio.tool-tours.v1", ${JSON.stringify(toolTours)});
  `;
}
