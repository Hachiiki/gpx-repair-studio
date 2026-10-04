/**
 * CommandKeycap (Phase 20) — the palette's key chip, the same keycap
 * treatment the help sheet renders (mono, bordered, shadow-lifted) so
 * the two surfaces read as one system.
 *
 * Pure presentation.
 */

"use client";

export function CommandKeycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex min-w-6 items-center justify-center rounded-[5px] border-[1.5px] border-ink bg-card px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none shadow-[0_1.5px_0_0_var(--ink)]"
    >
      {children}
    </kbd>
  );
}
