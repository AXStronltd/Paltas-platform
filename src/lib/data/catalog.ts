import type { Listing } from "@/lib/models";

/**
 * Catalog generator — produces a large, varied set of listings so the discovery
 * carousels have real depth to scroll through endlessly. Deterministic (seeded)
 * so the same listing id always yields the same data. This stands in for a real
 * inventory API; when the backend is ready, these functions become API calls
 * with the same shapes.
 */

const CITIES = [
  { city: "Mombasa", country: "Kenya", area: ["Nyali", "Bamburi", "Diani", "Shanzu"] },
  { city: "Nairobi", country: "Kenya", area: ["Kilimani", "Westlands", "Karen", "Upper Hill", "Lavington"] },
  { city: "Nanyuki", country: "Kenya", area: ["Mount Kenya", "Timau"] },
  { city: "Kisumu", country: "Kenya", area: ["Milimani", "Lakeside"] },
  { city: "Zanzibar", country: "Tanzania", area: ["Stone Town", "Nungwi", "Paje"] },
  { city: "Cape Town", country: "South Africa", area: ["Camps Bay", "Sea Point", "Waterfront"] },
  { city: "Dubai", country: "UAE", area: ["Marina", "Downtown", "Palm Jumeirah"] },
  { city: "Kigali", country: "Rwanda", area: ["Nyarutarama", "Kimihurura"] },
  { city: "Accra", country: "Ghana", area: ["Osu", "Cantonments", "Labadi"] },
  { city: "Lagos", country: "Nigeria", area: ["Victoria Island", "Lekki", "Ikoyi"] },
  { city: "London", country: "UK", area: ["Shoreditch", "Kensington", "Camden"] },
  { city: "Lisbon", country: "Portugal", area: ["Alfama", "Baixa", "Belém"] },
];

const TYPES: { type: Listing["type"]; label: string; beds: [number, number] }[] = [
  { type: "villa", label: "Villa", beds: [3, 6] },
  { type: "apartment", label: "Apartment", beds: [1, 3] },
  { type: "studio", label: "Studio", beds: [1, 1] },
  { type: "penthouse", label: "Penthouse", beds: [2, 4] },
  { type: "house", label: "House", beds: [2, 5] },
  { type: "cottage", label: "Cottage", beds: [1, 3] },
  { type: "loft", label: "Loft", beds: [1, 2] },
  { type: "suite", label: "Suite", beds: [1, 2] },
];

const ADJ = ["Serene", "Golden", "Coastal", "Skyline", "Garden", "Sunset", "Azure", "Riverside", "Palm", "Emerald", "Urban", "Hidden", "Grand", "Cozy", "Modern", "Panoramic"];
const NOUN = ["Retreat", "Haven", "Residence", "Escape", "Nest", "View", "Lodge", "Suite", "Villa", "Loft", "Hideaway", "Place", "Home", "Sanctuary"];

// Curated Unsplash photos (load live on the web). Cycled deterministically.
const PHOTOS = [
  "photo-1512917774080-9991f1c4c750", "photo-1600585154340-be6161a56a0c",
  "photo-1600607687939-ce8a6c25118c", "photo-1560448204-e02f11c3d0e2",
  "photo-1512918728675-ed5a9ecdebfd", "photo-1502672260266-1c1ef2d93688",
  "photo-1522708323590-d24dbb6b0267", "photo-1493809842364-78817add7ffb",
  "photo-1560185007-cde436f6a4d0", "photo-1571003123894-1f0594d2b5d9",
  "photo-1566073771259-6a8506099945", "photo-1582719478250-c89cae4dc85b",
  "photo-1568605114967-8130f3a36994", "photo-1613490493576-7fde63acd811",
  "photo-1449824913935-59a10b8d2000", "photo-1505691938895-1758d7feb511",
];

function seeded(n: number) {
  // simple deterministic pseudo-random from an integer
  let x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

/** Build a single listing deterministically from a numeric index. */
export function makeListing(i: number): Listing {
  const c = CITIES[i % CITIES.length];
  const area = c.area[Math.floor(seeded(i * 3) * c.area.length)];
  const t = TYPES[Math.floor(seeded(i * 7) * TYPES.length)];
  const beds = t.beds[0] + Math.floor(seeded(i * 11) * (t.beds[1] - t.beds[0] + 1));
  const baths = Math.max(1, beds - 1 + Math.floor(seeded(i * 13) * 2));
  const maxGuests = beds * 2;
  const priceBase = 3000 + Math.floor(seeded(i * 17) * 45000);
  const rating = Math.round((4.2 + seeded(i * 19) * 0.8) * 10) / 10;
  const reviewCount = 12 + Math.floor(seeded(i * 23) * 480);
  const name = `${ADJ[Math.floor(seeded(i * 29) * ADJ.length)]} ${NOUN[Math.floor(seeded(i * 31) * NOUN.length)]}`;
  const photo = PHOTOS[i % PHOTOS.length];
  const img = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;
  const stars = t.type === "suite" || t.type === "penthouse" ? 3 + Math.floor(seeded(i * 37) * 3) : undefined;

  return {
    id: `g${i}`,
    name,
    type: t.type,
    location: `${area}, ${c.city}`,
    city: c.city,
    country: c.country,
    price: priceBase,
    currency: "KES",
    rating,
    reviewCount,
    beds, baths, maxGuests,
    amenities: (["wifi", "kitchen", "parking", "ac", "pool"] as Listing["amenities"]).filter((_, k) => seeded(i * (k + 41)) > 0.4),
    imageUrl: img(photo),
    gallery: [img(photo), img(PHOTOS[(i + 1) % PHOTOS.length]), img(PHOTOS[(i + 2) % PHOTOS.length])],
    superhost: seeded(i * 43) > 0.6,
    chain: false,
    stars,
    hostId: `h${(i % 5) + 1}`,
    description: `A beautiful ${t.label.toLowerCase()} in ${area}, ${c.city}. Perfect for your next stay — instant confirmation and secure payment.`,
  };
}

/**
 * Fetch a page of listings for a given discovery row. Deterministic and
 * paginated so the carousel can load endlessly without loading everything.
 * `rowSeed` gives each row its own distinct slice of the catalog.
 */
export function getRowPage(rowSeed: number, page: number, pageSize = 8): Listing[] {
  const start = rowSeed * 1000 + page * pageSize;
  return Array.from({ length: pageSize }, (_, k) => makeListing(start + k + 1));
}
