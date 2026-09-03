"use client";

import { useState } from "react";
import { useGuest } from "@/components/booking/GuestProvider";
import { useToast, personalWelcome } from "@/components/ui/Toast";
import { Portal } from "./Portal";

/**
 * Create an account, or sign in.
 *
 * Real accounts, and the only kind. This used to fall back to a "demo session"
 * when Supabase was unconfigured: a client-side variable that put a name in the
 * header and granted nothing, so the site said you were signed in while every
 * page that needed a session disagreed. That was worse than refusing, because
 * it looked like it had worked.
 *
 * It now uses the same guest auth as the booking flow — scrypt-hashed
 * passwords, a hashed session token in an httpOnly cookie, verified on the
 * server for every request.
 */
const MIN_PASSWORD = 10;

export function AuthModal({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const { signIn, register } = useGuest();
  const [tab, setTab] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!email.trim()) return setErr("Please enter your email address.");
    if (!password) return setErr("Please enter a password.");
    if (tab === "up") {
      if (!name.trim()) return setErr("Please enter your name.");
      // Checked here so the refusal is immediate and explains itself, and
      // again on the server, which is the one that decides.
      if (password.length < MIN_PASSWORD) {
        return setErr(`Please use at least ${MIN_PASSWORD} characters — it protects your bookings.`);
      }
    }

    setBusy(true);
    const message = tab === "up"
      ? await register({ email: email.trim(), name: name.trim(), password })
      : await signIn(email.trim(), password);
    setBusy(false);

    if (message) return setErr(message);

    toast.success(
      personalWelcome(name.trim() || email.trim()),
      tab === "up" ? "Your account is ready." : "Good to see you again.",
    );
    onDone?.();
    onClose();
  }

  return (
    // Portalled to <body>: the header's backdrop-filter would otherwise make
    // it the containing block and clip this to the header's height.
    <Portal>
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal auth-modal" onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={tab === "up" ? "on" : ""}
            onClick={() => { setTab("up"); setErr(""); }}>Create account</button>
          <button type="button" className={tab === "in" ? "on" : ""}
            onClick={() => { setTab("in"); setErr(""); }}>Sign in</button>
        </div>

        <h2>{tab === "up" ? "Join PALTAS" : "Welcome back"}</h2>
        <p className="lede">
          {tab === "up"
            ? "Create your free account to book and manage stays."
            : "Sign in to your PALTAS account."}
        </p>

        {tab === "up" && (
          <div className="field">
            <label htmlFor="auth-name">Full name</label>
            <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name" autoComplete="name" required />
          </div>
        )}

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email" required />
        </div>

        <div className="field">
          <label htmlFor="auth-pass">Password</label>
          <input id="auth-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" required
            minLength={tab === "up" ? MIN_PASSWORD : undefined}
            autoComplete={tab === "up" ? "new-password" : "current-password"} />
          {tab === "up" && <small className="field-hint">At least {MIN_PASSWORD} characters.</small>}
        </div>

        {err && <div className="auth-error">{err}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : tab === "up" ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
    </Portal>
  );
}
