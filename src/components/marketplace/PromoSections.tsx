"use client";

import Link from "next/link";

/**
 * Marketing / promo rows for the home page. These make the page feel richer and
 * build trust: security messaging (escrow, no hidden fees), travel inspiration,
 * a book-early nudge, and a call-to-action for hosts/developers to manage on
 * PALTAS. Pure presentational — no data dependency.
 */

/** Trust band — the three reasons to book with PALTAS. */
export function TrustBand() {
  const items = [
    { icon: "🔒", title: "Secure payments", body: "Every payment is processed through trusted, encrypted payment providers — your card details are never stored by us." },
    { icon: "✓", title: "No hidden fees, ever", body: "The price you see is the price you pay — cleaning, service and taxes all shown upfront." },
    { icon: "⭐", title: "Verified hosts & stays", body: "Every host is verified and every stay is reviewed, so you always know who you're booking with." },
  ];
  return (
    <section className="promo-trust">
      <div className="promo-trust-head">
        <h2>Book with total peace of mind</h2>
        <p>PALTAS keeps every booking safe from search to check-in.</p>
      </div>
      <div className="trust-grid">
        {items.map((it) => (
          <div key={it.title} className="trust-card">
            <div className="trust-ico">{it.icon}</div>
            <b>{it.title}</b>
            <span>{it.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Travel inspiration — destinations to encourage exploration. */
export function TravelInspiration() {
  const places = [
    { name: "Diani Beach", tag: "Beach escapes", grad: "linear-gradient(135deg,#00c4ac,#2ea6ff)" },
    { name: "Nairobi", tag: "City stays", grad: "linear-gradient(135deg,#7b5cff,#2ea6ff)" },
    { name: "Mombasa", tag: "Coastal villas", grad: "linear-gradient(135deg,#ff9d5c,#ff5c8a)" },
    { name: "Nanyuki", tag: "Mountain getaways", grad: "linear-gradient(135deg,#12b886,#00c4ac)" },
  ];
  return (
    <section className="promo-travel">
      <div className="promo-travel-head">
        <div>
          <h2>Where to next?</h2>
          <p>Discover stays travellers love across the region.</p>
        </div>
        <Link href="/" className="promo-link">Explore all →</Link>
      </div>
      <div className="travel-grid">
        {places.map((p) => (
          <Link key={p.name} href="/" className="travel-card" style={{ background: p.grad }}>
            <span className="travel-tag">{p.tag}</span>
            <b>{p.name}</b>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Book-early banner — a gentle urgency nudge. */
export function BookEarlyBanner() {
  return (
    <section className="promo-early">
      <div className="promo-early-text">
        <span className="promo-early-badge">Plan ahead</span>
        <h2>Book early, stay for less</h2>
        <p>The best homes get booked fast. Reserve now with instant confirmation and secure payment — simple, fast, and no hidden fees.</p>
        <Link href="/" className="btn btn-primary promo-early-btn">Find your stay</Link>
      </div>
      <div className="promo-early-art" aria-hidden="true">
        <div className="pe-circle pe-1" />
        <div className="pe-circle pe-2" />
        <div className="pe-emoji">🏝️</div>
      </div>
    </section>
  );
}

/** Business CTA — invite hosts, landlords, agents, developers to manage on PALTAS. */
export function BusinessCTA() {
  const roles = [
    { icon: "🏨", label: "Hotels", href: "/portal/hotel" },
    { icon: "🏠", label: "Landlords", href: "/portal/landlord" },
    { icon: "🤝", label: "Agents", href: "/portal/agent" },
    { icon: "🏗️", label: "Developers", href: "/portal/developer" },
  ];
  return (
    <section className="promo-business">
      <div className="promo-business-inner">
        <div className="promo-business-text">
          <span className="promo-business-badge">For partners</span>
          <h2>Building or managing property? Do it all on PALTAS.</h2>
          <p>List your rooms, manage tenants and rent, track leads, or sell units in your development — all from one dashboard, with secure payments built in.</p>
        </div>
        <div className="business-roles">
          {roles.map((r) => (
            <Link key={r.label} href={r.href} className="business-role">
              <span>{r.icon}</span>
              {r.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
