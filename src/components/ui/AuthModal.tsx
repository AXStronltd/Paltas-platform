"use client";

import { useState } from "react";
import { useGuest } from "@/components/booking/GuestProvider";
import { useToast, personalWelcome } from "@/components/ui/Toast";
import { Portal } from "./Portal";
import { AuthCard, AuthTabs, AuthField, AuthError, AuthSubmit } from "@/components/auth/AuthUI";

/**
 * Create an account, or sign in.
 *
 * Real accounts, and the only kind — the same guest auth the booking flow
 * uses: scrypt-hashed passwords and a hashed session token in an httpOnly
 * cookie, verified server-side on every request.
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
      // Checked here so the refusal is immediate and explains itself, and again
      // on the server, which is the one that decides.
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
    // Portalled to <body>: the header's backdrop-filter would otherwise become
    // the containing block and clip this to the header's height.
    <Portal>
      <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
        <div className="modal auth-modal">
          <AuthCard
            title={tab === "up" ? "Join PALTAS" : "Welcome back"}
            subtitle={tab === "up"
              ? "One account to book stays, manage them, and keep everything in one place."
              : "Sign in to see your bookings and pick up where you left off."}
            onSubmit={submit}
          >
            <AuthTabs value={tab} onChange={(v) => { setTab(v); setErr(""); }}
              labels={{ up: "Create account", in: "Sign in" }} />

            {tab === "up" && (
              <AuthField label="Full name" value={name} onChange={setName}
                placeholder="Your name" autoComplete="name" required autoFocus />
            )}

            <AuthField label="Email" type="email" value={email} onChange={setEmail}
              placeholder="you@example.com" autoComplete="email" required
              autoFocus={tab === "in"} />

            <AuthField label="Password" type="password" value={password} onChange={setPassword}
              placeholder="••••••••" required
              minLength={tab === "up" ? MIN_PASSWORD : undefined}
              autoComplete={tab === "up" ? "new-password" : "current-password"}
              hint={tab === "up" ? `At least ${MIN_PASSWORD} characters.` : undefined} />

            <AuthError>{err}</AuthError>

            <AuthSubmit busy={busy} busyLabel={tab === "up" ? "Creating…" : "Signing in…"}>
              {tab === "up" ? "Create account" : "Sign in"}
            </AuthSubmit>
          </AuthCard>
        </div>
      </div>
    </Portal>
  );
}
