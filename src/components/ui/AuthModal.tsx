"use client";

import { useState } from "react";
import { useGuest } from "@/components/booking/GuestProvider";
import { useToast, personalWelcome } from "@/components/ui/Toast";
import { Portal } from "./Portal";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { AuthCard, AuthTabs, AuthField, AuthError, AuthSubmit, AuthAlt } from "@/components/auth/AuthUI";

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
  const { t } = useI18n();
  const [tab, setTab] = useState<"in" | "up" | "forgot">("up");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!email.trim()) return setErr(t("auth.needEmail"));
    if (tab !== "forgot" && !password) return setErr(t("auth.needPassword"));
    if (tab === "up") {
      if (!name.trim()) return setErr(t("auth.needName"));
      // Checked here so the refusal is immediate and explains itself, and again
      // on the server, which is the one that decides.
      if (password.length < MIN_PASSWORD) {
        return setErr(t("auth.tooShort", { n: MIN_PASSWORD }));
      }
    }

    if (tab === "forgot") {
      setBusy(true);
      const res = await fetch("/api/auth/forgot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), audience: "guest" }),
      }).then((r) => r.json()).catch(() => null);
      setBusy(false);
      // The same words whether or not the address exists — see the endpoint.
      setNotice(res?.message ?? "If that address has an account, a reset link is on its way.");
      return;
    }

    setBusy(true);
    const message = tab === "up"
      ? await register({ email: email.trim(), name: name.trim(), password })
      : await signIn(email.trim(), password);
    setBusy(false);

    if (message) return setErr(message);

    toast.success(
      personalWelcome(t, name.trim() || email.trim()),
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
            title={tab === "up" ? t("auth.join") : tab === "forgot" ? t("auth.resetTitle") : t("auth.welcomeBack")}
            subtitle={tab === "up" ? t("auth.joinSub")
              : tab === "forgot" ? t("auth.resetSub") : t("auth.signInSub")}
            onSubmit={submit}
          >
            {tab !== "forgot" && (
              <AuthTabs value={tab} onChange={(v) => { setTab(v); setErr(""); setNotice(""); }}
                labels={{ up: t("auth.createAccount"), in: t("auth.signIn") }} />
            )}

            {tab === "up" && (
              <AuthField label={t("auth.fullName")} value={name} onChange={setName}
                placeholder="Your name" autoComplete="name" required autoFocus />
            )}

            <AuthField label={t("auth.email")} type="email" value={email} onChange={setEmail}
              placeholder="you@example.com" autoComplete="email" required
              autoFocus={tab === "in"} />

            {tab !== "forgot" && (
            <AuthField label={t("auth.password")} type="password" value={password} onChange={setPassword}
              placeholder="••••••••" required
              minLength={tab === "up" ? MIN_PASSWORD : undefined}
              autoComplete={tab === "up" ? "new-password" : "current-password"}
              hint={tab === "up" ? t("auth.minChars", { n: MIN_PASSWORD }) : undefined} />
            )}

            {notice && <p className="auth-notice">{notice}</p>}

            <AuthError>{err}</AuthError>

            <AuthSubmit busy={busy}
              busyLabel={tab === "up" ? t("auth.creating") : tab === "forgot" ? t("auth.sending") : t("auth.signingIn")}>
              {tab === "up" ? t("auth.createAccount") : tab === "forgot" ? t("auth.sendReset") : t("auth.signIn")}
            </AuthSubmit>

            {/* Somebody locked out has no other way back in. */}
            {tab === "in" && (
              <AuthAlt onClick={() => { setTab("forgot"); setErr(""); setNotice(""); }}>
                {t("auth.forgot")}
              </AuthAlt>
            )}
            {tab === "forgot" && (
              <AuthAlt onClick={() => { setTab("in"); setErr(""); setNotice(""); }}>
                {t("auth.backToSignIn")}
              </AuthAlt>
            )}
          </AuthCard>
        </div>
      </div>
    </Portal>
  );
}
