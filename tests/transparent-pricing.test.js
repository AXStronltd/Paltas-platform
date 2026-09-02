/**
 * Transparent pricing, under test.
 *
 * The product makes two public promises here, and both are arithmetic rather
 * than marketing: that the total shown is the total charged, and that the
 * comparison against typical marketplace fee loading is derived from a stated
 * assumption rather than invented. Both are checkable, so they are checked.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  priceBreakdown, allInNightly, feeComparison, priceLines, TYPICAL_MARKETPLACE,
} = require("../.test-build/lib/services/pricingService.js");

const listing = (over = {}) => ({
  id: "l1", name: "Test", type: "villa", location: "Diani", city: "Kwale", country: "KE",
  price: 12000, currency: "KES", rating: 4.8, reviewCount: 40, beds: 3, baths: 2,
  maxGuests: 6, amenities: [], imageUrl: "", gallery: [], superhost: true,
  hostId: "h1", description: "", ...over,
});

test("the total is the sum of the parts, with nothing unaccounted for", () => {
  const b = priceBreakdown(listing(), 4);
  assert.equal(b.subtotal + b.cleaningFee + b.serviceFee + b.taxes, b.total);
  assert.equal(b.subtotal, 12000 * 4);
  assert.equal(b.nights, 4);
});

test("every line the guest is shown adds up to the total they are charged", () => {
  // This is the promise. If the displayed lines ever failed to sum to the
  // charged total, the pledge under them would be a lie.
  for (const nights of [1, 2, 3, 7, 14, 30]) {
    const { lines, total, breakdown } = priceLines(listing(), nights);
    const shown = lines.reduce((a, l) => a + l.amount, 0);
    assert.equal(shown, total, `${nights} nights: lines sum to ${shown}, total is ${total}`);
    assert.equal(total, breakdown.total);
  }
});

test("our own service fee is a named line, not hidden in the rate", () => {
  const { lines } = priceLines(listing(), 3);
  const service = lines.find((l) => l.label === "Service fee");
  assert.ok(service, "the service fee must appear as its own line");
  assert.match(service.note, /PALTAS keeps/, "and must say it is ours");
  // The nightly rate the guest reads is the host's rate, not a loaded one.
  const nightly = lines[0];
  assert.equal(nightly.amount, 12000 * 3);
});

test("the all-in nightly figure on a card is a real one-night total", () => {
  const l = listing();
  assert.equal(allInNightly(l), priceBreakdown(l, 1).total);
  assert.ok(allInNightly(l) > l.price, "an all-in figure that equals the bare rate would be hiding the fees");
});

test("the comparison is derived from the stated assumption, not invented", () => {
  const nights = 5;
  const c = feeComparison(listing(), nights);
  const base = 12000 * nights;

  const guestService = Math.round(base * TYPICAL_MARKETPLACE.guestServiceRate);
  const facility = TYPICAL_MARKETPLACE.facilityFeePerNight * nights;
  const lateTax = Math.round((base + guestService + facility) * TYPICAL_MARKETPLACE.lateTaxRate);

  assert.equal(c.typicalTotal, base + guestService + facility + lateTax);
  assert.equal(c.typicalExtras.reduce((a, e) => a + e.amount, 0), guestService + facility + lateTax);
  assert.equal(c.difference, c.typicalTotal - c.paltasTotal);
  assert.equal(c.paltasTotal, priceBreakdown(listing(), nights).total);
});

test("the comparison always says where its number came from", () => {
  const c = feeComparison(listing(), 3);
  assert.match(c.assumption, /illustrative industry model/i);
  assert.match(c.assumption, /not a quote from any named site/i);
  // Every itemised extra explains itself rather than appearing as a bare figure.
  for (const e of c.typicalExtras) {
    assert.ok(e.note && e.note.length > 0, `${e.label} must state what it is`);
  }
});

test("the claimed saving is a real one across a range of stays", () => {
  for (const nights of [1, 3, 7, 30]) {
    const c = feeComparison(listing(), nights);
    assert.ok(c.difference > 0, `${nights} nights should be cheaper here`);
    assert.ok(c.differencePercent > 0 && c.differencePercent < 100, "a plausible percentage");
    assert.equal(c.differencePercent, Math.round((c.difference / c.typicalTotal) * 100));
  }
});

test("a cheap listing over one night does not produce a nonsense comparison", () => {
  // Fixed fees dominate small totals; the figure must stay coherent.
  const c = feeComparison(listing({ price: 2000 }), 1);
  assert.ok(c.paltasTotal > 0 && c.typicalTotal > 0);
  assert.equal(c.difference, c.typicalTotal - c.paltasTotal);
  assert.ok(Number.isInteger(c.difference), "no fractional shillings");
});

test("every money figure is a whole minor unit", () => {
  const b = priceBreakdown(listing({ price: 12345 }), 3);
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "number") assert.ok(Number.isInteger(v), `${k} was ${v}`);
  }
  const c = feeComparison(listing({ price: 12345 }), 3);
  for (const e of c.typicalExtras) assert.ok(Number.isInteger(e.amount), `${e.label} was ${e.amount}`);
});
