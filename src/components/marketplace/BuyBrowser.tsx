"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/models";
import { searchListings } from "@/lib/services/listingService";
import { submitEnquiry } from "@/lib/services/enquiryService";
import { SafeImage } from "@/components/ui/SafeImage";

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
    if (!form.name.trim()) return setError("Please give us a name.");
    if (!form.contact.trim()) return setError("Please leave an email address or a phone number.");
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
      <Link href="/buy-sell" className="detail-back">← Buying or selling?</Link>
      <h1 className="choose-title">Property for sale</h1>

      {listings === null && <p className="muted">Loading…</p>}

      {listings && listings.length > 0 && (
        <div className="cards">
          {listings.map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`} className="card">
              <div className="card-media"><SafeImage src={l.imageUrl} alt={l.name} /></div>
              <div className="card-body">
                <b>{l.name}</b>
                <span>{[l.location, l.city].filter(Boolean).join(", ")}</span>
                <span className="card-price">
                  {new Intl.NumberFormat("en", { style: "currency", currency: l.currency, maximumFractionDigits: 0 }).format(l.price)}
                </span>
                <span>{l.beds} bed · {l.baths} bath</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {listings && listings.length === 0 && (
        <div className="empty-state">
          <p>Nothing is listed for sale on PALTAS just yet.</p>
          <p className="muted">
            Tell us what you are looking for below and an agent will contact you when something
            matches — often before it is advertised.
          </p>
        </div>
      )}

      <section className="enquiry">
        <h2>Tell us what you are looking for</h2>
        {sent ? (
          <div className="book-note">{sent}</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="b-name">Your name</label>
              <input id="b-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="b-contact">Email or phone</label>
              <input id="b-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="you@example.com or +254 7…" autoComplete="email" />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="b-city">Where</label>
                <input id="b-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Nairobi" />
              </div>
              <div className="field">
                <label htmlFor="b-budget">Budget</label>
                <input id="b-budget" inputMode="numeric" value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="12,000,000" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="b-msg">Anything else</label>
              <textarea id="b-msg" rows={3} value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Three bedrooms, garden, near a school…" />
            </div>
            {error && <div className="book-note bad">{error}</div>}
            <button className="btn btn-primary" disabled={busy} onClick={() => send()}>
              {busy ? "Sending…" : "Send my requirements"}
            </button>
            <p className="reassure">No account needed. We only use this to contact you about property.</p>
          </>
        )}
      </section>
    </main>
  );
}
