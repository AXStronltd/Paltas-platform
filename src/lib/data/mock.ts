import type { Host, Listing, Review } from "@/lib/models";

/**
 * Mock seed data. Shapes conform exactly to the domain models, so when the
 * real API is connected the frontend sees no difference.
 */

export const HOSTS: Record<string, Host> = {
  h1: {
    id: "h1", name: "Amina Otieno", type: "Superhost", verified: true,
    responseTime: "within an hour", rating: 4.9, reviews: 214, initials: "AO",
    hostingSince: 2019, responseRate: 98,
    verifications: [
      { kind: "identity", verifiedAt: "Jan 2026", method: "Kenyan national ID matched to the account holder and to the payout account name." },
      { kind: "payment", verifiedAt: "Jan 2026", method: "Payouts confirmed to a bank account in the same registered name." },
    ],
  },
  h2: {
    id: "h2", name: "Prime Realty", type: "Agent", verified: true,
    responseTime: "within 2 hours", rating: 4.8, reviews: 186, initials: "PR",
    hostingSince: 2017, responseRate: 95,
    verifications: [
      { kind: "identity", verifiedAt: "Feb 2026", method: "Company registration and director ID checked against the business registry." },
      { kind: "licence", verifiedAt: "Feb 2026", method: "Estate agency licence verified with the Estate Agents Registration Board." },
      { kind: "payment", verifiedAt: "Feb 2026", method: "Payouts confirmed to the registered company account." },
    ],
  },
  h3: {
    id: "h3", name: "Daniel Kimani", type: "Landlord", verified: true,
    responseTime: "within a day", rating: 4.7, reviews: 52, initials: "DK",
    hostingSince: 2022, responseRate: 88,
    verifications: [
      { kind: "identity", verifiedAt: "Nov 2025", method: "Kenyan national ID matched to the account holder." },
      { kind: "payment", verifiedAt: "Nov 2025", method: "Payouts confirmed to a bank account in the same name." },
    ],
  },
  h4: {
    id: "h4", name: "Sarova Hotels", type: "Hotel host", verified: true,
    responseTime: "within an hour", rating: 4.8, reviews: 1240, initials: "SH",
    hostingSince: 2015, responseRate: 99,
    verifications: [
      { kind: "identity", verifiedAt: "Jan 2026", method: "Company registration verified and a named account manager appointed." },
      { kind: "licence", verifiedAt: "Jan 2026", method: "Tourism Regulatory Authority licence verified and current." },
      { kind: "payment", verifiedAt: "Jan 2026", method: "Payouts confirmed to the registered corporate account." },
    ],
  },
  h5: {
    id: "h5", name: "Grace Wambui", type: "Host", verified: true,
    responseTime: "within an hour", rating: 4.8, reviews: 97, initials: "GW",
    hostingSince: 2021, responseRate: 96,
    verifications: [
      { kind: "identity", verifiedAt: "Dec 2025", method: "Kenyan national ID matched to the account holder." },
    ],
  },
};

export const LISTINGS: Listing[] = [
  {
    id: "l1", name: "Beachfront Family Villa", type: "villa",
    location: "Nyali, Mombasa", city: "Mombasa", country: "Kenya",
    price: 12800, currency: "KES", rating: 4.9, reviewCount: 214,
    beds: 4, baths: 3, maxGuests: 8,
    amenities: ["wifi", "pool", "parking", "kitchen", "ac", "beach"],
    imageUrl: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80&auto=format&fit=crop",
    ],
    superhost: true, hostId: "h1", priceFreeze: true, cancellation: "flexible",
    verifications: [
      { kind: "ownership", verifiedAt: "Jan 2026", method: "Title deed checked against the Ministry of Lands register." },
      { kind: "inspection", verifiedAt: "Feb 2026", method: "Visited in person; rooms, amenities and photographs confirmed accurate." },
    ],
    description: "A beautifully appointed villa steps from the beach, perfect for family and travel stays.",
  },
  {
    id: "l2", name: "Ocean View Penthouse", type: "penthouse",
    location: "Bamburi, Mombasa", city: "Mombasa", country: "Kenya",
    price: 15200, currency: "KES", rating: 5.0, reviewCount: 189,
    beds: 3, baths: 2, maxGuests: 6,
    amenities: ["wifi", "pool", "ac", "beach", "kitchen"],
    imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80&auto=format&fit=crop",
    ],
    superhost: true, hostId: "h1", priceFreeze: true, cancellation: "flexible",
    verifications: [
      { kind: "ownership", verifiedAt: "Jan 2026", method: "Title deed checked against the Ministry of Lands register." },
      { kind: "inspection", verifiedAt: "Feb 2026", method: "Visited in person; rooms, amenities and photographs confirmed accurate." },
    ],
    description: "Panoramic ocean views from a modern penthouse with a private pool.",
  },
  {
    id: "l3", name: "Cozy Studio near CBD", type: "studio",
    location: "Kilimani, Nairobi", city: "Nairobi", country: "Kenya",
    price: 5200, currency: "KES", rating: 4.7, reviewCount: 97,
    beds: 1, baths: 1, maxGuests: 2,
    amenities: ["wifi", "workspace", "kitchen", "ac"],
    imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80&auto=format&fit=crop",
    gallery: ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80&auto=format&fit=crop"],
    superhost: false, hostId: "h5", priceFreeze: true, cancellation: "moderate",
    verifications: [
      { kind: "ownership", verifiedAt: "Dec 2025", method: "Lease agreement checked, permitting short-term letting." },
    ],
    description: "A bright, well-equipped studio a short walk from the city centre.",
  },
  {
    id: "l4", name: "Executive Business Suite", type: "apartment",
    location: "Upper Hill, Nairobi", city: "Nairobi", country: "Kenya",
    price: 9800, currency: "KES", rating: 4.9, reviewCount: 156,
    beds: 2, baths: 2, maxGuests: 3,
    amenities: ["wifi", "workspace", "parking", "ac", "kitchen"],
    imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80&auto=format&fit=crop",
    gallery: ["https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80&auto=format&fit=crop"],
    superhost: true, hostId: "h3", priceFreeze: true, cancellation: "moderate",
    verifications: [
      { kind: "ownership", verifiedAt: "Nov 2025", method: "Title deed checked against the Ministry of Lands register." },
      { kind: "inspection", verifiedAt: "Nov 2025", method: "Visited in person; workspace and connectivity confirmed." },
    ],
    description: "A polished apartment for business travellers, near the business district.",
  },
  {
    id: "l5", name: "Sarova Grand Hotel", type: "suite",
    location: "CBD, Nairobi", city: "Nairobi", country: "Kenya",
    price: 14500, currency: "KES", rating: 4.8, reviewCount: 1240,
    beds: 1, baths: 1, maxGuests: 2,
    amenities: ["wifi", "pool", "ac", "parking", "workspace"],
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80&auto=format&fit=crop",
    gallery: ["https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80&auto=format&fit=crop"],
    superhost: true, chain: true, stars: 5, hostId: "h4", priceFreeze: true, cancellation: "flexible",
    verifications: [
      { kind: "inspection", verifiedAt: "Jan 2026", method: "Property audited against its published star rating." },
      { kind: "licence", verifiedAt: "Jan 2026", method: "Tourism Regulatory Authority licence verified and current." },
    ],
    description: "A verified 5-star hotel in the heart of Nairobi with instant confirmation.",
  },
  {
    id: "l6", name: "Palm Court Inn", type: "room",
    location: "Nyali, Mombasa", city: "Mombasa", country: "Kenya",
    price: 6900, currency: "KES", rating: 4.3, reviewCount: 112,
    beds: 1, baths: 1, maxGuests: 2,
    amenities: ["wifi", "ac", "parking"],
    imageUrl: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80&auto=format&fit=crop",
    gallery: ["https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80&auto=format&fit=crop"],
    superhost: false, chain: false, stars: 3, hostId: "h5", cancellation: "strict",
    description: "An independent 3-star inn — instant confirmation and secure payment.",
  },
];

const REVIEW_POOL: Review[] = [
  { id: "r1", author: "Sarah M.", initials: "SM", color: "#00a894", stars: 5, date: "2 weeks ago", text: "Exactly as pictured — spotless and the host answered within minutes. Booking was quick and the payment was secure." },
  { id: "r2", author: "David O.", initials: "DO", color: "#2278c4", stars: 5, date: "1 month ago", text: "No hidden costs — the total I saw was the total I paid. Would book again through PALTAS." },
  { id: "r3", author: "Aisha K.", initials: "AK", color: "#e0894a", stars: 4, date: "3 weeks ago", text: "Lovely place and very responsive host. A great stay for the family." },
  { id: "r4", author: "James R.", initials: "JR", color: "#6a5cff", stars: 5, date: "5 days ago", text: "The verified badge and protected payment gave me real peace of mind booking from abroad." },
];

export function reviewsForListing(listingId: string): Review[] {
  const n = listingId.charCodeAt(listingId.length - 1);
  return REVIEW_POOL.slice(0, 3 + (n % 2));
}
