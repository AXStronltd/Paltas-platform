/**
 * Paltas Rewards, under test.
 *
 * A loyalty scheme is where products keep their dark patterns: points with no
 * stated value, secret tier formulas, balances that lapse quietly. Having argued
 * in the pricing panel that a guest should always know what they are paying, the
 * rewards programme has to be auditable too — so the claims are checked here as
 * arithmetic.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../.test-build/lib/loyalty/loyalty.js");

const daysAgo = (n) => { const d = new Date("2026-09-01"); d.setDate(d.getDate() - n); return d; };
const NOW = new Date("2026-09-01");

test("tiers are reached by stated spend, with no gaps or overlaps", () => {
  assert.equal(L.tierForSpend(0).key, "bronze");
  assert.equal(L.tierForSpend(149_999).key, "bronze");
  assert.equal(L.tierForSpend(150_000).key, "silver", "the threshold itself qualifies");
  assert.equal(L.tierForSpend(499_999).key, "silver");
  assert.equal(L.tierForSpend(500_000).key, "gold");
  assert.equal(L.tierForSpend(1_500_000).key, "platinum");
  assert.equal(L.tierForSpend(99_000_000).key, "platinum", "the top tier is the ceiling");
});

test("thresholds ascend and every tier earns more than the one below", () => {
  for (let i = 1; i < L.TIERS.length; i++) {
    assert.ok(L.TIERS[i].threshold > L.TIERS[i - 1].threshold, "thresholds must ascend");
    assert.ok(L.TIERS[i].earnRatePer100 > L.TIERS[i - 1].earnRatePer100, "a higher tier must earn faster");
  }
});

test("points are rounded down, so the advertised rate is never overstated", () => {
  const bronze = L.tierByKey("bronze");   // 2 per 100
  const platinum = L.tierByKey("platinum"); // 5 per 100
  assert.equal(L.pointsForStay(10_000, bronze), 200);
  assert.equal(L.pointsForStay(10_000, platinum), 500);
  // 149 shillings is one full hundred, not one and a half.
  assert.equal(L.pointsForStay(149, bronze), 2);
  assert.equal(L.pointsForStay(99, bronze), 1);
  assert.equal(L.pointsForStay(49, bronze), 0);
  assert.equal(L.pointsForStay(0, bronze), 0);
  assert.equal(L.pointsForStay(-500, bronze), 0, "a refund does not earn points");
});

test("a point is worth exactly one shilling, always", () => {
  assert.equal(L.POINT_VALUE, 1);
  assert.equal(L.pointsValue(1_240), 1_240);
  assert.equal(L.pointsValue(0), 0);
  assert.equal(L.pointsValue(-50), 0, "a negative balance is worth nothing, not a debt");
});

test("redemption never exceeds the bill and never goes negative", () => {
  // Plenty of points, small bill.
  const a = L.redeem(10_000, 3_000);
  assert.equal(a.amountOff, 3_000);
  assert.equal(a.pointsUsed, 3_000);
  assert.equal(a.pointsLeft, 7_000);

  // Few points, large bill.
  const b = L.redeem(500, 20_000);
  assert.equal(b.amountOff, 500);
  assert.equal(b.pointsLeft, 0);

  // Nothing to redeem.
  assert.deepEqual(L.redeem(0, 5_000), { pointsUsed: 0, amountOff: 0, pointsLeft: 0 });
  assert.deepEqual(L.redeem(5_000, 0), { pointsUsed: 0, amountOff: 0, pointsLeft: 5_000 });

  // The member is never left owing points.
  for (const [pts, bill] of [[100, 100], [1, 999], [999, 1], [12345, 6789]]) {
    const r = L.redeem(pts, bill);
    assert.ok(r.pointsLeft >= 0, `${pts} pts against ${bill}`);
    assert.ok(r.amountOff <= bill);
    assert.ok(r.pointsUsed <= pts);
  }
});

test("the balance is derived from the ledger, not stored", () => {
  const ledger = [
    { points: 500, at: daysAgo(300), kind: "EARN", qualifyingSpend: 25_000 },
    { points: 1_200, at: daysAgo(120), kind: "EARN", qualifyingSpend: 40_000 },
    { points: -300, at: daysAgo(60), kind: "REDEEM" },
    { points: 100, at: daysAgo(10), kind: "ADJUST" },
  ];
  assert.equal(L.balanceFrom(ledger), 1_500);
  assert.equal(L.balanceFrom([]), 0);
});

test("tier is a rolling window, so status can be lost as well as gained", () => {
  const ledger = [
    // Outside the 12-month window — should no longer count.
    { points: 8_000, at: daysAgo(400), kind: "EARN", qualifyingSpend: 400_000 },
    // Inside it.
    { points: 3_000, at: daysAgo(100), kind: "EARN", qualifyingSpend: 160_000 },
  ];
  const qualifying = L.qualifyingSpendFrom(ledger, NOW);
  assert.equal(qualifying, 160_000, "only spend inside the window qualifies");
  assert.equal(L.tierForSpend(qualifying).key, "silver");
  // Counting the lifetime total instead would wrongly say gold.
  assert.equal(L.tierForSpend(560_000).key, "gold");
});

test("only EARN entries carry qualifying spend", () => {
  const ledger = [
    { points: 3_000, at: daysAgo(30), kind: "EARN", qualifyingSpend: 150_000 },
    { points: -1_000, at: daysAgo(20), kind: "REDEEM", qualifyingSpend: 999_999 },
    { points: 500, at: daysAgo(10), kind: "ADJUST", qualifyingSpend: 999_999 },
  ];
  assert.equal(L.qualifyingSpendFrom(ledger, NOW), 150_000);
});

test("progress to the next tier is honest at both ends of a band", () => {
  const start = L.tierProgress(150_000);
  assert.equal(start.tier.key, "silver");
  assert.equal(start.next.key, "gold");
  assert.equal(start.remaining, 350_000);
  assert.equal(start.percent, 0);

  const mid = L.tierProgress(325_000);
  assert.equal(mid.percent, 50);

  const top = L.tierProgress(2_000_000);
  assert.equal(top.tier.key, "platinum");
  assert.equal(top.next, null);
  assert.equal(top.remaining, 0);
  assert.equal(top.percent, 100);
});

test("the next expiry is the soonest live tranche, and lapsed ones are skipped", () => {
  // 700 days is still inside the 24-month window, so this is what lapses first.
  const soon = [
    { points: 400, at: daysAgo(700), kind: "EARN", qualifyingSpend: 20_000 },
    { points: 900, at: daysAgo(200), kind: "EARN", qualifyingSpend: 45_000 },
  ];
  const next = L.nextExpiry(soon, NOW);
  assert.ok(next, "there is a live tranche to warn about");
  assert.equal(next.points, 400, "the oldest live tranche expires first");
  assert.ok(next.at > NOW, "and it is still in the future");

  // Past 24 months it has genuinely lapsed, and the warning moves on.
  const lapsed = [
    { points: 400, at: daysAgo(800), kind: "EARN", qualifyingSpend: 20_000 },
    { points: 900, at: daysAgo(200), kind: "EARN", qualifyingSpend: 45_000 },
  ];
  assert.equal(L.nextExpiry(lapsed, NOW).points, 900);

  assert.equal(L.nextExpiry([], NOW), null);
});

test("redemptions consume the oldest points first, which favours the member", () => {
  const ledger = [
    { points: 500, at: daysAgo(600), kind: "EARN", qualifyingSpend: 25_000 },
    { points: 800, at: daysAgo(30), kind: "EARN", qualifyingSpend: 40_000 },
    { points: -500, at: daysAgo(5), kind: "REDEEM" },
  ];
  // The 500 from 600 days ago is fully spent, so the 800 is what remains.
  // The old tranche is spent, so what remains is the newer, longer-lived one.
  const next = L.nextExpiry(ledger, NOW);
  assert.equal(next.points, 800);
});

test("the stated policy constants are the ones the rules actually use", () => {
  assert.equal(L.EXPIRY_MONTHS, 24);
  assert.equal(L.TIER_WINDOW_MONTHS, 12);
  const earned = { points: 100, at: daysAgo(0), kind: "EARN", qualifyingSpend: 5_000 };
  const next = L.nextExpiry([earned], NOW);
  const expected = new Date(NOW);
  expected.setMonth(expected.getMonth() + L.EXPIRY_MONTHS);
  assert.equal(next.at.toDateString(), expected.toDateString());
});
