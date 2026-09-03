/**
 * PALTAS domain models.
 *
 * These types are the single source of truth for the shape of our data.
 * Both the mock data layer (today) and the real API responses (later) must
 * conform to these types. Because the whole frontend depends only on these
 * models — never on where the data came from — swapping mock → API is a
 * change confined to the service layer, invisible to pages and components.
 */

/**
 * Any ISO 4217 code. The named ones are the demo catalogue's, kept for
 * autocomplete; the union stays open because the platform serves every country
 * and a listing priced in TZS or SEK is not an error.
 */
export type Currency = "KES" | "USD" | "AED" | "EUR" | "GBP" | (string & {});

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

/** Open for the same reason as Currency: hosts write their own. */
export type Amenity =
  | "wifi"
  | "pool"
  | "parking"
  | "kitchen"
  | "ac"
  | "pets"
  | "workspace"
  | "beach"
  | (string & {});

/**
 * What was actually checked, and when.
 *
 * A badge that does not say what it certifies is decoration. Every trust badge
 * in the product is backed by one of these, so "Verified" can be expanded into
 * the specific thing that was verified, by what method, and how recently — which
 * is the difference between a trust signal and a sticker.
 */
export type VerificationKind =
  | "identity"    // government ID matched to the account holder
  | "ownership"   // title deed or lease proving the right to let
  | "inspection"  // someone physically visited the property
  | "licence"     // tourism or short-let licence on file
  | "payment";    // payouts verified to a named bank account

export interface Verification {
  kind: VerificationKind;
  /** Human-readable month and year — precision beyond that is noise. */
  verifiedAt: string;
  /** The specific check performed, quoted to the guest verbatim. */
  method: string;
}

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
  /** Backing evidence for the host-level badges. */
  verifications?: Verification[];
  hostingSince?: number;
  /** Percentage of enquiries answered — shown only when it is genuinely known. */
  responseRate?: number;
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
  /** Backing evidence for the property-level badges. */
  verifications?: Verification[];
  /** Set when the host has committed to the price not moving after booking. */
  priceFreeze?: boolean;
  cancellation?: "flexible" | "moderate" | "strict";
  /**
   * True when this is a real published listing backed by the database, and so
   * genuinely bookable. The demo catalogue is not: it exists to fill the
   * shopfront, and offering a Book button on it would take money for a room
   * that does not exist.
   */
  bookable?: boolean;
  /**
   * What the listing is actually offering. The demo catalogue has no such
   * distinction, so this is only set on real published rows — and it is what
   * separates a house for sale from a room for the night, which `type` alone
   * cannot express.
   */
  kind?: "SALE" | "RENT" | "STAY";
  /** Hotel room types, when the listing sells rooms rather than the whole place. */
  roomTypes?: {
    id: string; name: string; description: string | null; rate: number;
    currency: string; totalRooms: number; maxGuests: number; beds: string | null;
    amenities: string[];
  }[];
}

/**
 * The honest version of "cheaper than the other guys".
 *
 * `typicalTotal` is what the same stay would cost once a marketplace with
 * industry-standard fee loading has added its guest service fee and the extras
 * that commonly appear at checkout. It is a modelled figure from a stated
 * assumption — not a scrape of any competitor's live price — and the UI says so
 * where it is shown. Claiming a precise saving against a named rival would be
 * exactly the kind of thing this feature exists to argue against.
 */
export interface FeeComparison {
  currency: Currency;
  nights: number;
  /** Everything PALTAS charges, which is everything the guest pays. */
  paltasTotal: number;
  /** The same stay under typical marketplace fee loading. */
  typicalTotal: number;
  difference: number;
  differencePercent: number;
  /** The extras a guest commonly meets at checkout elsewhere, itemised. */
  typicalExtras: { label: string; amount: number; note: string }[];
  /** The assumptions behind `typicalTotal`, shown to the guest. */
  assumption: string;
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
  /** Free text: a city, a district, or part of a property's name. */
  city?: string;
  mode?: StayMode | "all";
  guests?: number;
  maxPrice?: number;
  amenities?: Amenity[];
  /**
   * What the visitor is looking for, as opposed to how it is classified.
   * `mode` describes the kind of stay; this describes the transaction, and the
   * two are not the same — "For sale" is not a kind of stay at all, which is
   * why every sale-related chip used to collapse into "all".
   */
  kind?: "STAY" | "RENT" | "SALE";
  /** Dates, when the visitor has chosen them. Only meaningful for stays. */
  checkIn?: string;
  checkOut?: string;
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
