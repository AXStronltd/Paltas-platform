/**
 * Group pricing, under test.
 *
 * Two things here are worth being sure of, because both are ways a platform
 * quietly loses money or credibility: which discount is chosen when several
 * apply, and whether the shares handed to a group actually add up to what is
 * owed. Neither needs a database to check.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { applies, amountOff, bestDiscount, splitEvenly } = require("../.test-build/lib/pricing/groupPricing.js");

const rule = (over = {}) => ({
  id: "d1", name: "Rule", kind: "GROUP", valueType: "PERCENTAGE", value: 10, currency: "KES",
  minNights: null, minGuests: null, minUnits: null, minLeadDays: null,
  maxRedemptions: null, redemptionCount: 0,
  startsAt: new Date("2026-01-01"), endsAt: new Date("2027-01-01"), active: true, ...over,
});
const booking = (over = {}) => ({ guests: 10, units: 3, nights: 5, leadDays: 40, amount: 100000, at: new Date("2026-06-01"), ...over });

test("thresholds are floors, not equalities", () => {
  const r = rule({ minGuests: 8 });
  assert.equal(applies(r, booking({ guests: 8 })), true);
  assert.equal(applies(r, booking({ guests: 20 })), true);
  assert.equal(applies(r, booking({ guests: 7 })), false);
});

test("every threshold must be met, not just one", () => {
  const r = rule({ minGuests: 8, minNights: 7 });
  assert.equal(applies(r, booking({ guests: 10, nights: 7 })), true);
  assert.equal(applies(r, booking({ guests: 10, nights: 5 })), false);
  assert.equal(applies(r, booking({ guests: 4, nights: 10 })), false);
});

test("a rule outside its window, switched off, or exhausted does not apply", () => {
  assert.equal(applies(rule({ active: false }), booking()), false);
  assert.equal(applies(rule({ startsAt: new Date("2026-09-01") }), booking()), false);
  assert.equal(applies(rule({ endsAt: new Date("2026-02-01") }), booking()), false);
  assert.equal(applies(rule({ maxRedemptions: 5, redemptionCount: 5 }), booking()), false);
  assert.equal(applies(rule({ maxRedemptions: 5, redemptionCount: 4 }), booking()), true);
});

test("a discount can never exceed the total", () => {
  assert.equal(amountOff(rule({ valueType: "FIXED", value: 500000 }), 100000), 100000);
  assert.equal(amountOff(rule({ valueType: "PERCENTAGE", value: 100 }), 100000), 100000);
  assert.equal(amountOff(rule({ valueType: "PERCENTAGE", value: 12 }), 100000), 12000);
  assert.equal(amountOff(rule({ valueType: "FIXED", value: 15000 }), 100000), 15000);
});

test("the best single rule wins — discounts never stack", () => {
  const eight = rule({ id: "a", name: "8+", minGuests: 8, value: 12 });
  const twenty = rule({ id: "b", name: "20+", minGuests: 20, value: 18 });
  const early = rule({ id: "c", name: "early", kind: "EARLY_BIRD", minLeadDays: 30, value: 8 });

  const small = bestDiscount([eight, twenty, early], booking({ guests: 10 }));
  assert.equal(small.rule.id, "a", "20+ does not apply to a party of 10");
  assert.equal(small.amount, 12000);

  const large = bestDiscount([eight, twenty, early], booking({ guests: 25 }));
  assert.equal(large.rule.id, "b", "the larger party gets the better rate");
  assert.equal(large.amount, 18000, "18% of the total, not 12% + 18% + 8%");
});

test("ties break toward the offer about to expire", () => {
  const soon = rule({ id: "soon", value: 10, endsAt: new Date("2026-07-01") });
  const later = rule({ id: "later", value: 10, endsAt: new Date("2026-12-01") });
  assert.equal(bestDiscount([later, soon], booking()).rule.id, "soon");
});

test("no applicable rule returns nothing rather than a zero discount", () => {
  assert.equal(bestDiscount([], booking()), null);
  assert.equal(bestDiscount([rule({ minGuests: 100 })], booking()), null);
  // A rule worth nothing is not an offer.
  assert.equal(bestDiscount([rule({ valueType: "FIXED", value: 0 })], booking()), null);
});

test("splitting loses and invents nothing", () => {
  for (const [total, count] of [[100, 3], [1000, 7], [1_478_400, 12], [1, 5], [0, 4]]) {
    const shares = splitEvenly(total, count);
    assert.equal(shares.length, count);
    assert.equal(shares.reduce((a, b) => a + b, 0), total, `${total} across ${count}`);
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, "shares differ by at most one unit");
    assert.ok(shares.every((s) => Number.isInteger(s)), "no fractional currency");
  }
  assert.deepEqual(splitEvenly(100, 3), [34, 33, 33]);
  assert.deepEqual(splitEvenly(0, 4), [0, 0, 0, 0]);
  assert.deepEqual(splitEvenly(50, 0), []);
});

test("the seeded Umrah party's arithmetic holds", () => {
  // 12 pilgrims, KES 1,680,000 gross, the 8+ rule at 12%.
  const gross = 1_680_000;
  const chosen = bestDiscount([rule({ name: "Group of 8 or more", minGuests: 8, value: 12 })],
    booking({ guests: 12, amount: gross }));
  assert.equal(chosen.amount, 201_600);
  const payable = gross - chosen.amount;
  const shares = splitEvenly(payable, 12);
  assert.equal(shares.reduce((a, b) => a + b, 0), payable);
  assert.equal(payable, 1_478_400);
});
