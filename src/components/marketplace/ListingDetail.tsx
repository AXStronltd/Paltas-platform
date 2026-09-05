"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Host, Listing, Review } from "@/lib/models";
import { PricePanel } from "./PricePanel";
import { HostTrust, TrustBadges } from "./TrustBadges";
import { MessageHostButton } from "@/components/messages/MessageHostButton";
import { PropertyMap } from "@/components/maps/PropertyMap";
import { CheckoutModal } from "@/components/booking/CheckoutModal";
import { BookingPanel } from "@/components/booking/BookingPanel";
import { SafeImage } from "@/components/ui/SafeImage";
import { useI18n } from "@/components/i18n/LocaleProvider";

/** Where the example stay starts, when nobody has chosen yet. */
const DEFAULT_FROM = 30;
const DEFAULT_NIGHTS = 3;
const isoDay = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Whole nights between two dates, floored at one. */
function nightsBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/**
 * One listing, in full.
 *
 * The trust strip above the booking card used to be three hardcoded promises —
 * "✓ Verified host", "⚡ Instant confirmation", "✓ No hidden fees" — printed on
 * every listing whether or not any of them were true. A guest cannot tell a
 * claim the platform checked from a claim it typed, so each one now depends on
 * the fact behind it: the host being verified, the listing being bookable.
 *
 * The rating is shown only where reviews exist. "★ 0 (0 reviews)" beside a new
 * property reads as a verdict rather than an absence.
 */
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
  const { t, money, date } = useI18n();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Real state, not a constant. The dates below used to be printed text beside
  // a price fixed at three nights, so changing them changed nothing — the one
  // thing a price panel exists to do.
  const [checkIn, setCheckIn] = useState(isoDay(DEFAULT_FROM));
  const [checkOut, setCheckOut] = useState(isoDay(DEFAULT_FROM + DEFAULT_NIGHTS));
  const nights = nightsBetween(checkIn, checkOut);
  // A monthly rent and a sale price are not nightly rates, and a panel that
  // multiplies either by a number of nights is inventing a figure.
  const nightly = listing.kind !== "RENT" && listing.kind !== "SALE";
  const rated = listing.reviewCount > 0;

  return (
    <main className="container detail">
      <Link href="/" className="detail-back">← {t("listing.backToStays")}</Link>

      <div className="detail-gallery">
        {listing.gallery.slice(0, 3).map((src, i) => (
          <SafeImage key={i} src={src} alt={`${listing.name} ${i + 1}`} />
        ))}
      </div>

      <div className="detail-cols">
        <div>
          <h1>{listing.name}</h1>
          <div className="detail-sub">
            {listing.location}
            {rated && ` · ★ ${listing.rating.toFixed(1)} (${t("listing.reviews", { count: listing.reviewCount })})`}
            {` · ${t("card.upToGuests", { count: listing.maxGuests })}`}
          </div>

          <div className="host-card">
            <div className="host-av">{host.initials}</div>
            <div className="host-info">
              <b>
                {host.name}
                {host.verified && <span className="verified">✓ {t("trust.verified")}</span>}
              </b>
              <span>
                {host.type}
                {host.reviews > 0 && ` · ★ ${host.rating}`}
                {host.responseTime && ` · ${t("listing.respondsIn", { time: host.responseTime })}`}
              </span>
            </div>
            <MessageHostButton listingId={listing.id} />
          </div>
          {/* What was actually checked, on this host and on this property. */}
          <HostTrust host={host} />

          {/* The heading would otherwise stand over nothing on every listing
              that has not been through verification yet. */}
          {(listing.verifications?.length || host.verifications?.length) ? (
            <>
              <h3>{t("listing.verifiedForProperty")}</h3>
              <TrustBadges listing={listing} host={host} />
            </>
          ) : null}

          <h3>{t("listing.about")}</h3>
          <p>{listing.description}</p>

          <h3>{t("listing.offers")}</h3>
          <div className="amenities">
            {listing.amenities.map((a) => (
              <div key={a} className="a">✓ {a}</div>
            ))}
          </div>

          {/* The same map component the search results use, given one listing
              instead of fifty. A second one built for this page would be a
              second thing to keep working. Geocoded from the location the
              listing already carries — there are no coordinates on a property
              to read, and inventing a column for them is not this change. */}
          <h3>{listing.location ? `${listing.location}, ${listing.city}` : listing.city}</h3>
          <PropertyMap listings={[listing]} />

          <h3>
            {rated
              ? `★ ${listing.rating.toFixed(1)} · ${t("listing.reviews", { count: listing.reviewCount })}`
              : t("listing.noReviews")}
          </h3>
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
            {/* Only what is true of this listing. */}
            <div className="trust-strip">
              {host.verified && <span>✓ {t("listing.verifiedHost")}</span>}
              {listing.bookable && <span>{t("card.instantConfirmation")}</span>}
              <span>✓ {t("listing.noHiddenFees")}</span>
            </div>
            {listing.priceFreeze && (
              <span className="price-freeze">{t("listing.priceFrozen")}</span>
            )}

            {/* A real published listing can actually be sold, so it gets the
                real panel: live dates, a server-priced quote and a booking that
                claims inventory. The demo catalogue cannot, and must not offer
                to take money for a room nobody has. */}
            {listing.bookable ? (
              <BookingPanel listing={listing} />
            ) : (
              <>
                <div className="book-price">
                  <b>{money(listing.price, listing.currency)}</b>{" "}
                  <span>{listing.kind === "SALE" ? "" : listing.kind === "RENT" ? t("card.perMonth") : t("card.perNight")}</span>
                </div>
                {nightly && (
                  <div className="book-fields">
                    <div className="bf-row">
                      <div className="bf">
                        <label htmlFor="ld-in">{t("book.checkIn")}</label>
                        <input id="ld-in" type="date" value={checkIn} min={isoDay(0)}
                          onChange={(e) => {
                            setCheckIn(e.target.value);
                            // Leaving before arriving is not a shorter stay, it
                            // is an impossible one.
                            if (e.target.value >= checkOut) {
                              setCheckOut(new Date(new Date(e.target.value).getTime() + 86_400_000).toISOString().slice(0, 10));
                            }
                          }} />
                      </div>
                      <div className="bf">
                        <label htmlFor="ld-out">{t("book.checkOut")}</label>
                        <input id="ld-out" type="date" value={checkOut} min={checkIn}
                          onChange={(e) => setCheckOut(e.target.value)} />
                      </div>
                    </div>
                    <div className="bf">
                      <label>{t("book.guests")}</label>
                      <div className="v">{t("search.guests", { count: 2 })}</div>
                    </div>
                  </div>
                )}
                <div className="book-note">
                  {t("listing.exampleOnly")} <Link href="/">{t("listing.browseReal")}</Link>
                </div>
                <button className="btn btn-primary" onClick={() => setCheckoutOpen(true)}>
                  {t("listing.previewCheckout")}
                </button>
              </>
            )}
            {!listing.bookable && (
              <>
                {/* Same component as the checkout, so the two cannot disagree. */}
                {nightly && <PricePanel listing={listing} nights={nights} />}
                <div className="reassure">{t("listing.notCharged")}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {checkoutOpen && !listing.bookable && (
        <CheckoutModal
          listing={listing}
          nights={nights}
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

/** Illustrative dates for the example listing, formatted in the reader's locale. */
