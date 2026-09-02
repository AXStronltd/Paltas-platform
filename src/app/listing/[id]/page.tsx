import { notFound } from "next/navigation";
import { getListing, getReviews } from "@/lib/services/listingService";
import { HOSTS } from "@/lib/data/mock";
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

  const host = HOSTS[listing.hostId] ?? HOSTS.h5;

  return <ListingDetail listing={listing} host={host} reviews={reviewsRes.data ?? []} />;
}
