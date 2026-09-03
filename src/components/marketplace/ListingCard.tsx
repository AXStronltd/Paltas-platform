"use client";

import type { Listing } from "@/lib/models";
import { SafeImage } from "@/components/ui/SafeImage";
import { allInNightly } from "@/lib/services/pricingService";
import { TrustStrip } from "./TrustBadges";
import { useI18n } from "@/components/i18n/LocaleProvider";

/**
 * One listing, as a card.
 *
 * Three things this used to claim without evidence, all now conditional on
 * being true:
 *
 *  - The host. It looked the listing's `hostId` up in the demo catalogue's
 *    `HOSTS` table. A real listing's `hostId` is the host's name, so the lookup
 *    missed and the card showed whatever verifications happened to be attached
 *    to nobody. It passes only the listing now, so a badge can only come from a
 *    check recorded against this property.
 *  - The rating. `★ {rating}` rendered "★ 0" on every property with no reviews,
 *    which reads as a terrible one rather than a new one.
 *  - Instant confirmation, which was promised on listings that cannot be booked.
 *
 * The price is in the listing's own currency and the reader's number format,
 * not a hardcoded "KSh".
 */
export function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const { t, money } = useI18n();
  const allIn = allInNightly(listing);
  // An all-in nightly rate means nothing for a house for sale, and the wrong
  // thing for a monthly let.
  const isStay = listing.kind !== "RENT" && listing.kind !== "SALE";

  return (
    <button className="card" onClick={onClick}>
      <div className="card-img">
        <SafeImage src={listing.imageUrl} alt={listing.name} emptyLabel={t("listing.noPhoto")} />
        {listing.bookable && (
          <span className="card-badge instant">{t("card.instantConfirmation")}</span>
        )}
      </div>
      <div className="card-body">
        <div className="card-top">
          <h3>{listing.name}</h3>
          {listing.reviewCount > 0 && (
            <span className="card-star">★ {listing.rating.toFixed(1)}</span>
          )}
        </div>
        <div className="card-loc">
          {listing.location} · {t("card.upToGuests", { count: listing.maxGuests })}
        </div>
        <div className="card-price">
          <b>{money(listing.price, listing.currency)}</b>{" "}
          <span>{listing.kind === "SALE" ? "" : listing.kind === "RENT" ? t("card.perMonth") : t("card.perNight")}</span>
        </div>
        {isStay && (
          <div className="card-allin">
            <span className="t">{t("card.allInPerNight", { amount: money(allIn, listing.currency) })}</span>
            <span className="nohidden">✓ {t("price.allIncluded")}</span>
          </div>
        )}
        {/* Evidence at a glance; the full detail is one tap away on the listing. */}
        <TrustStrip listing={listing} />
      </div>
    </button>
  );
}
