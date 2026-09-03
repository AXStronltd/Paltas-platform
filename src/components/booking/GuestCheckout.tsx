"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Listing } from "@/lib/models";
import { useGuest } from "./GuestProvider";
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
            <h2>Review your stay</h2>
            <p className="lede">{listing.name}{listing.city ? ` · ${listing.city}` : ""}</p>
            <div className="book-breakdown">
              <div><span>Check-in</span><span>{request.checkIn}</span></div>
              <div><span>Check-out</span><span>{request.checkOut}</span></div>
              <div><span>Guests</span><span>{request.guests}</span></div>
              {request.rooms > 1 && <div><span>Rooms</span><span>{request.rooms}</span></div>}
              <div><span>{quote.nights} nights</span><span>{money(quote.subtotal, quote.currency)}</span></div>
              <div><span>Service fee</span><span>{money(quote.serviceFee, quote.currency)}</span></div>
              <div><span>Taxes</span><span>{money(quote.taxes, quote.currency)}</span></div>
              <div className="book-total"><span>Total</span><span>{money(quote.total, quote.currency)}</span></div>
            </div>
            {error && <div className="book-note bad">{error}</div>}
            <button className="btn btn-primary" disabled={busy} onClick={reserve}>
              {busy ? "Reserving…" : `Reserve and pay ${money(quote.total, quote.currency)}`}
            </button>
            <button className="btn" disabled={busy} onClick={onClose}>Back</button>
            <p className="reassure">
              Your dates are checked again as you reserve. If someone took the last room while you were
              deciding, you will be told here and not charged.
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
            <h2>Card payments are not available</h2>
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
  signIn: (email: string, password: string) => Promise<string | null>;
  register: (i: { email: string; name: string; password: string; phone?: string }) => Promise<string | null>;
}) {
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
    const msg = mode === "signin"
      ? await signIn(email.trim(), password)
      : await register({ email: email.trim(), name: name.trim(), password });
    setBusy(false);
    if (msg) { setError(msg); return; }
    onDone();
  }

  return (
    // The same card as everywhere else, minus its own frame — the checkout
    // modal already provides one.
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1 className="auth-title">{mode === "signin" ? "Sign in to book" : "Create your account"}</h1>
      <p className="auth-sub">
        {mode === "signin"
          ? "Welcome back."
          : "You need an account so you can find this booking again and cancel it if plans change."}
      </p>

      <div className="auth-fields">
        {mode === "register" && (
          <AuthField label="Full name" value={name} onChange={setName}
            autoComplete="name" required autoFocus />
        )}

        <AuthField label="Email" type="email" value={email} onChange={setEmail}
          placeholder="you@example.com" autoComplete="email" required
          autoFocus={mode === "signin"} />

        <AuthField label="Password" type="password" value={password} onChange={setPassword}
          placeholder="••••••••" required
          minLength={mode === "register" ? 10 : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          hint={mode === "register" ? "At least 10 characters." : undefined} />

        <AuthError>{error}</AuthError>

        <AuthSubmit busy={busy} busyLabel={mode === "signin" ? "Signing in…" : "Creating…"}>
          {mode === "signin" ? "Sign in" : "Create account and continue"}
        </AuthSubmit>

        <AuthAlt onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setError(null); }}>
          {mode === "signin" ? "I need an account" : "I already have an account"}
        </AuthAlt>
      </div>
    </form>
  );
}

function PayStep({ amountLabel, reference, onPaid }: {
  amountLabel: string; reference: string; onPaid: () => void;
}) {
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
      <h2>Pay {amountLabel}</h2>
      <p className="lede">Booking {reference}. Your card details go straight to Stripe and never reach this site.</p>
      <PaymentElement />
      {error && <div className="book-note bad">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={!stripe || busy}>
        {busy ? "Paying…" : `Pay ${amountLabel}`}
      </button>
    </form>
  );
}

function DoneStep({ booking, error, onClose }: {
  booking: GuestBooking | null; error: string | null; onClose: () => void;
}) {
  const router = useRouter();
  return (
    <>
      <h2>{error ? "Your booking is held" : "Thank you — you're booked"}</h2>
      <p className="lede">
        {error
          ? error
          : `Booking ${booking?.reference}. We are confirming your payment now; your booking updates the moment it clears.`}
      </p>
      {/* Deliberately not "confirmed": the webhook decides that, and it may not
          have arrived yet. Promising confirmation here would sometimes be a lie. */}
      <button className="btn btn-primary" onClick={() => { onClose(); router.push("/bookings"); }}>
        See my bookings
      </button>
      <button className="btn" onClick={onClose}>Close</button>
    </>
  );
}
