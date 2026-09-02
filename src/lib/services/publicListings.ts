import type { Listing, ListingType, Review } from "@/lib/models";

/**
 * Real published listings, shaped for the shopfront.
 *
 * The marketplace UI was built against a demo catalogue. Rather than rewrite
 * every card and detail panel, real rows from `/api/public/listings` are
 * adapted into the same `Listing` shape — with one honest difference:
 * `bookable: true`. The demo catalogue keeps `bookable` unset, so a Book button
 * only ever appears on a property that actually exists and can actually be
 * sold. Offering one on demo content would take money for a room nobody has.
 *
 * Real listings are always shown first, so a visitor meets the genuine
 * inventory before the filler.
 */

interface ApiListing {
  id: string; title: string; summary: string | null; description: string;
  kind: "STAY" | "RENT" | "SALE"; price: number; currency: string;
  maxGuests: number; bedrooms: number; bathrooms: number;
  amenities: string[]; images: string[];
  city: string | null; location: string | null;
  hostName: string; hostKind: string; publishedAt: string | null;
  priceUnit?: string;
  rating?: number | null;
  reviewCount?: number;
  roomTypes?: Listing["roomTypes"];
  reviews?: {
    id: string; stars: number; title: string | null; body: string;
    hostReply: string | null; createdAt: string; guestName: string;
  }[];
}

/** A stand-in when a host published without photographs. */
const PLACEHOLDER = "/paltas-logo.png";

/**
 * The demo catalogue's `type` is a fixed vocabulary; a real listing has none.
 * Inferred from what the host actually published rather than defaulted, so a
 * hotel does not present itself as a villa.
 */
function inferType(l: ApiListing): ListingType {
  if (l.roomTypes?.length) return "room";
  const text = `${l.title} ${l.summary ?? ""}`.toLowerCase();
  if (text.includes("hotel") || text.includes("suite")) return "suite";
  if (text.includes("penthouse")) return "penthouse";
  if (text.includes("villa")) return "villa";
  if (text.includes("cottage")) return "cottage";
  if (text.includes("studio")) return "studio";
  if (text.includes("house")) return "house";
  return "apartment";
}

export function adaptListing(l: ApiListing): Listing {
  return {
    id: l.id,
    name: l.title,
    type: inferType(l),
    location: l.location ?? l.city ?? "",
    city: l.city ?? "",
    // The public projection does not carry a country, and inventing one would
    // put listings in the wrong filter. The city is what the host stated.
    country: "",
    price: l.price,
    currency: l.currency,
    rating: l.rating ?? 0,
    reviewCount: l.reviewCount ?? 0,
    beds: l.bedrooms,
    baths: l.bathrooms,
    maxGuests: l.maxGuests,
    amenities: l.amenities,
    imageUrl: l.images[0] ?? PLACEHOLDER,
    gallery: l.images.length ? l.images : [PLACEHOLDER],
    superhost: false,
    hostId: l.hostName,
    description: l.description,
    bookable: true,
    roomTypes: l.roomTypes,
  };
}

/** Deterministic, so the same reviewer keeps the same colour between renders. */
const AVATAR_COLORS = ["#00c4ac", "#0b3d5c", "#f5a623", "#e0574a", "#7b61ff", "#2d9c6b"];

export function adaptReviews(l: ApiListing): Review[] {
  return (l.reviews ?? []).map((r, i) => ({
    id: r.id,
    // The API deliberately gives a first name only — someone reviewing a hotel
    // is not consenting to be indexed next to the dates they were there.
    author: r.guestName,
    initials: r.guestName.slice(0, 2).toUpperCase(),
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
    stars: r.stars,
    date: r.createdAt.slice(0, 10),
    text: r.body,
  }));
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    // Relative on the client; absolute on the server, where there is no origin.
    const base = typeof window === "undefined"
      ? process.env.PALTAS_INTERNAL_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`
      : "";
    const res = await fetch(`${base}/api${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // The shopfront must still render if the API is briefly unreachable. A
    // marketplace showing the demo catalogue beats one showing a stack trace.
    return null;
  }
}

export async function fetchRealListings(params: { kind?: string; city?: string; guests?: number } = {}): Promise<Listing[]> {
  const q = new URLSearchParams();
  if (params.kind) q.set("kind", params.kind);
  if (params.city) q.set("city", params.city);
  if (params.guests) q.set("guests", String(params.guests));
  const json = await fetchJson<{ listings: ApiListing[] }>(`/public/listings${q.toString() ? `?${q}` : ""}`);
  return (json?.listings ?? []).map(adaptListing);
}

export async function fetchRealListing(id: string): Promise<{ listing: Listing; reviews: Review[] } | null> {
  const json = await fetchJson<{ listing: ApiListing }>(`/public/listings/${id}`);
  if (!json?.listing) return null;
  return { listing: adaptListing(json.listing), reviews: adaptReviews(json.listing) };
}

/**
 * Demo ids are short and predictable (`l1`, `g412`); real ones are cuids. Used
 * to avoid a pointless API round trip for every catalogue card.
 */
export const looksReal = (id: string) => id.length > 20 && !/^g\d+$/.test(id);
