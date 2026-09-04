"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { AuthCard, AuthError, AuthField, AuthSubmit } from "@/components/auth/AuthUI";

/** Matches the floor the API enforces. Disagreeing with it is a rejected form. */
const MIN_PASSWORD = 10;

/**
 * Where a password-reset link lands.
 *
 * This page is the reason the reset email can exist. Until now the platform
 * could mint a reset token and told people "a reset link is on its way", and
 * there was nowhere for that link to go — the token came back in the API
 * response and the flow simply stopped. An email to a page that does not exist
 * is worse than no email.
 *
 * The token is read from the query string and sent to the server, which is the
 * only thing that can judge it. Nothing here inspects it, and it is never
 * written anywhere it might be kept — no state that outlives the request, no
 * logging.
 */
export function ResetPassword() {
  const { t } = useI18n();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD) return setError(t("auth.tooShort", { n: MIN_PASSWORD }));
    // Checked here as well as trusted to the server: a typo in a password you
    // cannot see is the one mistake this form exists to prevent.
    if (password !== confirm) return setError(t("reset.mismatch"));

    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) setDone(true);
      else setError(t("reset.invalid"));
    } catch {
      setError(t("reset.invalid"));
    } finally {
      setBusy(false);
    }
  }

  // A link with no token at all is a link that was mangled in transit. Say so
  // rather than presenting a form that cannot possibly succeed.
  if (!token) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">{t("reset.title")}</h1>
          <p className="auth-sub">{t("reset.invalid")}</p>
          <div className="auth-footer"><Link href="/">{t("auth.backToSignIn")}</Link></div>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">{t("reset.done.title")}</h1>
          <p className="auth-sub">{t("reset.done.sub")}</p>
          <div className="auth-footer"><Link href="/">{t("auth.backToSignIn")}</Link></div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <AuthCard
        brand={{ name: "PALTAS" }}
        title={t("reset.title")}
        subtitle={t("reset.sub")}
        onSubmit={submit}
        footer={<Link href="/">{t("auth.backToSignIn")}</Link>}
      >
        {error && <AuthError>{error}</AuthError>}
        <AuthField
          label={t("auth.password")} type="password" value={password} onChange={setPassword}
          autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus
          hint={t("auth.minChars", { n: MIN_PASSWORD })}
        />
        <AuthField
          label={t("reset.confirm")} type="password" value={confirm} onChange={setConfirm}
          autoComplete="new-password" minLength={MIN_PASSWORD} required
        />
        <AuthSubmit busy={busy} busyLabel={t("reset.saving")}>{t("reset.submit")}</AuthSubmit>
      </AuthCard>
    </main>
  );
}
