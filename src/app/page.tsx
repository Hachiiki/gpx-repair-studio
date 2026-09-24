/**
 * Phase 0 application shell — composition only.
 *
 * This page intentionally contains no product features. It establishes the
 * layout skeleton (header / main / footer, responsive, sticky footer) that
 * later phases fill with real panels. Per the master plan (Section D-6),
 * this file must remain a composition layer: no GPX logic, no map logic,
 * no business logic.
 */
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            GPX Repair Studio
          </h1>
          <Badge variant="secondary">Local-first</Badge>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Foundation ready
        </h2>
        <p className="max-w-md text-balance text-muted-foreground">
          Upload, inspect, and repair incomplete GPX activities — all in your
          browser. Tooling arrives with the next development phases.
        </p>
      </main>

      <footer className="mt-auto border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          All processing happens in your browser. No GPX data is uploaded to
          any server.
        </div>
      </footer>
    </div>
  );
}
