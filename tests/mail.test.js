/**
 * Email: the outbox policy, and what the messages actually say.
 *
 * The failures worth naming:
 *
 *   Sending a booking confirmation twice, because Stripe delivered the webhook
 *   twice and the second delivery looked like a new event.
 *   Retrying forever against an address that will never accept mail, which
 *   costs money and buries the real failures underneath it.
 *   Giving up on a message because the provider had a bad thirty seconds.
 *   Putting the API key, or anything else from the request, into `lastError` —
 *   which is stored in the database and read by people.
 *   Sending a guest in Nairobi an email in English because the locale was only
 *   ever wired into the browser.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  afterFailure, isPermanent, nextAttemptAt, dedupeKey, deliverable,
  MAX_ATTEMPTS, BACKOFF_SECONDS,
} = require("../.test-build/lib/mail/outbox.js");
const {
  bookingConfirmed, bookingCancelled, passwordReset,
} = require("../.test-build/lib/mail/templates.js");

const NOW = new Date("2026-09-10T12:00:00Z");

const booking = (over = {}) => ({
  guestName: "Amina", guestLocale: "en", market: "KE",
  reference: "PLT-4821", listingTitle: "Nyali Beach House", city: "Mombasa",
  checkIn: new Date("2026-10-02T00:00:00Z"), checkOut: new Date("2026-10-06T00:00:00Z"),
  nights: 4, guests: 2, total: 48_000, currency: "KES",
  bookingUrl: "https://paltas.io/bookings", helpUrl: "https://paltas.io/help",
  ...over,
});

/* ---------------------------------------------------------------- dedupe */

test("one event produces one key however often it is delivered", () => {
  assert.equal(dedupeKey("booking.confirmed", "bk1"), dedupeKey("booking.confirmed", "bk1"));
});

test("the key is built from the event, not the moment it was noticed", () => {
  // If the time got in, a redelivered webhook would send a second email.
  assert.ok(!/\d{13}/.test(dedupeKey("booking.confirmed", "bk1")));
});

test("different events on one booking stay distinct", () => {
  assert.notEqual(
    dedupeKey("booking.confirmed", "bk1"),
    dedupeKey("booking.cancelled", "bk1"),
  );
});

/* --------------------------------------------------------------- retries */

test("a provider having a bad moment is tried again", () => {
  const after = afterFailure({ attempts: 0, status: "PENDING" }, 503, NOW);
  assert.equal(after.status, "PENDING");
  assert.equal(after.attempts, 1);
  assert.ok(after.nextAttemptAt > NOW);
});

test("an address the provider refuses outright is not retried", () => {
  assert.equal(afterFailure({ attempts: 0, status: "PENDING" }, 422, NOW).status, "FAILED");
});

test("a bad API key is not permanent — it is fixable, and the mail still matters", () => {
  assert.equal(isPermanent(401), false);
  assert.equal(afterFailure({ attempts: 0, status: "PENDING" }, 401, NOW).status, "PENDING");
});

test("rate limiting is a reason to wait, not to give up", () => {
  assert.equal(isPermanent(429), false);
});

test("an unknown status is treated as transient", () => {
  // Throwing a deliverable message away is the more expensive mistake.
  assert.equal(isPermanent(418), true);   // 4xx we do not recognise: refused
  assert.equal(isPermanent(500), false);
  assert.equal(isPermanent(0), false);
});

test("retrying stops eventually", () => {
  const after = afterFailure({ attempts: MAX_ATTEMPTS - 1, status: "PENDING" }, 503, NOW);
  assert.equal(after.status, "FAILED");
});

test("each wait is longer than the last", () => {
  for (let i = 1; i < BACKOFF_SECONDS.length; i += 1) {
    assert.ok(BACKOFF_SECONDS[i] > BACKOFF_SECONDS[i - 1]);
  }
  assert.ok(nextAttemptAt(5, NOW) > nextAttemptAt(0, NOW));
});

test("backoff does not run off the end of the table", () => {
  assert.ok(Number.isFinite(nextAttemptAt(99, NOW).getTime()));
});

/* ------------------------------------------------------------- addresses */

test("an address that cannot be delivered to is never queued", () => {
  for (const bad of [null, undefined, "", "  ", "no-at-sign", "a@b", "two@@at.com",
                     "spaces in@example.com", "@example.com", "x@.com", "x@com."]) {
    assert.equal(deliverable(bad), false, `should refuse ${JSON.stringify(bad)}`);
  }
});

test("ordinary addresses are accepted", () => {
  for (const good of ["amina@example.com", "a.b+tag@sub.example.co.ke", " x@example.org "]) {
    assert.equal(deliverable(good), true, `should accept ${JSON.stringify(good)}`);
  }
});

/* ------------------------------------------------------------- templates */

test("a confirmation carries every fact the guest needs to keep", () => {
  const m = bookingConfirmed(booking());
  for (const part of [m.text, m.html]) {
    assert.match(part, /PLT-4821/);
    assert.match(part, /Nyali Beach House/);
    assert.match(part, /Mombasa/);
  }
  assert.match(m.subject, /PLT-4821/);
});

test("the plain-text part says the same as the HTML, not 'view in browser'", () => {
  const m = bookingConfirmed(booking());
  assert.ok(m.text.length > 120);
  assert.doesNotMatch(m.text, /<[a-z]/i);
  assert.match(m.text, /https:\/\/paltas\.io\/bookings/);
});

test("a guest who chose Swahili is written to in Swahili", () => {
  const sw = bookingConfirmed(booking({ guestLocale: "sw" }));
  const en = bookingConfirmed(booking({ guestLocale: "en" }));
  assert.notEqual(sw.subject, en.subject);
  assert.match(sw.html, /lang="sw"/);
});

test("Arabic is laid out right to left", () => {
  const ar = bookingConfirmed(booking({ guestLocale: "ar" }));
  assert.match(ar.html, /dir="rtl"/);
});

test("an unknown locale falls back rather than rendering message keys", () => {
  const m = bookingConfirmed(booking({ guestLocale: "xx" }));
  assert.doesNotMatch(m.subject, /email\./);
  assert.doesNotMatch(m.text, /email\.[a-z]/);
});

test("no message leaves a placeholder unfilled", () => {
  const messages = [
    bookingConfirmed(booking()),
    bookingCancelled(booking()),
    passwordReset({ name: "Amina", locale: "en", market: "KE", expiresInMinutes: 60,
                    resetUrl: "https://paltas.io/reset?token=x", helpUrl: "https://paltas.io/help" }),
  ];
  for (const m of messages) {
    for (const part of [m.subject, m.text, m.html]) {
      assert.doesNotMatch(part, /\{[a-zA-Z]+\}/, `unfilled placeholder in: ${part.slice(0, 90)}`);
    }
  }
});

test("a name with markup in it cannot get into the HTML as markup", () => {
  const m = bookingConfirmed(booking({ listingTitle: '<img src=x onerror="alert(1)">' }));
  assert.doesNotMatch(m.html, /<img src=x/);
  assert.match(m.html, /&lt;img/);
});

test("the city is spelled the reader's way, not ours", () => {
  const ar = bookingConfirmed(booking({ guestLocale: "ar", city: "Mombasa" }));
  // An Arabic message that hands back the English spelling of the city has
  // translated the furniture and left the content behind.
  assert.match(ar.text, /مومباسا/);
  assert.doesNotMatch(ar.text, /Mombasa/);
});

test("the footer does not run two sentences into one line", () => {
  const m = bookingConfirmed(booking());
  const lines = m.text.trim().split("\n");
  assert.ok(lines[lines.length - 1].length < 90, "footer line is a run-on");
  assert.match(m.html, /<br>/);
});

test("a cancellation says what happens about money, with a timescale", () => {
  const m = bookingCancelled(booking());
  assert.match(m.text, /refund/i);
  assert.match(m.text, /days/i);
});

test("a cancellation does not offer a link to manage a booking that is gone", () => {
  assert.doesNotMatch(bookingCancelled(booking()).text, /View this booking/);
});

test("a reset email says the link expires and that ignoring it is safe", () => {
  const m = passwordReset({
    name: "Amina", locale: "en", market: "KE", expiresInMinutes: 60,
    resetUrl: "https://paltas.io/reset?token=secret", helpUrl: "https://paltas.io/help",
  });
  assert.match(m.text, /60/);
  assert.match(m.text, /ignore/i);
  assert.match(m.text, /secret/);   // the link itself must survive rendering
});

test("no template invents a feature the platform does not have", () => {
  const all = [bookingConfirmed(booking()), bookingCancelled(booking())]
    .map((m) => m.text).join("\n").toLowerCase();
  for (const claim of ["message your host", "chat with", "your driver", "loyalty points",
                       "download the app", "rate your stay"]) {
    assert.ok(!all.includes(claim), `template claims "${claim}", which does not exist`);
  }
});
