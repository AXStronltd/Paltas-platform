"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { startCardPayment } from "@/lib/services/managementService";
import { Dialog } from "@/components/security/VisitorsPanel";

/**
 * The browser half of a card payment.
 *
 * Card details are entered into Stripe's own iframe and never touch this
 * origin — that is what keeps PALTAS out of PCI scope, and why the Payment
 * Element is used rather than a form of our own that posts a card number.
 *
 * The flow is deliberately server-first: the browser asks our API *what* is
 * being paid, the server works out how much and returns only a client secret,
 * and Stripe is confirmed against that. At no point does the browser name a
 * price, and at no point does it see a secret key.
 *
 * The authoritative outcome is the webhook, not this screen. A confirmation here
 * is a good sign; the ledger moves when Stripe tells the server it moved.
 */

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Loaded lazily and only once. The publishable key is safe in the browser — it
 * can start a payment attempt and nothing else — but it must still be present.
 */
function getStripe(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

export interface PaymentTarget {
  purpose: "charge" | "group_share";
  chargeId?: string;
  groupBookingId?: string;
  memberId?: string;
  /** Shown to the payer so they know what they are settling. */
  label: string;
  customerEmail?: string;
}

export function StripeCheckout({ target, onClose, onSettled }: {
  target: PaymentTarget;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<{ value: number; currency: string } | null>(null);
  const [mode, setMode] = useState<string>("test");
  const [error, setError] = useState<string | null>(null);
  const stripe = getStripe();

  useEffect(() => {
    let cancelled = false;
    startCardPayment({
      purpose: target.purpose,
      chargeId: target.chargeId,
      groupBookingId: target.groupBookingId,
      memberId: target.memberId,
      customerEmail: target.customerEmail,
    }).then((res) => {
      if (cancelled) return;
      if (res.error) { setError(res.error.message); return; }
      setClientSecret(res.data.clientSecret);
      setAmount({ value: res.data.amount, currency: res.data.currency });
      setMode(res.data.mode);
    });
    return () => { cancelled = true; };
  }, [target]);

  const options = useMemo(
    () => (clientSecret
      ? { clientSecret, appearance: { theme: "stripe" as const, variables: { colorPrimary: "#0f6b4f" } } }
      : undefined),
    [clientSecret],
  );

  return (
    <Dialog title={`Pay — ${target.label}`} onClose={onClose}>
      {!stripe && (
        <div className="panel-error">
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set, so the card form cannot load.
          That is the publishable key, safe in the browser — never the secret key.
        </div>
      )}
      {error && <div className="panel-error">{error}</div>}

      {stripe && clientSecret && options && (
        <>
          {mode === "live" && (
            <div className="live-banner"><b>Live mode</b> — this will move real money.</div>
          )}
          {amount && (
            <p className="pay-amount">
              <b>{amount.currency} {amount.value.toLocaleString()}</b>
              <span>Worked out by the server from what is owed, not by this page.</span>
            </p>
          )}
          <Elements stripe={stripe} options={options}>
            <ConfirmForm onSettled={onSettled} onError={setError} />
          </Elements>
        </>
      )}

      {stripe && !clientSecret && !error && (
        <div className="manage-loading"><div className="spinner" /><span>Preparing a secure payment…</span></div>
      )}
    </Dialog>
  );
}

function ConfirmForm({ onSettled, onError }: { onSettled: () => void; onError: (m: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      // Only used by methods that must leave the page — 3-D Secure, some wallets.
      confirmParams: { return_url: `${window.location.origin}/manage/finance?paid=1` },
      redirect: "if_required",
    });
    setBusy(false);

    if (error) {
      // Stripe writes these for payers; passing them through is kinder than a
      // generic failure, and they never contain anything sensitive.
      onError(error.message ?? "The payment could not be completed.");
      return;
    }

    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      setDone(true);
      onSettled();
    } else {
      onError(`The payment ended as "${paymentIntent?.status ?? "unknown"}".`);
    }
  }, [stripe, elements, onError, onSettled]);

  if (done) {
    return (
      <div className="pay-done">
        <b>Payment submitted</b>
        <p className="muted small">
          Stripe has it. The ledger updates when Stripe confirms settlement to the
          server, rather than on the strength of this screen.
        </p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      {/* Stripe's iframe. Card details never reach this origin. */}
      <PaymentElement />
      <div className="row end">
        <button type="submit" className="btn primary" disabled={!stripe || busy}>
          {busy ? "Confirming…" : "Pay now"}
        </button>
      </div>
      <p className="muted small">Card details go straight to Stripe and are never seen by PALTAS.</p>
    </form>
  );
}
