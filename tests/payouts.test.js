/**
 * The payout ledger, under test.
 *
 * Every failure here is somebody's money. The ones worth naming:
 *
 *   Paying an earning twice, because a run was retried after Stripe accepted a
 *   transfer but before the rows were written.
 *   Paying before the guest has stayed, leaving nothing to refund from.
 *   Paying an account Stripe will refuse, which reads to a host as an outage
 *   rather than as a missing document.
 *   Mixing two currencies into one transfer.
 *   Refunding a guest and quietly eating the host's share.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  planPayouts, reverseForRefund, balances, batchKey,
  netOf, holdElapsed, payableFrom, DEFAULT_POLICY,
} = require("../.test-build/lib/payouts/ledger.js");

const NOW = new Date("2026-09-10T12:00:00Z");
const day = (n) => new Date(NOW.getTime() + n * 86_400_000);

let n = 0;
const earning = (over = {}) => ({
  id: `e${++n}`, orgId: "org1", bookingId: `b${n}`, currency: "KES",
  gross: 10_000, platformFee: 800, status: "HELD", checkOut: day(-5), ...over,
});

const account = (over = {}) => ({
  orgId: "org1", stripeAccountId: "acct_1", payoutsEnabled: true, ...over,
});

const plan = (earnings, accounts = [account()], now = NOW, policy) =>
  planPayouts({ earnings, accounts, now, policy });

/* --------------------------------------------------------------- basics -- */

test("the host receives the gross less the stated fee, and nothing else", () => {
  assert.equal(netOf(earning({ gross: 10_000, platformFee: 800 })), 9_200);
  // A fee of zero is a real configuration, not a missing one.
  assert.equal(netOf(earning({ gross: 10_000, platformFee: 0 })), 10_000);
});

test("nothing is sent before the guest has finished staying", () => {
  // The hold runs from check-out, so a guest still in the property has not yet
  // paid for a stay that cannot be put right.
  const staying = earning({ checkOut: day(1) });
  assert.equal(holdElapsed(staying, NOW, DEFAULT_POLICY), false);
  assert.equal(plan([staying]).batches.length, 0);
  assert.deepEqual(plan([staying]).withheld.map((w) => w.reason), ["still-held"]);
});

test("the hold boundary is inclusive, so money is not held an extra day", () => {
  const e = earning({ checkOut: new Date("2026-09-09T12:00:00Z") });
  const due = payableFrom(e, { holdDays: 1, minimumPayout: 0 });
  assert.equal(due.toISOString(), "2026-09-10T12:00:00.000Z");
  assert.equal(holdElapsed(e, due, { holdDays: 1, minimumPayout: 0 }), true, "exactly due counts as due");
  assert.equal(holdElapsed(e, new Date(due.getTime() - 1), { holdDays: 1, minimumPayout: 0 }), false);
});

test("a longer hold is honoured, because the policy is the promise", () => {
  const e = earning({ checkOut: day(-2) });
  assert.equal(plan([e], [account()], NOW, { holdDays: 7, minimumPayout: 0 }).batches.length, 0);
  assert.equal(plan([e], [account()], NOW, { holdDays: 1, minimumPayout: 0 }).batches.length, 1);
});

/* ------------------------------------------------------- what may be sent -- */

test("only money that is genuinely owed is ever considered", () => {
  // PAID and REVERSED are terminal. Reading them here is how an earning gets
  // paid a second time.
  const p = plan([
    earning({ status: "PAID" }),
    earning({ status: "REVERSED" }),
  ]);
  assert.deepEqual(p.batches, []);
  assert.deepEqual(p.withheld, [], "a settled earning is not owed, so it is not withheld either");
});

test("a host who has not onboarded is withheld, not failed", () => {
  const p = plan([earning()], [account({ stripeAccountId: null, payoutsEnabled: false })]);
  assert.equal(p.batches.length, 0);
  assert.equal(p.withheld[0].reason, "not-onboarded");
  assert.equal(p.withheld[0].amount, 9_200, "and the amount owed is still stated");
});

test("an account Stripe would refuse is withheld with the real reason", () => {
  // Onboarding started is not onboarding finished; sending anyway produces a
  // failed transfer, which reads as an outage rather than a missing document.
  const p = plan([earning()], [account({ payoutsEnabled: false })]);
  assert.equal(p.batches.length, 0);
  assert.equal(p.withheld[0].reason, "payouts-disabled");
});

test("an org with no account row at all is withheld rather than crashing", () => {
  const p = plan([earning({ orgId: "unknown" })], []);
  assert.equal(p.batches.length, 0);
  assert.equal(p.withheld[0].reason, "not-onboarded");
});

test("a trivial amount waits for company", () => {
  const tiny = earning({ gross: 150, platformFee: 100 });
  const p = plan([tiny], [account()], NOW, { holdDays: 1, minimumPayout: 100 });
  assert.equal(p.batches.length, 0);
  assert.equal(p.withheld[0].reason, "below-minimum");
  // And once there is enough between them, both go at once.
  const p2 = plan([tiny, earning({ gross: 150, platformFee: 100 })], [account()], NOW,
    { holdDays: 1, minimumPayout: 100 });
  assert.equal(p2.batches.length, 1);
  assert.equal(p2.batches[0].amount, 100);
});

/* ------------------------------------------------------------- batching -- */

test("one transfer carries one currency, because a bank transfer does", () => {
  const p = plan([
    earning({ currency: "KES", gross: 10_000, platformFee: 0 }),
    earning({ currency: "EUR", gross: 200, platformFee: 0 }),
    earning({ currency: "KES", gross: 5_000, platformFee: 0 }),
  ]);
  assert.equal(p.batches.length, 2);
  const byCurrency = Object.fromEntries(p.batches.map((b) => [b.currency, b.amount]));
  assert.deepEqual(byCurrency, { KES: 15_000, EUR: 200 });
  for (const b of p.batches) assert.ok(b.currency, "a batch without a currency cannot be sent");
});

test("one transfer carries one host", () => {
  const p = plan(
    [earning({ orgId: "org1" }), earning({ orgId: "org2" })],
    [account({ orgId: "org1" }), account({ orgId: "org2", stripeAccountId: "acct_2" })],
  );
  assert.equal(p.batches.length, 2);
  assert.deepEqual(p.batches.map((b) => b.stripeAccountId).sort(), ["acct_1", "acct_2"]);
});

test("a batch pays exactly the earnings it names, and no others", () => {
  const ready = [earning({ checkOut: day(-3) }), earning({ checkOut: day(-2) })];
  const held = earning({ checkOut: day(3) });
  const p = plan([...ready, held]);
  assert.equal(p.batches.length, 1);
  assert.deepEqual(p.batches[0].earningIds, ready.map((e) => e.id).sort());
  assert.equal(p.batches[0].amount, ready.reduce((n, e) => n + netOf(e), 0));
  assert.ok(!p.batches[0].earningIds.includes(held.id), "a held earning was about to be sent");
});

test("every shilling owed is either in a batch or explained", () => {
  // The invariant that matters to a host: money does not go missing quietly.
  const earnings = [
    earning({ checkOut: day(-3) }),
    earning({ checkOut: day(5) }),
    earning({ orgId: "org2" }),
    earning({ currency: "EUR", gross: 300, platformFee: 30 }),
    earning({ status: "PAID" }),
    earning({ status: "REVERSED" }),
  ];
  const p = plan(earnings, [account()]);
  const owed = earnings
    .filter((e) => e.status === "HELD" || e.status === "PAYABLE")
    .reduce((n, e) => n + netOf(e), 0);
  const accounted = p.batches.reduce((n, b) => n + b.amount, 0)
    + p.withheld.reduce((n, w) => n + w.amount, 0);
  assert.equal(accounted, owed, "money owed went neither out nor onto the withheld list");

  const ids = [...p.batches.flatMap((b) => b.earningIds), ...p.withheld.flatMap((w) => w.earningIds)];
  assert.equal(new Set(ids).size, ids.length, "an earning appeared in two places at once");
});

/* --------------------------------------------------------- idempotency -- */

test("the same earnings always produce the same key", () => {
  // This is what stops a run that died after Stripe accepted the transfer from
  // paying the same earnings again when it is retried.
  const es = [earning({ checkOut: day(-3) }), earning({ checkOut: day(-2) })];
  const first = plan(es).batches[0].idempotencyKey;
  const second = plan(es).batches[0].idempotencyKey;
  assert.equal(first, second);
  // Order of discovery must not change it either.
  assert.equal(plan([...es].reverse()).batches[0].idempotencyKey, first);
});

test("a different set of earnings produces a different key", () => {
  const a = batchKey("org1", "KES", ["e1", "e2"]);
  assert.notEqual(a, batchKey("org1", "KES", ["e1", "e3"]), "a changed set reused a key");
  assert.notEqual(a, batchKey("org2", "KES", ["e1", "e2"]), "another host reused a key");
  assert.notEqual(a, batchKey("org1", "EUR", ["e1", "e2"]), "another currency reused a key");
  assert.equal(a, batchKey("org1", "kes", ["e2", "e1"]), "case and order are not differences");
});

test("a key is safe to put in a header", () => {
  const k = batchKey("org1", "KES", ["e1", "e2"]);
  assert.match(k, /^[A-Za-z0-9_]+$/, `${k} would need escaping`);
  assert.ok(k.length <= 255, "Stripe caps idempotency keys");
});

test("once paid, the same earnings do not come round again", () => {
  const es = [earning({ checkOut: day(-3) }), earning({ checkOut: day(-2) })];
  assert.equal(plan(es).batches.length, 1);
  const settled = es.map((e) => ({ ...e, status: "PAID" }));
  assert.equal(plan(settled).batches.length, 0, "a paid earning was offered for payment again");
});

/* ------------------------------------------------------------- refunds -- */

test("refunding before the money has gone simply stops it going", () => {
  for (const status of ["HELD", "PAYABLE"]) {
    const r = reverseForRefund(earning({ status }));
    assert.equal(r.status, "REVERSED");
    assert.equal(r.clawBackRequired, false, "asked Stripe to claw back money it never sent");
  }
});

test("refunding after the money has gone requires clawing it back", () => {
  // The bug this exists for: refunding the guest empties the platform's balance
  // while the host keeps their share. The refund does not undo the transfer.
  const r = reverseForRefund(earning({ status: "PAID" }));
  assert.equal(r.status, "REVERSED");
  assert.equal(r.clawBackRequired, true);
});

test("refunding twice does not claw back twice", () => {
  const r = reverseForRefund(earning({ status: "REVERSED" }));
  assert.equal(r.status, "REVERSED");
  assert.equal(r.clawBackRequired, false);
});

test("a reversed earning is never paid, however long it waits", () => {
  const e = earning({ status: "REVERSED", checkOut: day(-90) });
  assert.equal(plan([e]).batches.length, 0);
});

/* ---------------------------------------------------------- statements -- */

test("a host can read what they are owed, by currency", () => {
  const rows = balances([
    earning({ currency: "KES", status: "HELD", gross: 10_000, platformFee: 800 }),
    earning({ currency: "KES", status: "PAYABLE", gross: 5_000, platformFee: 400 }),
    earning({ currency: "KES", status: "PAID", gross: 2_000, platformFee: 160 }),
    earning({ currency: "EUR", status: "HELD", gross: 300, platformFee: 24 }),
    earning({ currency: "KES", status: "REVERSED", gross: 9_999, platformFee: 0 }),
  ]);
  assert.deepEqual(rows, [
    { currency: "EUR", held: 276, payable: 0, paid: 0 },
    { currency: "KES", held: 9_200, payable: 4_600, paid: 1_840 },
  ]);
});

test("a reversed booking is in no total at all", () => {
  const rows = balances([earning({ status: "REVERSED", gross: 10_000, platformFee: 0 })]);
  assert.deepEqual(rows, [{ currency: "KES", held: 0, payable: 0, paid: 0 }]);
});

test("no earnings, no statement — rather than a row of zeroes", () => {
  assert.deepEqual(balances([]), []);
});
