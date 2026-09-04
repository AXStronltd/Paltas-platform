"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The header's link to the inbox, carrying the unread count.
 *
 * It asks once on mount and then on window focus, rather than polling. An
 * unread badge that is a minute stale is a badge; one that costs a request
 * every few seconds for every signed-in visitor is a bill.
 */
export function MessagesLink() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const count = async () => {
      try {
        const response = await fetch("/api/messages");
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const total = (payload?.threads ?? []).reduce((sum: number, t: { unread?: number }) => sum + (t.unread ?? 0), 0);
        if (active) setUnread(total);
      } catch { /* a badge is not worth an error message */ }
    };
    void count();
    window.addEventListener("focus", count);
    return () => { active = false; window.removeEventListener("focus", count); };
  }, []);

  return (
    <Link href="/messages" className="header-heart header-msgs" aria-label={unread ? `Messages, ${unread} unread` : "Messages"}>
      ✉
      {unread > 0 && <span className="msg-unread header-msg-badge">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
