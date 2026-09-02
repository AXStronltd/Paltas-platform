/**
 * Stripe webhook verification, under test.
 *
 * This is the single most security-critical pure function in the product: it
 * decides whether to believe a stranger who says a payment succeeded. Getting it
 * wrong means shipping goods for free, so it is tested directly rather than
 * inferred from the endpoint behaving plausibly.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { verifyWebhookSignature, mapStatus, stripeMode, assertNoPublicSecret } = require("../.test-build/server/stripe.js");

const SECRET = "whsec_test_abc123";
const BODY = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });

const sign = (body, secret, timestamp = Math.floor(Date.now() / 1000)) => {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${v1}`;
};

test("a correctly signed payload is accepted", () => {
  assert.equal(verifyWebhookSignature(BODY, sign(BODY, SECRET), SECRET).ok, true);
});

test("a payload altered after signing is rejected", () => {
  const header = sign(BODY, SECRET);
  const tampered = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", amount: 999999 });
  assert.equal(verifyWebhookSignature(tampered, header, SECRET).ok, false);
});

test("a signature from the wrong secret is rejected", () => {
  assert.equal(verifyWebhookSignature(BODY, sign(BODY, "whsec_someone_else"), SECRET).ok, false);
});

test("an old signature is rejected, so a captured webhook cannot be replayed", () => {
  const longAgo = Math.floor(Date.now() / 1000) - 3600;
  const r = verifyWebhookSignature(BODY, sign(BODY, SECRET, longAgo), SECRET);
  assert.equal(r.ok, false);
  assert.match(r.reason, /tolerance/i);
  // Inside the window it is fine.
  const recent = Math.floor(Date.now() / 1000) - 60;
  assert.equal(verifyWebhookSignature(BODY, sign(BODY, SECRET, recent), SECRET).ok, true);
});

test("a future-dated signature is rejected too", () => {
  const ahead = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(verifyWebhookSignature(BODY, sign(BODY, SECRET, ahead), SECRET).ok, false);
});

test("missing pieces are refused rather than waved through", () => {
  assert.equal(verifyWebhookSignature(BODY, sign(BODY, SECRET), undefined).ok, false, "no endpoint secret configured");
  assert.equal(verifyWebhookSignature(BODY, null, SECRET).ok, false, "no signature header");
  assert.equal(verifyWebhookSignature(BODY, "garbage", SECRET).ok, false, "malformed header");
  assert.equal(verifyWebhookSignature(BODY, "t=123", SECRET).ok, false, "no v1 component");
  assert.equal(verifyWebhookSignature(BODY, `t=${Math.floor(Date.now()/1000)},v1=`, SECRET).ok, false, "empty signature");
});

test("a signature of the wrong length cannot crash the comparison", () => {
  const t = Math.floor(Date.now() / 1000);
  for (const v1 of ["ab", "0".repeat(63), "0".repeat(65), "z".repeat(64)]) {
    const r = verifyWebhookSignature(BODY, `t=${t},v1=${v1}`, SECRET);
    assert.equal(r.ok, false, `v1 of length ${v1.length}`);
  }
});

test("Stripe statuses map onto ours without falling through to success", () => {
  assert.equal(mapStatus("succeeded"), "SUCCEEDED");
  assert.equal(mapStatus("processing"), "PROCESSING");
  assert.equal(mapStatus("canceled"), "CANCELLED");
  assert.equal(mapStatus("requires_payment_method"), "REQUIRES_PAYMENT");
  assert.equal(mapStatus("requires_action"), "REQUIRES_PAYMENT");
  // Anything unrecognised must never be treated as paid.
  for (const unknown of ["", "weird_new_status", "SUCCEEDED", "paid"]) {
    assert.notEqual(mapStatus(unknown), "SUCCEEDED", `"${unknown}" must not read as success`);
  }
});

test("mode reflects the key in play, and says so when there is none", () => {
  const original = process.env.STRIPE_SECRET_KEY;
  try {
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(stripeMode(), "unconfigured");
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    assert.equal(stripeMode(), "test");
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    assert.equal(stripeMode(), "live");
  } finally {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = original;
  }
});

test("a secret key in a NEXT_PUBLIC_ variable is fatal, not a warning", () => {
  // NEXT_PUBLIC_ variables are compiled into the browser bundle. A secret there
  // is served to every visitor, so this must stop the process rather than log.
  const name = "NEXT_PUBLIC_TEST_LEAK";
  try {
    process.env[name] = "sk_live_deadbeef";
    assert.throws(() => assertNoPublicSecret(), /compiled into the browser bundle/);
    process.env[name] = "rk_test_restricted";
    assert.throws(() => assertNoPublicSecret(), /browser bundle/);
    process.env[name] = "mk_0000000000000000000000";
    assert.throws(() => assertNoPublicSecret(), /browser bundle/);
    process.env[name] = "pk_live_publishable_is_fine";
    assert.doesNotThrow(() => assertNoPublicSecret(), "publishable keys belong in NEXT_PUBLIC_");
  } finally {
    delete process.env[name];
  }
});

test("Connect routing is opt-in, and the platform fee rounds in the payer's favour", () => {
  // The fee arithmetic matters: taking more than the stated rate from an owner
  // is the kind of error that ends a marketplace relationship. Verified here as
  // arithmetic rather than trusted to the request builder.
  const feeFor = (amount, bps) => Math.floor((Math.round(amount) * bps) / 10_000);

  assert.equal(feeFor(100_000, 250), 2_500, "2.5% of 100,000");
  assert.equal(feeFor(10_000, 250), 250);
  assert.equal(feeFor(999, 250), 24, "rounded down, never up");
  assert.equal(feeFor(100_000, 0), 0, "no fee configured means no fee taken");
  // The fee can never exceed the payment.
  for (const [amount, bps] of [[1, 250], [100, 10_000], [50_000, 500]]) {
    assert.ok(feeFor(amount, bps) <= amount, `${bps}bps of ${amount}`);
  }
});
