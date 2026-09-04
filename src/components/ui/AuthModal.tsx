"use client";

import { useState } from "react";
import { useGuest } from "@/components/booking/GuestProvider";
import { useToast, personalWelcome } from "@/components/ui/Toast";
import { Portal } from "./Portal";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { AuthCard, AuthTabs, AuthField, AuthError, AuthSubmit, AuthAlt } from "@/components/auth/AuthUI";
import { supabaseEnterStaff, supabaseGoogleSignIn, supabaseResetPassword } from "@/lib/supabase/auth";
import { staffDestination } from "@/lib/auth/destination";

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
  const { signIn, register, registerBusiness } = useGuest();
  const { t } = useI18n();
  const [tab, setTab] = useState<"in" | "up" | "forgot">("up");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"guest" | "business">("guest");
  const [role, setRole] = useState<"landlord" | "agent" | "hotel" | "developer">("landlord");
  const [businessName, setBusinessName] = useState("");
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
      const { error } = await supabaseResetPassword(email.trim());
      setBusy(false);
      setNotice(error ?? "If that address has an account, a reset link is on its way.");
      return;
    }

    setBusy(true);

    if (tab === "in") {
      const result = await signIn(email.trim(), password);
      if (result.error) { setBusy(false); return setErr(result.error); }

      // This is the front door for the whole platform, not just the shop. If
      // the address that just signed in also has a PALTAS account, take them to
      // it — to the existing onboarding form when it is unfinished, and to the
      // dashboard their approved role names when it is not. Before this, a
      // landlord signing in here became a shopper and was never told otherwise.
      if (result.staff) {
        const staff = await supabaseEnterStaff();
        if (!("error" in staff && staff.error)) {
          window.location.assign(staffDestination(staff.data));
          return;
        }
        // Their marketplace session is real and already established. Falling
        // through leaves them signed in as a guest rather than stranded.
      }

      setBusy(false);
      toast.success(
        personalWelcome(t, name.trim() || email.trim()),
        "Good to see you again.",
      );
      onDone?.();
      onClose();
      return;
    }

    const message = accountType === "business"
      ? await registerBusiness({ email: email.trim(), name: name.trim(), password, role, businessName: businessName.trim() })
      : await register({ email: email.trim(), name: name.trim(), password });
    setBusy(false);

    if (message) return setErr(message);

    toast.success(
      personalWelcome(t, name.trim() || email.trim()),
      "Your account is ready.",
    );
    onDone?.();
    onClose();
  }

  async function continueWithGoogle() {
    setErr("");
    const result = await supabaseGoogleSignIn("guest");
    if (result.error) setErr(result.error);
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

            {tab === "up" && (
              <>
                <label className="auth-field">Account type
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value as "guest" | "business")}>
                    <option value="guest">Personal account</option>
                    <option value="business">Property business</option>
                  </select>
                </label>
                {accountType === "business" && (
                  <>
                    <AuthField label="Business name" value={businessName} onChange={setBusinessName} placeholder="Your company or trading name" required />
                    <label className="auth-field">Role
                      <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                        <option value="landlord">Landlord</option>
                        <option value="agent">Agent</option>
                        <option value="hotel">Hotel</option>
                        <option value="developer">Developer</option>
                      </select>
                    </label>
                  </>
                )}
              </>
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

            {(tab === "in" || (tab === "up" && accountType === "guest")) && (
              <button className="btn secondary" type="button" onClick={() => void continueWithGoogle()}>
                Continue with Google
              </button>
            )}

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
