import type { FeeComparison, Listing, PriceBreakdown, PaymentMode } from "@/lib/models";

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
 * Payment mode.
 * Escrow is temporarily disabled for launch — every booking confirms instantly
 * through the payment provider. The escrow branch is kept in the type/codebase
 * so it can be re-enabled later (licensing permitting) without a rebuild.
 */
export function paymentModeFor(listing: Listing): PaymentMode {
  const stars = listing.stars ?? (listing.rating >= 4.8 ? 5 : listing.rating >= 4.5 ? 4 : 3);
  // Launch mode: no escrow hold — pay → confirmed.
  return { escrow: false, reason: "Instant confirmation", stars };
}

/* ============================================================
   TRANSPARENT PRICING
   ============================================================ */

/**
 * Typical marketplace fee loading, as an explicit, auditable assumption.
 *
 * These are the industry-standard shapes of charge a guest meets at checkout on
 * a large OTA: a guest-side service fee on top of the host's rate, a "resort" or
 * facility fee levied at the property, and local tax applied late. They are
 * modelled, not scraped, and every surface that shows a comparison also shows
 * this assumption — a precise claim about a named competitor's live price would
 * be exactly the dishonesty this feature argues against.
 *
 * Kept as named constants so the claim can be revised in one place if the market
 * moves, rather than being buried in a template.
 */
export const TYPICAL_MARKETPLACE = {
  /** Guest-side service fee, charged on top of the nightly rate. */
  guestServiceRate: 0.15,
  /** Facility or "resort" fee, per night, commonly disclosed only at checkout. */
  facilityFeePerNight: 1200,
  /** Local tax, frequently added after the headline total. */
  lateTaxRate: 0.05,
  label: "a marketplace charging a 15% guest service fee, a nightly facility fee, and tax added at checkout",
} as const;

/**
 * What the same stay costs here versus under that loading.
 *
 * PALTAS's own total is simply `priceBreakdown().total` — there is no second
 * number, which is the entire point: the figure on the card is the figure on the
 * card reader.
 */
export function feeComparison(listing: Listing, nights: number): FeeComparison {
  const ours = priceBreakdown(listing, nights);

  const base = listing.price * nights;
  const guestService = Math.round(base * TYPICAL_MARKETPLACE.guestServiceRate);
  const facility = TYPICAL_MARKETPLACE.facilityFeePerNight * nights;
  const lateTax = Math.round((base + guestService + facility) * TYPICAL_MARKETPLACE.lateTaxRate);
  const typicalTotal = base + guestService + facility + lateTax;

  const difference = typicalTotal - ours.total;

  return {
    currency: listing.currency,
    nights,
    paltasTotal: ours.total,
    typicalTotal,
    difference,
    differencePercent: typicalTotal > 0 ? Math.round((difference / typicalTotal) * 100) : 0,
    typicalExtras: [
      { label: "Guest service fee", amount: guestService, note: "15% on top of the nightly rate" },
      { label: "Facility fee", amount: facility, note: "per night, usually disclosed at checkout" },
      { label: "Tax added late", amount: lateTax, note: "applied after the headline total" },
    ],
    assumption: `Compared against ${TYPICAL_MARKETPLACE.label}. An illustrative industry model, not a quote from any named site.`,
  };
}

/**
 * The line items, in the order a guest reads them, with our own margin named
 * rather than hidden. Used by every surface that shows a price, so the detail
 * page and the checkout cannot drift apart.
 */
export function priceLines(listing: Listing, nights: number) {
  const b = priceBreakdown(listing, nights);
  return {
    breakdown: b,
    lines: [
      {
        label: `${listing.currency} ${listing.price.toLocaleString()} × ${nights} night${nights === 1 ? "" : "s"}`,
        amount: b.subtotal,
        note: null as string | null,
      },
      { label: "Cleaning fee", amount: b.cleaningFee, note: "Charged once, set by the host" },
      { label: "Service fee", amount: b.serviceFee, note: "What PALTAS keeps — 8%, stated up front" },
      { label: "Taxes", amount: b.taxes, note: "Collected and remitted for you" },
    ],
    total: b.total,
  };
}
