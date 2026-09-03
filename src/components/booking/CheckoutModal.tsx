"use client";

import { useState } from "react";
import type { Listing, Booking } from "@/lib/models";
import { PricePanel } from "@/components/marketplace/PricePanel";
import { priceBreakdown, paymentModeFor } from "@/lib/services/pricingService";
import { createBooking, makeIdempotencyKey } from "@/lib/services/bookingService";
import { useGuest } from "@/components/booking/GuestProvider";
import { useToast, personalSuccess, personalError } from "@/components/ui/Toast";
import { paymentOptions, type PaymentOption } from "@/lib/providers/registry";
import { useI18n } from "@/components/i18n/LocaleProvider";

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
  const { t, money } = useI18n();
  // This is the preview checkout for the demo catalogue — see ListingDetail.
  // It reads the real session so it cannot disagree with the header about who
  // is signed in, but it takes no money and books nothing.
  const { guest } = useGuest();
  const existing = guest;
  const [step, setStep] = useState<Step>(existing ? "method" : "account");
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [idemKey] = useState(() => makeIdempotencyKey(listing.id, existing?.id ?? "guest"));
  const [simFail, setSimFail] = useState(false);
  const [option, setOption] = useState<PaymentOption | null>(null);
  const [phone, setPhone] = useState("");
  const [processingHint, setProcessingHint] = useState<string>("preview.processing");

  const breakdown = priceBreakdown(listing, nights);
  const pm = paymentModeFor(listing);
  const options = paymentOptions();

  function handleAccount() {
    // A preview needs no account. Creating one here would have meant a second
    // sign-up path with different rules from the real one.
    setStep("method");
  }

  async function handlePay() {
    if (!option) return;
    setProcessingHint(option.method === "mobile_money" ? "preview.approveOnPhone" : "preview.processing");
    setStep("processing");
    const user = guest;
    const res = await createBooking({
      listing, checkIn: "2025-08-30", checkOut: "2025-09-02", nights, guests: 2,
      buyerId: user?.id ?? "preview", buyerName: user?.name ?? (name || "Guest"), idempotencyKey: idemKey, simulateFailure: simFail,
      method: option.method, providerName: option.providerName, phone,
    });
    setBooking(res.data);
    setStep("result");
    // personalized, animated feedback
    const who = guest?.name;
    if (res.data && res.data.status !== "failed") {
      toast.success(
        personalSuccess(t, who),
        t("preview.confirmedAt", { name: listing.name }),
      );
    } else if (res.data) {
      toast.error(personalError(t, who), t("preview.failedNotCharged", { reason: res.data.failureReason ?? "" }));
    }
  }

  const needsPhone = option?.method === "mobile_money";
  const canPay = option && (!needsPhone || phone.replace(/\D/g, "").length >= 9);

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && step !== "processing" && onClose()}>
      <div className="modal">
        {step === "account" && (
          <>
            <h2>{t("preview.almostThere")}</h2>
            <p className="lede">{t("preview.takesSeconds")}</p>
            <div className="field"><label>{t("auth.fullName")}</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("buy.yourName")} /></div>
            <div className="field"><label>{t("auth.email")}</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
            <button className="btn btn-primary" disabled={busy} onClick={handleAccount}>{busy ? t("auth.creating") : t("checkout.continue")}</button>
          </>
        )}

        {step === "method" && (
          <>
            <h2>{t("preview.howToPay")}</h2>
            <p className="lede">{t("price.total")} {money(breakdown.total, listing.currency)} · {t("price.allIncluded")}</p>
            <div className="pay-options">
              {options.map((o) => (
                <button
                  key={o.method + o.providerName}
                  className={`pay-option ${option?.method === o.method && option?.providerName === o.providerName ? "sel" : ""}`}
                  onClick={() => setOption(o)}
                >
                  <span className="po-ico">{o.icon || "•"}</span>
                  <span className="po-txt"><b>{o.label}</b><span>{o.sublabel} · {t("preview.via", { provider: o.providerName })}</span></span>
                  <span className="po-radio" />
                </button>
              ))}
            </div>
            {needsPhone && (
              <div className="field" style={{ marginTop: 12 }}>
                <label>{t("preview.mobileMoneyNumber")}</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" inputMode="tel" />
              </div>
            )}
            <button className="btn btn-primary" disabled={!canPay} onClick={() => setStep("review")} style={{ marginTop: 14 }}>{t("preview.continue")}</button>
          </>
        )}

        {step === "review" && option && (
          <>
            <h2>{t("preview.reviewConfirm")}</h2>
            <p className="lede">{listing.name} · {listing.location}</p>
            <div className="escrow-band instant">
              <div className="eb-ico">⚡</div>
              <div><b>{t("preview.instantConfirmation")}</b><span>{t("preview.confirmedOnSuccess")}</span></div>
            </div>
            {/* The same component the listing page used. A guest who compared
                prices there is looking at the identical arithmetic here. */}
            <PricePanel listing={listing} nights={nights} compact />
            <div className="breakdown">
              <div className="br"><span>{t("preview.payingWith")}</span><span>{option.icon} {option.label}</span></div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--muted)", margin: "12px 0" }}>
              <input type="checkbox" checked={simFail} onChange={(e) => setSimFail(e.target.checked)} />
              {t("preview.simulateFailure")}
            </label>
            <button className="btn btn-primary" onClick={handlePay}>{t("preview.confirmAndPay", { total: money(breakdown.total, listing.currency) })}</button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setStep("method")}>{t("preview.changeMethod")}</button>
          </>
        )}

        {step === "processing" && (
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <div className="spinner" />
            <h2 style={{ marginTop: 18 }}>{t(option?.method === "mobile_money" ? "preview.awaitingApproval" : "preview.processing")}</h2>
            <p className="lede">{t(processingHint)} {t("preview.dontClose")}</p>
          </div>
        )}

        {step === "result" && booking && booking.status !== "failed" && (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="result-check ok">✓</div>
              <h2>{t("preview.bookingConfirmed")}</h2>
              <p className="lede">{t("preview.allSet")}</p>
            </div>
            <div className="receipt">
              <div className="br"><span>{t("preview.property")}</span><b>{booking.property}</b></div>
              <div className="br"><span>{t("preview.paidWith")}</span><b>{option?.label} · {option?.providerName}</b></div>
              <div className="br"><span>{t("preview.reference")}</span><b>{booking.reference}</b></div>
              <div className="br"><span>{t("preview.bookingCode")}</span><b>{booking.code}</b></div>
              <div className="br"><span>{t("preview.amount")}</span><b>{money(booking.breakdown.total, listing.currency)}</b></div>
              <div className="br"><span>{t("preview.status")}</span><b style={{ color: "var(--teal-ink)" }}>✓ {t("bookings.status.CONFIRMED")}</b></div>
            </div>
            <button className="btn btn-primary" onClick={() => onComplete(booking.escrowId ?? booking.id)}>{t("preview.viewBooking")}</button>
          </>
        )}

        {step === "result" && booking && booking.status === "failed" && (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="result-check fail">✕</div>
              <h2>{t("preview.paymentFailed")}</h2>
              <p className="lede">{t("preview.failedTryAgain", { reason: booking.failureReason ?? "" })}</p>
            </div>
            <div className="receipt">
              <div className="br"><span>{t("preview.reference")}</span><b>{booking.reference || "—"}</b></div>
              <div className="br"><span>{t("preview.status")}</span><b style={{ color: "#c0453a" }}>{t("preview.failedNotChargedShort")}</b></div>
            </div>
            <button className="btn btn-primary" onClick={() => setStep("method")}>{t("preview.tryDifferent")}</button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={onClose}>{t("bookings.cancel")}</button>
          </>
        )}
      </div>
    </div>
  );
}
