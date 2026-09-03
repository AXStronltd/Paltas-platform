/**
 * The whole money path, once, against Stripe test mode.
 *
 * Guest pays → the host is owed → the hold elapses → the money is transferred →
 * the guest is refunded → the transfer is reversed. Every step against the real
 * Stripe API and the real webhook handler, with the ledger read back out of the
 * database in between, because the expensive mistakes here are the ones that
 * only appear when the pieces meet.
 *
 * It exists because the ledger arithmetic is proven by unit tests and the Stripe
 * calls are not. `transfers.create` and a transfer reversal have never run.
 * Until they have, "payouts work" is a belief rather than a fact.
 *
 * REFUSES TO RUN AGAINST A LIVE KEY. Not a warning, not a prompt — it exits.
 * A script that creates accounts, moves money and issues refunds must not be
 * one mistyped variable away from doing it for real.
 *
 * Needs, all from the environment and none of them printed:
 *   STRIPE_SECRET_KEY      sk_test_… only
 *   STRIPE_WEBHOOK_SECRET  whsec_… the running app is using
 *   PAYOUT_RUN_TOKEN       the running app is using
 *   DATABASE_URL           the running app is using
 *   PALTAS_URL             default http://localhost:3010
 *
 * Run:  node scripts/stripe-roundtrip.mjs
 */

import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const STRIPE = "https://api.stripe.com/v1";
const KEY = process.env.STRIPE_SECRET_KEY ?? "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const RUN_TOKEN = process.env.PAYOUT_RUN_TOKEN ?? "";
const raw = (process.env.PALTAS_URL ?? "http://localhost:3010").trim().replace(/\/$/, "");
const URL_BASE = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;

let pass = 0, fail = 0;
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`); }
  return cond;
};
const step = (s) => console.log(`\n${s}`);
const die = (msg) => { console.error(`\n${msg}`); process.exit(2); };

/* ------------------------------------------------------------- the guard -- */

if (!KEY) die("STRIPE_SECRET_KEY is not set. Nothing to test against.");
if (KEY.startsWith("sk_live_")) {
  die(
    "Refusing to run: STRIPE_SECRET_KEY is a LIVE key.\n" +
    "This script creates accounts, moves money and issues refunds. Point it at\n" +
    "a sk_test_ key. If you meant to test live, you did not.",
  );
}
if (!KEY.startsWith("sk_test_")) die("STRIPE_SECRET_KEY is neither a test nor a live key. Refusing to guess.");
if (!WEBHOOK_SECRET) die("STRIPE_WEBHOOK_SECRET is not set — the webhook would reject every event.");
if (RUN_TOKEN.length < 32) die("PAYOUT_RUN_TOKEN is missing or too short; the payout run cannot be triggered.");

const prisma = new PrismaClient();
const cleanup = [];

/* ------------------------------------------------------------- plumbing -- */

const form = (obj, prefix = "") => {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) out.push(form(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
};

async function stripe(path, body, method = "POST") {
  const res = await fetch(`${STRIPE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-06-20",
    },
    body: body ? form(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  // The key is never echoed, including on failure: an error that prints the
  // credential is how a log becomes a breach.
  if (!res.ok) throw new Error(`Stripe ${path} → ${res.status}: ${json?.error?.message ?? "no detail"}`);
  return json;
}

/** A properly signed event, so the real handler runs including its signature check. */
async function sendWebhook(type, object) {
  const payload = JSON.stringify({ id: `evt_test_${Date.now()}`, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`, "utf8").digest("hex");
  const res = await fetch(`${URL_BASE}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${signature}` },
    body: payload,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const earningFor = (bookingId) =>
  prisma.hostEarning.findUnique({
    where: { bookingId },
    select: { id: true, status: true, gross: true, platformFee: true, clawedBack: true, payoutId: true },
  });

/* ------------------------------------------------------------------ run -- */

try {
  step("0 · WHAT WE ARE POINTED AT");
  const account = await stripe("/balance", null, "GET");
  ok(Boolean(account), "Stripe answers in test mode");
  const health = await fetch(`${URL_BASE}/api/public/listings`).then((r) => r.status).catch(() => 0);
  ok(health === 200, `the app at ${URL_BASE} is up`, `status ${health}`);

  step("1 · A HOST WITH SOMEWHERE TO BE PAID");
  // A test Custom account with the transfers capability. Real onboarding is a
  // hosted form a person fills in; in test mode Stripe accepts these values and
  // enables the account, which is the state this script needs to exercise.
  const connected = await stripe("/accounts", {
    type: "custom",
    country: "GB",
    email: `roundtrip+${Date.now()}@example.com`,
    business_type: "individual",
    capabilities: { transfers: { requested: true } },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
    individual: {
      first_name: "Test", last_name: "Host",
      dob: { day: 1, month: 1, year: 1990 },
      email: `roundtrip+${Date.now()}@example.com`,
      address: { line1: "address_full_match", city: "London", postal_code: "WC2N 5DU", country: "GB" },
    },
    business_profile: { mcc: "7011", url: "https://example.com" },
  });
  ok(Boolean(connected.id), "a connected account exists", connected.id);

  const org = await prisma.organization.findFirst({
    where: { approved: true, isPlatform: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, stripeAccountId: true, stripeOnboarded: true, platformFeeBasisPoints: true },
  });
  if (!org) die("No approved organisation to pay. Run the seed first.");
  const restoreOrg = { stripeAccountId: org.stripeAccountId, stripeOnboarded: org.stripeOnboarded };
  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeAccountId: connected.id, stripeOnboarded: true },
  });
  cleanup.push(() => prisma.organization.update({ where: { id: org.id }, data: restoreOrg }));
  ok(true, `${org.name} is pointed at it for the duration of this run`);

  step("2 · A GUEST PAYS");
  const booking = await prisma.booking.findFirst({
    where: { status: { in: ["PENDING", "CONFIRMED"] }, earning: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, total: true, currency: true, checkOut: true, propertyId: true },
  });
  if (!booking) die("No booking without an earning to use. Re-run the seed.");

  // pm_card_bypassPending is Stripe's test payment method whose funds land in
  // the available balance immediately. Without it the charge sits in pending
  // and the transfer in step 4 fails for insufficient funds — which would look
  // like a bug in the payout code rather than a property of test mode.
  const intent = await stripe("/payment_intents", {
    amount: booking.total,
    currency: booking.currency.toLowerCase(),
    payment_method: "pm_card_bypassPending",
    confirm: "true",
    "automatic_payment_methods[enabled]": "true",
    "automatic_payment_methods[allow_redirects]": "never",
    description: `Round-trip ${booking.reference}`,
    metadata: { purpose: "booking", bookingId: booking.id, reference: booking.reference, orgId: org.id },
  });
  ok(intent.status === "succeeded", "the charge succeeded", intent.status);

  step("3 · THE HOST IS OWED, AND THE MONEY IS HELD");
  const hook = await sendWebhook("payment_intent.succeeded", {
    id: intent.id, amount: intent.amount, currency: intent.currency, status: "succeeded",
    metadata: { purpose: "booking", bookingId: booking.id, reference: booking.reference, orgId: org.id },
  });
  ok(hook.status === 200, "the signed webhook was accepted", `status ${hook.status}`);

  let earning = await earningFor(booking.id);
  ok(Boolean(earning), "an earning was recorded");
  ok(earning?.status === "HELD", "and it is held, not paid", earning?.status);
  const expectedFee = Math.floor((booking.total * (org.platformFeeBasisPoints ?? 0)) / 10_000);
  ok(earning?.gross === booking.total, "for exactly what the guest paid");
  ok(earning?.platformFee === expectedFee, "with the stated fee", `${earning?.platformFee} vs ${expectedFee}`);

  // Delivered twice, as Stripe does. One earning, not two.
  await sendWebhook("payment_intent.succeeded", {
    id: intent.id, amount: intent.amount, currency: intent.currency, status: "succeeded",
    metadata: { purpose: "booking", bookingId: booking.id, reference: booking.reference, orgId: org.id },
  });
  const count = await prisma.hostEarning.count({ where: { bookingId: booking.id } });
  ok(count === 1, "a duplicate delivery does not owe the host twice", `${count} earnings`);

  step("4 · THE HOLD ELAPSES AND THE MONEY IS SENT");
  // Backdating rather than waiting a day. The hold itself is unit-tested; what
  // is being proven here is that a payable earning reaches Stripe.
  await prisma.hostEarning.update({
    where: { id: earning.id },
    data: { checkOut: new Date(Date.now() - 30 * 86_400_000) },
  });

  const run = await fetch(`${URL_BASE}/api/platform/payouts/run`, {
    method: "POST", headers: { Authorization: `Bearer ${RUN_TOKEN}` },
  });
  const runBody = await run.json().catch(() => null);
  ok(run.status === 200, "the payout run was accepted", `status ${run.status}`);

  earning = await earningFor(booking.id);
  ok(earning?.status === "PAID", "the earning is paid", earning?.status);
  const payout = earning?.payoutId
    ? await prisma.payout.findUnique({
        where: { id: earning.payoutId },
        select: { status: true, amount: true, currency: true, stripeTransferId: true, failureReason: true },
      })
    : null;
  ok(payout?.status === "SENT", "a payout was sent", payout?.failureReason ?? payout?.status);
  ok(Boolean(payout?.stripeTransferId), "with a real Stripe transfer id", payout?.stripeTransferId ?? "none");
  ok(payout?.amount === (earning.gross - earning.platformFee), "for the host's net share",
    `${payout?.amount} vs ${earning.gross - earning.platformFee}`);

  if (payout?.stripeTransferId) {
    const transfer = await stripe(`/transfers/${payout.stripeTransferId}`, null, "GET");
    ok(transfer.destination === connected.id, "and it actually reached that host's account");
    ok(transfer.amount === payout.amount, "for the amount we recorded", `${transfer.amount}`);
  }

  step("5 · RUNNING AGAIN PAYS NOBODY TWICE");
  const again = await fetch(`${URL_BASE}/api/platform/payouts/run`, {
    method: "POST", headers: { Authorization: `Bearer ${RUN_TOKEN}` },
  });
  const againBody = await again.json().catch(() => null);
  const paidTwice = (againBody?.sent ?? []).some((s) => s.orgId === org.id);
  ok(!paidTwice, "the second run sends nothing for this host");
  const payoutCount = await prisma.payout.count({ where: { orgId: org.id, status: "SENT" } });
  ok(payoutCount >= 1, "and the payout it already made still stands");

  step("6 · A REFUND TAKES THE MONEY BACK");
  await stripe("/refunds", {
    payment_intent: intent.id,
    reverse_transfer: "true",
    refund_application_fee: "true",
  });
  const refundHook = await sendWebhook("charge.refunded", {
    id: intent.id, amount: intent.amount, currency: intent.currency, status: "succeeded",
    metadata: { purpose: "booking", bookingId: booking.id, reference: booking.reference, orgId: org.id },
  });
  ok(refundHook.status === 200, "the refund webhook was accepted", `status ${refundHook.status}`);

  earning = await earningFor(booking.id);
  ok(earning?.status === "REVERSED", "the earning is reversed", earning?.status);
  ok(earning?.clawedBack === true, "and the money was clawed back from the host, not eaten by us",
    `clawedBack=${earning?.clawedBack}`);

  step("7 · WHAT THE HOST WOULD SEE");
  const balance = await stripe(`/balance`, null, "GET");
  ok(Array.isArray(balance.available), "the platform balance is readable");
  console.log(`  · this run created test objects on ${connected.id}; test data is disposable.`);
} catch (e) {
  fail++;
  console.error(`\n  ✗ ${e.message}`);
} finally {
  for (const undo of cleanup.reverse()) {
    try { await undo(); } catch { /* best effort: test data, not production */ }
  }
  await prisma.$disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log(
    "\nA failure here is the point of the script: it means the money path does\n" +
    "not yet work end to end, and it says which step it stopped at.",
  );
}
process.exit(fail === 0 ? 0 : 1);
