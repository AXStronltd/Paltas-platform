"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useGuest } from "./GuestProvider";
import { useI18n } from "@/components/i18n/LocaleProvider";
import {
  getMyBookings, cancelBooking, payForBooking, money,
  type GuestBooking, type BookingStatus,
} from "@/lib/services/guestService";

/**
 * A guest's own bookings.
 *
 * Scoped entirely by the session cookie — there is no guest id in any request
 * here, because a `?guestId=` parameter would be a lookup table of everyone
 * else's travel plans. A booking that is not yours returns 404 rather than 403,
 * so this screen cannot be used to discover which references are real.
 *
 * A PENDING booking is one that was reserved but not paid for. It still holds
 * the room, so it can be paid later rather than being silently lost.
 */

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

/** Status wording lives in the catalogues, keyed by the status itself. */
const labelKey = (s: BookingStatus) => `bookings.status.${s}`;

export function MyBookings() {
  const { guest, loading: guestLoading } = useGuest();
  const { t } = useI18n();
  const [bookings, setBookings] = useState<GuestBooking[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ id: string; secret: string; label: string } | null>(null);

  const load = useCallback(async () => {
    if (!guest) { setBookings([]); return; }
    const res = await getMyBookings();
    if (res.error) { setNotice(res.error.message); setBookings([]); return; }
    setBookings(res.data!.bookings);
  }, [guest]);

  useEffect(() => { void load(); }, [load]);

  async function cancel(b: GuestBooking) {
    const reason = prompt(t("bookings.cancelPrompt", { ref: b.reference }));
    if (!reason?.trim()) return;
    setBusy(b.id);
    const res = await cancelBooking(b.id, reason.trim());
    setBusy(null);
    if (res.error) { setNotice(res.error.message); return; }
    setNotice(t("bookings.cancelled", { ref: b.reference }));
    void load();
  }

  async function pay(b: GuestBooking) {
    setBusy(b.id);
    const res = await payForBooking(b.id);
    setBusy(null);
    if (res.error) { setNotice(res.error.message); return; }
    setPaying({ id: b.id, secret: res.data!.clientSecret, label: money(b.total, b.currency) });
  }

  const Heading = () => (
    <>
      <h1 className="choose-title">{t("bookings.title")}</h1>
      <p className="choose-sub">{t("bookings.sub")}</p>
    </>
  );

  if (guestLoading) return <><Heading /><p className="muted">{t("common.loading")}</p></>;

  if (!guest) {
    return (
      <><Heading />
      <div className="empty-state">
        <p>{t("bookings.signInPrompt")}</p>
        <p className="muted">
          You are given an account when you make your first booking.{" "}
          <Link href="/">{t("menu.findStay")}</Link>
        </p>
      </div></>
    );
  }

  if (bookings === null) return <><Heading /><p className="muted">{t("bookings.loading")}</p></>;

  if (bookings.length === 0) {
    return (
      <><Heading />
      <div className="empty-state">
        <p>{t("bookings.none")}</p>
        <p className="muted"><Link href="/">{t("bookings.browse")}</Link></p>
      </div></>
    );
  }

  const stripe = getStripe();

  return (
    <>
      <Heading />
      {notice && <div className="book-note">{notice}</div>}

      {bookings.map((b) => (
        <div key={b.id} className="lrow">
          <div style={{ flex: 1 }}>
            <b>{b.listing?.title ?? "Stay"}</b>
            <span>
              {b.reference} · {b.checkIn.slice(0, 10)} → {b.checkOut.slice(0, 10)} · {t("bookings.nights", { count: b.nights })}
              {b.roomType ? ` · ${b.roomType.name}` : ""}
              {b.rooms > 1 ? ` · ${b.rooms} rooms` : ""}
            </span>
            {b.cancelReason && <span className="bad">{b.cancelReason}</span>}
          </div>
          <div style={{ textAlign: "right" }}>
            <b>{money(b.total, b.currency)}</b>
            <div className={`pill pill-${b.status === "CANCELLED" || b.status === "REFUNDED" ? "red" : b.status === "PENDING" ? "amber" : "green"}`}>
              {t(labelKey(b.status))}
            </div>
            <div className="room-acts">
              {b.status === "PENDING" && (
                <button disabled={busy === b.id} onClick={() => pay(b)}>
                  {busy === b.id ? "…" : t("bookings.payNow")}
                </button>
              )}
              {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                <button disabled={busy === b.id} onClick={() => cancel(b)}>{t("bookings.cancel")}</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {paying && stripe && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setPaying(null)}>
          <div className="modal">
            <Elements stripe={stripe} options={{ clientSecret: paying.secret, appearance: { theme: "flat" } }}>
              <PayLater
                label={paying.label}
                onDone={() => { setPaying(null); setNotice(t("bookings.paySent")); void load(); }}
              />
            </Elements>
          </div>
        </div>
      )}
    </>
  );
}

function PayLater({ label, onDone }: { label: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const res = await stripe.confirmPayment({ elements, redirect: "if_required" });
    setBusy(false);
    if (res.error) { setError(res.error.message ?? "That payment could not be completed."); return; }
    // The webhook is what confirms the booking; this only reports the attempt.
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <h2>Pay {label}</h2>
      <p className="lede">Your card details go straight to Stripe and never reach this site.</p>
      <PaymentElement />
      {error && <div className="book-note bad">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={!stripe || busy}>
        {busy ? "Paying…" : `Pay ${label}`}
      </button>
    </form>
  );
}
