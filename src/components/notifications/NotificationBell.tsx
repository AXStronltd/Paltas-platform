"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string; kind: string; title: string; body: string | null;
  href: string | null; readAt: string | null; createdAt: string;
}

const ICON: Record<string, string> = {
  BOOKING: "🧾", APPROVAL: "✅", VERIFICATION: "🪪", MESSAGE: "✉️",
  PRICE_DROP: "💰", NEW_LISTING: "🏠", AVAILABILITY: "📅", SYSTEM: "🔔",
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * The bell, its count, and the panel behind it.
 *
 * Asked for on mount and again when the window regains focus — not on a timer.
 * A badge a minute stale is a badge; one that polls every few seconds for every
 * signed-in visitor is a bill, and it is the kind that grows with success.
 *
 * Opening the panel marks everything read in one request rather than one per
 * row, and the count drops immediately rather than after the round trip: the
 * server is being told what happened, not asked permission.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) return;
      const payload = await response.json().catch(() => null);
      setItems(payload?.notifications ?? []);
      const count = payload?.unread ?? 0;
      // Animate only on an actual increase, so the badge does not twitch every
      // time the window is focused.
      if (count > seen.current) { setPulse(true); setTimeout(() => setPulse(false), 900); }
      seen.current = count;
      setUnread(count);
    } catch { /* a bell is not worth an error message */ }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  // Click-away, because a panel that only closes via its own button is a panel
  // people close by reloading the page.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || unread === 0) return;
    setUnread(0); seen.current = 0;
    setItems((current) => current.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    try { await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    catch { /* the badge is cosmetic; the next load corrects it */ }
  }

  return (
    <div className="notif" ref={box}>
      <button type="button" className="header-heart notif-bell" onClick={() => void toggle()}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open}>
        🔔
        {unread > 0 && <span className={`notif-badge ${pulse ? "pulse" : ""}`}>{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">Notifications</div>
          {items.length === 0 && <p className="notif-empty">Nothing yet. Bookings, approvals and document reviews appear here.</p>}
          {items.map((n) => (
            <button type="button" key={n.id}
              className={`notif-item ${n.readAt ? "" : "unread"}`}
              onClick={() => { setOpen(false); if (n.href) router.push(n.href); }}>
              <span className="notif-ico" aria-hidden="true">{ICON[n.kind] ?? "🔔"}</span>
              <span className="notif-text">
                <b>{n.title}</b>
                {n.body && <span>{n.body}</span>}
                <time>{ago(n.createdAt)}</time>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
