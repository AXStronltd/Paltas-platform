import { showDemoCatalogue } from "@/lib/config";
import type { Listing, Review, SearchFilters, Result, StayMode } from "@/lib/models";
import { LISTINGS, reviewsForListing } from "@/lib/data/mock";
import { mockDelay } from "./apiClient";
import { fetchRealListing, fetchRealListings, looksReal } from "./publicListings";

/**
 * Listing service — the ONLY module that knows where listing data comes from.
 * Pages and components call these functions and never touch mock data or fetch
 * directly.
 *
 * There are now two sources, and they are not interchangeable:
 *
 *   Real listings come from /api/public/listings — actual rows a host has
 *   published, which can actually be booked and paid for. They carry
 *   `bookable: true` and are always shown first.
 *
 *   The demo catalogue is fiction, kept for local development. It is not
 *   bookable, and it is off unless NEXT_PUBLIC_DEMO_CATALOGUE=true.
 *
 * Real listings from the database are always the answer. NEXT_PUBLIC_DEMO_CATALOGUE
 * decides only whether examples are added on top of them for local development,
 * never whether genuine inventory is used.
 *
 * The demo catalogue used to be gated on a data-source switch, which conflated
 * two unrelated decisions and put six invented properties on the live shopfront.
 * A visitor cannot tell filler from inventory, so there must be none.
 */

function classifyMode(l: Listing): StayMode {
  if (["penthouse", "suite", "room"].includes(l.type)) return "hotel";
  if (["apartment", "studio", "house"].includes(l.type)) return "rent";
  return "stays";
}

export async function searchListings(filters: SearchFilters = {}): Promise<Result<Listing[]>> {
  // Real inventory first, always. A visitor should meet a property that exists
  // before they meet one that does not.
  // An explicit kind wins over one inferred from the stay mode: someone who
  // asked for property to buy did not ask for a kind of stay.
  const kind = filters.kind
    ?? (filters.mode === "rent" ? "RENT"
      : filters.mode === "hotel" || filters.mode === "stays" ? "STAY"
      : undefined);

  const real = await fetchRealListings({ city: filters.city, guests: filters.guests, kind });

  if (showDemoCatalogue()) {
    let list = [...LISTINGS];
    // Matched loosely and across several fields: someone typing "mombasa",
    // "Diani" or "beach" is describing where they want to be, not naming a
    // database column. An exact city match found nothing for most of them.
    if (filters.city) {
      const q = filters.city.trim().toLowerCase();
      list = list.filter((l) =>
        [l.city, l.location, l.country, l.name].some((v) => (v ?? "").toLowerCase().includes(q)));
    }
    if (filters.mode && filters.mode !== "all") list = list.filter((l) => classifyMode(l) === filters.mode);
    if (filters.guests) list = list.filter((l) => l.maxGuests >= filters.guests!);
    if (filters.maxPrice) list = list.filter((l) => l.price <= filters.maxPrice!);
    if (filters.amenities?.length) list = list.filter((l) => filters.amenities!.every((a) => l.amenities.includes(a)));
    // The demo catalogue has no transaction kind, so a search for property to
    // buy must not pad its results with invented stays.
    if (kind) list = [];
    return mockDelay({ data: [...real, ...list], error: null });
  }
  // Real inventory is the whole answer when the demo catalogue is off, which
  // is everywhere a member of the public can reach.
  return { data: real, error: null };
}

export async function getListing(id: string): Promise<Result<Listing | null>> {
  // A cuid-shaped id can only be a real listing, so this costs nothing on
  // catalogue ids and saves a round trip on every one of them.
  if (looksReal(id)) {
    const found = await fetchRealListing(id);
    if (found) return { data: found.listing, error: null };
    // Fall through: an unknown id is a 404 either way, and the catalogue lookup
    // below is what produces it.
  }

  if (showDemoCatalogue()) {
    // Generated catalog listings (discovery rows) have ids like "g123".
    if (id.startsWith("g")) {
      const n = parseInt(id.slice(1), 10);
      if (!Number.isNaN(n)) {
        const { makeListing } = await import("@/lib/data/catalog");
        return mockDelay({ data: makeListing(n), error: null });
      }
    }
    const found = LISTINGS.find((l) => l.id === id) ?? null;
    return mockDelay({ data: found, error: null });
  }
  return { data: null, error: null };
}

export async function getReviews(listingId: string): Promise<Result<Review[]>> {
  if (looksReal(listingId)) {
    const found = await fetchRealListing(listingId);
    if (found) return { data: found.reviews, error: null };
  }

  if (showDemoCatalogue()) {
    return mockDelay({ data: reviewsForListing(listingId), error: null });
  }
  // Inventing reviews for a real property is the same lie as inventing the
  // property, so an unknown listing simply has none.
  return { data: [], error: null };
}

export { classifyMode };
