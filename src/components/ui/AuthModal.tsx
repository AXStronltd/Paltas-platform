"use client";

import { useState } from "react";
import { signUp, signIn } from "@/lib/services/authService";
import { supabaseEnabled } from "@/lib/supabase";
import { useToast, personalWelcome } from "@/components/ui/Toast";

/**
 * Real authentication modal — sign up or sign in.
 * Uses Supabase when configured (real, secure accounts); otherwise falls back
 * to a demo session so the app still works without keys.
 */
export function AuthModal({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!email || (supabaseEnabled && !password)) {
      setErr("Please fill in all fields.");
      return;
    }
    setBusy(true);
    const res = tab === "up"
      ? await signUp({ name: name || "Guest", email, password })
      : await signIn({ email, password });
    setBusy(false);

    if (res.error) {
      setErr(res.error.message);
      return;
    }
    toast.success(personalWelcome(res.data.name), tab === "up" ? "Your account is ready." : "Good to see you again.");
    onDone?.();
    onClose();
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal auth-modal">
        <div className="auth-tabs">
          <button className={tab === "up" ? "on" : ""} onClick={() => { setTab("up"); setErr(""); }}>Create account</button>
          <button className={tab === "in" ? "on" : ""} onClick={() => { setTab("in"); setErr(""); }}>Sign in</button>
        </div>

        <h2>{tab === "up" ? "Join PALTAS" : "Welcome back"}</h2>
        <p className="lede">
          {tab === "up" ? "Create your free account to book and manage stays." : "Sign in to your PALTAS account."}
        </p>

        {tab === "up" && (
          <div className="field">
            <label>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {err && <div className="auth-error">{err}</div>}

        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Please wait…" : tab === "up" ? "Create account" : "Sign in"}
        </button>

        {!supabaseEnabled && (
          <p className="auth-demo-note">Demo mode — connect Supabase for real, secure accounts.</p>
        )}
      </div>
    </div>
  );
}
