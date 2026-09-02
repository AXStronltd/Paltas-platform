import type { Listing } from "@/lib/models";
import { SafeImage } from "@/components/ui/SafeImage";
import { allInNightly } from "@/lib/services/pricingService";
import { HOSTS } from "@/lib/data/mock";
import { TrustStrip } from "./TrustBadges";

export function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const allIn = allInNightly(listing);
  const host = HOSTS[listing.hostId];

  return (
    <button className="card" onClick={onClick}>
      <div className="card-img">
        <SafeImage src={listing.imageUrl} alt={listing.name} />
        <span className="card-badge instant">
          ⚡ Instant confirmation
        </span>
      </div>
      <div className="card-body">
        <div className="card-top">
          <h3>{listing.name}</h3>
          <span className="card-star">★ {listing.rating}</span>
        </div>
        <div className="card-loc">
          {listing.location} · up to {listing.maxGuests} guests
        </div>
        <div className="card-price">
          <b>KSh {listing.price.toLocaleString()}</b> <span>/ night</span>
        </div>
        <div className="card-allin">
          <span className="t">KSh {allIn.toLocaleString()} total / night</span>
          <span className="nohidden">✓ all fees included</span>
        </div>
        {/* Evidence at a glance; the full detail is one tap away on the listing. */}
        <TrustStrip listing={listing} host={host} />
      </div>
    </button>
  );
}
