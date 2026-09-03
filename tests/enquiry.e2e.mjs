/**
 * Buy / Sell enquiries, end to end.
 *
 * This is the only unauthenticated write on the platform, which makes it the
 * one worth being suspicious of. The tests are mostly attempts to abuse it:
 * inject a lead deep in someone's pipeline, assign it to a stranger, point it
 * at a draft listing, or simply flood an agent's queue.
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
let pass = 0, fail = 0;
const check = (ok, l, d = "") => { ok ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  → ${d}`)); };

const post = async (p, b) => {
  const r = await fetch(BASE + p, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
async function staff(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: P }),
  });
  const c = (r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; ");
  return { get: async (p) => { const x = await fetch(BASE + p, { headers: { Cookie: c } });
                               return { status: x.status, json: await x.json().catch(() => null) }; } };
}
const uniq = () => `e2e${Math.floor(Math.random() * 1e9)}@example.com`;

console.log("THE PAGE EXISTS AT ALL");
const feed = await (await fetch(`${BASE}/public/listings?kind=SALE`)).json();
check(feed.listings.length >= 1, "there is property for sale to browse", `${feed.listings?.length}`);
const forSale = feed.listings[0];
check(forSale.priceUnit === "total", "priced as a total, not per night", forSale?.priceUnit);

console.log("\nA BUYER CAN ASK WITHOUT AN ACCOUNT");
const buy = await post("/public/enquiries", {
  intent: "buy", name: "Test Buyer", email: uniq(), listingId: forSale.id,
  city: "Nairobi", budget: 50_000_000, message: "Is the title deed ready?",
});
check(buy.status === 201, "a buyer enquiry is accepted", JSON.stringify(buy.json?.error));
check(buy.json.received === true && buy.json.intent === "buy", "and acknowledged");
// Returning an id would let anyone enumerate the pipeline by submitting forms.
check(!JSON.stringify(buy.json).includes("id"), "no lead id comes back", JSON.stringify(buy.json));

console.log("\nA SELLER CAN TOO");
const sell = await post("/public/enquiries", {
  intent: "sell", name: "Test Seller", phone: "+254 700 000 001",
  propertyType: "House", city: "Mombasa", budget: 20_000_000,
});
check(sell.status === 201, "a seller enquiry is accepted", JSON.stringify(sell.json?.error));
check(/call you/i.test(sell.json.message), "with a reply that says what happens next", sell.json?.message);

console.log("\nWHAT THE FORM CANNOT DO");
check((await post("/public/enquiries", { name: "X", email: uniq() })).status === 400,
  "an enquiry with no intent is refused");
check((await post("/public/enquiries", { intent: "buy", email: uniq() })).status === 400,
  "one with no name is refused");
check((await post("/public/enquiries", { intent: "buy", name: "X" })).status === 400,
  "and one with no way to reply at all");
check((await post("/public/enquiries", { intent: "buy", name: "X", email: "not-an-email" })).status === 400,
  "a malformed email is refused");
check((await post("/public/enquiries", { intent: "steal", name: "X", email: uniq() })).status === 400,
  "an invented intent is refused");

// A draft was never public, so an enquiry naming one is stale or probing.
// The Diani draft belongs to the other tenant, so it is their owner who can
// see it. Fetched rather than assumed, so this assertion cannot silently skip.
const salimForDraft = await staff("owner@coastalliving.co.ke");
const drafts = (await salimForDraft.get("/listings?status=DRAFT")).json.listings ?? [];
check(drafts.length > 0, "there is an unpublished draft to probe with", `${drafts.length}`);
const d = await post("/public/enquiries", {
  intent: "buy", name: "Prober", email: uniq(), listingId: drafts[0].id,
});
check(d.status === 400, "an enquiry about an unpublished draft is refused", `${d.status}`);
check((await post("/public/enquiries", { intent: "buy", name: "Prober", email: uniq(), listingId: "made-up" })).status === 400,
  "and so is one about a listing that does not exist");

console.log("\nTHE CLIENT CANNOT PLACE ITS OWN LEAD IN THE PIPELINE");
const em = uniq();
await post("/public/enquiries", {
  intent: "buy", name: "Injector", email: em, listingId: forSale.id,
  // Every one of these should be ignored and derived server-side.
  stage: "RESERVED", assignedToId: "someone-else", orgId: "another-tenant",
  source: "forged", lostReason: "nope",
});
const mgr = await staff("joseph.kamau@paltas.co.ke");
const injected = (await mgr.get("/leads")).json.leads.find((l) => l.email === em);
check(!!injected, "the lead arrived");
check(injected.stage === "NEW", "at NEW, not the stage the form asked for", injected?.stage);
check(injected.assignedToId === null, "unassigned — nobody is claimed as its owner", `${injected?.assignedToId}`);
check(/Buy enquiry/.test(injected.source ?? ""), "with a source set by the server", injected?.source);

console.log("\nIT ROUTES TO WHOEVER HOLDS THE PROPERTY");
check(!!(await mgr.get("/leads")).json.leads.find((l) => l.email === em),
  "an enquiry about a listing reaches that organisation's pipeline");
const salim = await staff("owner@coastalliving.co.ke");
check(!(await salim.get("/leads")).json.leads.some((l) => l.email === em),
  "and not the other tenant's");

console.log("\nIT CANNOT BE USED TO FLOOD A PIPELINE");
const flood = uniq();
const results = [];
for (let i = 0; i < 7; i++) {
  results.push((await post("/public/enquiries", { intent: "buy", name: "Flooder", email: flood })).status);
}
check(results.filter((s) => s === 201).length <= 5, "at most five per hour from one address",
  results.join(","));
check(results.includes(429), "and the rest are rate limited, with a polite message", results.join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
