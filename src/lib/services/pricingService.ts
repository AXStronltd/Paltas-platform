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
 *
 * Every booking confirms instantly through the payment provider. There is no
 * second mode: PALTAS is not authorised to hold client funds, so it does not
 * offer to, and the branch that used to describe one has been removed rather
 * than left switched off — a disabled escrow path is still a claim sitting in
 * the codebase waiting to be re-enabled by someone who does not know why it
 * was disabled.
 */
export function paymentModeFor(listing: Listing): PaymentMode {
  const stars = listing.stars ?? (listing.rating >= 4.8 ? 5 : listing.rating >= 4.5 ? 4 : 3);
  return { reason: "Instant confirmation", stars };
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
      { key: "price.typical.guestService", noteKey: "price.typical.guestServiceNote", amount: guestService },
      { key: "price.typical.facility", noteKey: "price.typical.facilityNote", amount: facility },
      { key: "price.typical.lateTax", noteKey: "price.typical.lateTaxNote", amount: lateTax },
    ],
    assumptionKey: "price.compareAssumption",
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
    // Keys, not sentences. The nightly line needs the rate formatted in the
    // reader's locale, which only the component knows how to do, so it carries
    // the raw number and the component composes the line.
    lines: [
      { key: "price.nightsAt", noteKey: null as string | null, amount: b.subtotal, rate: listing.price, nights },
      { key: "price.cleaningFee", noteKey: "price.cleaningNote", amount: b.cleaningFee },
      { key: "price.serviceFee", noteKey: "price.serviceFeeNote", amount: b.serviceFee },
      { key: "price.taxes", noteKey: "price.taxesNote", amount: b.taxes },
    ],
    total: b.total,
  };
}
