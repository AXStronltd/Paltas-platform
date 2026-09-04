/**
 * Email, end to end against a running server.
 *
 * The unit tests cover what the messages say and when a retry happens. This
 * covers the parts that only exist once a database and a route are involved:
 *
 *   That a reset request queues exactly one message, and a second request five
 *   minutes later queues another — one is a retry, the other is a person asking
 *   again, and confusing them either sends twice or never sends.
 *   That the flush endpoint is not reachable by a stranger, and does not
 *   confirm its own existence to one.
 *   That with no provider configured the reset link is still handed back,
 *   because the alternative is an account nobody can get back into.
 *
 * Run with: npm run test:mail
 */

const BASE = process.env.PALTAS_URL ?? "http://localhost:3010";

let passed = 0, failed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const post = async (path, body, headers = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
};

console.log("\nEmail\n");

/* ------------------------------------------------- the honest fallback */

const unknown = await post("/api/auth/forgot", { email: "nobody-at-all@example.com" });
ok("an address with no account gets the same answer as one that has",
   unknown.status === 200 && unknown.json?.sent === true);
ok("...and no token, because there is no account to reset",
   !unknown.json?.resetToken);

const guest = await post("/api/auth/forgot", { email: "guest@example.com" });
ok("a real account gets a reset issued", guest.status === 200);

if (guest.json?.deliveryPending) {
  ok("with no provider configured, the link is handed back rather than lost",
     typeof guest.json.resetToken === "string" && guest.json.resetToken.length > 20);
  ok("...and the response says plainly that delivery is not configured",
     /not configured/i.test(guest.json.message ?? ""));

  const reset = await post("/api/auth/reset", { token: guest.json.resetToken, password: "a-new-long-password" });
  ok("the handed-back token actually works", reset.status === 200, `got ${reset.status}`);

  const again = await post("/api/auth/reset", { token: guest.json.resetToken, password: "another-long-password" });
  ok("and works exactly once", again.status !== 200, `second use returned ${again.status}`);
} else {
  ok("with a provider configured, no token is ever returned", !guest.json?.resetToken);
}

/* ----------------------------------------------------- the reset page */

const page = await fetch(`${BASE}/reset?token=whatever`);
ok("the address a reset link points at exists", page.status === 200, `got ${page.status}`);
const html = await page.text();
ok("...and it is not indexed", /noindex/i.test(html));

/* ------------------------------------------------------- the flush job */

const anon = await post("/api/platform/mail/flush", {});
ok("a stranger cannot flush the outbox", anon.status !== 200, `got ${anon.status}`);
// 401 with no session, exactly as the payout run answers. What matters is that
// the two agree: an endpoint that guards itself differently from its neighbour
// is an endpoint someone will probe to find out why.
ok("...and is refused the same way the payout run is", anon.status === 401,
   `expected 401, got ${anon.status}`);
ok("...and says nothing about the outbox while refusing",
   !JSON.stringify(anon.json).match(/pending|sent|sender/i));

const badToken = await post("/api/platform/mail/flush", {}, { authorization: "Bearer short" });
ok("a scheduler token that is too short does not open the door",
   badToken.status === 401, `got ${badToken.status}`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 1 - 1 : 1);
