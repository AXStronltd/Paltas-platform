# PALTAS Smart Living — Full Codebase Reference

> Single-file reference of the entire PALTAS frontend source (Next.js + TypeScript).
> For reading & sharing. Generated 2026-08-22.

PALTAS is a stays / real-estate marketplace. The money moment is a **booking
payment held in escrow and released to the host** — not a payments-transfer app.

**Architecture in one line:** the UI calls route handlers in this same repository
under `src/app/api/`, which read and write PostgreSQL through Prisma; the pure
decision-making (availability, pricing, permissions, the payout ledger) lives in
`src/lib/` with no database access at all, so it can be tested directly. Payment providers (Stripe, Appra Pay, Mobile
money) sit behind a `PaymentProvider` interface and swap via one line in the registry.

---

## Table of contents

**PROJECT CONFIG**  
&nbsp;&nbsp;1. `package.json`  
&nbsp;&nbsp;2. `tsconfig.json`  
&nbsp;&nbsp;3. `next.config.mjs`  

**ARCHITECTURE CORE — models, config, mock data**  
&nbsp;&nbsp;4. `src/lib/models/index.ts`  
&nbsp;&nbsp;5. `src/lib/config/index.ts`  
&nbsp;&nbsp;6. `src/lib/data/mock.ts`  
&nbsp;&nbsp;7. `src/lib/data/portals.ts`  

**PROVIDER ABSTRACTION LAYER (Stripe, Appra Pay, Mobile money, escrow, KYC, notify)**  
&nbsp;&nbsp;8. `src/lib/providers/interfaces.ts`  
&nbsp;&nbsp;9. `src/lib/providers/mock.ts`  
&nbsp;&nbsp;10. `src/lib/providers/stripeProvider.ts`  
&nbsp;&nbsp;11. `src/lib/providers/appraPayProvider.ts`  
&nbsp;&nbsp;12. `src/lib/providers/mobileMoneyProvider.ts`  
&nbsp;&nbsp;13. `src/lib/providers/registry.ts`  

**SERVICE LAYER — the mock<->API boundary**  
&nbsp;&nbsp;14. `src/lib/services/apiClient.ts`  
&nbsp;&nbsp;15. `src/lib/services/authService.ts`  
&nbsp;&nbsp;16. `src/lib/services/listingService.ts`  
&nbsp;&nbsp;17. `src/lib/services/pricingService.ts`  
&nbsp;&nbsp;18. `src/lib/services/escrowService.ts`  
&nbsp;&nbsp;19. `src/lib/services/bookingService.ts`  
&nbsp;&nbsp;20. `src/lib/services/portalService.ts`  

**APP ROUTES (Next.js App Router)**  
&nbsp;&nbsp;21. `src/app/layout.tsx`  
&nbsp;&nbsp;22. `src/app/page.tsx`  
&nbsp;&nbsp;23. `src/app/listing/[id]/page.tsx`  
&nbsp;&nbsp;24. `src/app/bookings/page.tsx`  
&nbsp;&nbsp;25. `src/app/portal/hotel/page.tsx`  
&nbsp;&nbsp;26. `src/app/portal/landlord/page.tsx`  
&nbsp;&nbsp;27. `src/app/portal/agent/page.tsx`  
&nbsp;&nbsp;28. `src/app/portal/developer/page.tsx`  

**UI COMPONENTS — shared**  
&nbsp;&nbsp;29. `src/components/ui/Header.tsx`  
&nbsp;&nbsp;30. `src/components/ui/TabBar.tsx`  
&nbsp;&nbsp;31. `src/components/ui/PWARegister.tsx`  

**UI COMPONENTS — marketplace & booking journey**  
&nbsp;&nbsp;32. `src/components/marketplace/Marketplace.tsx`  
&nbsp;&nbsp;33. `src/components/marketplace/ListingCard.tsx`  
&nbsp;&nbsp;34. `src/components/marketplace/ListingDetail.tsx`  
&nbsp;&nbsp;35. `src/components/booking/CheckoutModal.tsx`  
&nbsp;&nbsp;36. `src/components/booking/MyBookings.tsx`  

**UI COMPONENTS — role portals**  
&nbsp;&nbsp;37. `src/components/portal/PortalShell.tsx`  
&nbsp;&nbsp;38. `src/components/portal/HotelDashboard.tsx`  
&nbsp;&nbsp;39. `src/components/portal/LandlordPortal.tsx`  
&nbsp;&nbsp;40. `src/components/portal/AgentPortal.tsx`  
&nbsp;&nbsp;41. `src/components/portal/DeveloperPortal.tsx`  

**STYLES**  
&nbsp;&nbsp;42. `src/styles/globals.css`  


---


# PROJECT CONFIG

## 1. `package.json`

```json
{
  "name": "paltas-app",
  "version": "0.1.0",
  "private": true,
  "description": "PALTAS Smart Living — API-ready product frontend",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "typescript": "5.5.3"
  }
}
```

## 2. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## 3. `next.config.mjs`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
```


# ARCHITECTURE CORE — models, config, mock data

## 4. `src/lib/models/index.ts`

```typescript
/**
 * PALTAS domain models.
 *
 * These types are the single source of truth for the shape of our data.
 * Both the mock data layer (today) and the real API responses (later) must
 * conform to these types. Because the whole frontend depends only on these
 * models — never on where the data came from — swapping mock → API is a
 * change confined to the service layer, invisible to pages and components.
 */

export type Currency = "KES" | "USD" | "AED" | "EUR" | "GBP";

export type ListingType =
  | "villa"
  | "apartment"
  | "studio"
  | "house"
  | "penthouse"
  | "suite"
  | "room"
  | "cottage"
  | "loft";

/** How a listing is booked/paid — drives the escrow-vs-instant decision. */
export type StayMode = "stays" | "hotel" | "rent";

export type Amenity =
  | "wifi"
  | "pool"
  | "parking"
  | "kitchen"
  | "ac"
  | "pets"
  | "workspace"
  | "beach";

export interface Host {
  id: string;
  name: string;
  /** Role label shown to guests: Superhost, Agent, Landlord, Hotel host, Developer. */
  type: string;
  verified: boolean;
  responseTime: string;
  rating: number;
  reviews: number;
  initials: string;
}

export interface Review {
  id: string;
  author: string;
  initials: string;
  color: string;
  stars: number;
  date: string;
  text: string;
}

export interface Listing {
  id: string;
  name: string;
  type: ListingType;
  location: string;
  city: string;
  country: string;
  /** Nightly base price in the listing's own currency. */
  price: number;
  currency: Currency;
  rating: number;
  reviewCount: number;
  beds: number;
  baths: number;
  maxGuests: number;
  amenities: Amenity[];
  imageUrl: string;
  gallery: string[];
  superhost: boolean;
  /** Hotel-only: true for established/verified hotel chains. */
  chain?: boolean;
  /** Hotel-only: star rating (3–5). */
  stars?: number;
  hostId: string;
  description: string;
}

export interface PriceBreakdown {
  nightly: number;
  nights: number;
  subtotal: number;
  cleaningFee: number;
  serviceFee: number;
  taxes: number;
  total: number;
  currency: Currency;
}

export type PaymentMode =
  | { escrow: true; reason: string }
  | { escrow: false; reason: string; stars: number };

export type EscrowStatus = "held" | "released" | "disputed";

/**
 * The full lifecycle of a PALTAS booking. Every state the UI must handle:
 * a booking is created → payment processes → funds held in escrow (or instantly
 * confirmed for verified hotels) → guest stays → both parties confirm → released.
 * Failure and reversal states are first-class, not afterthoughts.
 */
export type BookingStatus =
  | "draft"        // being built (review screen)
  | "processing"   // payment being taken (loading/pending)
  | "confirmed"    // paid; for instant hotels this is the end state
  | "held"         // paid; funds protected in escrow, awaiting stay/confirmation
  | "completed"    // both sides confirmed, funds released to host
  | "failed"       // payment failed — nothing charged
  | "reversed"     // payment reversed/refunded to guest
  | "disputed";    // issue raised, under PALTAS review

export interface EscrowTransaction {
  id: string;
  code: string;
  kind: "booking" | "offer";
  property: string;
  location: string;
  amount: number;
  currency: Currency;
  buyerId: string;
  buyerName: string;
  host: Host;
  dates: string;
  guests: number;
  status: EscrowStatus;
  buyerConfirmed: boolean;
  hostConfirmed: boolean;
  createdAt: number;
}

export interface BookingEvent {
  status: BookingStatus;
  at: number;
  note: string;
}

export interface Booking {
  id: string;
  code: string;
  /** Idempotency key — set by the client, honoured by the backend so a retried
   *  payment never double-charges. Designed in from day one. */
  idempotencyKey: string;
  listingId: string;
  property: string;
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  breakdown: PriceBreakdown;
  paymentMode: PaymentMode;
  escrowId?: string;
  status: BookingStatus;
  /** Full audit trail of state transitions — powers the status timeline & history. */
  events: BookingEvent[];
  /** Payment reference the guest can quote to support. */
  reference: string;
  failureReason?: string;
  createdAt: number;
}

export interface Receipt {
  bookingCode: string;
  reference: string;
  property: string;
  location: string;
  dates: string;
  guests: number;
  breakdown: PriceBreakdown;
  paymentMode: "escrow" | "instant";
  status: BookingStatus;
  issuedAt: number;
}

export interface SearchFilters {
  city?: string;
  mode?: StayMode | "all";
  guests?: number;
  maxPrice?: number;
  amenities?: Amenity[];
}

/** Uniform result wrapper — mirrors what a real API layer returns. */
export interface Result<T> {
  data: T;
  error: null | { code: string; message: string };
}

/* ============================================================
   ROLE PORTAL MODELS — hotel, landlord, agent, developer
   ============================================================ */

// ---- Hotel ----
export interface HotelRoom {
  id: string;
  name: string;
  rate: number;
  currency: Currency;
  total: number;
  available: number;
  beds: string;
  status: "active" | "inactive";
}
export interface HotelBooking {
  id: string;
  guest: string;
  room: string;
  checkIn: string;
  checkOut: string;
  amount: number;
  currency: Currency;
  status: "confirmed" | "checked_in" | "checked_out" | "cancelled";
}

// ---- Landlord ----
export interface Unit {
  id: string;
  name: string;
  location: string;
  rent: number;
  currency: Currency;
  status: "occupied" | "vacant" | "notice";
  tenantId?: string;
}
export interface Tenant {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  rent: number;
  currency: Currency;
  rentStatus: "paid" | "due" | "overdue";
  leaseEnd: string;
}
export interface MaintenanceTicket {
  id: string;
  unitName: string;
  issue: string;
  raisedBy: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved";
  createdAt: number;
}

// ---- Agent ----
export interface AgentListing {
  id: string;
  name: string;
  location: string;
  price: number;
  currency: Currency;
  kind: "sale" | "rent";
  status: "live" | "under_offer" | "sold" | "draft";
  views: number;
}
export interface Lead {
  id: string;
  name: string;
  interestedIn: string;
  stage: "new" | "contacted" | "viewing" | "offer" | "closed";
  budget: number;
  currency: Currency;
  lastContact: string;
}
export interface Viewing {
  id: string;
  listing: string;
  client: string;
  when: string;
  status: "scheduled" | "completed" | "cancelled";
}

// ---- Developer ----
export interface Project {
  id: string;
  name: string;
  location: string;
  totalUnits: number;
  sold: number;
  available: number;
  revenue: number;
  currency: Currency;
  completion: number; // percent
  status: "planning" | "selling" | "completed";
}
export interface ProjectUnit {
  id: string;
  projectId: string;
  unitNo: string;
  type: string;
  price: number;
  currency: Currency;
  status: "available" | "reserved" | "sold";
}
export interface DeveloperLead {
  id: string;
  name: string;
  project: string;
  stage: "enquiry" | "reserved" | "deposit" | "completed";
  value: number;
  currency: Currency;
}
```

## 5. `src/lib/config/index.ts`

```typescript
/**
 * Runtime configuration.
 *
 * `DATA_SOURCE` is the single switch that decides whether services return
 * mock data or call the real backend. Today it is "mock". When your APIs are
 * (this quoted block is out of date — the switch has been deleted; see
 * the app changes. This is the seam that makes the frontend API-ready.
 */

export type DataSource = "mock" | "api";

export const config = {
  demoCatalogue: process.env.NEXT_PUBLIC_DEMO_CATALOGUE === "true",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  /** Simulated network latency for mock mode, so the UI's loading states are real. */
  mockLatencyMs: 250,
} as const;

export const isMock = () => config.dataSource === "mock";
```

## 6. `src/lib/data/mock.ts`

```typescript
import type { Host, Listing, Review } from "@/lib/models";

/**
 * Mock seed data. Shapes conform exactly to the domain models, so when the
 * real API is connected the frontend sees no difference.
 */

export const HOSTS: Record<string, Host> = {
  h1: { id: "h1", name: "Amina Otieno", type: "Superhost", verified: true, responseTime: "within an hour", rating: 4.9, reviews: 214, initials: "AO" },
  h2: { id: "h2", name: "Prime Realty", type: "Agent", verified: true, responseTime: "within 2 hours", rating: 4.8, reviews: 186, initials: "PR" },
  h3: { id: "h3", name: "Daniel Kimani", type: "Landlord", verified: true, responseTime: "within a day", rating: 4.7, reviews: 52, initials: "DK" },
  h4: { id: "h4", name: "Sarova Hotels", type: "Hotel host", verified: true, responseTime: "within an hour", rating: 4.8, reviews: 1240, initials: "SH" },
  h5: { id: "h5", name: "Grace Wambui", type: "Host", verified: true, responseTime: "within an hour", rating: 4.8, reviews: 97, initials: "GW" },
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
    superhost: true, hostId: "h1",
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
    superhost: true, hostId: "h1",
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
    superhost: false, hostId: "h5",
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
    superhost: true, hostId: "h3",
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
    superhost: true, chain: true, stars: 5, hostId: "h4",
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
    superhost: false, chain: false, stars: 3, hostId: "h5",
    description: "An independent 3-star inn — escrow-protected for your peace of mind.",
  },
];

const REVIEW_POOL: Review[] = [
  { id: "r1", author: "Sarah M.", initials: "SM", color: "#00a894", stars: 5, date: "2 weeks ago", text: "Exactly as pictured — spotless and the host answered within minutes. Booking felt safe with the escrow." },
  { id: "r2", author: "David O.", initials: "DO", color: "#2278c4", stars: 5, date: "1 month ago", text: "No hidden costs — the total I saw was the total I paid. Would book again through PALTAS." },
  { id: "r3", author: "Aisha K.", initials: "AK", color: "#e0894a", stars: 4, date: "3 weeks ago", text: "Lovely place and very responsive host. A great stay for the family." },
  { id: "r4", author: "James R.", initials: "JR", color: "#6a5cff", stars: 5, date: "5 days ago", text: "The verified badge and protected payment gave me real peace of mind booking from abroad." },
];

export function reviewsForListing(listingId: string): Review[] {
  const n = listingId.charCodeAt(listingId.length - 1);
  return REVIEW_POOL.slice(0, 3 + (n % 2));
}
```

## 7. `src/lib/data/portals.ts`

```typescript
import type {
  HotelRoom, HotelBooking, Unit, Tenant, MaintenanceTicket,
  AgentListing, Lead, Viewing, Project, ProjectUnit, DeveloperLead,
} from "@/lib/models";

/** Mock seed data for the role portals. Shapes conform to the domain models. */

export const HOTEL_ROOMS: HotelRoom[] = [
  { id: "hr1", name: "Standard Double", rate: 8500, currency: "KES", total: 40, available: 12, beds: "1 Queen", status: "active" },
  { id: "hr2", name: "Deluxe King", rate: 12000, currency: "KES", total: 25, available: 6, beds: "1 King", status: "active" },
  { id: "hr3", name: "Executive Suite", rate: 18500, currency: "KES", total: 12, available: 3, beds: "1 King + sofa", status: "active" },
  { id: "hr4", name: "Family Room", rate: 15000, currency: "KES", total: 15, available: 8, beds: "2 Queen", status: "active" },
  { id: "hr5", name: "Presidential Suite", rate: 45000, currency: "KES", total: 2, available: 1, beds: "2 King", status: "active" },
];

export const HOTEL_BOOKINGS: HotelBooking[] = [
  { id: "hb1", guest: "Sarah Mwangi", room: "Deluxe King", checkIn: "26 Aug", checkOut: "29 Aug", amount: 36000, currency: "KES", status: "confirmed" },
  { id: "hb2", guest: "John K. (UK)", room: "Executive Suite", checkIn: "28 Aug", checkOut: "2 Sep", amount: 92500, currency: "KES", status: "confirmed" },
  { id: "hb3", guest: "Aisha Noor", room: "Standard Double", checkIn: "30 Aug", checkOut: "31 Aug", amount: 8500, currency: "KES", status: "checked_in" },
  { id: "hb4", guest: "Peter O.", room: "Family Room", checkIn: "1 Sep", checkOut: "4 Sep", amount: 45000, currency: "KES", status: "confirmed" },
  { id: "hb5", guest: "Grace W.", room: "Standard Double", checkIn: "24 Aug", checkOut: "26 Aug", amount: 17000, currency: "KES", status: "checked_out" },
];

export const UNITS: Unit[] = [
  { id: "u1", name: "Apt 4B — Kilimani", location: "Kilimani, Nairobi", rent: 45000, currency: "KES", status: "occupied", tenantId: "t1" },
  { id: "u2", name: "Apt 2A — Kilimani", location: "Kilimani, Nairobi", rent: 38000, currency: "KES", status: "occupied", tenantId: "t2" },
  { id: "u3", name: "Studio 1C — Westlands", location: "Westlands, Nairobi", rent: 30000, currency: "KES", status: "vacant" },
  { id: "u4", name: "Apt 7D — Kilimani", location: "Kilimani, Nairobi", rent: 52000, currency: "KES", status: "notice", tenantId: "t3" },
];

export const TENANTS: Tenant[] = [
  { id: "t1", name: "Daniel Mwangi", unitId: "u1", unitName: "Apt 4B", rent: 45000, currency: "KES", rentStatus: "paid", leaseEnd: "Dec 2025" },
  { id: "t2", name: "Faith Achieng", unitId: "u2", unitName: "Apt 2A", rent: 38000, currency: "KES", rentStatus: "due", leaseEnd: "Mar 2026" },
  { id: "t3", name: "Brian Otieno", unitId: "u4", unitName: "Apt 7D", rent: 52000, currency: "KES", rentStatus: "overdue", leaseEnd: "Sep 2025" },
];

export const MAINTENANCE: MaintenanceTicket[] = [
  { id: "m1", unitName: "Apt 2A", issue: "Leaking kitchen tap", raisedBy: "Faith Achieng", priority: "medium", status: "open", createdAt: Date.now() - 86400000 },
  { id: "m2", unitName: "Apt 4B", issue: "Water heater not working", raisedBy: "Daniel Mwangi", priority: "high", status: "in_progress", createdAt: Date.now() - 172800000 },
  { id: "m3", unitName: "Studio 1C", issue: "Repaint before new tenant", raisedBy: "Landlord", priority: "low", status: "open", createdAt: Date.now() - 259200000 },
];

export const AGENT_LISTINGS: AgentListing[] = [
  { id: "al1", name: "3BR Apartment — Nyali", location: "Nyali, Mombasa", price: 8500000, currency: "KES", kind: "sale", status: "live", views: 342 },
  { id: "al2", name: "Beach Villa — Diani", location: "Diani Beach", price: 25000000, currency: "KES", kind: "sale", status: "under_offer", views: 891 },
  { id: "al3", name: "2BR — Kilimani (rent)", location: "Kilimani, Nairobi", price: 65000, currency: "KES", kind: "rent", status: "live", views: 210 },
  { id: "al4", name: "Penthouse — Westlands", location: "Westlands, Nairobi", price: 18000000, currency: "KES", kind: "sale", status: "draft", views: 0 },
];

export const LEADS: Lead[] = [
  { id: "ld1", name: "James Odhiambo", interestedIn: "3BR Apartment — Nyali", stage: "viewing", budget: 9000000, currency: "KES", lastContact: "2h ago" },
  { id: "ld2", name: "Mary W.", interestedIn: "2BR — Kilimani (rent)", stage: "contacted", budget: 70000, currency: "KES", lastContact: "1d ago" },
  { id: "ld3", name: "Ahmed H.", interestedIn: "Beach Villa — Diani", stage: "offer", budget: 24000000, currency: "KES", lastContact: "3h ago" },
  { id: "ld4", name: "Lucy N.", interestedIn: "Penthouse — Westlands", stage: "new", budget: 20000000, currency: "KES", lastContact: "just now" },
];

export const VIEWINGS: Viewing[] = [
  { id: "v1", listing: "3BR Apartment — Nyali", client: "James Odhiambo", when: "Today 2:00 PM", status: "scheduled" },
  { id: "v2", listing: "Beach Villa — Diani", client: "Ahmed H.", when: "Tomorrow 10:00 AM", status: "scheduled" },
  { id: "v3", listing: "2BR — Kilimani (rent)", client: "Mary W.", when: "Yesterday", status: "completed" },
];

export const PROJECTS: Project[] = [
  { id: "p1", name: "Golden Park Residences", location: "Kileleshwa, Nairobi", totalUnits: 120, sold: 78, available: 42, revenue: 546000000, currency: "KES", completion: 65, status: "selling" },
  { id: "p2", name: "Westgate Towers", location: "Westlands, Nairobi", totalUnits: 80, sold: 80, available: 0, revenue: 720000000, currency: "KES", completion: 100, status: "completed" },
  { id: "p3", name: "Coastal Breeze Estate", location: "Nyali, Mombasa", totalUnits: 60, sold: 12, available: 48, revenue: 96000000, currency: "KES", completion: 20, status: "selling" },
];

export const PROJECT_UNITS: ProjectUnit[] = [
  { id: "pu1", projectId: "p1", unitNo: "A-101", type: "2 Bedroom", price: 7000000, currency: "KES", status: "sold" },
  { id: "pu2", projectId: "p1", unitNo: "A-102", type: "2 Bedroom", price: 7000000, currency: "KES", status: "available" },
  { id: "pu3", projectId: "p1", unitNo: "B-201", type: "3 Bedroom", price: 9500000, currency: "KES", status: "reserved" },
  { id: "pu4", projectId: "p1", unitNo: "B-202", type: "3 Bedroom", price: 9500000, currency: "KES", status: "available" },
];

export const DEVELOPER_LEADS: DeveloperLead[] = [
  { id: "dl1", name: "Kevin M.", project: "Golden Park Residences", stage: "deposit", value: 9500000, currency: "KES" },
  { id: "dl2", name: "Susan A.", project: "Coastal Breeze Estate", stage: "enquiry", value: 1600000, currency: "KES" },
  { id: "dl3", name: "Omar F.", project: "Golden Park Residences", stage: "reserved", value: 7000000, currency: "KES" },
];
```


# PROVIDER ABSTRACTION LAYER (Stripe, Appra Pay, Mobile money, escrow, KYC, notify)

## 8. `src/lib/providers/interfaces.ts`

```typescript
/**
 * Provider abstraction layer.
 *
 * PALTAS is a stays/real-estate marketplace, so its integrations are the ones a
 * marketplace needs: take a booking payment, hold it in escrow, verify hosts,
 * and notify guests. These are INTERFACES — the product depends only on them,
 * never on a concrete provider. A mock provider satisfies them today; a real
 * one (a licensed PSP, an escrow/settlement partner, a KYC vendor) is dropped
 * in later by implementing the same interface. No user journey changes.
 *
 * This is exactly the "do not hard-code around one provider" requirement,
 * scoped to what PALTAS actually does — not a payments-transfer app.
 */

import type { Currency, Result } from "@/lib/models";

/** Payment methods a provider can offer at checkout. */
export type PaymentMethod =
  | "card"
  | "apple_pay"
  | "google_pay"
  | "bank_transfer"
  | "mobile_money"
  | "appra_pay";

/** Result of attempting to take a booking payment. */
export interface PaymentIntent {
  reference: string;
  /** "pending" is used by async rails like mobile money (awaiting STK push / OTP). */
  status: "processing" | "pending" | "succeeded" | "failed";
  amount: number;
  currency: Currency;
  provider: string;
  method: PaymentMethod;
  failureReason?: string;
  /** For mobile money: a human hint shown while we await confirmation. */
  pendingHint?: string;
}

export interface ChargeInput {
  amount: number;
  currency: Currency;
  idempotencyKey: string;
  description: string;
  method: PaymentMethod;
  /** Mobile money needs the payer's phone; card/wallet need their own fields (collected by provider UI later). */
  phone?: string;
}

/** Collects the guest's booking payment. A real impl wraps a licensed PSP. */
export interface PaymentProvider {
  readonly name: string;
  /** Which methods this provider supports — drives the checkout selector. */
  readonly methods: PaymentMethod[];
  charge(input: ChargeInput): Promise<Result<PaymentIntent>>;
  /** Poll/confirm an async (pending) payment such as mobile money. */
  confirm?(reference: string): Promise<Result<PaymentIntent>>;
  refund(reference: string): Promise<Result<PaymentIntent>>;
}

/** Holds booking funds until both sides confirm, then releases to the host. */
export interface EscrowProvider {
  readonly name: string;
  hold(input: { reference: string; amount: number; currency: Currency }): Promise<Result<{ escrowRef: string }>>;
  release(escrowRef: string): Promise<Result<{ released: true }>>;
  reverse(escrowRef: string): Promise<Result<{ reversed: true }>>;
}

/** Verifies host / listing identity & ownership (the "Verified" badge). */
export interface KYCProvider {
  readonly name: string;
  startVerification(subjectId: string): Promise<Result<{ verificationId: string; status: "pending" }>>;
  getStatus(verificationId: string): Promise<Result<{ status: "pending" | "verified" | "rejected" }>>;
}

/** Sends booking confirmations, receipts, and updates (email/in-app/SMS). */
export interface NotificationProvider {
  readonly name: string;
  send(input: { to: string; channel: "email" | "sms" | "in-app"; title: string; body: string }): Promise<Result<{ delivered: boolean }>>;
}
```

## 9. `src/lib/providers/mock.ts`

```typescript
/**
 * Mock providers. Each satisfies its interface exactly, so swapping in a real
 * provider later is a one-line change in the registry below — no journey edits.
 * The mock payment provider can simulate failure so the UI's failed/error
 * states are real and tested, not decorative.
 */

import type {
  PaymentProvider, EscrowProvider, KYCProvider, NotificationProvider, PaymentIntent,
} from "./interfaces";
import type { Result } from "@/lib/models";

const delay = <T>(v: T, ms = 500) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const ok = <T>(data: T): Result<T> => ({ data, error: null });

export const mockPaymentProvider: PaymentProvider = {
  name: "mock-psp",
  methods: ["card"],
  async charge({ amount, currency, description, method }): Promise<Result<PaymentIntent>> {
    const forceFail = /FAIL/i.test(description);
    await delay(null, 900);
    if (forceFail) {
      return ok<PaymentIntent>({ reference: ref(), status: "failed", amount, currency, provider: "mock-psp", method, failureReason: "Card declined by issuer" });
    }
    return ok<PaymentIntent>({ reference: ref(), status: "succeeded", amount, currency, provider: "mock-psp", method });
  },
  async refund(reference): Promise<Result<PaymentIntent>> {
    await delay(null, 600);
    return ok<PaymentIntent>({ reference, status: "succeeded", amount: 0, currency: "KES", provider: "mock-psp", method: "card" });
  },
};

export const mockEscrowProvider: EscrowProvider = {
  name: "mock-escrow",
  async hold({ reference }) { await delay(null, 300); return ok({ escrowRef: "esc_" + reference }); },
  async release(escrowRef) { await delay(null, 300); return ok({ released: true as const }); },
  async reverse(escrowRef) { await delay(null, 300); return ok({ reversed: true as const }); },
};

export const mockKYCProvider: KYCProvider = {
  name: "mock-kyc",
  async startVerification(subjectId) { await delay(null, 200); return ok({ verificationId: "kyc_" + subjectId, status: "pending" as const }); },
  async getStatus() { await delay(null, 200); return ok({ status: "verified" as const }); },
};

export const mockNotificationProvider: NotificationProvider = {
  name: "mock-notify",
  async send() { await delay(null, 100); return ok({ delivered: true }); },
};

function ref() {
  return "PX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
```

## 10. `src/lib/providers/stripeProvider.ts`

```typescript
import type { PaymentProvider, ChargeInput, PaymentIntent } from "./interfaces";
import type { Result } from "@/lib/models";

/**
 * Stripe provider — handles cards, Apple/Google Pay, and bank transfers.
 *
 * SECURITY: Stripe's secret key must NEVER live in frontend code. The real flow
 * is: this client asks YOUR backend to create a PaymentIntent (backend holds the
 * secret key and calls Stripe), the client confirms it with Stripe.js using the
 * publishable key, and Stripe calls your backend webhook to confirm settlement.
 * The `// REAL:` comments mark exactly where that wiring goes. Today it is mocked
 * so the whole checkout journey runs without keys.
 */

function ref() {
  return "STRIPE-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  methods: ["card", "apple_pay", "google_pay", "bank_transfer"],

  async charge(input: ChargeInput): Promise<Result<PaymentIntent>> {
    // REAL: const res = await apiPost('/payments/stripe/create-intent', {
    //   amount: input.amount, currency: input.currency, method: input.method,
    //   idempotencyKey: input.idempotencyKey });
    // then confirm client-side with Stripe.js (publishable key) and rely on the
    // Stripe webhook -> your backend for the authoritative settled status.
    const forceFail = /FAIL/i.test(input.description);
    await wait(900);
    if (forceFail) {
      return okIntent({ reference: ref(), status: "failed", input, failureReason: "Card declined by issuer" });
    }
    // Cards & wallets settle synchronously; bank transfer is treated as pending.
    const status = input.method === "bank_transfer" ? "pending" : "succeeded";
    return okIntent({
      reference: ref(), status, input,
      pendingHint: status === "pending" ? "Awaiting bank transfer confirmation" : undefined,
    });
  },

  async confirm(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: query your backend for the webhook-confirmed status of this intent.
    await wait(600);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "stripe", method: "bank_transfer" }, error: null };
  },

  async refund(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/stripe/refund', { reference });
    await wait(500);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "stripe", method: "card" }, error: null };
  },
};

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function okIntent(p: { reference: string; status: PaymentIntent["status"]; input: ChargeInput; failureReason?: string; pendingHint?: string }): Result<PaymentIntent> {
  return {
    data: {
      reference: p.reference, status: p.status, amount: p.input.amount, currency: p.input.currency,
      provider: "stripe", method: p.input.method, failureReason: p.failureReason, pendingHint: p.pendingHint,
    },
    error: null,
  };
}
```

## 11. `src/lib/providers/appraPayProvider.ts`

```typescript
import type { PaymentProvider, ChargeInput, PaymentIntent } from "./interfaces";
import type { Result } from "@/lib/models";

/**
 * Appra Pay provider — a payment GATEWAY that routes card & bank payments.
 *
 * As a gateway, Appra Pay accepts the booking payment and routes it to the
 * underlying rail; PALTAS only talks to Appra Pay's API. Like Stripe, the secret
 * credentials live on YOUR backend, never here. `// REAL:` marks the wiring.
 */

function ref() {
  return "APPRA-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const appraPayProvider: PaymentProvider = {
  name: "appra-pay",
  methods: ["card", "bank_transfer"],

  async charge(input: ChargeInput): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/appra/charge', {
    //   amount, currency, method: input.method, idempotencyKey });
    // Appra Pay routes to the card/bank rail and returns a status; settlement is
    // confirmed via its webhook -> your backend.
    await wait(850);
    if (/FAIL/i.test(input.description)) {
      return fail(ref(), input, "Payment routing failed at gateway");
    }
    const status = input.method === "bank_transfer" ? "pending" : "succeeded";
    return {
      data: {
        reference: ref(), status, amount: input.amount, currency: input.currency,
        provider: "appra-pay", method: input.method,
        pendingHint: status === "pending" ? "Awaiting bank confirmation via Appra Pay" : undefined,
      },
      error: null,
    };
  },

  async confirm(reference: string): Promise<Result<PaymentIntent>> {
    await wait(600);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "appra-pay", method: "bank_transfer" }, error: null };
  },

  async refund(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/appra/refund', { reference });
    await wait(500);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "appra-pay", method: "card" }, error: null };
  },
};

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function fail(reference: string, input: ChargeInput, reason: string): Result<PaymentIntent> {
  return { data: { reference, status: "failed", amount: input.amount, currency: input.currency, provider: "appra-pay", method: input.method, failureReason: reason }, error: null };
}
```

## 12. `src/lib/providers/mobileMoneyProvider.ts`

```typescript
import type { PaymentProvider, ChargeInput, PaymentIntent } from "./interfaces";
import type { Result } from "@/lib/models";

/**
 * Mobile money provider — all major African networks (M-Pesa, Airtel Money,
 * MTN MoMo, etc.). The network is auto-detected from the phone prefix by the
 * real gateway; the guest just enters their number.
 *
 * FLOW (this is why mobile money needs its own path): charge() triggers an STK
 * push / prompt to the phone and returns `pending`. The guest approves on their
 * handset; your backend receives the network callback and marks it settled.
 * The UI polls confirm() until succeeded/failed. `// REAL:` marks the wiring.
 */

function ref() {
  return "MM-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// simple in-memory pending store so the mock confirm() can resolve
const pending = new Map<string, { input: ChargeInput; attempts: number }>();

export const mobileMoneyProvider: PaymentProvider = {
  name: "mobile-money",
  methods: ["mobile_money"],

  async charge(input: ChargeInput): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/mobile-money/stk-push', {
    //   amount, currency, phone: input.phone, idempotencyKey });
    // The gateway prompts the phone; you return pending and await the callback.
    if (!input.phone || input.phone.replace(/\D/g, "").length < 9) {
      return fail(ref(), input, "Enter a valid mobile money number");
    }
    if (/FAIL/i.test(input.description)) {
      return fail(ref(), input, "Payment was declined on the handset");
    }
    const reference = ref();
    pending.set(reference, { input, attempts: 0 });
    await wait(700);
    return {
      data: {
        reference, status: "pending", amount: input.amount, currency: input.currency,
        provider: "mobile-money", method: "mobile_money",
        pendingHint: `Check your phone ${maskPhone(input.phone)} and enter your PIN to approve`,
      },
      error: null,
    };
  },

  async confirm(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: read the webhook-confirmed status of this STK push from your backend.
    const p = pending.get(reference);
    await wait(1200);
    if (!p) {
      return { data: { reference, status: "failed", amount: 0, currency: "KES", provider: "mobile-money", method: "mobile_money", failureReason: "Request expired" }, error: null };
    }
    p.attempts += 1;
    // mock: confirm on the 2nd poll to mimic the guest approving on their phone
    if (p.attempts >= 2) {
      pending.delete(reference);
      return { data: { reference, status: "succeeded", amount: p.input.amount, currency: p.input.currency, provider: "mobile-money", method: "mobile_money" }, error: null };
    }
    return { data: { reference, status: "pending", amount: p.input.amount, currency: p.input.currency, provider: "mobile-money", method: "mobile_money", pendingHint: "Waiting for you to approve on your phone…" }, error: null };
  },

  async refund(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/mobile-money/refund', { reference });
    await wait(500);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "mobile-money", method: "mobile_money" }, error: null };
  },
};

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function maskPhone(p: string) { const d = p.replace(/\D/g, ""); return d.length > 4 ? "•••• " + d.slice(-3) : p; }
function fail(reference: string, input: ChargeInput, reason: string): Result<PaymentIntent> {
  return { data: { reference, status: "failed", amount: input.amount, currency: input.currency, provider: "mobile-money", method: "mobile_money", failureReason: reason }, error: null };
}
```

## 13. `src/lib/providers/registry.ts`

```typescript
/**
 * Provider registry - the single place that decides WHICH providers exist and
 * how a chosen payment method routes to a provider.
 *
 * PALTAS now offers three payment providers, all behind the same interface:
 *   - Stripe        card, Apple/Google Pay, bank transfer
 *   - Appra Pay     gateway routing card & bank
 *   - Mobile Money  all major African networks (STK push)
 *
 * To add or replace a provider, implement PaymentProvider and register it here.
 * Nothing in the checkout journey changes.
 */

import type { EscrowProvider, KYCProvider, NotificationProvider, PaymentProvider, PaymentMethod } from "./interfaces";
import { mockEscrowProvider, mockKYCProvider, mockNotificationProvider } from "./mock";
import { stripeProvider } from "./stripeProvider";
import { appraPayProvider } from "./appraPayProvider";
import { mobileMoneyProvider } from "./mobileMoneyProvider";

export const paymentProviders: PaymentProvider[] = [
  stripeProvider,
  appraPayProvider,
  mobileMoneyProvider,
];

export interface PaymentOption {
  method: PaymentMethod;
  providerName: string;
  label: string;
  sublabel: string;
  icon: string;
}

export function paymentOptions(): PaymentOption[] {
  const labels: Record<PaymentMethod, { label: string; sublabel: string; icon: string }> = {
    card: { label: "Card", sublabel: "Visa, Mastercard", icon: "💳" },
    apple_pay: { label: "Apple Pay", sublabel: "Fast & secure", icon: "" },
    google_pay: { label: "Google Pay", sublabel: "Fast & secure", icon: "🟢" },
    bank_transfer: { label: "Bank transfer", sublabel: "Direct from your bank", icon: "🏦" },
    mobile_money: { label: "Mobile money", sublabel: "M-Pesa, Airtel, MTN & more", icon: "📱" },
    appra_pay: { label: "Appra Pay", sublabel: "Pay via Appra", icon: "🅰️" },
  };
  const opts: PaymentOption[] = [];
  const seen = new Set<string>();
  for (const p of paymentProviders) {
    for (const m of p.methods) {
      const key = m + ":" + p.name;
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({ method: m, providerName: p.name, label: labels[m].label, sublabel: labels[m].sublabel, icon: labels[m].icon });
    }
  }
  return opts;
}

export function providerFor(method: PaymentMethod, providerName: string): PaymentProvider {
  return paymentProviders.find((p) => p.name === providerName && p.methods.includes(method)) ?? stripeProvider;
}

export const providers = {
  payment: stripeProvider,
  escrow: mockEscrowProvider,
  kyc: mockKYCProvider,
  notification: mockNotificationProvider,
};
```


# SERVICE LAYER — the mock<->API boundary

## 14. `src/lib/services/apiClient.ts`

```typescript
import { config } from "@/lib/config";
import type { Result } from "@/lib/models";

/**
 * Thin HTTP client used by services when config.dataSource === "api".
 * Centralises base URL, headers, auth token, and error shape so that every
 * service calls the backend the same way. When you connect real APIs, this is
 * the only place that talks to the network.
 */

export async function apiGet<T>(path: string): Promise<Result<T>> {
  return request<T>("GET", path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<Result<T>> {
  return request<T>("POST", path, body);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        // Auth token wiring goes here later, e.g. Authorization: `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      return { data: null as unknown as T, error: { code: String(res.status), message: res.statusText } };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (e) {
    return { data: null as unknown as T, error: { code: "network", message: (e as Error).message } };
  }
}

/** Simulate latency in mock mode so loading states are exercised in development. */
export function mockDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), config.mockLatencyMs));
}
```

## 15. `src/lib/services/authService.ts`

```typescript
import { isMock } from "@/lib/config";
import type { Result } from "@/lib/models";
import { apiPost } from "./apiClient";

/**
 * Auth service. In mock mode we keep a lightweight in-memory session so the
 * booking journey works end-to-end without a backend. With the API, these call
 * real auth endpoints and store a token — callers (the checkout gate, header,
 * bookings page) do not change.
 */

export interface User {
  id: string;
  name: string;
  email: string;
}

let currentUser: User | null = null;

export function getCurrentUser(): User | null {
  return currentUser;
}

export async function signIn(input: { name: string; email: string }): Promise<Result<User>> {
  if (isMock()) {
    currentUser = { id: "u_" + Date.now(), name: input.name, email: input.email };
    return { data: currentUser, error: null };
  }
  const res = await apiPost<User>(`/auth/sign-in`, input);
  if (res.data) currentUser = res.data;
  return res;
}

export function signOut() {
  currentUser = null;
}
```

## 16. `src/lib/services/listingService.ts`

```typescript
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
```

## 17. `src/lib/services/pricingService.ts`

```typescript
import type { Listing, PriceBreakdown, PaymentMode } from "@/lib/models";

/**
 * Pricing rules — pure functions, no I/O, trivially testable.
 * Transparent, all-in pricing (base + cleaning + service + taxes) is computed
 * here so it is identical on cards, detail pages, and checkout — no surprises.
 */

const CLEANING_FEE = 1500;
const SERVICE_RATE = 0.08;
const TAX_RATE = 0.05;

export function priceBreakdown(listing: Listing, nights: number): PriceBreakdown {
  const nightly = listing.price;
  const subtotal = nightly * nights;
  const cleaningFee = CLEANING_FEE;
  const serviceFee = Math.round(subtotal * SERVICE_RATE);
  const taxes = Math.round((subtotal + cleaningFee + serviceFee) * TAX_RATE);
  const total = subtotal + cleaningFee + serviceFee + taxes;
  return { nightly, nights, subtotal, cleaningFee, serviceFee, taxes, total, currency: listing.currency };
}

/** All-in nightly price shown on cards ("what you actually pay per night"). */
export function allInNightly(listing: Listing): number {
  const b = priceBreakdown(listing, 1);
  return b.total;
}

/**
 * Escrow decision.
 * Big / verified hotel chains (4–5★) pay out instantly — established businesses.
 * Independent / lower-star hotels and all individual hosts use PALTAS escrow.
 */
export function paymentModeFor(listing: Listing): PaymentMode {
  const isHotel = ["penthouse", "suite", "room"].includes(listing.type);
  const stars = listing.stars ?? (listing.rating >= 4.8 ? 5 : listing.rating >= 4.5 ? 4 : 3);
  const bigVerifiedHotel = isHotel && listing.chain === true && stars >= 4;
  if (bigVerifiedHotel) {
    return { escrow: false, reason: `Verified ${stars}-star hotel — instant confirmation`, stars };
  }
  return {
    escrow: true,
    reason: isHotel ? "Protected by PALTAS escrow (independent hotel)" : "Protected by PALTAS escrow",
  };
}
```

## 18. `src/lib/services/escrowService.ts`

```typescript
import { isMock } from "@/lib/config";
import type { EscrowTransaction, Host, Currency, Result } from "@/lib/models";
import { apiPost, mockDelay } from "./apiClient";

/**
 * Escrow service — the two-sided money-protection engine.
 * Funds are HELD until BOTH the buyer and the host confirm; only then are they
 * released. This is PALTAS's trust moat. In mock mode the state lives in memory;
 * with the API it lives in the backend + a real settlement provider. The rules
 * (release only when both confirm) live here and never change.
 */

const store: EscrowTransaction[] = [];

interface CreateEscrowInput {
  code: string;
  kind: "booking" | "offer";
  property: string;
  location: string;
  amount: number;
  currency: Currency;
  buyerId: string;
  buyerName: string;
  host: Host;
  dates: string;
  guests: number;
}

export async function createEscrow(input: CreateEscrowInput): Promise<Result<EscrowTransaction>> {
  if (isMock()) {
    const tx: EscrowTransaction = {
      id: "esc_" + Date.now(), ...input,
      status: "held", buyerConfirmed: false, hostConfirmed: false, createdAt: Date.now(),
    };
    store.unshift(tx);
    return mockDelay({ data: tx, error: null });
  }
  // API: return apiPost<EscrowTransaction>(`/escrow`, input);
  return apiPost<EscrowTransaction>(`/escrow`, input);
}

export async function confirmAsBuyer(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.buyerConfirmed = true; settle(tx); }, `/escrow/${id}/confirm-buyer`);
}

export async function confirmAsHost(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.hostConfirmed = true; settle(tx); }, `/escrow/${id}/confirm-host`);
}

export async function raiseDispute(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.status = "disputed"; }, `/escrow/${id}/dispute`);
}

export async function getMyEscrows(buyerId: string): Promise<Result<EscrowTransaction[]>> {
  if (isMock()) return mockDelay({ data: [...store], error: null });
  return apiPost<EscrowTransaction[]>(`/escrow/search`, { buyerId });
}

/** Core rule: release only when both sides have confirmed. */
function settle(tx: EscrowTransaction) {
  if (tx.buyerConfirmed && tx.hostConfirmed) tx.status = "released";
}

async function transition(
  id: string,
  mutate: (tx: EscrowTransaction) => void,
  apiPath: string
): Promise<Result<EscrowTransaction>> {
  if (isMock()) {
    const tx = store.find((t) => t.id === id);
    if (!tx) return { data: null as unknown as EscrowTransaction, error: { code: "not_found", message: "Escrow not found" } };
    mutate(tx);
    return mockDelay({ data: tx, error: null });
  }
  // API: return apiPost<EscrowTransaction>(apiPath, {});
  return apiPost<EscrowTransaction>(apiPath, {});
}
```

## 19. `src/lib/services/bookingService.ts`

```typescript
import { isMock } from "@/lib/config";
import type { Booking, BookingEvent, BookingStatus, Listing, Result } from "@/lib/models";
import { priceBreakdown, paymentModeFor } from "./pricingService";
import { createEscrow } from "./escrowService";
import { HOSTS } from "@/lib/data/mock";
import { providers, providerFor } from "@/lib/providers/registry";
import type { PaymentMethod } from "@/lib/providers/interfaces";
import { apiPost, mockDelay } from "./apiClient";

/**
 * Booking service — orchestrates the full PALTAS booking lifecycle through the
 * provider layer. This is the marketplace's money moment (pay -> hold in escrow
 * -> release to host), NOT a payments-transfer app.
 *
 * Every transition is recorded as a BookingEvent (audit trail / status
 * timeline). Idempotency keys are honoured so a retried payment never
 * double-books. Failure and reversal are first-class outcomes.
 */

const bookings: Booking[] = [];
const seenKeys = new Map<string, Booking>();

interface CreateBookingInput {
  listing: Listing;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  buyerId: string;
  buyerName: string;
  idempotencyKey: string;
  simulateFailure?: boolean;
  method: PaymentMethod;
  providerName: string;
  phone?: string;
}

function event(status: BookingStatus, note: string): BookingEvent {
  return { status, at: Date.now(), note };
}

export async function createBooking(input: CreateBookingInput): Promise<Result<Booking>> {
  const { listing, checkIn, checkOut, nights, guests, buyerId, buyerName, idempotencyKey, simulateFailure } = input;

  if (seenKeys.has(idempotencyKey)) {
    return mockDelay({ data: seenKeys.get(idempotencyKey)!, error: null });
  }

  if (!isMock()) {
    return apiPost<Booking>(`/bookings`, input);
  }

  const breakdown = priceBreakdown(listing, nights);
  const paymentMode = paymentModeFor(listing);
  const code = "PALTAS-" + Math.random().toString(36).slice(2, 7).toUpperCase();

  const booking: Booking = {
    id: "b_" + Date.now(), code, idempotencyKey,
    listingId: listing.id, property: listing.name, location: listing.location,
    checkIn, checkOut, guests, breakdown, paymentMode,
    status: "processing", reference: "", events: [event("processing", "Payment initiated")],
    createdAt: Date.now(),
  };
  bookings.unshift(booking);
  seenKeys.set(idempotencyKey, booking);

  const provider = providerFor(input.method, input.providerName);
  let chargeRes = await provider.charge({
    amount: breakdown.total, currency: listing.currency, idempotencyKey,
    description: simulateFailure ? "FAIL booking" : `Booking ${code}`,
    method: input.method, phone: input.phone,
  });
  let intent = chargeRes.data;
  booking.reference = intent?.reference ?? "";

  // Async rails (mobile money, bank transfer) return "pending" -> poll confirm().
  if (intent && intent.status === "pending" && provider.confirm) {
    booking.events.push(event("processing", intent.pendingHint || "Awaiting confirmation"));
    for (let i = 0; i < 4 && intent.status === "pending"; i++) {
      const c = await provider.confirm(intent.reference);
      intent = c.data;
    }
  }

  if (!intent || intent.status === "failed") {
    booking.status = "failed";
    booking.failureReason = intent?.failureReason ?? "Payment could not be processed";
    booking.events.push(event("failed", booking.failureReason));
    return mockDelay({ data: booking, error: null });
  }

  if (paymentMode.escrow) {
    const host = HOSTS[listing.hostId] ?? HOSTS.h5;
    const esc = await createEscrow({
      code, kind: "booking", property: listing.name, location: listing.location,
      amount: breakdown.total, currency: listing.currency,
      buyerId, buyerName, host, dates: `${checkIn} - ${checkOut}`, guests,
    });
    booking.escrowId = esc.data.id;
    booking.status = "held";
    booking.events.push(event("held", "Payment received - funds held in escrow"));
  } else {
    booking.status = "confirmed";
    booking.events.push(event("confirmed", "Verified hotel - confirmed instantly"));
  }

  providers.notification.send({
    to: buyerName, channel: "in-app", title: "Booking confirmed",
    body: `${listing.name} - ${paymentMode.escrow ? "held in escrow" : "confirmed"}`,
  });

  return mockDelay({ data: booking, error: null });
}

export async function reverseBooking(bookingId: string): Promise<Result<Booking>> {
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { data: null as unknown as Booking, error: { code: "not_found", message: "Booking not found" } };
  await providers.payment.refund(b.reference);
  b.status = "reversed";
  b.events.push(event("reversed", "Payment reversed to guest"));
  return mockDelay({ data: b, error: null });
}

export async function getBooking(id: string): Promise<Result<Booking | null>> {
  if (isMock()) return mockDelay({ data: bookings.find((b) => b.id === id) ?? null, error: null });
  return apiPost<Booking | null>(`/bookings/get`, { id });
}

export async function listMyBookings(buyerId: string): Promise<Result<Booking[]>> {
  if (isMock()) return mockDelay({ data: [...bookings], error: null });
  return apiPost<Booking[]>(`/bookings/search`, { buyerId });
}

export function makeIdempotencyKey(listingId: string, buyerId: string): string {
  return `bk_${listingId}_${buyerId}_${Date.now()}`;
}
```

## 20. `src/lib/services/portalService.ts`

```typescript
import { isMock } from "@/lib/config";
import type {
  HotelRoom, HotelBooking, Unit, Tenant, MaintenanceTicket,
  AgentListing, Lead, Viewing, Project, ProjectUnit, DeveloperLead, Result,
} from "@/lib/models";
import {
  HOTEL_ROOMS, HOTEL_BOOKINGS, UNITS, TENANTS, MAINTENANCE,
  AGENT_LISTINGS, LEADS, VIEWINGS, PROJECTS, PROJECT_UNITS, DEVELOPER_LEADS,
} from "@/lib/data/portals";
import { apiGet, mockDelay } from "./apiClient";

/**
 * Portal service — one service backing all four role portals (hotel, landlord,
 * agent, developer). Same mock⇄API pattern as the rest of the app: pages call
 * these functions; when the backend is ready, implement the `// API:` branches
 * and the portal UIs don't change.
 *
 * Mock state is mutable so actions (edit rate, resolve ticket, advance a lead,
 * mark a unit sold) actually change the data and the UI reflects it — real
 * states, not static screens.
 */

// working copies so mutations persist in-session
const rooms = HOTEL_ROOMS.map((r) => ({ ...r }));
const hotelBookings = HOTEL_BOOKINGS.map((b) => ({ ...b }));
const units = UNITS.map((u) => ({ ...u }));
const tenants = TENANTS.map((t) => ({ ...t }));
const maintenance = MAINTENANCE.map((m) => ({ ...m }));
const agentListings = AGENT_LISTINGS.map((l) => ({ ...l }));
const leads = LEADS.map((l) => ({ ...l }));
const viewings = VIEWINGS.map((v) => ({ ...v }));
const projects = PROJECTS.map((p) => ({ ...p }));
const projectUnits = PROJECT_UNITS.map((u) => ({ ...u }));
const developerLeads = DEVELOPER_LEADS.map((l) => ({ ...l }));

const wrap = <T>(v: T): Promise<Result<T>> => mockDelay({ data: v, error: null });

// ---------------- HOTEL ----------------
export async function getHotelRooms(): Promise<Result<HotelRoom[]>> {
  if (isMock()) return wrap(rooms.map((r) => ({ ...r })));
  return apiGet<HotelRoom[]>("/portal/hotel/rooms");
}
export async function getHotelBookings(): Promise<Result<HotelBooking[]>> {
  if (isMock()) return wrap(hotelBookings.map((b) => ({ ...b })));
  return apiGet<HotelBooking[]>("/portal/hotel/bookings");
}
export async function updateRoomRate(id: string, rate: number): Promise<Result<HotelRoom | null>> {
  const r = rooms.find((x) => x.id === id);
  if (r) r.rate = rate;
  return wrap(r ? { ...r } : null);
}
export async function updateRoomAvailability(id: string, available: number): Promise<Result<HotelRoom | null>> {
  const r = rooms.find((x) => x.id === id);
  if (r) r.available = Math.max(0, Math.min(r.total, available));
  return wrap(r ? { ...r } : null);
}
export async function addRoomType(input: { name: string; rate: number; total: number; beds: string }): Promise<Result<HotelRoom>> {
  const room: HotelRoom = { id: "hr_" + Date.now(), currency: "KES", available: input.total, status: "active", ...input };
  rooms.push(room);
  return wrap({ ...room });
}

// ---------------- LANDLORD ----------------
export async function getUnits(): Promise<Result<Unit[]>> {
  if (isMock()) return wrap(units.map((u) => ({ ...u })));
  return apiGet<Unit[]>("/portal/landlord/units");
}
export async function getTenants(): Promise<Result<Tenant[]>> {
  if (isMock()) return wrap(tenants.map((t) => ({ ...t })));
  return apiGet<Tenant[]>("/portal/landlord/tenants");
}
export async function getMaintenance(): Promise<Result<MaintenanceTicket[]>> {
  if (isMock()) return wrap(maintenance.map((m) => ({ ...m })));
  return apiGet<MaintenanceTicket[]>("/portal/landlord/maintenance");
}
export async function sendRentReminder(tenantId: string): Promise<Result<{ sent: true }>> {
  return wrap({ sent: true as const });
}
export async function addTenant(input: { name: string; unitName: string; rent: number }): Promise<Result<Tenant>> {
  const t: Tenant = { id: "t_" + Date.now(), unitId: "u_new", currency: "KES", rentStatus: "due", leaseEnd: "12 months", ...input };
  tenants.push(t);
  return wrap({ ...t });
}
export async function resolveMaintenance(id: string): Promise<Result<MaintenanceTicket | null>> {
  const m = maintenance.find((x) => x.id === id);
  if (m) m.status = "resolved";
  return wrap(m ? { ...m } : null);
}

// ---------------- AGENT ----------------
export async function getAgentListings(): Promise<Result<AgentListing[]>> {
  if (isMock()) return wrap(agentListings.map((l) => ({ ...l })));
  return apiGet<AgentListing[]>("/portal/agent/listings");
}
export async function getLeads(): Promise<Result<Lead[]>> {
  if (isMock()) return wrap(leads.map((l) => ({ ...l })));
  return apiGet<Lead[]>("/portal/agent/leads");
}
export async function getViewings(): Promise<Result<Viewing[]>> {
  if (isMock()) return wrap(viewings.map((v) => ({ ...v })));
  return apiGet<Viewing[]>("/portal/agent/viewings");
}
const LEAD_STAGES: Lead["stage"][] = ["new", "contacted", "viewing", "offer", "closed"];
export async function advanceLead(id: string): Promise<Result<Lead | null>> {
  const l = leads.find((x) => x.id === id);
  if (l) {
    const i = LEAD_STAGES.indexOf(l.stage);
    l.stage = LEAD_STAGES[Math.min(LEAD_STAGES.length - 1, i + 1)];
    l.lastContact = "just now";
  }
  return wrap(l ? { ...l } : null);
}

// ---------------- DEVELOPER ----------------
export async function getProjects(): Promise<Result<Project[]>> {
  if (isMock()) return wrap(projects.map((p) => ({ ...p })));
  return apiGet<Project[]>("/portal/developer/projects");
}
export async function getProjectUnits(projectId: string): Promise<Result<ProjectUnit[]>> {
  if (isMock()) return wrap(projectUnits.filter((u) => u.projectId === projectId).map((u) => ({ ...u })));
  return apiGet<ProjectUnit[]>(`/portal/developer/projects/${projectId}/units`);
}
export async function getDeveloperLeads(): Promise<Result<DeveloperLead[]>> {
  if (isMock()) return wrap(developerLeads.map((l) => ({ ...l })));
  return apiGet<DeveloperLead[]>("/portal/developer/leads");
}
export async function markUnitSold(id: string): Promise<Result<ProjectUnit | null>> {
  const u = projectUnits.find((x) => x.id === id);
  if (u) {
    u.status = "sold";
    const proj = projects.find((p) => p.id === u.projectId);
    if (proj) { proj.sold += 1; proj.available = Math.max(0, proj.available - 1); }
  }
  return wrap(u ? { ...u } : null);
}
```


# APP ROUTES (Next.js App Router)

## 21. `src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import "@/styles/globals.css";
import { Header } from "@/components/ui/Header";
import { TabBar } from "@/components/ui/TabBar";
import { PWARegister } from "@/components/ui/PWARegister";

export const metadata: Metadata = {
  title: "PALTAS — Smart Living",
  description: "Homes, apartments and unique stays across Africa and beyond.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PALTAS",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#00c4ac",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Header />
        {children}
        <TabBar />
        <PWARegister />
      </body>
    </html>
  );
}
```

## 22. `src/app/page.tsx`

```tsx
import { Marketplace } from "@/components/marketplace/Marketplace";

/**
 * Home / marketplace page.
 * The page is a thin shell; the Marketplace client component handles browsing,
 * filtering, and navigation into a listing. Data always comes through the
 * listingService, so this page never knows whether it is mock or API-backed.
 */
export default function HomePage() {
  return (
    <main className="container">
      <section className="hero">
        <h1>
          Find your next<br />place to <span className="grad">stay.</span>
        </h1>
        <p>Homes, apartments and unique stays across Africa and beyond.</p>
      </section>
      <Marketplace />
    </main>
  );
}
```

## 23. `src/app/listing/[id]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { getListing, getReviews } from "@/lib/services/listingService";
import { HOSTS } from "@/lib/data/mock";
import { ListingDetail } from "@/components/marketplace/ListingDetail";

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
```

## 24. `src/app/bookings/page.tsx`

```tsx
import { MyBookings } from "@/components/booking/MyBookings";

/**
 * My bookings page — the end of the journey. Shows the guest's protected
 * bookings and lets them confirm & release escrow (the two-sided completion).
 */
export default function BookingsPage() {
  return (
    <main className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.5px", marginBottom: 6 }}>
        My bookings
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 22 }}>
        Your protected bookings and confirmations.
      </p>
      <MyBookings />
    </main>
  );
}
```

## 25. `src/app/portal/hotel/page.tsx`

```tsx
import { HotelDashboard } from "@/components/portal/HotelDashboard";
export default function HotelPortalPage() { return <HotelDashboard />; }
```

## 26. `src/app/portal/landlord/page.tsx`

```tsx
import { LandlordPortal } from "@/components/portal/LandlordPortal";
export default function LandlordPage() { return <LandlordPortal />; }
```

## 27. `src/app/portal/agent/page.tsx`

```tsx
import { AgentPortal } from "@/components/portal/AgentPortal";
export default function AgentPage() { return <AgentPortal />; }
```

## 28. `src/app/portal/developer/page.tsx`

```tsx
import { DeveloperPortal } from "@/components/portal/DeveloperPortal";
export default function DeveloperPage() { return <DeveloperPortal />; }
```


# UI COMPONENTS — shared

## 29. `src/components/ui/Header.tsx`

```tsx
import Link from "next/link";

export function Header() {
  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="brand">
          PALTAS<span>.</span>
          <small>SMART LIVING</small>
        </Link>
        <div className="header-spacer" />
        <Link href="/" className="header-link">Stays</Link>
        <Link href="/bookings" className="header-link">My bookings</Link>
        <div className="header-portals">
          <Link href="/portal/hotel" className="header-link">Hotel</Link>
          <Link href="/portal/landlord" className="header-link">Landlord</Link>
          <Link href="/portal/agent" className="header-link">Agent</Link>
          <Link href="/portal/developer" className="header-link">Developer</Link>
        </div>
      </div>
    </header>
  );
}
```

## 30. `src/components/ui/TabBar.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom tab bar — appears on phones and in the installed PWA, giving PALTAS a
 * native-app feel. Hidden on tablet/desktop via CSS.
 */
export function TabBar() {
  const path = usePathname();
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));

  return (
    <nav className="tabbar">
      <Link href="/" className={is("/") ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 11l9-8 9 8M5 10v10h14V10" />
        </svg>
        Stays
      </Link>
      <Link href="/bookings" className={is("/bookings") ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        Bookings
      </Link>
      <Link href="/" className="">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        Account
      </Link>
    </nav>
  );
}
```

## 31. `src/components/ui/PWARegister.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker (making PALTAS installable + offline-capable)
 * and surfaces a lightweight "Install app" banner when the browser allows it.
 */
export function PWARegister() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="pwa-banner">
      <div className="pwa-ico">P</div>
      <div className="pwa-txt">
        <b>Install PALTAS</b>
        <span>Add to your home screen — works like an app, even offline.</span>
      </div>
      <button className="pwa-install" onClick={install}>Install</button>
      <button className="pwa-close" onClick={() => setShow(false)} aria-label="Dismiss">✕</button>
    </div>
  );
}
```


# UI COMPONENTS — marketplace & booking journey

## 32. `src/components/marketplace/Marketplace.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Listing, StayMode } from "@/lib/models";
import { searchListings } from "@/lib/services/listingService";
import { ListingCard } from "./ListingCard";

const MODES: { key: StayMode | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "stays", label: "Short stays" },
  { key: "hotel", label: "Hotels" },
  { key: "rent", label: "Long-term rent" },
];

export function Marketplace() {
  const router = useRouter();
  const [mode, setMode] = useState<StayMode | "all">("all");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchListings({ mode }).then((res) => {
      if (active) {
        setListings(res.data ?? []);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [mode]);

  return (
    <>
      <div className="chips">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`chip ${mode === m.key ? "active" : ""}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Finding places…</div>
      ) : (
        <div className="grid">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              onClick={() => router.push(`/listing/${l.id}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}
```

## 33. `src/components/marketplace/ListingCard.tsx`

```tsx
import type { Listing } from "@/lib/models";
import { allInNightly, paymentModeFor } from "@/lib/services/pricingService";

export function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const allIn = allInNightly(listing);
  const pm = paymentModeFor(listing);

  return (
    <button className="card" onClick={onClick}>
      <div className="card-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={listing.imageUrl} alt={listing.name} loading="lazy" />
        <span className={`card-badge ${pm.escrow ? "escrow" : "instant"}`}>
          {pm.escrow ? "🔒 Escrow protected" : "⚡ Instant confirmation"}
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
      </div>
    </button>
  );
}
```

## 34. `src/components/marketplace/ListingDetail.tsx`

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Host, Listing, Review } from "@/lib/models";
import { priceBreakdown, paymentModeFor } from "@/lib/services/pricingService";
import { CheckoutModal } from "@/components/booking/CheckoutModal";

const NIGHTS = 3; // in a full build this comes from a date picker

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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const breakdown = priceBreakdown(listing, NIGHTS);
  const pm = paymentModeFor(listing);

  return (
    <main className="container detail">
      <Link href="/" className="detail-back">← Back to stays</Link>

      <div className="detail-gallery">
        {listing.gallery.slice(0, 3).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt={`${listing.name} ${i + 1}`} />
        ))}
      </div>

      <div className="detail-cols">
        <div>
          <h1>{listing.name}</h1>
          <div className="detail-sub">
            {listing.location} · ★ {listing.rating} ({listing.reviewCount} reviews) · up to {listing.maxGuests} guests
          </div>

          <div className="host-card">
            <div className="host-av">{host.initials}</div>
            <div className="host-info">
              <b>
                {host.name}
                {host.verified && <span className="verified">✓ Verified</span>}
              </b>
              <span>{host.type} · ★ {host.rating} · Responds {host.responseTime}</span>
            </div>
          </div>

          <h3>About this place</h3>
          <p>{listing.description}</p>

          <h3>What this place offers</h3>
          <div className="amenities">
            {listing.amenities.map((a) => (
              <div key={a} className="a">✓ {a}</div>
            ))}
          </div>

          <h3>★ {listing.rating} · {listing.reviewCount} reviews</h3>
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
            <div className="trust-strip">
              <span>✓ Verified host</span>
              {pm.escrow ? <span>🔒 Escrow protected</span> : <span>⚡ Instant confirmation</span>}
              <span>✓ No hidden fees</span>
            </div>
            <div className="book-price">
              <b>KSh {listing.price.toLocaleString()}</b> <span>/ night</span>
            </div>
            <div className="book-fields">
              <div className="bf-row">
                <div className="bf"><label>Check-in</label><div className="v">Sat, 30 Aug</div></div>
                <div className="bf"><label>Check-out</label><div className="v">Tue, 2 Sep</div></div>
              </div>
              <div className="bf"><label>Guests</label><div className="v">2 guests</div></div>
            </div>
            <button className="btn btn-primary" onClick={() => setCheckoutOpen(true)}>
              Reserve now
            </button>
            <div className="breakdown">
              <div className="br">
                <span>KSh {listing.price.toLocaleString()} × {NIGHTS} nights</span>
                <span>KSh {breakdown.subtotal.toLocaleString()}</span>
              </div>
              <div className="br"><span>Cleaning fee</span><span>KSh {breakdown.cleaningFee.toLocaleString()}</span></div>
              <div className="br"><span>Service fee</span><span>KSh {breakdown.serviceFee.toLocaleString()}</span></div>
              <div className="br"><span>Taxes</span><span>KSh {breakdown.taxes.toLocaleString()}</span></div>
              <div className="br total"><span>Total · all in</span><span>KSh {breakdown.total.toLocaleString()}</span></div>
            </div>
            <div className="reassure">You won&apos;t be charged yet · Full price shown above</div>
          </div>
        </div>
      </div>

      {checkoutOpen && (
        <CheckoutModal
          listing={listing}
          nights={NIGHTS}
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
```

## 35. `src/components/booking/CheckoutModal.tsx`

```tsx
"use client";

import { useState } from "react";
import type { Listing, Booking } from "@/lib/models";
import { priceBreakdown, paymentModeFor } from "@/lib/services/pricingService";
import { createBooking, makeIdempotencyKey } from "@/lib/services/bookingService";
import { getCurrentUser, signIn } from "@/lib/services/authService";
import { paymentOptions, type PaymentOption } from "@/lib/providers/registry";

/**
 * Checkout state machine, now with real payment-provider selection:
 * account -> method (Stripe card/wallet/bank, Appra Pay, Mobile money)
 * -> review -> processing -> completed | failed -> receipt.
 * The chosen method routes to a provider behind the PaymentProvider interface.
 */
type Step = "account" | "method" | "review" | "processing" | "result";

export function CheckoutModal({
  listing, nights, onClose, onComplete,
}: {
  listing: Listing; nights: number; onClose: () => void; onComplete: (bookingId: string) => void;
}) {
  const existing = getCurrentUser();
  const [step, setStep] = useState<Step>(existing ? "method" : "account");
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [idemKey] = useState(() => makeIdempotencyKey(listing.id, existing?.id ?? "guest"));
  const [simFail, setSimFail] = useState(false);
  const [option, setOption] = useState<PaymentOption | null>(null);
  const [phone, setPhone] = useState("");
  const [processingHint, setProcessingHint] = useState("Processing your payment…");

  const breakdown = priceBreakdown(listing, nights);
  const pm = paymentModeFor(listing);
  const options = paymentOptions();

  async function handleAccount() {
    setBusy(true);
    await signIn({ name: name || "Guest", email: email || "guest@paltas.com" });
    setBusy(false);
    setStep("method");
  }

  async function handlePay() {
    if (!option) return;
    if (option.method === "mobile_money") setProcessingHint("Check your phone and approve the prompt…");
    else setProcessingHint("Processing your payment…");
    setStep("processing");
    const user = getCurrentUser()!;
    const res = await createBooking({
      listing, checkIn: "2025-08-30", checkOut: "2025-09-02", nights, guests: 2,
      buyerId: user.id, buyerName: user.name, idempotencyKey: idemKey, simulateFailure: simFail,
      method: option.method, providerName: option.providerName, phone,
    });
    setBooking(res.data);
    setStep("result");
  }

  const needsPhone = option?.method === "mobile_money";
  const canPay = option && (!needsPhone || phone.replace(/\D/g, "").length >= 9);

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && step !== "processing" && onClose()}>
      <div className="modal">
        {step === "account" && (
          <>
            <h2>Almost there — create your free account</h2>
            <p className="lede">Takes 10 seconds. {pm.escrow ? "Your payment is protected by PALTAS escrow until you check in." : "This is a verified hotel — instant confirmation."}</p>
            <div className="field"><label>Full name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
            <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
            <button className="btn btn-primary" disabled={busy} onClick={handleAccount}>{busy ? "Creating…" : "Create account & continue"}</button>
          </>
        )}

        {step === "method" && (
          <>
            <h2>How would you like to pay?</h2>
            <p className="lede">Total KSh {breakdown.total.toLocaleString()} · all fees included</p>
            <div className="pay-options">
              {options.map((o) => (
                <button
                  key={o.method + o.providerName}
                  className={`pay-option ${option?.method === o.method && option?.providerName === o.providerName ? "sel" : ""}`}
                  onClick={() => setOption(o)}
                >
                  <span className="po-ico">{o.icon || "•"}</span>
                  <span className="po-txt"><b>{o.label}</b><span>{o.sublabel} · via {o.providerName}</span></span>
                  <span className="po-radio" />
                </button>
              ))}
            </div>
            {needsPhone && (
              <div className="field" style={{ marginTop: 12 }}>
                <label>Mobile money number</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" inputMode="tel" />
              </div>
            )}
            <button className="btn btn-primary" disabled={!canPay} onClick={() => setStep("review")} style={{ marginTop: 14 }}>Continue</button>
          </>
        )}

        {step === "review" && option && (
          <>
            <h2>Review & confirm</h2>
            <p className="lede">{listing.name} · {listing.location}</p>
            <div className={`escrow-band ${pm.escrow ? "" : "instant"}`}>
              <div className="eb-ico">{pm.escrow ? "🔒" : "⚡"}</div>
              <div><b>{pm.escrow ? "Protected by PALTAS Escrow" : "Verified hotel · Instant confirmation"}</b><span>{pm.reason}</span></div>
            </div>
            <div className="breakdown">
              <div className="br"><span>KSh {listing.price.toLocaleString()} × {nights} nights</span><span>KSh {breakdown.subtotal.toLocaleString()}</span></div>
              <div className="br"><span>Cleaning fee</span><span>KSh {breakdown.cleaningFee.toLocaleString()}</span></div>
              <div className="br"><span>Service fee</span><span>KSh {breakdown.serviceFee.toLocaleString()}</span></div>
              <div className="br"><span>Taxes</span><span>KSh {breakdown.taxes.toLocaleString()}</span></div>
              <div className="br"><span>Paying with</span><span>{option.icon} {option.label}</span></div>
              <div className="br total"><span>Total</span><span>KSh {breakdown.total.toLocaleString()}</span></div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--muted)", margin: "12px 0" }}>
              <input type="checkbox" checked={simFail} onChange={(e) => setSimFail(e.target.checked)} />
              Simulate a failed payment (to see the error state)
            </label>
            <button className="btn btn-primary" onClick={handlePay}>Confirm & pay KSh {breakdown.total.toLocaleString()}</button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setStep("method")}>Change payment method</button>
          </>
        )}

        {step === "processing" && (
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <div className="spinner" />
            <h2 style={{ marginTop: 18 }}>{option?.method === "mobile_money" ? "Awaiting your approval…" : "Processing your payment…"}</h2>
            <p className="lede">{processingHint} Please don&apos;t close this window.</p>
          </div>
        )}

        {step === "result" && booking && booking.status !== "failed" && (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="result-check ok">✓</div>
              <h2>{booking.status === "held" ? "Paid & protected 🎉" : "Booking confirmed 🎉"}</h2>
              <p className="lede">{booking.status === "held" ? "Your payment is safely held by PALTAS escrow until you confirm your stay." : "You're confirmed instantly at this verified hotel."}</p>
            </div>
            <div className="receipt">
              <div className="br"><span>Property</span><b>{booking.property}</b></div>
              <div className="br"><span>Paid with</span><b>{option?.label} · {option?.providerName}</b></div>
              <div className="br"><span>Reference</span><b>{booking.reference}</b></div>
              <div className="br"><span>Booking code</span><b>{booking.code}</b></div>
              <div className="br"><span>Amount</span><b>KSh {booking.breakdown.total.toLocaleString()}</b></div>
              <div className="br"><span>Status</span><b style={{ color: "var(--teal-ink)" }}>{booking.status === "held" ? "🔒 Held in escrow" : "✓ Confirmed"}</b></div>
            </div>
            <button className="btn btn-primary" onClick={() => onComplete(booking.escrowId ?? booking.id)}>{booking.status === "held" ? "View my protected booking" : "View my booking"}</button>
          </>
        )}

        {step === "result" && booking && booking.status === "failed" && (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="result-check fail">✕</div>
              <h2>Payment failed</h2>
              <p className="lede">{booking.failureReason}. You have not been charged. Please try again or use a different method.</p>
            </div>
            <div className="receipt">
              <div className="br"><span>Reference</span><b>{booking.reference || "—"}</b></div>
              <div className="br"><span>Status</span><b style={{ color: "#c0453a" }}>Failed · not charged</b></div>
            </div>
            <button className="btn btn-primary" onClick={() => setStep("method")}>Try a different method</button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
```

## 36. `src/components/booking/MyBookings.tsx`

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { EscrowTransaction } from "@/lib/models";
import { getMyEscrows, confirmAsBuyer, confirmAsHost } from "@/lib/services/escrowService";
import { getCurrentUser } from "@/lib/services/authService";

export function MyBookings() {
  const [items, setItems] = useState<EscrowTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const user = getCurrentUser();
    const res = await getMyEscrows(user?.id ?? "guest");
    setItems(res.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function release(id: string) {
    await confirmAsBuyer(id);
    await load();
  }

  // Demo helper so you can see the two-sided completion without a second device.
  async function hostConfirm(id: string) {
    await confirmAsHost(id);
    await load();
  }

  if (loading) return <div className="loading">Loading your bookings…</div>;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 40 }}>🧳</div>
        <p style={{ fontWeight: 800, margin: "10px 0 4px" }}>No bookings yet</p>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          When you book a stay, your protected bookings appear here.
        </p>
        <Link href="/" className="btn btn-primary" style={{ display: "inline-flex", width: "auto", padding: "12px 22px" }}>
          Find a place to stay
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      {items.map((t) => {
        const complete = t.status === "released";
        return (
          <div key={t.id} className="book-card" style={{ position: "static" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <b style={{ fontSize: 17 }}>{t.property}</b>
              <span style={{ fontSize: 12, fontWeight: 800, color: complete ? "var(--teal-ink)" : "#2278c4" }}>
                {t.status === "held" ? "🔒 Held in escrow" : complete ? "✓ Completed" : "⚠ In review"}
              </span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
              {t.location} · {t.dates} · {t.code}
            </div>

            <div className="host-card" style={{ margin: "0 0 12px" }}>
              <div className="host-av">{t.host.initials}</div>
              <div className="host-info">
                <b>{t.host.name}{t.host.verified && <span className="verified">✓ Verified</span>}</b>
                <span>{t.host.type} · ★ {t.host.rating}</span>
              </div>
            </div>

            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              KSh {t.amount.toLocaleString()} <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>held safely</span>
            </div>

            <div className="check-both">
              <div className="cb"><span className={`cb-dot ${t.buyerConfirmed ? "ok" : "wait"}`}>{t.buyerConfirmed ? "✓" : "•"}</span> You {t.buyerConfirmed ? "confirmed" : "not yet"}</div>
              <div className="cb"><span className={`cb-dot ${t.hostConfirmed ? "ok" : "wait"}`}>{t.hostConfirmed ? "✓" : "•"}</span> {t.host.name.split(" ")[0]} {t.hostConfirmed ? "confirmed" : "not yet"}</div>
            </div>

            {complete ? (
              <div className="complete-banner">
                <div className="c">✓</div>
                <div>
                  <b>Booking complete</b>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                    Both you and {t.host.name.split(" ")[0]} confirmed — funds released. 🎉
                  </div>
                </div>
              </div>
            ) : t.status === "held" ? (
              <>
                <button className="btn btn-primary" disabled={t.buyerConfirmed} onClick={() => release(t.id)}>
                  {t.buyerConfirmed ? `Waiting on ${t.host.name.split(" ")[0]}` : "Confirm & release funds"}
                </button>
                {t.buyerConfirmed && !t.hostConfirmed && (
                  <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => hostConfirm(t.id)}>
                    Confirm as host (demo)
                  </button>
                )}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
```


# UI COMPONENTS — role portals

## 37. `src/components/portal/PortalShell.tsx`

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Shared shell for all role portals: header with title/badge, a tab strip, and
 * a body that renders the active tab. Keeps every portal consistent and DRY.
 */
export function PortalShell({
  title, subtitle, badge, tabs, activeKey, onTabChange,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  tabs: { key: string; label: string; render: () => React.ReactNode }[];
  activeKey?: string;
  onTabChange?: (key: string) => void;
}) {
  const [internal, setInternal] = useState(tabs[0]?.key);
  const active = activeKey ?? internal;
  const setActive = (k: string) => { setInternal(k); onTabChange?.(k); };
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="portal">
      <div className="portal-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {badge && <span className="portal-badge">{badge}</span>}
        <Link href="/" className="portal-exit">Exit</Link>
      </div>
      <div className="portal-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`portal-tab ${active === t.key ? "on" : ""}`} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="portal-body">{current?.render()}</div>
    </div>
  );
}

/** Simple stat card used across portals. */
export function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="kpi">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** Status pill with semantic colour. */
export function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "grey"; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** Loading + empty helpers so every list has real states. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="portal-loading"><div className="spinner" /><span>{label}</span></div>;
}
export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="portal-empty">
      <div style={{ fontSize: 38 }}>{icon}</div>
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}
```

## 38. `src/components/portal/HotelDashboard.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import type { HotelRoom, HotelBooking } from "@/lib/models";
import {
  getHotelRooms, getHotelBookings, updateRoomRate, updateRoomAvailability, addRoomType,
} from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";

export function HotelDashboard() {
  const [rooms, setRooms] = useState<HotelRoom[] | null>(null);
  const [bookings, setBookings] = useState<HotelBooking[] | null>(null);

  async function loadRooms() { setRooms((await getHotelRooms()).data); }
  async function loadBookings() { setBookings((await getHotelBookings()).data); }
  useEffect(() => { loadRooms(); loadBookings(); }, []);

  const occupancy = rooms ? Math.round(((sum(rooms, "total") - sum(rooms, "available")) / Math.max(1, sum(rooms, "total"))) * 100) : 0;
  const available = rooms ? sum(rooms, "available") : 0;

  async function editRate(r: HotelRoom) {
    const v = prompt(`New nightly rate for ${r.name} (KSh):`, String(r.rate));
    if (v) { await updateRoomRate(r.id, parseInt(v) || r.rate); loadRooms(); }
  }
  async function setAvail(r: HotelRoom) {
    const v = prompt(`Rooms available for ${r.name}:`, String(r.available));
    if (v !== null) { await updateRoomAvailability(r.id, parseInt(v) || 0); loadRooms(); }
  }
  async function addRoom() {
    const name = prompt("New room type name:", "Superior Twin");
    if (!name) return;
    const rate = parseInt(prompt("Nightly rate (KSh):", "10000") || "10000") || 10000;
    const total = parseInt(prompt("How many rooms:", "10") || "10") || 10;
    await addRoomType({ name, rate, total, beds: "2 Twin" });
    loadRooms();
  }

  return (
    <PortalShell
      title="Sarova Grand Hotel" subtitle="Hotel management · Nairobi" badge="✓ Verified · Instant payout"
      tabs={[
        {
          key: "overview", label: "Overview", render: () => rooms === null || bookings === null ? <Loading /> : (
            <>
              <div className="kpis">
                <Kpi value={`${occupancy}%`} label="Occupancy" />
                <Kpi value={String(available)} label="Rooms available" />
                <Kpi value={String(bookings.filter((b) => b.status === "confirmed").length)} label="Arrivals today" />
                <Kpi value={`KSh ${Math.round(bookings.filter((b) => b.status !== "checked_out").reduce((a, b) => a + b.amount, 0) / 1000)}k`} label="Revenue (in-house)" />
              </div>
              <div className="portal-note">💡 As a verified hotel, your bookings pay out <b>instantly</b> — no escrow hold. Guests get instant confirmation.</div>
              <h3 className="portal-h3">Today&apos;s arrivals</h3>
              {bookings.filter((b) => b.status === "confirmed").map((b) => (
                <div key={b.id} className="lrow"><div><b>{b.guest}</b><span>{b.room} · {b.checkIn} → {b.checkOut}</span></div><b>KSh {b.amount.toLocaleString()}</b></div>
              ))}
            </>
          ),
        },
        {
          key: "rooms", label: "Rooms & rates", render: () => rooms === null ? <Loading /> : (
            <>
              <div className="portal-h3 row-between"><span>Room types &amp; rates</span><button className="btn-mini" onClick={addRoom}>+ Add room type</button></div>
              {rooms.map((r) => (
                <div key={r.id} className="room-card">
                  <div className="room-top"><b>{r.name}</b><span className="room-rate">KSh {r.rate.toLocaleString()}<small>/night</small></span></div>
                  <div className="room-meta">{r.beds} · {r.total} rooms · <span className="ok">{r.available} available</span></div>
                  <div className="room-acts">
                    <button onClick={() => editRate(r)}>Edit rate</button>
                    <button onClick={() => setAvail(r)}>Set availability</button>
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "availability", label: "Availability", render: () => rooms === null ? <Loading /> : (
            <>
              <h3 className="portal-h3">Next 7 days</h3>
              <div className="avail-legend"><span><i style={{ background: "#00c4ac" }} />Available</span><span><i style={{ background: "#f5a623" }} />Limited</span><span><i style={{ background: "#e0574a" }} />Full</span></div>
              <div className="avail-grid" style={{ gridTemplateColumns: "1.4fr repeat(7,1fr)" }}>
                <div className="avail-corner">Room</div>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="avail-day">{d}</div>)}
                {rooms.map((r) => (
                  <FragmentRow key={r.id} room={r} />
                ))}
              </div>
            </>
          ),
        },
        {
          key: "bookings", label: "Bookings", render: () => bookings === null ? <Loading /> : bookings.length === 0 ? <Empty icon="🛎️" title="No bookings yet" /> : (
            <>
              {bookings.map((b) => (
                <div key={b.id} className="lrow">
                  <div className="lrow-av">{b.guest.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  <div style={{ flex: 1 }}><b>{b.guest}</b><span>{b.room} · {b.checkIn} → {b.checkOut}</span></div>
                  <div style={{ textAlign: "right" }}>
                    <b>KSh {b.amount.toLocaleString()}</b>
                    <div><BookingPill status={b.status} /></div>
                  </div>
                </div>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}

function FragmentRow({ room }: { room: HotelRoom }) {
  return (
    <>
      <div className="avail-name">{room.name}</div>
      {[0, 1, 2, 3, 4, 5, 6].map((di) => {
        const a = Math.max(0, room.available - (di % 3));
        const cls = a === 0 ? "full" : a <= 2 ? "limited" : "open";
        return <div key={di} className={`avail-cell ${cls}`}>{a}</div>;
      })}
    </>
  );
}

function BookingPill({ status }: { status: HotelBooking["status"] }) {
  const map: Record<HotelBooking["status"], { tone: "blue" | "green" | "grey" | "red"; label: string }> = {
    confirmed: { tone: "blue", label: "Confirmed" },
    checked_in: { tone: "green", label: "Checked in" },
    checked_out: { tone: "grey", label: "Checked out" },
    cancelled: { tone: "red", label: "Cancelled" },
  };
  const m = map[status];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

function sum(rooms: HotelRoom[], k: "total" | "available") { return rooms.reduce((a, r) => a + r[k], 0); }
```

## 39. `src/components/portal/LandlordPortal.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Unit, Tenant, MaintenanceTicket } from "@/lib/models";
import { getUnits, getTenants, getMaintenance, sendRentReminder, addTenant, resolveMaintenance } from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";

export function LandlordPortal() {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [tickets, setTickets] = useState<MaintenanceTicket[] | null>(null);
  const [toast, setToast] = useState("");

  async function loadUnits() { setUnits((await getUnits()).data); }
  async function loadTenants() { setTenants((await getTenants()).data); }
  async function loadTickets() { setTickets((await getMaintenance()).data); }
  useEffect(() => { loadUnits(); loadTenants(); loadTickets(); }, []);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2600); }

  async function remind(t: Tenant) { await sendRentReminder(t.id); flash(`Rent reminder sent to ${t.name}`); }
  async function newTenant() {
    const name = prompt("Tenant name:"); if (!name) return;
    const unitName = prompt("Unit (e.g. Apt 5C):", "Apt 5C") || "Unit";
    const rent = parseInt(prompt("Monthly rent (KSh):", "40000") || "40000") || 40000;
    await addTenant({ name, unitName, rent }); loadTenants(); flash(`${name} added — invite sent`);
  }
  async function resolve(m: MaintenanceTicket) { await resolveMaintenance(m.id); loadTickets(); flash("Marked resolved"); }

  const occupied = units?.filter((u) => u.status === "occupied").length ?? 0;
  const monthlyRent = tenants?.reduce((a, t) => a + t.rent, 0) ?? 0;
  const overdue = tenants?.filter((t) => t.rentStatus !== "paid").length ?? 0;

  return (
    <>
      {toast && <div className="portal-toast">{toast}</div>}
      <PortalShell
        title="Landlord portal" subtitle="Your units, tenants & rent" badge="Verified landlord"
        tabs={[
          {
            key: "overview", label: "Overview", render: () => units === null || tenants === null ? <Loading /> : (
              <>
                <div className="kpis">
                  <Kpi value={`${occupied}/${units.length}`} label="Units occupied" />
                  <Kpi value={`KSh ${Math.round(monthlyRent / 1000)}k`} label="Monthly rent" />
                  <Kpi value={String(overdue)} label="Rent to collect" />
                  <Kpi value={String(tickets?.filter((t) => t.status !== "resolved").length ?? 0)} label="Open maintenance" />
                </div>
                <div className="quick-actions">
                  <button onClick={newTenant}>+ Add a tenant</button>
                  <button onClick={() => tenants.filter((t) => t.rentStatus !== "paid").forEach(remind)}>Send rent reminders</button>
                </div>
                <h3 className="portal-h3">Rent status</h3>
                {tenants.map((t) => (
                  <div key={t.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{t.name}</b><span>{t.unitName} · lease ends {t.leaseEnd}</span></div>
                    <div style={{ textAlign: "right" }}>
                      <b>KSh {t.rent.toLocaleString()}</b>
                      <div><RentPill s={t.rentStatus} /></div>
                    </div>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "units", label: "Properties", render: () => units === null ? <Loading /> : (
              <>
                {units.map((u) => (
                  <div key={u.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{u.name}</b><span>{u.location}</span></div>
                    <div style={{ textAlign: "right" }}><b>KSh {u.rent.toLocaleString()}</b><div><UnitPill s={u.status} /></div></div>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "tenants", label: "Tenants", render: () => tenants === null ? <Loading /> : tenants.length === 0 ? <Empty icon="👥" title="No tenants yet" hint="Add a tenant to start collecting rent." /> : (
              <>
                <div className="portal-h3 row-between"><span>Tenants</span><button className="btn-mini" onClick={newTenant}>+ Add tenant</button></div>
                {tenants.map((t) => (
                  <div key={t.id} className="lrow">
                    <div className="lrow-av">{t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                    <div style={{ flex: 1 }}><b>{t.name}</b><span>{t.unitName} · KSh {t.rent.toLocaleString()}/mo</span></div>
                    <button className="btn-mini" onClick={() => remind(t)}>Remind</button>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "maintenance", label: "Maintenance", render: () => tickets === null ? <Loading /> : tickets.length === 0 ? <Empty icon="🔧" title="No maintenance requests" /> : (
              <>
                {tickets.map((m) => (
                  <div key={m.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{m.issue}</b><span>{m.unitName} · {m.raisedBy} · {m.priority} priority</span></div>
                    {m.status === "resolved" ? <Pill tone="green">Resolved</Pill> : <button className="btn-mini" onClick={() => resolve(m)}>Resolve</button>}
                  </div>
                ))}
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function RentPill({ s }: { s: Tenant["rentStatus"] }) {
  const m = { paid: ["green", "Paid"], due: ["amber", "Due"], overdue: ["red", "Overdue"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
function UnitPill({ s }: { s: Unit["status"] }) {
  const m = { occupied: ["green", "Occupied"], vacant: ["amber", "Vacant"], notice: ["red", "On notice"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
```

## 40. `src/components/portal/AgentPortal.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import type { AgentListing, Lead, Viewing } from "@/lib/models";
import { getAgentListings, getLeads, getViewings, advanceLead } from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";

export function AgentPortal() {
  const [listings, setListings] = useState<AgentListing[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [viewings, setViewings] = useState<Viewing[] | null>(null);
  const [toast, setToast] = useState("");

  async function loadLeads() { setLeads((await getLeads()).data); }
  useEffect(() => {
    getAgentListings().then((r) => setListings(r.data));
    loadLeads();
    getViewings().then((r) => setViewings(r.data));
  }, []);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2400); }
  async function advance(l: Lead) { await advanceLead(l.id); loadLeads(); flash(`${l.name} moved forward`); }

  const live = listings?.filter((l) => l.status === "live").length ?? 0;
  const openLeads = leads?.filter((l) => l.stage !== "closed").length ?? 0;

  return (
    <>
      {toast && <div className="portal-toast">{toast}</div>}
      <PortalShell
        title="Agent CRM" subtitle="Listings, leads & viewings" badge="Verified agent"
        tabs={[
          {
            key: "overview", label: "Overview", render: () => listings === null || leads === null ? <Loading /> : (
              <>
                <div className="kpis">
                  <Kpi value={String(live)} label="Live listings" />
                  <Kpi value={String(openLeads)} label="Active leads" />
                  <Kpi value={String(viewings?.filter((v) => v.status === "scheduled").length ?? 0)} label="Viewings booked" />
                  <Kpi value={String(listings.filter((l) => l.status === "under_offer").length)} label="Under offer" />
                </div>
                <h3 className="portal-h3">Leads needing action</h3>
                {leads.filter((l) => l.stage !== "closed").map((l) => (
                  <div key={l.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.interestedIn} · {l.lastContact}</span></div>
                    <LeadPill s={l.stage} />
                    <button className="btn-mini" onClick={() => advance(l)}>Advance →</button>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "listings", label: "Listings", render: () => listings === null ? <Loading /> : (
              <>
                {listings.map((l) => (
                  <div key={l.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.location} · {l.views} views · {l.kind === "sale" ? "For sale" : "For rent"}</span></div>
                    <div style={{ textAlign: "right" }}><b>KSh {l.price.toLocaleString()}</b><div><ListingPill s={l.status} /></div></div>
                  </div>
                ))}
              </>
            ),
          },
          {
            key: "leads", label: "Leads pipeline", render: () => leads === null ? <Loading /> : leads.length === 0 ? <Empty icon="🎯" title="No leads yet" /> : (
              <>
                {(["new", "contacted", "viewing", "offer", "closed"] as Lead["stage"][]).map((stage) => {
                  const group = leads.filter((l) => l.stage === stage);
                  if (group.length === 0) return null;
                  return (
                    <div key={stage}>
                      <h3 className="portal-h3" style={{ textTransform: "capitalize" }}>{stage} ({group.length})</h3>
                      {group.map((l) => (
                        <div key={l.id} className="lrow">
                          <div className="lrow-av">{l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                          <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.interestedIn} · budget KSh {l.budget.toLocaleString()}</span></div>
                          <button className="btn-mini" onClick={() => advance(l)}>Advance →</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            ),
          },
          {
            key: "viewings", label: "Viewings", render: () => viewings === null ? <Loading /> : viewings.length === 0 ? <Empty icon="📅" title="No viewings scheduled" /> : (
              <>
                {viewings.map((v) => (
                  <div key={v.id} className="lrow">
                    <div style={{ flex: 1 }}><b>{v.listing}</b><span>{v.client} · {v.when}</span></div>
                    <Pill tone={v.status === "scheduled" ? "blue" : v.status === "completed" ? "green" : "grey"}>{v.status}</Pill>
                  </div>
                ))}
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function LeadPill({ s }: { s: Lead["stage"] }) {
  const m: Record<Lead["stage"], "grey" | "blue" | "amber" | "green"> = { new: "grey", contacted: "blue", viewing: "amber", offer: "amber", closed: "green" };
  return <Pill tone={m[s]}>{s}</Pill>;
}
function ListingPill({ s }: { s: AgentListing["status"] }) {
  const m = { live: ["green", "Live"], under_offer: ["amber", "Under offer"], sold: ["blue", "Sold"], draft: ["grey", "Draft"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
```

## 41. `src/components/portal/DeveloperPortal.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Project, ProjectUnit, DeveloperLead } from "@/lib/models";
import { getProjects, getProjectUnits, getDeveloperLeads, markUnitSold } from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";

export function DeveloperPortal() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [leads, setLeads] = useState<DeveloperLead[] | null>(null);
  const [openProject, setOpenProject] = useState<Project | null>(null);
  const [units, setUnits] = useState<ProjectUnit[] | null>(null);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState("overview");

  async function loadProjects() { setProjects((await getProjects()).data); }
  useEffect(() => { loadProjects(); getDeveloperLeads().then((r) => setLeads(r.data)); }, []);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(""), 2400); }
  async function openUnits(p: Project) { setOpenProject(p); setUnits(null); setTab("units"); setUnits((await getProjectUnits(p.id)).data); }
  async function sell(u: ProjectUnit) {
    await markUnitSold(u.id);
    if (openProject) setUnits((await getProjectUnits(openProject.id)).data);
    loadProjects();
    flash(`${u.unitNo} marked sold`);
  }

  const totalUnits = projects?.reduce((a, p) => a + p.totalUnits, 0) ?? 0;
  const totalSold = projects?.reduce((a, p) => a + p.sold, 0) ?? 0;
  const revenue = projects?.reduce((a, p) => a + p.revenue, 0) ?? 0;

  return (
    <>
      {toast && <div className="portal-toast">{toast}</div>}
      <PortalShell
        title="Developer portal" subtitle="Projects, units, sales & leads" badge="Verified developer"
        activeKey={tab} onTabChange={setTab}
        tabs={[
          {
            key: "overview", label: "Overview", render: () => projects === null ? <Loading /> : (
              <>
                <div className="kpis">
                  <Kpi value={String(projects.length)} label="Projects" />
                  <Kpi value={`${totalSold}/${totalUnits}`} label="Units sold" />
                  <Kpi value={`KSh ${Math.round(revenue / 1_000_000)}M`} label="Total revenue" />
                  <Kpi value={String(leads?.length ?? 0)} label="Active leads" />
                </div>
                <h3 className="portal-h3">Projects</h3>
                {projects.map((p) => (
                  <button key={p.id} className="proj-card" onClick={() => openUnits(p)}>
                    <div className="proj-top"><b>{p.name}</b><ProjectPill s={p.status} /></div>
                    <span className="proj-loc">{p.location}</span>
                    <div className="proj-bar"><div className="proj-bar-fill" style={{ width: `${p.completion}%` }} /></div>
                    <div className="proj-stats">
                      <span>{p.sold}/{p.totalUnits} sold</span>
                      <span>{p.available} available</span>
                      <span>KSh {Math.round(p.revenue / 1_000_000)}M</span>
                      <span>{p.completion}% built</span>
                    </div>
                  </button>
                ))}
              </>
            ),
          },
          {
            key: "units", label: "Units", render: () => (
              <>
                {openProject ? (
                  <>
                    <div className="portal-h3 row-between"><span>{openProject.name} — units</span><button className="btn-mini" onClick={() => { setOpenProject(null); setUnits(null); }}>← All projects</button></div>
                    {units === null ? <Loading /> : units.map((u) => (
                      <div key={u.id} className="lrow">
                        <div style={{ flex: 1 }}><b>{u.unitNo}</b><span>{u.type} · KSh {u.price.toLocaleString()}</span></div>
                        {u.status === "sold" ? <Pill tone="blue">Sold</Pill> : u.status === "reserved" ? <Pill tone="amber">Reserved</Pill> : <button className="btn-mini" onClick={() => sell(u)}>Mark sold</button>}
                      </div>
                    ))}
                  </>
                ) : projects === null ? <Loading /> : (
                  <Empty icon="🏢" title="Pick a project" hint="Open a project from Overview to manage its units." />
                )}
              </>
            ),
          },
          {
            key: "leads", label: "Sales leads", render: () => leads === null ? <Loading /> : leads.length === 0 ? <Empty icon="🎯" title="No leads yet" /> : (
              <>
                {leads.map((l) => (
                  <div key={l.id} className="lrow">
                    <div className="lrow-av">{l.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                    <div style={{ flex: 1 }}><b>{l.name}</b><span>{l.project} · KSh {l.value.toLocaleString()}</span></div>
                    <DevLeadPill s={l.stage} />
                  </div>
                ))}
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function ProjectPill({ s }: { s: Project["status"] }) {
  const m = { planning: ["grey", "Planning"], selling: ["green", "Selling"], completed: ["blue", "Completed"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
function DevLeadPill({ s }: { s: DeveloperLead["stage"] }) {
  const m = { enquiry: ["grey", "Enquiry"], reserved: ["amber", "Reserved"], deposit: ["blue", "Deposit paid"], completed: ["green", "Completed"] } as const;
  return <Pill tone={m[s][0]}>{m[s][1]}</Pill>;
}
```


# STYLES

## 42. `src/styles/globals.css`

```css
:root {
  --ink: #1a1f2b;
  --ink-2: #3d4657;
  --muted: #6b7688;
  --line: #eef1f5;
  --line-2: #dde3ec;
  --bg: #ffffff;
  --bg-2: #f5f8fa;
  --teal: #00c4ac;
  --teal-ink: #008a79;
  --grad: linear-gradient(135deg, #00c4ac, #2ea6ff);
  --shadow-sm: 0 1px 3px rgba(16, 24, 40, 0.06);
  --shadow-lg: 0 18px 40px rgba(8, 20, 34, 0.16);
  --radius: 16px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; border: none; background: none; }
img { display: block; max-width: 100%; }

.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

/* header */
.site-header {
  position: sticky; top: 0; z-index: 40;
  background: rgba(255,255,255,.92); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.site-header .inner { display: flex; align-items: center; gap: 20px; height: 68px; }
.brand { font-weight: 800; font-size: 22px; letter-spacing: -.5px; }
.brand span { color: var(--teal-ink); }
.brand small { display: block; font-size: 10px; letter-spacing: 2px; color: var(--teal-ink); font-weight: 700; }
.header-spacer { flex: 1; }
.header-link { font-weight: 700; color: var(--ink-2); padding: 8px 14px; border-radius: 20px; }
.header-link:hover { background: var(--bg-2); }

/* hero */
.hero { padding: 48px 0 28px; }
.hero h1 { font-size: 40px; font-weight: 800; letter-spacing: -1px; line-height: 1.05; }
.hero h1 .grad {
  background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero p { color: var(--muted); font-size: 17px; margin-top: 12px; }

/* filter chips */
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 22px 0 6px; }
.chip {
  padding: 9px 16px; border-radius: 22px; border: 1.5px solid var(--line-2);
  font-weight: 700; font-size: 14px; color: var(--ink-2); background: #fff; transition: .15s;
}
.chip:hover { border-color: var(--teal); }
.chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }

/* listing grid */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 22px; margin: 24px 0 60px; }
.card {
  border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fff;
  cursor: pointer; transition: .22s; text-align: left; width: 100%; display: block;
}
.card:hover { transform: translateY(-5px); box-shadow: var(--shadow-lg); border-color: var(--line-2); }
.card-img { height: 200px; background: linear-gradient(135deg, #dfe6ee, #c7d2de); position: relative; }
.card-img img { width: 100%; height: 100%; object-fit: cover; }
.card-badge {
  position: absolute; top: 12px; left: 12px; font-size: 11.5px; font-weight: 800; color: #fff;
  background: rgba(26,31,43,.9); padding: 6px 11px; border-radius: 20px; backdrop-filter: blur(4px);
}
.card-badge.instant { background: rgba(46,166,255,.95); }
.card-badge.escrow { background: rgba(0,196,172,.95); }
.card-body { padding: 15px 16px; }
.card-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.card-top h3 { font-size: 16px; font-weight: 800; }
.card-star { font-weight: 700; font-size: 13.5px; white-space: nowrap; }
.card-loc { color: var(--muted); font-size: 13px; margin: 4px 0 10px; }
.card-price b { font-size: 17px; }
.card-price span { color: var(--muted); font-size: 13px; }
.card-allin { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 5px; }
.card-allin .t { font-size: 12.5px; font-weight: 700; color: var(--ink-2); }
.card-allin .nohidden { font-size: 11px; font-weight: 800; color: var(--teal-ink); background: rgba(0,196,172,.1); padding: 3px 8px; border-radius: 20px; }

/* buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 800; font-size: 15px; padding: 13px 20px; border-radius: 12px; transition: .15s; }
.btn-primary { background: var(--grad); color: #fff; box-shadow: 0 8px 20px rgba(0,196,172,.28); width: 100%; }
.btn-primary:hover { filter: brightness(1.05); }
.btn-primary:disabled { opacity: .5; cursor: default; }
.btn-ghost { border: 1.5px solid var(--line-2); color: var(--ink-2); background: #fff; width: 100%; }
.btn-ghost:hover { background: var(--bg-2); }

/* detail */
.detail { padding: 28px 0 60px; }
.detail-back { color: var(--teal-ink); font-weight: 800; margin-bottom: 16px; display: inline-flex; gap: 6px; }
.detail-gallery { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; height: 340px; border-radius: 18px; overflow: hidden; margin-bottom: 24px; }
.detail-gallery img { width: 100%; height: 100%; object-fit: cover; background: var(--bg-2); }
.detail-cols { display: grid; grid-template-columns: 1.6fr 1fr; gap: 40px; align-items: start; }
.detail h1 { font-size: 30px; font-weight: 800; letter-spacing: -.6px; }
.detail-sub { color: var(--muted); margin: 6px 0 18px; }
.detail h3 { font-size: 19px; font-weight: 800; margin: 24px 0 10px; }
.amenities { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.amenities .a { padding: 8px 0; color: var(--ink-2); }

/* trust + host */
.trust-strip { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.trust-strip span { font-size: 11px; font-weight: 700; color: var(--ink-2); background: var(--bg-2); padding: 5px 10px; border-radius: 20px; }
.host-card { display: flex; align-items: center; gap: 12px; background: var(--bg-2); border-radius: 14px; padding: 12px 14px; margin: 16px 0; }
.host-av { width: 44px; height: 44px; border-radius: 50%; background: var(--grad); color: #fff; display: grid; place-items: center; font-weight: 800; }
.host-info b { display: flex; align-items: center; gap: 7px; font-size: 14.5px; }
.host-info .verified { font-size: 10.5px; font-weight: 800; color: var(--teal-ink); background: rgba(0,196,172,.14); padding: 2px 8px; border-radius: 20px; }
.host-info span { font-size: 12px; color: var(--muted); }

/* book card */
.book-card { border: 1px solid var(--line-2); border-radius: 18px; padding: 20px; position: sticky; top: 88px; box-shadow: var(--shadow-sm); }
.book-price b { font-size: 26px; font-weight: 800; }
.book-price span { color: var(--muted); }
.book-fields { border: 1px solid var(--line-2); border-radius: 12px; overflow: hidden; margin: 16px 0; }
.bf-row { display: grid; grid-template-columns: 1fr 1fr; }
.bf { padding: 11px 14px; border-bottom: 1px solid var(--line-2); }
.bf:nth-child(1) { border-right: 1px solid var(--line-2); }
.bf label { font-size: 10.5px; font-weight: 800; text-transform: uppercase; color: var(--muted); letter-spacing: .5px; }
.bf .v { font-weight: 700; margin-top: 3px; }
.breakdown { margin-top: 14px; }
.br { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: var(--ink-2); }
.br.total { border-top: 1px solid var(--line); margin-top: 6px; padding-top: 12px; font-weight: 800; color: var(--ink); font-size: 16px; }
.reassure { text-align: center; color: var(--muted); font-size: 12.5px; margin-top: 12px; }

/* reviews */
.reviews { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.review { border: 1px solid var(--line); border-radius: 14px; padding: 15px 16px; }
.rev-head { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
.rev-av { width: 38px; height: 38px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 13px; }
.rev-head b { display: block; font-size: 14px; }
.rev-head span { font-size: 12px; color: var(--muted); }
.rev-stars { margin-left: auto; color: #f5a623; }
.review p { font-size: 13px; color: var(--ink-2); line-height: 1.55; }

/* modal / checkout */
.scrim { position: fixed; inset: 0; background: rgba(10,18,31,.5); backdrop-filter: blur(4px); z-index: 60; display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal { background: #fff; width: 100%; max-width: 460px; max-height: 92vh; overflow: auto; border-radius: 20px; padding: 26px; box-shadow: var(--shadow-lg); }
.modal h2 { font-size: 22px; font-weight: 800; letter-spacing: -.4px; }
.modal p.lede { color: var(--muted); margin: 6px 0 18px; }
.field { margin-bottom: 14px; }
.field label { font-size: 12.5px; font-weight: 700; display: block; margin-bottom: 6px; }
.field input { width: 100%; padding: 12px 14px; border: 1.5px solid var(--line-2); border-radius: 11px; font-family: inherit; font-size: 14.5px; }
.field input:focus { outline: none; border-color: var(--teal); }

/* escrow band */
.escrow-band { display: flex; gap: 12px; align-items: flex-start; background: linear-gradient(135deg, rgba(0,196,172,.1), rgba(46,166,255,.08)); border: 1px solid rgba(0,196,172,.28); border-radius: 16px; padding: 16px; margin: 18px 0; }
.escrow-band.instant { background: linear-gradient(135deg, rgba(46,166,255,.1), rgba(0,196,172,.06)); border-color: rgba(46,166,255,.25); }
.eb-ico { width: 42px; height: 42px; border-radius: 12px; background: var(--grad); color: #fff; display: grid; place-items: center; flex: none; font-size: 20px; }
.escrow-band b { display: block; font-size: 14.5px; }
.escrow-band span { font-size: 12.5px; color: var(--ink-2); }
.check-both { display: flex; gap: 16px; margin: 14px 0; }
.cb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); }
.cb-dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; }
.cb-dot.ok { background: var(--teal); color: #fff; }
.cb-dot.wait { background: var(--bg-2); color: var(--muted); border: 1.5px solid var(--line-2); }
.complete-banner { display: flex; align-items: center; gap: 12px; background: linear-gradient(135deg, rgba(0,196,172,.12), rgba(46,166,255,.08)); border: 1px solid rgba(0,196,172,.3); border-radius: 14px; padding: 14px; }
.complete-banner .c { width: 40px; height: 40px; border-radius: 50%; background: var(--grad); color: #fff; display: grid; place-items: center; font-size: 20px; }

.loading { padding: 60px; text-align: center; color: var(--muted); }

/* ===== PWA install banner ===== */
.pwa-banner {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: 16px; z-index: 80;
  width: calc(100% - 32px); max-width: 460px;
  display: flex; align-items: center; gap: 12px;
  background: #fff; border: 1px solid var(--line-2); border-radius: 16px;
  padding: 12px 14px; box-shadow: var(--shadow-lg);
  animation: pwaUp .35s ease;
}
@keyframes pwaUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
.pwa-ico { width: 42px; height: 42px; border-radius: 12px; background: var(--grad); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 20px; flex: none; }
.pwa-txt { flex: 1; min-width: 0; }
.pwa-txt b { display: block; font-size: 14.5px; }
.pwa-txt span { font-size: 12px; color: var(--muted); }
.pwa-install { background: var(--grad); color: #fff; font-weight: 800; font-size: 14px; padding: 10px 16px; border-radius: 10px; flex: none; }
.pwa-close { color: var(--muted); font-size: 15px; padding: 4px 6px; flex: none; }

/* ===== bottom tab bar (phones / installed PWA) ===== */
.tabbar { display: none; }

/* =========================================================
   RESPONSIVE SYSTEM — adapts to the visitor's device.
   Desktop (>1024) → wide multi-column.
   Tablet (700–1024) → medium grids, 2-col detail.
   Phone (<700) → single column + bottom tab bar.
   ========================================================= */

/* large desktop */
@media (min-width: 1280px) {
  .grid { grid-template-columns: repeat(4, 1fr); }
}

/* tablet */
@media (max-width: 1024px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
  .detail-cols { grid-template-columns: 1.4fr 1fr; gap: 28px; }
  .hero h1 { font-size: 36px; }
}

/* phone */
@media (max-width: 700px) {
  .container { padding: 0 16px; }
  .grid { grid-template-columns: 1fr; gap: 18px; }
  .detail-cols { grid-template-columns: 1fr; }
  .book-card { position: static; }
  .reviews { grid-template-columns: 1fr; }
  .amenities { grid-template-columns: 1fr; }
  .hero { padding: 28px 0 18px; }
  .hero h1 { font-size: 30px; }
  .hero p { font-size: 15px; }
  .detail-gallery { grid-template-columns: 1fr; height: 240px; }
  .detail-gallery img:not(:first-child) { display: none; }
  .detail h1 { font-size: 25px; }

  /* header collapses to brand + inline links; page gets a bottom tab bar */
  .site-header .inner { height: 60px; gap: 8px; }
  .header-link { display: none; }
  body { padding-bottom: 68px; } /* room for tab bar */

  .tabbar {
    display: grid; grid-template-columns: repeat(3, 1fr);
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 70;
    background: rgba(255,255,255,.96); backdrop-filter: blur(12px);
    border-top: 1px solid var(--line);
    padding: 6px 0 max(6px, env(safe-area-inset-bottom));
  }
  .tabbar a {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    font-size: 11px; font-weight: 700; color: var(--muted); padding: 6px 0;
  }
  .tabbar a.active { color: var(--teal-ink); }
  .tabbar svg { width: 22px; height: 22px; }

  .pwa-banner { bottom: 76px; } /* sit above the tab bar */
}

/* small phone */
@media (max-width: 380px) {
  .hero h1 { font-size: 27px; }
  .chip { padding: 8px 13px; font-size: 13px; }
}

/* installed PWA (standalone) — hide the browser-style top nav links entirely */
@media (display-mode: standalone) {
  .header-link { display: none; }
}


/* ===== checkout states ===== */
.spinner { width: 44px; height: 44px; border-radius: 50%; border: 4px solid var(--line); border-top-color: var(--teal); animation: spin .8s linear infinite; margin: 0 auto; }
@keyframes spin { to { transform: rotate(360deg); } }
.result-check { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 32px; font-weight: 800; color: #fff; margin: 0 auto 8px; }
.result-check.ok { background: var(--grad); }
.result-check.fail { background: linear-gradient(135deg, #e0574a, #f0714a); }
.receipt { border: 1px solid var(--line-2); border-radius: 14px; padding: 14px 16px; margin: 16px 0; }
.receipt .br { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; color: var(--ink-2); }
.receipt .br b { color: var(--ink); }

/* ===== payment method selector ===== */
.pay-options { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 4px; }
.pay-option { display: flex; align-items: center; gap: 13px; padding: 14px 15px; border: 1.5px solid var(--line-2); border-radius: 13px; background: #fff; text-align: left; transition: .15s; width: 100%; }
.pay-option:hover { border-color: var(--teal); }
.pay-option.sel { border-color: var(--teal); background: rgba(0,196,172,.05); }
.po-ico { font-size: 22px; width: 30px; text-align: center; flex: none; }
.po-txt { flex: 1; min-width: 0; }
.po-txt b { display: block; font-size: 15px; color: var(--ink); }
.po-txt span { font-size: 12.5px; color: var(--muted); }
.po-radio { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--line-2); flex: none; position: relative; }
.pay-option.sel .po-radio { border-color: var(--teal); }
.pay-option.sel .po-radio::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: var(--teal); }

/* ===== ROLE PORTALS ===== */
.portal { max-width: 900px; margin: 0 auto; padding: 0 20px 60px; }
.portal-head { display: flex; align-items: center; gap: 14px; padding: 22px 0 16px; }
.portal-head h1 { font-size: 24px; font-weight: 800; letter-spacing: -.5px; }
.portal-head p { color: var(--muted); font-size: 13.5px; }
.portal-badge { font-size: 11.5px; font-weight: 800; color: #2278c4; background: rgba(46,166,255,.12); padding: 6px 12px; border-radius: 20px; white-space: nowrap; }
.portal-exit { font-weight: 800; color: var(--teal-ink); font-size: 14px; }
.portal-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); overflow-x: auto; }
.portal-tab { padding: 13px 16px; font-family: inherit; font-size: 14px; font-weight: 700; color: var(--muted); border-bottom: 2.5px solid transparent; white-space: nowrap; }
.portal-tab.on { color: var(--ink); border-bottom-color: var(--teal); }
.portal-body { padding-top: 20px; }
.portal-h3 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); margin: 18px 0 12px; }
.row-between { display: flex; justify-content: space-between; align-items: center; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.kpi { border: 1px solid var(--line-2); border-radius: 14px; padding: 16px; }
.kpi b { font-size: 22px; font-weight: 800; letter-spacing: -.5px; display: block; }
.kpi span { font-size: 12px; color: var(--muted); }
.portal-note { background: rgba(46,166,255,.08); border: 1px solid rgba(46,166,255,.2); border-radius: 12px; padding: 12px 14px; font-size: 13px; color: var(--ink-2); }
.quick-actions { display: flex; gap: 10px; margin: 4px 0 8px; flex-wrap: wrap; }
.quick-actions button { border: 1.5px solid var(--line-2); background: #fff; border-radius: 11px; padding: 10px 16px; font-family: inherit; font-weight: 700; font-size: 13.5px; color: var(--ink-2); }
.quick-actions button:hover { border-color: var(--teal); color: var(--teal-ink); }
.lrow { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.lrow b { font-size: 14.5px; display: block; }
.lrow span { font-size: 12.5px; color: var(--muted); }
.lrow-av { width: 38px; height: 38px; border-radius: 50%; background: var(--grad); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 13px; flex: none; }
.btn-mini { border: 1.5px solid var(--line-2); background: #fff; border-radius: 9px; padding: 7px 12px; font-family: inherit; font-weight: 700; font-size: 12.5px; color: var(--teal-ink); white-space: nowrap; }
.btn-mini:hover { border-color: var(--teal); background: var(--bg-2); }
.pill { font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 20px; white-space: nowrap; }
.pill-green { color: #008a5e; background: rgba(0,180,120,.12); }
.pill-amber { color: #b06d00; background: rgba(245,166,35,.15); }
.pill-red { color: #c0453a; background: rgba(224,87,74,.12); }
.pill-blue { color: #2278c4; background: rgba(46,166,255,.12); }
.pill-grey { color: #6b7688; background: var(--bg-2); }
.room-card { border: 1px solid var(--line-2); border-radius: 14px; padding: 15px 16px; margin-bottom: 12px; }
.room-top { display: flex; justify-content: space-between; align-items: baseline; }
.room-top b { font-size: 16px; font-weight: 800; }
.room-rate { font-size: 16px; font-weight: 800; color: var(--teal-ink); }
.room-rate small { font-size: 11px; color: var(--muted); font-weight: 600; }
.room-meta { font-size: 12.5px; color: var(--muted); margin: 5px 0 12px; }
.room-meta .ok { color: var(--teal-ink); font-weight: 700; }
.room-acts { display: flex; gap: 8px; }
.room-acts button { border: 1.5px solid var(--line-2); background: #fff; border-radius: 10px; padding: 8px 14px; font-family: inherit; font-weight: 700; font-size: 12.5px; color: var(--ink-2); }
.room-acts button:hover { border-color: var(--teal); color: var(--teal-ink); }
.avail-legend { display: flex; gap: 16px; margin-bottom: 12px; font-size: 12px; color: var(--muted); }
.avail-legend span { display: flex; align-items: center; gap: 6px; }
.avail-legend i { width: 12px; height: 12px; border-radius: 3px; }
.avail-grid { display: grid; gap: 5px; font-size: 12px; }
.avail-corner, .avail-day { font-weight: 800; color: var(--muted); padding: 8px 4px; font-size: 11px; text-align: center; }
.avail-corner { text-align: left; }
.avail-name { display: flex; align-items: center; font-size: 12px; font-weight: 700; padding: 4px; }
.avail-cell { display: grid; place-items: center; height: 36px; border-radius: 8px; font-weight: 800; color: #fff; font-size: 12px; }
.avail-cell.open { background: #00c4ac; } .avail-cell.limited { background: #f5a623; } .avail-cell.full { background: #e0574a; }
.proj-card { display: block; width: 100%; text-align: left; border: 1px solid var(--line-2); border-radius: 14px; padding: 16px; margin-bottom: 12px; background: #fff; transition: .15s; }
.proj-card:hover { border-color: var(--teal); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
.proj-top { display: flex; justify-content: space-between; align-items: center; }
.proj-top b { font-size: 16px; font-weight: 800; }
.proj-loc { font-size: 12.5px; color: var(--muted); }
.proj-bar { height: 6px; background: var(--bg-2); border-radius: 6px; margin: 12px 0 10px; overflow: hidden; }
.proj-bar-fill { height: 100%; background: var(--grad); border-radius: 6px; }
.proj-stats { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--ink-2); font-weight: 600; }
.portal-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 50px; color: var(--muted); }
.portal-empty { text-align: center; padding: 50px 20px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.portal-empty b { font-size: 16px; }
.portal-empty span { font-size: 13px; color: var(--muted); }
.portal-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 12px 20px; border-radius: 12px; font-weight: 700; font-size: 13.5px; z-index: 80; box-shadow: var(--shadow-lg); }
@media (max-width: 600px) { .kpis { grid-template-columns: 1fr 1fr; } }
```
