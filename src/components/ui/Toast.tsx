"use client";

import { createContext, useContext, useCallback, useState, useRef } from "react";

/**
 * Global toast system — animated, personalized feedback for success / error /
 * info moments. Any component calls `useToast().show(...)`. Toasts slide in,
 * auto-dismiss, and can be personalized with the user's name and context so the
 * message feels human ("Nice one, Ahmed — your booking is protected 🎉") rather
 * than a generic system line.
 */

type ToastType = "success" | "error" | "info";
interface Toast { id: number; type: ToastType; title: string; body?: string; }

interface ToastApi {
  show: (t: { type: ToastType; title: string; body?: string }) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);
export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
};

const ICONS: Record<ToastType, string> = { success: "🎉", error: "⚠️", info: "💬" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((t: { type: ToastType; title: string; body?: string }) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => remove(id), t.type === "error" ? 5000 : 3800);
  }, [remove]);

  const api: ToastApi = {
    show,
    success: (title, body) => show({ type: "success", title, body }),
    error: (title, body) => show({ type: "error", title, body }),
    info: (title, body) => show({ type: "info", title, body }),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status" onClick={() => remove(t.id)}>
            <span className="toast-ico">{ICONS[t.type]}</span>
            <div className="toast-txt">
              <b>{t.title}</b>
              {t.body && <span>{t.body}</span>}
            </div>
            <span className="toast-bar" />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * Personalization helpers — turn a raw event into a warm, human message using
 * the user's first name and a rotating set of friendly phrasings.
 */
export function firstName(full?: string | null): string {
  if (!full) return "";
  return full.trim().split(/\s+/)[0];
}

/**
 * The warm openers, as message keys.
 *
 * These take a translator rather than reading one, because they are plain
 * functions and not components — a hook cannot be called here. The caller has
 * `t` already, so passing it costs nothing and keeps "Nice one, Ahmed!" from
 * being the one English sentence left in an otherwise Arabic checkout.
 */
type T = (key: string, values?: Record<string, string | number>) => string;

const SUCCESS_OPENERS = [
  "toast.opener.niceOne", "toast.opener.allSet", "toast.opener.done",
  "toast.opener.perfect", "toast.opener.youreAllSet",
];

export function personalSuccess(t: T, name?: string | null): string {
  const n = firstName(name);
  const opener = t(SUCCESS_OPENERS[Math.floor(Math.random() * SUCCESS_OPENERS.length)]);
  return n ? t("toast.successNamed", { opener, name: n }) : t("toast.success", { opener });
}
export function personalError(t: T, name?: string | null): string {
  const n = firstName(name);
  return n ? t("toast.errorNamed", { name: n }) : t("toast.error");
}
export function personalWelcome(t: T, name?: string | null): string {
  const n = firstName(name);
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const greeting = t(`toast.good.${part}`);
  return n ? t("toast.welcomeNamed", { greeting, name: n }) : t("toast.welcome", { greeting });
}
