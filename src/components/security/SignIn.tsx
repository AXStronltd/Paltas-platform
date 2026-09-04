"use client";

import { useState } from "react";
import { useSession } from "@/components/security/SessionProvider";
import { supabaseGoogleSignIn, supabaseSignIn } from "@/lib/supabase/auth";
import { AuthCard, AuthField, AuthError, AuthSubmit } from "@/components/auth/AuthUI";

/**
 * One sign-in form, shared by the management portal and the landlord, hotel,
 * agent and developer portals.
 *
 * It lives on its own because a second copy would drift: the moment two forms
 * post to /api/auth/login, one of them stops handling a lockout message or a
 * suspended account properly, and only one of them gets fixed.
 *
 * It now uses the same card as the guest form. Staff signing in and a guest
 * signing up are the same act on the same platform, and there was no reason
 * for them to look like two different products.
 */
export function SignIn({ subtitle }: { subtitle?: string } = {}) {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await supabaseSignIn(email.trim(), password, "staff");
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data?.onboardingRequired) {
      window.location.assign("/onboarding");
      return;
    }
    await refresh();
  }

  async function continueWithGoogle() {
    setError(null);
    const result = await supabaseGoogleSignIn("staff");
    if (result.error) setError(result.error);
  }

  return (
    <div className="auth-page">
      <AuthCard
        brand={{ name: "PALTAS", context: "MANAGEMENT" }}
        title="Sign in"
        subtitle={subtitle ?? "Property owners and staff. What you see next depends on the permissions assigned to your account."}
        onSubmit={submit}
      >
        <AuthField label="Email" type="email" value={email} onChange={setEmail}
          placeholder="you@paltas.co.ke" autoComplete="username" required autoFocus />

        <AuthField label="Password" type="password" value={password} onChange={setPassword}
          placeholder="••••••••" autoComplete="current-password" required />

        <AuthError>{error}</AuthError>

        <AuthSubmit busy={busy} busyLabel="Signing in…">Sign in</AuthSubmit>
        <button className="btn secondary" type="button" onClick={() => void continueWithGoogle()}>
          Continue with Google
        </button>
      </AuthCard>
    </div>
  );
}
