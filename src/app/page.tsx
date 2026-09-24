/**
 * Phase 2 application page — composition only (§D-6 "App.tsx rule").
 *
 * The page describes WHAT is displayed: the application shell, which owns
 * the session wiring and panel composition. No GPX logic, no map logic,
 * no business logic may live here (enforced by the ESLint boundary rules).
 */

import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
  return <AppShell />;
}
