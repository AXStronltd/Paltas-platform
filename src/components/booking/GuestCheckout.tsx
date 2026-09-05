"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Listing } from "@/lib/models";
import { useGuest } from "./GuestProvider";
import { useI18n } from "@/components/i18n/LocaleProvider";
import {
  createBooking, payForBooking, money, newIdempotencyKey,
  type GuestBooking, type Quote,
} from "@/lib/services/guestService";
import { AuthField, AuthError, AuthSubmit, AuthAlt } from "@/components/auth/AuthUI";

/**
 * Checkout, for real.
 *
 * Four steps: who you are, what you are booking, paying for it, and done.
 *
 * Two things are deliberate. First, the booking is created *before* payment and
 * starts as PENDING — so the room is claimed against the same transactional
 * availability check every other booking goes through, rather than being held
 * on the strength of an intention to pay. Second, the confirmation screen is
 * not what confirms anything: Stripe's webhook tells the server the money
 * moved, and the server confirms the booking. This screen reports; it does not
 * decide.
 */

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

type Step = "account" | "review" | "pay" | "done";

export function GuestCheckout({
  listing, quote, request, onClose,
}: {
  listing: Listing;
  quote: Quote;
  request: { checkIn: string; checkOut: string; guests: number; rooms: number; roomTypeId: string | null };
  onClose: () => void;
}) {
  const { guest, signIn, register } = useGuest();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(guest ? "review" : "account");
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Made once, so every retry of this attempt reuses it. That is what stops a
  // double tap or a lost response becoming a second booking.
  const [idempotencyKey] = useState(newIdempotencyKey);

  async function reserve() {
    setBusy(true);
    setError(null);
    const res = await createBooking({
      listingId: listing.id,
      roomTypeId: request.roomTypeId,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      guests: request.guests,
      rooms: request.rooms,
      idempotencyKey,
    });
    if (res.error) { setBusy(false); setError(res.error.message); return; }

    const made = res.data!.booking;
    setBooking(made);

    const pay = await payForBooking(made.id);
    setBusy(false);
    if (pay.error) {
      // The booking exists and is held as PENDING. Say so, rather than leaving
      // the guest thinking nothing happened and booking a second time.
      setError(`${pay.error.message} Your booking ${made.reference} is held — you can pay from My bookings.`);
      setStep("done");
      return;
    }
    setClientSecret(pay.data!.clientSecret);
    setStep("pay");
  }

  const stripe = getStripe();

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal">
        {step === "account" && (
          <AccountStep
            onDone={() => setStep("review")}
            signIn={signIn}
            register={register}
          />
        )}

        {step === "review" && (
          <>
            <h2>{t("checkout.review")}</h2>
            <p className="lede">{listing.name}{listing.city ? ` · ${listing.city}` : ""}</p>
            <div className="book-breakdown">
              <div><span>{t("book.checkIn")}</span><span>{request.checkIn}</span></div>
              <div><span>{t("book.checkOut")}</span><span>{request.checkOut}</span></div>
              <div><span>{t("book.guests")}</span><span>{request.guests}</span></div>
              {request.rooms > 1 && <div><span>{t("book.rooms")}</span><span>{request.rooms}</span></div>}
              <div><span>{quote.nights} nights</span><span>{money(quote.subtotal, quote.currency)}</span></div>
              <div><span>{t("book.serviceFee")}</span><span>{money(quote.serviceFee, quote.currency)}</span></div>
              <div><span>{t("book.taxes")}</span><span>{money(quote.taxes, quote.currency)}</span></div>
              <div className="book-total"><span>{t("price.total")}</span><span>{money(quote.total, quote.currency)}</span></div>
            </div>
            {error && <div className="book-note bad">{error}</div>}
            <button className="btn btn-primary" disabled={busy} onClick={reserve}>
              {busy ? t("checkout.reserving") : t("checkout.reserveAndPay", { total: money(quote.total, quote.currency) })}
            </button>
            <button className="btn" disabled={busy} onClick={onClose}>{t("common.back")}</button>
            <p className="reassure">
              {t("checkout.reassure")}
            </p>
          </>
        )}

        {step === "pay" && clientSecret && stripe && (
          <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: "flat" } }}>
            <PayStep
              amountLabel={money(quote.total, quote.currency)}
              reference={booking?.reference ?? ""}
              onPaid={() => setStep("done")}
            />
          </Elements>
        )}

        {step === "pay" && clientSecret && !stripe && (
          <>
            <h2>{t("checkout.noCard")}</h2>
            <p className="lede">
              Your booking {booking?.reference} is held. Payment is not configured on this site yet.
            </p>
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </>
        )}

        {step === "done" && <DoneStep booking={booking} error={error} onClose={onClose} />}
      </div>
    </div>
  );
}

function AccountStep({
  onDone, signIn, register,
}: {
  onDone: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null; staff: boolean }>;
  register: (i: { email: string; name: string; password: string; phone?: string })
    => Promise<{ error: string | null; needsVerification?: boolean }>;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"register" | "signin">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Any staff account this person also holds is deliberately ignored here:
    // they are three fields from finishing a booking, and sending them to a
    // dashboard would throw it away.
    const msg = mode === "signin"
      ? (await signIn(email.trim(), password)).error
      : (await register({ email: email.trim(), name: name.trim(), password })).error;
    setBusy(false);
    if (msg) { setError(msg); return; }
    onDone();
  }

  return (
    // The same card as everywhere else, minus its own frame — the checkout
    // modal already provides one.
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1 className="auth-title">{t(mode === "signin" ? "checkout.signInTitle" : "checkout.createTitle")}</h1>
      <p className="auth-sub">
        {t(mode === "signin" ? "checkout.signInSub" : "checkout.createSub")}
      </p>

      <div className="auth-fields">
        {mode === "register" && (
          <AuthField label={t("auth.fullName")} value={name} onChange={setName}
            autoComplete="name" required autoFocus />
        )}

        <AuthField label={t("auth.email")} type="email" value={email} onChange={setEmail}
          placeholder="you@example.com" autoComplete="email" required
          autoFocus={mode === "signin"} />

        <AuthField label={t("auth.password")} type="password" value={password} onChange={setPassword}
          placeholder="••••••••" required
          minLength={mode === "register" ? 10 : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          hint={mode === "register" ? t("auth.minChars", { n: 10 }) : undefined} />

        <AuthError>{error}</AuthError>

        <AuthSubmit busy={busy} busyLabel={t(mode === "signin" ? "auth.signingIn" : "auth.creating")}>
          {t(mode === "signin" ? "auth.signIn" : "checkout.continue")}
        </AuthSubmit>

        <AuthAlt onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setError(null); }}>
          {t(mode === "signin" ? "checkout.needAccount" : "checkout.haveAccount")}
        </AuthAlt>
      </div>
    </form>
  );
}

function PayStep({ amountLabel, reference, onPaid }: {
  amountLabel: string; reference: string; onPaid: () => void;
}) {
  const { t } = useI18n();
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    // No return_url: this stays in the modal for cards that need no redirect,
    // and Stripe handles the ones that do.
    const res = await stripe.confirmPayment({ elements, redirect: "if_required" });
    setBusy(false);
    if (res.error) { setError(res.error.message ?? "That payment could not be completed."); return; }
    onPaid();
  }

  return (
    <form onSubmit={pay}>
      <h2>{t("checkout.payTitle", { total: amountLabel })}</h2>
      <p className="lede">{t("checkout.payingNote", { ref: reference })}</p>
      <PaymentElement />
      {error && <div className="book-note bad">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={!stripe || busy}>
        {busy ? t("checkout.paying") : t("checkout.payTitle", { total: amountLabel })}
      </button>
    </form>
  );
}

function DoneStep({ booking, error, onClose }: {
  booking: GuestBooking | null; error: string | null; onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <h2>{t(error ? "checkout.held" : "checkout.thanks")}</h2>
      <p className="lede">
        {error
          ? error
          : t("checkout.confirmingNote", { ref: booking?.reference ?? "" })}
      </p>
      {/* Deliberately not "confirmed": the webhook decides that, and it may not
          have arrived yet. Promising confirmation here would sometimes be a lie. */}
      <button className="btn btn-primary" onClick={() => { onClose(); router.push("/bookings"); }}>
        {t("checkout.seeBookings")}
      </button>
      <button className="btn" onClick={onClose}>{t("checkout.close")}</button>
    </>
  );
}
