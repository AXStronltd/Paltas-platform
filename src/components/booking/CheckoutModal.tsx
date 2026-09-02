"use client";

import { useState } from "react";
import type { Listing, Booking } from "@/lib/models";
import { PricePanel } from "@/components/marketplace/PricePanel";
import { priceBreakdown, paymentModeFor } from "@/lib/services/pricingService";
import { createBooking, makeIdempotencyKey } from "@/lib/services/bookingService";
import { getCurrentUser, signIn } from "@/lib/services/authService";
import { useToast, personalSuccess, personalError } from "@/components/ui/Toast";
import { paymentOptions, type PaymentOption } from "@/lib/providers/registry";

/**
 * Checkout state machine, now with real payment-provider selection:
 * account -> method (Stripe card/wallet/bank, Appra Pay, Mobile money)
 * -> review -> processing -> completed | failed -> receipt.
 * The chosen method routes to a provider behind the PaymentProvider interface.
 */
type Step = "account" | "method" | "review" | "processing" | "result";

export function CheckoutModal({
  listing, nights, onClose, onComplete,
}: {
  listing: Listing; nights: number; onClose: () => void; onComplete: (bookingId: string) => void;
}) {
  const toast = useToast();
  const existing = getCurrentUser();
  const [step, setStep] = useState<Step>(existing ? "method" : "account");
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [idemKey] = useState(() => makeIdempotencyKey(listing.id, existing?.id ?? "guest"));
  const [simFail, setSimFail] = useState(false);
  const [option, setOption] = useState<PaymentOption | null>(null);
  const [phone, setPhone] = useState("");
  const [processingHint, setProcessingHint] = useState("Processing your payment…");

  const breakdown = priceBreakdown(listing, nights);
  const pm = paymentModeFor(listing);
  const options = paymentOptions();

  async function handleAccount() {
    setBusy(true);
    await signIn({ name: name || "Guest", email: email || "guest@paltas.com" });
    setBusy(false);
    setStep("method");
  }

  async function handlePay() {
    if (!option) return;
    if (option.method === "mobile_money") setProcessingHint("Check your phone and approve the prompt…");
    else setProcessingHint("Processing your payment…");
    setStep("processing");
    const user = getCurrentUser()!;
    const res = await createBooking({
      listing, checkIn: "2025-08-30", checkOut: "2025-09-02", nights, guests: 2,
      buyerId: user.id, buyerName: user.name, idempotencyKey: idemKey, simulateFailure: simFail,
      method: option.method, providerName: option.providerName, phone,
    });
    setBooking(res.data);
    setStep("result");
    // personalized, animated feedback
    const who = getCurrentUser()?.name;
    if (res.data && res.data.status !== "failed") {
      toast.success(
        personalSuccess(who),
        `You're confirmed at ${listing.name}. Have a great stay!`
      );
    } else if (res.data) {
      toast.error(personalError(who), `${res.data.failureReason}. You have not been charged.`);
    }
  }

  const needsPhone = option?.method === "mobile_money";
  const canPay = option && (!needsPhone || phone.replace(/\D/g, "").length >= 9);

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && step !== "processing" && onClose()}>
      <div className="modal">
        {step === "account" && (
          <>
            <h2>Almost there — create your free account</h2>
            <p className="lede">Takes 10 seconds. Instant confirmation on all bookings.</p>
            <div className="field"><label>Full name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
            <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
            <button className="btn btn-primary" disabled={busy} onClick={handleAccount}>{busy ? "Creating…" : "Create account & continue"}</button>
          </>
        )}

        {step === "method" && (
          <>
            <h2>How would you like to pay?</h2>
            <p className="lede">Total KSh {breakdown.total.toLocaleString()} · all fees included</p>
            <div className="pay-options">
              {options.map((o) => (
                <button
                  key={o.method + o.providerName}
                  className={`pay-option ${option?.method === o.method && option?.providerName === o.providerName ? "sel" : ""}`}
                  onClick={() => setOption(o)}
                >
                  <span className="po-ico">{o.icon || "•"}</span>
                  <span className="po-txt"><b>{o.label}</b><span>{o.sublabel} · via {o.providerName}</span></span>
                  <span className="po-radio" />
                </button>
              ))}
            </div>
            {needsPhone && (
              <div className="field" style={{ marginTop: 12 }}>
                <label>Mobile money number</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" inputMode="tel" />
              </div>
            )}
            <button className="btn btn-primary" disabled={!canPay} onClick={() => setStep("review")} style={{ marginTop: 14 }}>Continue</button>
          </>
        )}

        {step === "review" && option && (
          <>
            <h2>Review & confirm</h2>
            <p className="lede">{listing.name} · {listing.location}</p>
            <div className="escrow-band instant">
              <div className="eb-ico">⚡</div>
              <div><b>Instant confirmation</b><span>You&apos;re confirmed as soon as payment succeeds.</span></div>
            </div>
            {/* The same component the listing page used. A guest who compared
                prices there is looking at the identical arithmetic here. */}
            <PricePanel listing={listing} nights={nights} compact />
            <div className="breakdown">
              <div className="br"><span>Paying with</span><span>{option.icon} {option.label}</span></div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--muted)", margin: "12px 0" }}>
              <input type="checkbox" checked={simFail} onChange={(e) => setSimFail(e.target.checked)} />
              Simulate a failed payment (to see the error state)
            </label>
            <button className="btn btn-primary" onClick={handlePay}>Confirm & pay KSh {breakdown.total.toLocaleString()}</button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setStep("method")}>Change payment method</button>
          </>
        )}

        {step === "processing" && (
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <div className="spinner" />
            <h2 style={{ marginTop: 18 }}>{option?.method === "mobile_money" ? "Awaiting your approval…" : "Processing your payment…"}</h2>
            <p className="lede">{processingHint} Please don&apos;t close this window.</p>
          </div>
        )}

        {step === "result" && booking && booking.status !== "failed" && (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="result-check ok">✓</div>
              <h2>Booking confirmed 🎉</h2>
              <p className="lede">You&apos;re confirmed — your booking is all set. Have a great stay!</p>
            </div>
            <div className="receipt">
              <div className="br"><span>Property</span><b>{booking.property}</b></div>
              <div className="br"><span>Paid with</span><b>{option?.label} · {option?.providerName}</b></div>
              <div className="br"><span>Reference</span><b>{booking.reference}</b></div>
              <div className="br"><span>Booking code</span><b>{booking.code}</b></div>
              <div className="br"><span>Amount</span><b>KSh {booking.breakdown.total.toLocaleString()}</b></div>
              <div className="br"><span>Status</span><b style={{ color: "var(--teal-ink)" }}>✓ Confirmed</b></div>
            </div>
            <button className="btn btn-primary" onClick={() => onComplete(booking.escrowId ?? booking.id)}>View my booking</button>
          </>
        )}

        {step === "result" && booking && booking.status === "failed" && (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="result-check fail">✕</div>
              <h2>Payment failed</h2>
              <p className="lede">{booking.failureReason}. You have not been charged. Please try again or use a different method.</p>
            </div>
            <div className="receipt">
              <div className="br"><span>Reference</span><b>{booking.reference || "—"}</b></div>
              <div className="br"><span>Status</span><b style={{ color: "#c0453a" }}>Failed · not charged</b></div>
            </div>
            <button className="btn btn-primary" onClick={() => setStep("method")}>Try a different method</button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
