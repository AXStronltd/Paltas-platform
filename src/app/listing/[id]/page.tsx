import { notFound } from "next/navigation";
import { getListing, getReviews } from "@/lib/services/listingService";
import { HOSTS } from "@/lib/data/mock";
import type { Host } from "@/lib/models";
import { ListingDetail } from "@/components/marketplace/ListingDetail";

export function generateStaticParams() {
  return ["l1","l2","l3","l4","l5","l6"].map((id) => ({ id }));
}


/**
 * Listing detail page (server component). Loads the listing, its host and
 * reviews through services, then hands off to the ListingDetail client
 * component which owns the booking journey (Reserve → checkout → confirm).
 */
export default async function ListingPage({ params }: { params: { id: string } }) {
  const [listingRes, reviewsRes] = await Promise.all([
    getListing(params.id),
    getReviews(params.id),
  ]);

  const listing = listingRes.data;
  if (!listing) notFound();

  /*
   * A real listing gets its real host, and no trust it has not earned.
   *
   * This used to fall back to HOSTS.h5 whenever the id was not in the demo
   * catalogue — which is every real listing, since their hostId is the host's
   * name. The result on the live site was a fabricated persona on genuine
   * property: "Grace Wambui · Verified · ID verified · 4.8 stars · 97 reviews",
   * shown directly beneath the listing's own "0 reviews".
   *
   * Inventing a verification is worse than showing none. It is a claim about a
   * real person's identity having been checked, on a page where money changes
   * hands, and it was not checked.
   */
  const host: Host = listing.bookable
    ? {
        id: listing.hostId,
        name: listing.hostId,
        type: "Host",
        // Nothing here is verified until something actually verifies it.
        verified: false,
        responseTime: "",
        rating: 0,
        reviews: listing.reviewCount ?? 0,
        initials: listing.hostId.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(),
      }
    : HOSTS[listing.hostId] ?? HOSTS.h5;

  return <ListingDetail listing={listing} host={host} reviews={reviewsRes.data ?? []} />;
}
