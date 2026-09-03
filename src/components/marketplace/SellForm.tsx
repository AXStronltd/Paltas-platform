"use client";

import { useState } from "react";
import Link from "next/link";
import { submitEnquiry } from "@/lib/services/enquiryService";

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
const TYPES = ["House", "Apartment", "Land", "Commercial", "Other"];

export function SellForm() {
  const [f, setF] = useState({
    name: "", contact: "", propertyType: "House", city: "", price: "", message: "",
  });
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError("Please give us a name.");
    if (!f.contact.trim()) return setError("Please leave an email address or a phone number.");
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
          <h1 className="choose-title">Thank you</h1>
          <p>{sent}</p>
          <p className="muted">
            <Link href="/">Back to PALTAS</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container detail">
      <Link href="/buy-sell" className="detail-back">← Buying or selling?</Link>
      <h1 className="choose-title">Sell your property</h1>
      <p className="choose-sub">
        Tell us about it and we will call you. No account, no fee to list, and no obligation.
      </p>

      <form className="enquiry" onSubmit={submit}>
        <div className="field">
          <label htmlFor="s-name">Your name</label>
          <input id="s-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
            required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="s-contact">Email or phone</label>
          <input id="s-contact" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })}
            required placeholder="you@example.com or +254 7…" autoComplete="email" />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="s-type">What are you selling</label>
            <select id="s-type" value={f.propertyType} onChange={(e) => setF({ ...f, propertyType: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-city">Where is it</label>
            <input id="s-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Nairobi" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="s-price">What do you hope to get <span className="muted">(optional)</span></label>
          <input id="s-price" inputMode="numeric" value={f.price}
            onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="15,000,000" />
        </div>

        <div className="field">
          <label htmlFor="s-msg">Anything we should know <span className="muted">(optional)</span></label>
          <textarea id="s-msg" rows={3} value={f.message}
            onChange={(e) => setF({ ...f, message: e.target.value })}
            placeholder="Three bedrooms, title deed ready, tenant in place until March…" />
        </div>

        {error && <div className="book-note bad">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Ask for a valuation"}
        </button>
        <p className="reassure">
          We only use these details to contact you about your property.
        </p>
      </form>
    </main>
  );
}
