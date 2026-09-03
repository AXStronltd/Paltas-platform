/**
 * Availability, under test.
 *
 * Double-booking is the failure a marketplace cannot recover from: the money is
 * taken, the guest arrives, and there is nowhere to put them. The off-by-one on
 * check-out day is the classic way it happens, so that is pinned first.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../.test-build/lib/booking/availability.js");

const d = (s) => new Date(`${s}T00:00:00Z`);
const range = (from, to) => ({ from: d(from), to: d(to) });
const occ = (from, to, rooms = 1) => ({ from: d(from), to: d(to), rooms });
const NOW = d("2026-01-01");

test("check-out day is free — back-to-back stays do not collide", () => {
  // One guest leaves on the 5th, another arrives on the 5th. Normal, not a clash.
  assert.equal(A.overlaps(range("2026-03-01", "2026-03-05"), range("2026-03-05", "2026-03-08")), false);
  assert.equal(A.overlaps(range("2026-03-05", "2026-03-08"), range("2026-03-01", "2026-03-05")), false);
  // One night of genuine overlap is a clash.
  assert.equal(A.overlaps(range("2026-03-01", "2026-03-06"), range("2026-03-05", "2026-03-08")), true);
  // Fully contained.
  assert.equal(A.overlaps(range("2026-03-01", "2026-03-10"), range("2026-03-03", "2026-03-04")), true);
});

test("nights are counted, not days", () => {
  assert.equal(A.nightsBetween(d("2026-03-01"), d("2026-03-02")), 1);
  assert.equal(A.nightsBetween(d("2026-03-01"), d("2026-03-08")), 7);
  assert.equal(A.nightsBetween(d("2026-03-01"), d("2026-03-01")), 0);
});

test("a range must be sane and in the future", () => {
  assert.equal(A.isValidRange(d("2026-03-05"), d("2026-03-01"), NOW).ok, false, "backwards");
  assert.equal(A.isValidRange(d("2026-03-05"), d("2026-03-05"), NOW).ok, false, "zero nights");
  assert.equal(A.isValidRange(d("2025-06-01"), d("2025-06-05"), NOW).ok, false, "in the past");
  assert.equal(A.isValidRange(d("2026-03-01"), d("2028-03-01"), NOW).ok, false, "absurdly long");
  assert.equal(A.isValidRange(d("2026-03-01"), d("2026-03-05"), NOW).ok, true);
  // Booking this morning for tonight must work.
  const today = new Date(NOW);
  const tomorrow = new Date(NOW); tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(A.isValidRange(today, tomorrow, new Date(NOW.getTime() + 11 * 3600_000)).ok, true);
});

test("occupancy is the peak night, not the sum of stays", () => {
  // Five consecutive one-night stays occupy one room at a time.
  const consecutive = [
    occ("2026-03-01", "2026-03-02"), occ("2026-03-02", "2026-03-03"),
    occ("2026-03-03", "2026-03-04"), occ("2026-03-04", "2026-03-05"),
  ];
  assert.equal(A.peakOccupancy(consecutive, range("2026-03-01", "2026-03-05")), 1,
    "summing these would wrongly report 4 rooms taken");

  // Five overlapping stays occupy five.
  const overlapping = Array.from({ length: 5 }, () => occ("2026-03-01", "2026-03-05"));
  assert.equal(A.peakOccupancy(overlapping, range("2026-03-02", "2026-03-03")), 5);

  // Nothing relevant.
  assert.equal(A.peakOccupancy([occ("2026-06-01", "2026-06-05")], range("2026-03-01", "2026-03-05")), 0);
});

test("a whole-property listing cannot be sold twice", () => {
  const existing = [occ("2026-03-01", "2026-03-05")];
  const clash = A.checkAvailability({
    requested: range("2026-03-03", "2026-03-07"), requestedRooms: 1,
    totalRooms: 1, existing, blocks: [], now: NOW,
  });
  assert.equal(clash.available, false);
  assert.equal(clash.roomsLeft, 0);

  // The same property immediately after is fine.
  const after = A.checkAvailability({
    requested: range("2026-03-05", "2026-03-08"), requestedRooms: 1,
    totalRooms: 1, existing, blocks: [], now: NOW,
  });
  assert.equal(after.available, true);
});

test("a hotel sells up to its inventory and no further", () => {
  const existing = Array.from({ length: 8 }, () => occ("2026-03-01", "2026-03-05"));
  const base = { requested: range("2026-03-02", "2026-03-04"), totalRooms: 10, existing, blocks: [], now: NOW };

  assert.equal(A.checkAvailability({ ...base, requestedRooms: 2 }).available, true, "2 of 2 left");
  const over = A.checkAvailability({ ...base, requestedRooms: 3 });
  assert.equal(over.available, false);
  assert.equal(over.roomsLeft, 2);
  assert.match(over.reason, /Only 2 left/);

  const full = A.checkAvailability({ ...base, totalRooms: 8, requestedRooms: 1 });
  assert.equal(full.available, false);
  assert.match(full.reason, /Fully booked/);
});

test("a host block is absolute, whatever the inventory", () => {
  const r = A.checkAvailability({
    requested: range("2026-03-02", "2026-03-04"), requestedRooms: 1,
    totalRooms: 50, existing: [], blocks: [range("2026-03-03", "2026-03-06")], now: NOW,
  });
  assert.equal(r.available, false);
  assert.match(r.reason, /not available/);

  // A block that ends before the stay begins does not touch it.
  const clear = A.checkAvailability({
    requested: range("2026-03-06", "2026-03-08"), requestedRooms: 1,
    totalRooms: 1, existing: [], blocks: [range("2026-03-01", "2026-03-06")], now: NOW,
  });
  assert.equal(clear.available, true);
});

test("the quote adds up, and every figure is a whole unit", () => {
  const q = A.quote({ nightlyRate: 12000, nights: 4, currency: "KES", cleaningFee: 1500 });
  assert.equal(q.subtotal, 48000);
  assert.equal(q.serviceFee, Math.round(48000 * 0.08));
  const expectedTax = Math.round((q.subtotal + q.cleaningFee + q.serviceFee) * 0.05);
  assert.equal(q.taxes, expectedTax);
  assert.equal(q.total, q.subtotal + q.cleaningFee + q.serviceFee - q.discountAmount + q.taxes);
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === "number") assert.ok(Number.isInteger(v), `${k} was ${v}`);
  }
});

test("multiple rooms multiply the subtotal, and a discount never exceeds it", () => {
  const one = A.quote({ nightlyRate: 10000, nights: 3, currency: "KES" });
  const three = A.quote({ nightlyRate: 10000, nights: 3, rooms: 3, currency: "KES" });
  assert.equal(three.subtotal, one.subtotal * 3);

  const huge = A.quote({ nightlyRate: 10000, nights: 2, currency: "KES", discountAmount: 999_999 });
  assert.equal(huge.discountAmount, huge.subtotal, "capped at the subtotal");
  assert.ok(huge.total >= 0, "a booking can never total less than nothing");
});

/* --------------------------- the whole trip ---------------------------- */

test("the four pricing models are the difference between a transfer and a driver", () => {
  const nights = 5, guests = 2;
  const flat = A.priceAddon({ offeringId: "o1", name: "Airport transfer", unitPrice: 4000, pricing: "FLAT" }, nights, guests);
  assert.equal(flat.units, 1);
  assert.equal(flat.amount, 4000, "a transfer is once, however long the stay");

  const perNight = A.priceAddon({ offeringId: "o2", name: "Driver", unitPrice: 4000, pricing: "PER_NIGHT" }, nights, guests);
  assert.equal(perNight.amount, 20000, "a driver is per day");

  const perGuest = A.priceAddon({ offeringId: "o3", name: "Ski pass", unitPrice: 3000, pricing: "PER_GUEST" }, nights, guests);
  assert.equal(perGuest.amount, 6000);

  const both = A.priceAddon({ offeringId: "o4", name: "Breakfast", unitPrice: 800, pricing: "PER_GUEST_NIGHT" }, nights, guests);
  assert.equal(both.amount, 8000, "breakfast is per person per morning");
});

test("quantity multiplies on top of the pricing model", () => {
  // Two transfers — one in, one out.
  const a = A.priceAddon({ offeringId: "o1", name: "Transfer", unitPrice: 4000, pricing: "FLAT", quantity: 2 }, 3, 2);
  assert.equal(a.amount, 8000);
  const b = A.priceAddon({ offeringId: "o2", name: "Driver", unitPrice: 4000, pricing: "PER_NIGHT", quantity: 2 }, 3, 2);
  assert.equal(b.amount, 24000, "two drivers for three days");
});

test("a stay and its services come to one total", () => {
  const q = A.quote({
    nightlyRate: 12000, nights: 4, guests: 2, currency: "KES",
    addons: [
      { offeringId: "t", name: "Airport transfer", unitPrice: 4500, pricing: "FLAT", quantity: 2 },
      { offeringId: "c", name: "Mid-stay clean", unitPrice: 2500, pricing: "FLAT" },
    ],
  });
  assert.equal(q.subtotal, 48000);
  assert.equal(q.addonsTotal, 4500 * 2 + 2500);
  assert.equal(q.addons.length, 2, "and the guest can see the working");
  assert.equal(q.total, q.subtotal + q.cleaningFee + q.serviceFee + q.addonsTotal - q.discountAmount + q.taxes);
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === "number") assert.ok(Number.isInteger(v), `${k} was ${v}`);
  }
});

test("the platform fee is charged on the stay, never on the guest's transfer", () => {
  // Taking a cut of someone's airport pickup is how a bundle stops being worth
  // using. The fee must not move when add-ons are added.
  const without = A.quote({ nightlyRate: 12000, nights: 4, guests: 2, currency: "KES" });
  const with_ = A.quote({
    nightlyRate: 12000, nights: 4, guests: 2, currency: "KES",
    addons: [{ offeringId: "t", name: "Transfer", unitPrice: 9000, pricing: "FLAT" }],
  });
  assert.equal(with_.serviceFee, without.serviceFee, "the platform fee did not move");
  assert.ok(with_.total > without.total, "but the total did");
  assert.equal(with_.total - without.total, 9000 + Math.round(9000 * 0.05),
    "by the add-on and its tax, and nothing else");
});

test("no add-ons leaves every existing figure exactly as it was", () => {
  const q = A.quote({ nightlyRate: 9500, nights: 3, currency: "KES" });
  assert.equal(q.addonsTotal, 0);
  assert.deepEqual(q.addons, []);
  assert.equal(q.total, q.subtotal + q.serviceFee + q.taxes, "unchanged for a plain stay");
});
