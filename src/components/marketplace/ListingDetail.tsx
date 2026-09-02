"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Host, Listing, Review } from "@/lib/models";
import { PricePanel } from "./PricePanel";
import { HostTrust, TrustBadges } from "./TrustBadges";
import { priceBreakdown, paymentModeFor } from "@/lib/services/pricingService";
import { CheckoutModal } from "@/components/booking/CheckoutModal";
import { SafeImage } from "@/components/ui/SafeImage";

const NIGHTS = 3; // in a full build this comes from a date picker

export function ListingDetail({
  listing,
  host,
  reviews,
}: {
  listing: Listing;
  host: Host;
  reviews: Review[];
}) {
  const router = useRouter();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const breakdown = priceBreakdown(listing, NIGHTS);
  const pm = paymentModeFor(listing);

  return (
    <main className="container detail">
      <Link href="/" className="detail-back">← Back to stays</Link>

      <div className="detail-gallery">
        {listing.gallery.slice(0, 3).map((src, i) => (
          <SafeImage key={i} src={src} alt={`${listing.name} ${i + 1}`} />
        ))}
      </div>

      <div className="detail-cols">
        <div>
          <h1>{listing.name}</h1>
          <div className="detail-sub">
            {listing.location} · ★ {listing.rating} ({listing.reviewCount} reviews) · up to {listing.maxGuests} guests
          </div>

          <div className="host-card">
            <div className="host-av">{host.initials}</div>
            <div className="host-info">
              <b>
                {host.name}
                {host.verified && <span className="verified">✓ Verified</span>}
              </b>
              <span>{host.type} · ★ {host.rating} · Responds {host.responseTime}</span>
            </div>
          </div>
          {/* What was actually checked, on this host and on this property. */}
          <HostTrust host={host} />

          <h3>Verified for this property</h3>
          <TrustBadges listing={listing} host={host} />

          <h3>About this place</h3>
          <p>{listing.description}</p>

          <h3>What this place offers</h3>
          <div className="amenities">
            {listing.amenities.map((a) => (
              <div key={a} className="a">✓ {a}</div>
            ))}
          </div>

          <h3>★ {listing.rating} · {listing.reviewCount} reviews</h3>
          <div className="reviews">
            {reviews.map((r) => (
              <div key={r.id} className="review">
                <div className="rev-head">
                  <div className="rev-av" style={{ background: r.color }}>{r.initials}</div>
                  <div>
                    <b>{r.author}</b>
                    <span>{r.date}</span>
                  </div>
                  <span className="rev-stars">{"★".repeat(r.stars)}</span>
                </div>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="book-card">
            <div className="trust-strip">
              <span>✓ Verified host</span>
              <span>⚡ Instant confirmation</span>
              <span>✓ No hidden fees</span>
            </div>
            <div className="book-price">
              <b>KSh {listing.price.toLocaleString()}</b> <span>/ night</span>
              {listing.priceFreeze && (
                <span className="price-freeze">Price frozen — this will not change after you book</span>
              )}
            </div>
            <div className="book-fields">
              <div className="bf-row">
                <div className="bf"><label>Check-in</label><div className="v">Sat, 30 Aug</div></div>
                <div className="bf"><label>Check-out</label><div className="v">Tue, 2 Sep</div></div>
              </div>
              <div className="bf"><label>Guests</label><div className="v">2 guests</div></div>
            </div>
            <button className="btn btn-primary" onClick={() => setCheckoutOpen(true)}>
              Reserve now
            </button>
            {/* Same component as the checkout, so the two cannot disagree. */}
            <PricePanel listing={listing} nights={NIGHTS} />
            <div className="reassure">You won&apos;t be charged yet · Full price shown above</div>
          </div>
        </div>
      </div>

      {checkoutOpen && (
        <CheckoutModal
          listing={listing}
          nights={NIGHTS}
          onClose={() => setCheckoutOpen(false)}
          onComplete={(bookingId) => {
            setCheckoutOpen(false);
            router.push(`/bookings?highlight=${bookingId}`);
          }}
        />
      )}
    </main>
  );
}
