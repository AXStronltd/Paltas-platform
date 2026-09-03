"use client";

import { useState } from "react";
import Link from "next/link";
import { submitEnquiry } from "@/lib/services/enquiryService";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * "I want to sell."
 *
 * No account required, deliberately. Someone deciding whether to sell a house
 * is not going to create a password first, and an enquiry that never arrives is
 * worth nothing. The lead lands with PALTAS operations, who route it to an
 * agent — see the note in /api/public/enquiries about why a seller with no
 * listing yet cannot honestly be assigned to a particular organisation.
 *
 * The form asks for very little. Every extra field on a first contact costs
 * responses, and the valuation conversation gathers the rest anyway.
 */
// The value is stored and read by staff, so it stays English; the label is
// what the seller reads, so it is translated.
const TYPES = [
  { value: "House", key: "sell.type.house" },
  { value: "Apartment", key: "sell.type.apartment" },
  { value: "Land", key: "sell.type.land" },
  { value: "Commercial", key: "sell.type.commercial" },
  { value: "Other", key: "sell.type.other" },
];

export function SellForm() {
  const { t } = useI18n();
  const [f, setF] = useState({
    name: "", contact: "", propertyType: "House", city: "", price: "", message: "",
  });
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError(t("sell.needName"));
    if (!f.contact.trim()) return setError(t("sell.needContact"));
    setBusy(true);
    setError(null);
    const isEmail = f.contact.includes("@");
    const res = await submitEnquiry({
      intent: "sell",
      name: f.name.trim(),
      ...(isEmail ? { email: f.contact.trim() } : { phone: f.contact.trim() }),
      propertyType: f.propertyType,
      city: f.city.trim() || undefined,
      // What they hope to get. Recorded as the budget field because that is
      // what it is on a Lead — the figure the conversation starts from.
      budget: f.price ? Number(f.price.replace(/[^\d]/g, "")) : undefined,
      message: f.message.trim() || undefined,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSent(res.data!.message);
  }

  if (sent) {
    return (
      <main className="container detail">
        <div className="empty-state">
          <h1 className="choose-title">{t("sell.thanks")}</h1>
          <p>{sent}</p>
          <p className="muted">
            <Link href="/">{t("sell.backHome")}</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container detail">
      <Link href="/buy-sell" className="detail-back">← {t("buysell.title")}</Link>
      <h1 className="choose-title">{t("sell.title")}</h1>
      <p className="choose-sub">
        {t("sell.sub")}
      </p>

      <form className="enquiry" onSubmit={submit}>
        <div className="field">
          <label htmlFor="s-name">{t("buy.yourName")}</label>
          <input id="s-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
            required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="s-contact">{t("buy.contact")}</label>
          <input id="s-contact" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })}
            required placeholder="you@example.com or +254 7…" autoComplete="email" />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="s-type">{t("sell.what")}</label>
            <select id="s-type" value={f.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })}>
              {TYPES.map((o) => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-city">{t("sell.whereIsIt")}</label>
            <input id="s-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Nairobi" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="s-price">{t("sell.hopeToGet")} <span className="muted">({t("sell.optional")})</span></label>
          <input id="s-price" inputMode="numeric" value={f.price}
            onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="15,000,000" />
        </div>

        <div className="field">
          <label htmlFor="s-msg">{t("sell.knowMore")} <span className="muted">({t("sell.optional")})</span></label>
          <textarea id="s-msg" rows={3} value={f.message}
            onChange={(e) => setF({ ...f, message: e.target.value })}
            placeholder="Three bedrooms, title deed ready, tenant in place until March…" />
        </div>

        {error && <div className="book-note bad">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t("buy.sending") : t("sell.askValuation")}
        </button>
        <p className="reassure">
          {t("sell.onlyContact")}
        </p>
      </form>
    </main>
  );
}
