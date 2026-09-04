"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The messages inbox, for whichever side of PALTAS is signed in.
 *
 * One component rather than a guest one and a host one: the endpoints already
 * resolve who is asking and return the conversation from their point of view,
 * so a second copy would differ only in the words "guest" and "host" and would
 * be the one that stopped getting fixed.
 */

interface ThreadSummary {
  id: string; name: string; initials: string; official: boolean;
  subject: string | null; preview: string; lastMessageAt: string; unread: number;
  listing: { id: string; title: string } | null;
}

interface Message { id: string; body: string; at: string; mine: boolean }

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [[60, "m"], [3600, "h"], [86400, "d"]];
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  void units;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function Inbox() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [header, setHeader] = useState<{ name: string; initials: string; official: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const response = await fetch("/api/messages");
      if (response.status === 401) { setThreads([]); setError("Sign in to see your messages."); return; }
      const payload = await response.json().catch(() => null);
      setThreads(payload?.threads ?? []);
    } catch {
      setError("Could not load your messages.");
      setThreads([]);
    }
  }, []);

  const openThread = useCallback(async (id: string) => {
    setOpenId(id); setError("");
    try {
      const response = await fetch(`/api/messages/${id}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) { setError(payload?.error?.message ?? "That conversation could not be opened."); return; }
      setHeader({ name: payload.thread.name, initials: payload.thread.initials, official: payload.thread.official });
      setMessages(payload.thread.messages);
      // The unread badge is now wrong — reading it is what cleared it.
      void loadThreads();
    } catch {
      setError("Could not load that conversation.");
    }
  }, [loadThreads]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Arriving from "Message host" on a listing, which names the thread it just
  // opened. Read from location rather than useSearchParams so this component
  // does not drag a Suspense boundary onto the page for one optional value.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("thread");
    if (wanted) void openThread(wanted);
  }, [openThread]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !openId) return;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/messages/${openId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) { setError(payload?.error?.message ?? "That message could not be sent."); return; }
      setMessages((current) => [...current, payload.message]);
      setDraft("");
      void loadThreads();
    } catch {
      setError("That message could not be sent. Check your connection.");
    } finally {
      setSending(false);
    }
  }

  if (threads === null) return <div className="msg-empty">Loading your messages…</div>;

  return (
    <div className="msg-layout">
      <aside className={`msg-list ${openId ? "has-open" : ""}`}>
        <h2 className="msg-list-title">Messages</h2>
        {threads.length === 0 && <p className="msg-empty">{error || "No conversations yet."}</p>}
        {threads.map((thread) => (
          <button type="button" key={thread.id}
            className={`msg-item ${openId === thread.id ? "on" : ""}`}
            onClick={() => void openThread(thread.id)}>
            <span className={`msg-item-av ${thread.official ? "official" : ""}`}>{thread.initials}</span>
            <span className="msg-item-body">
              <b>{thread.name}{thread.official && <span className="msg-verified" title="Verified">✓</span>}</b>
              <span>{thread.listing?.title ?? thread.preview ?? ""}</span>
            </span>
            {thread.unread > 0 && <span className="msg-unread">{thread.unread}</span>}
          </button>
        ))}
      </aside>

      <section className={`msg-thread ${openId ? "on" : ""}`}>
        {!openId && <p className="msg-empty">Choose a conversation.</p>}
        {openId && header && (
          <>
            <header className="msg-thread-head">
              <button type="button" className="msg-back" onClick={() => setOpenId(null)} aria-label="Back">←</button>
              <span className={`msg-item-av ${header.official ? "official" : ""}`}>{header.initials}</span>
              <b>{header.name}</b>
            </header>

            <div className="msg-thread-body">
              {messages.map((message) => (
                <div key={message.id} className={`mt-msg ${message.mine ? "me" : "them"}`}>
                  <div className="mt-bubble">{message.body}</div>
                  <span className="mt-time">{timeAgo(message.at)}</span>
                </div>
              ))}
              <div ref={bottom} />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <form className="msg-compose" onSubmit={send}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…" maxLength={4000} aria-label="Write a message" />
              <button className="btn btn-primary" disabled={sending || !draft.trim()}>
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
