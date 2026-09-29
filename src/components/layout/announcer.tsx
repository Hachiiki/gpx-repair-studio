/**
 * Announcer — the app's single aria-live region (Phase 8), the render
 * half of the announcements bus (lib/announcements.ts).
 *
 * Mounted exactly once (AppShell). Screen-reader contract: the region
 * is `role="status"` + `aria-live="polite"` (announcements never
 * interrupt), visually hidden (the sighted UI already shows the same
 * information — badges, banners, toasts; this is the non-visual
 * twin, not a duplicate).
 *
 * Re-announcement of identical consecutive messages is a real need
 * ("Point deleted" twice in a row): each message carries a unique id
 * so the region's content always changes between utterances. Entries
 * are dropped after a beat — a region that grows forever is a
 * page-history leak for some screen readers, and announcements are
 * ephemeral by design.
 */

import { useEffect, useRef, useState } from "react";
import { subscribeAnnouncements } from "@/lib/announcements";

interface Announcement {
  id: number;
  message: string;
}

let announcementSeq = 0;

/** How long a message stays in the region before being dropped (ms). */
const ANNOUNCEMENT_TTL_MS = 6_000;

export function Announcer() {
  const [current, setCurrent] = useState<Announcement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAnnouncements((message) => {
      if (timer.current) clearTimeout(timer.current);
      setCurrent({ id: (announcementSeq += 1), message });
      timer.current = setTimeout(() => {
        setCurrent(null);
        timer.current = null;
      }, ANNOUNCEMENT_TTL_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="announcer-region"
    >
      {current ? <p key={current.id}>{current.message}</p> : null}
    </div>
  );
}
