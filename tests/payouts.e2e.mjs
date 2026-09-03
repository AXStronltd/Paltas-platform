/**
 * Payouts, end to end, against a live server and a real database.
 *
 * The pure suite proves the ledger arithmetic. This one proves the things
 * arithmetic cannot: that a host's payout statement is private to their own
 * organisation, that the run endpoint is invisible to everyone but Paltas
 * staff, that a booking nobody paid for owes nobody anything, and that the
 * statement answers the question a host actually asks — how much, in what
 * currency, and when.
 *
 * No money is moved here. Stripe is not configured in test, and the run
 * endpoint says so rather than pretending; the ledger is exercised through the
 * database, which is where the expensive mistakes live.
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
let pass = 0, fail = 0;
const check = (ok, l, d = "") => { ok ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  → ${d}`)); };

function client(cookie = "") {
  const call = async (m, p, b) => {
    const r = await fetch(BASE + p, {
      method: m,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(b ? { "Content-Type": "application/json" } : {}) },
      body: b ? JSON.stringify(b) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b) };
}

async function staff(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: P }),
  });
  return client((r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; "));
}

const anon = client();

console.log("A HOST CAN SEE WHAT THEY ARE OWED");
const owner = await staff("owner@paltas.co.ke");
const mine = await owner.get("/payouts");
check(mine.status === 200, "an owner can read their payout statement", `${mine.status}`);
check(Array.isArray(mine.json?.balances), "with balances by currency");
check(Array.isArray(mine.json?.earnings), "and the earnings behind them");
check(Array.isArray(mine.json?.payouts), "and what has actually been sent");

console.log("\nIT ANSWERS THE QUESTION A HOST ACTUALLY ASKS");
check(typeof mine.json?.policy?.holdDays === "number",
  "the hold is stated, not implied", JSON.stringify(mine.json?.policy));
check(mine.json?.account && "connected" in mine.json.account && "payoutsEnabled" in mine.json.account,
  "and whether an account can receive money at all", JSON.stringify(mine.json?.account));
for (const e of mine.json?.earnings ?? []) {
  if (e.status !== "HELD") continue;
  check(Boolean(e.payableFrom), `a held earning states when it is payable`, JSON.stringify(e));
  break;
}
for (const b of mine.json?.balances ?? []) {
  check(typeof b.currency === "string" && b.currency.length === 3,
    "every balance names its currency", JSON.stringify(b));
  check(b.held >= 0 && b.payable >= 0 && b.paid >= 0, "and none of them is negative", JSON.stringify(b));
}

console.log("\nTHE ARITHMETIC IS THE SAME ARITHMETIC");
for (const e of (mine.json?.earnings ?? []).slice(0, 5)) {
  check(e.net === e.gross - e.platformFee, "net is gross less the stated fee", JSON.stringify(e));
  check(e.platformFee >= 0 && e.platformFee <= e.gross,
    "and the fee is never more than the guest paid", JSON.stringify(e));
}

console.log("\nA STATEMENT IS PRIVATE TO ITS OWN ORGANISATION");
const salim = await staff("owner@coastalliving.co.ke");
const theirs = await salim.get("/payouts");
check(theirs.status === 200, "the other tenant reads their own");
const myRefs = new Set((mine.json?.earnings ?? []).map((e) => e.bookingReference).filter(Boolean));
const theirRefs = (theirs.json?.earnings ?? []).map((e) => e.bookingReference).filter(Boolean);
check(!theirRefs.some((r) => myRefs.has(r)),
  "and sees not one of the other's bookings", theirRefs.join(", "));

console.log("\nMONEY IS NOT A PUBLIC ENDPOINT");
check((await anon.get("/payouts")).status === 401, "a stranger is refused the statement");
const anonRun = await anon.post("/platform/payouts/run", {});
check(anonRun.status === 401 || anonRun.status === 404,
  "and cannot reach the payout run", `${anonRun.status}`);

console.log("\nONLY PALTAS STAFF CAN MOVE MONEY");
// 404, not 403: a stranger should not learn that a payout run exists.
const ownerRun = await owner.post("/platform/payouts/run?dry=1", {});
check(ownerRun.status === 404,
  "an owner is told the run does not exist, not that they are forbidden", `${ownerRun.status}`);

const admin = await staff("admin@paltas.com");
const run = await admin.post("/platform/payouts/run?dry=1", {});
check([200, 503].includes(run.status),
  "platform staff reach it — 503 while Stripe is unconfigured, which is honest", `${run.status}`);
if (run.status === 200) {
  check(run.json.dryRun === true, "a dry run says so");
  check(Array.isArray(run.json.sent) && Array.isArray(run.json.withheld),
    "and reports both what would go and what would not");
  for (const w of run.json.withheld ?? []) {
    check(typeof w.reason === "string" && w.reason.length > 0,
      "withheld money always states why", JSON.stringify(w));
  }
}

console.log("\nAN UNPAID BOOKING OWES NOBODY ANYTHING");
// The invariant: earnings come from payments, not from bookings. A booking
// nobody has paid for must not appear as money owed to a host.
const refs = (mine.json?.earnings ?? []).map((e) => e.bookingReference);
const bookings = await owner.get("/bookings");
const unpaid = (bookings.json?.bookings ?? []).filter((b) => b.status === "PENDING");
check(!unpaid.some((b) => refs.includes(b.reference)),
  "a pending booking is not on the ledger",
  unpaid.map((b) => b.reference).join(", "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
