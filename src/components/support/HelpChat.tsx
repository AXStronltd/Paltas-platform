"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { whatsappHref, SUPPORT_EMAIL } from "@/lib/contact";
import { MAX_MESSAGE_CHARS, type Turn } from "@/lib/support/chat";

/**
 * The help panel.
 *
 * Three things shaped it.
 *
 * The answer streams. A help assistant that shows nothing for four seconds
 * reads as broken, and somebody who has already decided it is broken has gone.
 *
 * Every path the assistant names becomes a link. It is told to answer with real
 * paths — "/bookings", not "the bookings page" — and turning those into links
 * is the difference between being told where to go and being taken there.
 *
 * Escalation is to a person who can actually be reached. WhatsApp and email,
 * both carrying the conversation so nobody has to retype it. A form that files
 * a ticket into a queue nobody reads would look more like a product and help
 * less than a link that opens a chat with a human.
 */

const STARTERS = ["chat.starter.book", "chat.starter.cancel", "chat.starter.list", "chat.starter.fees"];

/** Paths the assistant may have named. Anything else is left as plain text. */
const PATH = /(^|[\s(])(\/(?:[a-z][a-z0-9-]*)(?:\/[a-z][a-z0-9-]*)*)(?=[\s,.)!?]|$)/g;

/** Render an answer, turning the paths it names into links people can follow. */
function Answer({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(PATH)) {
    const [whole, lead, path] = match;
    const at = match.index ?? 0;
    parts.push(text.slice(last, at + lead.length));
    parts.push(<Link key={`${at}-${path}`} href={path} className="chat-path">{path}</Link>);
    last = at + whole.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function HelpChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const path = usePathname();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [escalating, setEscalating] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  // Follow the answer as it arrives, and land on the input when the panel opens.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, streaming]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  // Escape closes it, the way every other panel on the site behaves.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Leaving the panel must stop the request; otherwise a closed panel keeps
  // spending on an answer nobody will read.
  useEffect(() => () => abort.current?.abort(), []);

  async function send(question: string) {
    const asked = question.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!asked || streaming) return;

    const history: Turn[] = [...turns, { role: "user", content: asked }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setError("");
    setStreaming(true);

    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages: history, locale, path }),
      });

      if (!response.ok || !response.body) {
        // The API nests refusals under `error`. Reading the wrong level here
        // means a visitor who is rate limited, or on a deployment with no key,
        // is shown the generic "something went wrong" instead of the sentence
        // that would tell them what to do about it.
        const detail = await response.json().catch(() => null) as
          { error?: { message?: string } } | null;
        setError(detail?.error?.message ?? t("chat.error"));
        setTurns(history);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const { text } = JSON.parse(payload) as { text?: string };
            if (text) {
              answer += text;
              setTurns([...history, { role: "assistant", content: answer }]);
            }
          } catch { /* a frame we cannot read is a frame we do not need */ }
        }
      }

      // An empty answer is a failure that looks like success. Say so.
      if (!answer.trim()) { setError(t("chat.error")); setTurns(history); }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") { setError(t("chat.error")); setTurns(history); }
    } finally {
      setStreaming(false);
      abort.current = null;
    }
  }

  /** The conversation, for handing to a person who has not seen it. */
  function transcript(): string {
    return turns
      .filter((m) => m.content.trim())
      .map((m) => `${m.role === "user" ? "—" : "PALTAS:"} ${m.content}`)
      .join("\n\n")
      .slice(0, 1200);
  }

  if (!open) return null;

  const escalationBody = encodeURIComponent(
    turns.length ? `${t("chat.escalate.intro")}\n\n${transcript()}` : t("chat.escalate.intro"),
  );

  return (
    <>
      <div className="chat-scrim" onClick={onClose} aria-hidden="true" />
      <section className="chat-panel" role="dialog" aria-modal="true" aria-label={t("chat.title")}>
        <header className="chat-head">
          <div>
            <strong>{t("chat.title")}</strong>
            <span>{t("chat.subtitle")}</span>
          </div>
          <button className="chat-close" onClick={onClose} aria-label={t("chat.close")}>✕</button>
        </header>

        <div className="chat-body" ref={scroller}>
          {turns.length === 0 && (
            <div className="chat-intro">
              <p>{t("chat.intro")}</p>
              <div className="chat-starters">
                {STARTERS.map((key) => (
                  <button key={key} onClick={() => send(t(key))}>{t(key)}</button>
                ))}
              </div>
            </div>
          )}

          {turns.map((m, i) => (
            <div key={i} className={m.role === "user" ? "chat-msg chat-you" : "chat-msg chat-ai"}>
              {m.role === "assistant" && !m.content && streaming
                ? <span className="chat-typing" aria-label={t("chat.thinking")}><i /><i /><i /></span>
                : <Answer text={m.content} />}
            </div>
          ))}

          {error && <p className="chat-error" role="alert">{error}</p>}

          {/* Offered once there is something to escalate, not before: a way out
              shown before anything has been tried reads as no confidence. */}
          {turns.length > 0 && !streaming && (
            <div className="chat-escalate">
              {escalating ? (
                <div className="chat-escalate-open">
                  <p>{t("chat.escalate.lead")}</p>
                  <a className="chat-escalate-btn" href={`${whatsappHref}?text=${escalationBody}`}
                     target="_blank" rel="noopener noreferrer">{t("chat.escalate.whatsapp")}</a>
                  <a className="chat-escalate-btn chat-escalate-alt"
                     href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("chat.escalate.subject"))}&body=${escalationBody}`}>
                    {t("chat.escalate.email")}
                  </a>
                </div>
              ) : (
                <button className="chat-escalate-link" onClick={() => setEscalating(true)}>
                  {t("chat.escalate.open")}
                </button>
              )}
            </div>
          )}
        </div>

        <form
          className="chat-compose"
          onSubmit={(e) => { e.preventDefault(); send(draft); }}
        >
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter starts a line — what people expect of
              // a chat box, and what they will do before reading any hint.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); }
            }}
            placeholder={t("chat.placeholder")}
            maxLength={MAX_MESSAGE_CHARS}
            rows={1}
            aria-label={t("chat.placeholder")}
          />
          <button type="submit" disabled={!draft.trim() || streaming} aria-label={t("chat.send")}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2v6.4Z" />
            </svg>
          </button>
        </form>

        <p className="chat-foot">{t("chat.disclaimer")}</p>
      </section>
    </>
  );
}
