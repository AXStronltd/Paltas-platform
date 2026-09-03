"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/models";
import { searchListings } from "@/lib/services/listingService";
import { submitEnquiry } from "@/lib/services/enquiryService";
import { SafeImage } from "@/components/ui/SafeImage";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * Property for sale, and a way to ask about it.
 *
 * Only real published listings are shown here. The demo catalogue that fills
 * the stays page is deliberately excluded: someone browsing to buy a house is
 * making a decision worth hundreds of thousands, and showing them invented
 * stock alongside genuine stock would be indefensible.
 *
 * If there is nothing for sale yet, the page says so and takes the enquiry
 * anyway — an empty result is not a reason to lose the buyer.
 */
export function BuyBrowser() {
  const { t, money } = useI18n();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", city: "", budget: "", message: "" });

  const load = useCallback(async () => {
    const res = await searchListings({});
    const forSale = (res.data ?? []).filter((l) => l.bookable && l.kind === "SALE");
    setListings(forSale);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(listingId?: string) {
    if (!form.name.trim()) return setError(t("sell.needName"));
    if (!form.contact.trim()) return setError(t("sell.needContact"));
    setBusy(true);
    setError(null);
    const isEmail = form.contact.includes("@");
    const res = await submitEnquiry({
      intent: "buy",
      name: form.name.trim(),
      ...(isEmail ? { email: form.contact.trim() } : { phone: form.contact.trim() }),
      listingId,
      city: form.city.trim() || undefined,
      budget: form.budget ? Number(form.budget.replace(/[^\d]/g, "")) : undefined,
      message: form.message.trim() || undefined,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSent(res.data!.message);
  }

  return (
    <main className="container detail">
      <Link href="/buy-sell" className="detail-back">← {t("buysell.title")}</Link>
      <h1 className="choose-title">{t("buy.title")}</h1>

      {listings === null && <p className="muted">{t("common.loading")}</p>}

      {listings && listings.length > 0 && (
        <div className="cards">
          {listings.map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`} className="card">
              <div className="card-media"><SafeImage src={l.imageUrl} alt={l.name} /></div>
              <div className="card-body">
                <b>{l.name}</b>
                <span>{[l.location, l.city].filter(Boolean).join(", ")}</span>
                {/* Formatted for the reader, not for English: this hardcoded
                    "en" put a French buyer's price in American grouping. */}
                <span className="card-price">{money(l.price, l.currency)}</span>
                <span>{t("buy.bedsBaths", { beds: l.beds, baths: l.baths })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {listings && listings.length === 0 && (
        <div className="empty-state">
          <p>{t("buy.nothingYet")}</p>
          <p className="muted">{t("buy.tellUs")}</p>
        </div>
      )}

      <section className="enquiry">
        <h2>{t("buy.formTitle")}</h2>
        {sent ? (
          <div className="book-note">{sent}</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="b-name">{t("buy.yourName")}</label>
              <input id="b-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="b-contact">{t("buy.contact")}</label>
              <input id="b-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="you@example.com or +254 7…" autoComplete="email" />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="b-city">{t("buy.where")}</label>
                <input id="b-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Nairobi" />
              </div>
              <div className="field">
                <label htmlFor="b-budget">{t("buy.budget")}</label>
                <input id="b-budget" inputMode="numeric" value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="12,000,000" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="b-msg">{t("buy.anythingElse")}</label>
              <textarea id="b-msg" rows={3} value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Three bedrooms, garden, near a school…" />
            </div>
            {error && <div className="book-note bad">{error}</div>}
            <button className="btn btn-primary" disabled={busy} onClick={() => send()}>
              {busy ? t("buy.sending") : t("buy.send")}
            </button>
            <p className="reassure">{t("buy.noAccount")}</p>
          </>
        )}
      </section>
    </main>
  );
}
