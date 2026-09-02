import { isMock } from "@/lib/config";
import type { Listing, Review, SearchFilters, Result, StayMode } from "@/lib/models";
import { LISTINGS, reviewsForListing } from "@/lib/data/mock";
import { apiGet, mockDelay } from "./apiClient";

/**
 * Listing service — the ONLY module that knows where listing data comes from.
 * Pages and components call these functions and never touch mock data or fetch
 * directly. To go live, implement the `// API:` branches; callers stay identical.
 */

function classifyMode(l: Listing): StayMode {
  if (["penthouse", "suite", "room"].includes(l.type)) return "hotel";
  if (["apartment", "studio", "house"].includes(l.type)) return "rent";
  return "stays";
}

export async function searchListings(filters: SearchFilters = {}): Promise<Result<Listing[]>> {
  if (isMock()) {
    let list = [...LISTINGS];
    if (filters.city) list = list.filter((l) => l.city.toLowerCase() === filters.city!.toLowerCase());
    if (filters.mode && filters.mode !== "all") list = list.filter((l) => classifyMode(l) === filters.mode);
    if (filters.guests) list = list.filter((l) => l.maxGuests >= filters.guests!);
    if (filters.maxPrice) list = list.filter((l) => l.price <= filters.maxPrice!);
    if (filters.amenities?.length) list = list.filter((l) => filters.amenities!.every((a) => l.amenities.includes(a)));
    return mockDelay({ data: list, error: null });
  }
  // API: return apiGet<Listing[]>(`/listings?${new URLSearchParams(filters as any)}`);
  return apiGet<Listing[]>(`/listings`);
}

export async function getListing(id: string): Promise<Result<Listing | null>> {
  if (isMock()) {
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
  // API: return apiGet<Listing>(`/listings/${id}`);
  return apiGet<Listing | null>(`/listings/${id}`);
}

export async function getReviews(listingId: string): Promise<Result<Review[]>> {
  if (isMock()) {
    return mockDelay({ data: reviewsForListing(listingId), error: null });
  }
  // API: return apiGet<Review[]>(`/listings/${listingId}/reviews`);
  return apiGet<Review[]>(`/listings/${listingId}/reviews`);
}

export { classifyMode };
