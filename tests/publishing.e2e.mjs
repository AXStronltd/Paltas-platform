/**
 * Marketplace publishing and Stripe payments, end to end.
 *
 * Includes the checks that matter most for money: that an unsigned or forged
 * webhook is rejected, and that a guard is refused before learning anything
 * about the payment configuration.
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
let pass = 0, fail = 0;
const check = (ok, l, d = "") => { ok ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  → ${d}`)); };
async function s(email) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: P }) });
  const c = (r.headers.getSetCookie() ?? []).map(x => x.split(";")[0]).join("; ");
  const call = async (m, p, b) => { const x = await fetch(BASE + p, { method: m, headers: { Cookie: c, ...(b ? { "Content-Type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: x.status, json: await x.json().catch(() => null) }; };
  return { get: p => call("GET", p), post: (p, b) => call("POST", p, b) };
}

const owner = await s("owner@paltas.co.ke");
const mgr = await s("joseph.kamau@paltas.co.ke");
const guard = await s("john.mutiso@paltas.co.ke");
const admin = await s("admin@paltas.com");

console.log("PUBLISHING");
const ls = await owner.get("/listings");
const adminLs = await admin.get("/listings");
// Asserted as a relationship rather than a fixed count, so adding a listing to
// the seed does not silently turn an isolation test into a counting test.
check(ls.status === 200 && ls.json.listings.length > 0, "owner sees their own org's listings", `${ls.json.listings?.length}`);
check(ls.json.listings.every((l) => !/Diani Palms/.test(l.title)), "and none of the other tenant's");
check(adminLs.json.listings.length > ls.json.listings.length, "platform admin sees more — both tenants'",
  `${adminLs.json.listings?.length} vs ${ls.json.listings?.length}`);
check(adminLs.json.listings.some((l) => /Diani Palms/.test(l.title)), "including the other tenant's draft");
check((await guard.get("/listings")).status === 403, "a guard cannot see listings");
check((await mgr.get("/listings")).status === 200, "a property manager can");

const props = (await mgr.get("/properties")).json.properties;
// A draft may be incomplete — you are still writing it. The gate is at publish.
const stub = await mgr.post("/listings", {
  propertyId: props[0].id, title: "Test unit", description: "short", price: 30000,
});
check(stub.status === 201, "a stub draft is allowed — it is still being written", `${stub.status}`);
const publishStub = await owner.post(`/listings/${stub.json.listing.id}/publish`, { action: "publish" });
check(publishStub.status === 400 && /40 characters/.test(publishStub.json?.error?.message ?? ""),
  "but publishing it is refused for want of a real description", publishStub.json?.error?.message);
const empty = await mgr.post("/listings", { propertyId: props[0].id, title: "No copy", price: 1000 });
check(empty.status === 400, "and a listing with no description at all is refused outright", `${empty.status}`);

const good = await mgr.post("/listings", {
  propertyId: props[0].id, title: "Studio near the gate",
  description: "A compact studio on the ground floor of Block B, with borehole water and backup power throughout.",
  kind: "RENT", price: 32000,
});
check(good.status === 201, "a complete draft is accepted", JSON.stringify(good.json?.error));
check(good.json.listing.status === "DRAFT", "and starts as a draft, never live", good.json.listing?.status);

const mgrPublish = await mgr.post(`/listings/${good.json.listing.id}/publish`, { action: "publish" });
check(mgrPublish.status === 403, "the manager cannot publish — that is the owner's call", `${mgrPublish.status}`);

const noPhoto = await owner.post(`/listings/${good.json.listing.id}/publish`, { action: "publish" });
check(noPhoto.status === 400 && /photograph/i.test(noPhoto.json?.error?.message ?? ""),
  "publishing without a photograph is refused, and says so", noPhoto.json?.error?.message);

console.log("\nPUBLIC MARKETPLACE FEED");
const pub = await fetch(`${BASE}/public/listings`);
const feed = await pub.json();
check(pub.status === 200, "readable without signing in");
// The invariant is that no draft escapes — not that there is exactly one row.
check(!feed.listings.some((l) => /Diani Palms/.test(l.title)), "the unpublished draft is not exposed",
  feed.listings.map((l) => l.title).join(" | "));
const kilimani = feed.listings.find((l) => l.title.includes("Kilimani"));
check(!!kilimani, "the published listing is", feed.listings.map((l) => l.title).join(" | "));
check(kilimani.priceUnit === "per month", "price unit is stated, not guessed", kilimani?.priceUnit);
check(feed.listings.find((l) => l.kind === "STAY")?.priceUnit === "per night", "and differs by kind");
const blob = JSON.stringify(feed);
check(!blob.includes("orgId") && !blob.includes("unitId"), "no tenant or internal ids leak");
// "Diani" alone is a place several published listings are in; the draft is
// identified by its full title so a legitimate listing cannot fail this.
check(!blob.includes("createdById") && !blob.includes("Diani Palms"), "no drafts and no internal authorship leak");

console.log("\nPAYMENTS");
const settle = await owner.get("/payments/settlements");
check(settle.status === 200, "the owner can read settlements");
check(settle.json.mode === "unconfigured", "Stripe reports unconfigured with no key set", settle.json?.mode);
check((await guard.get("/payments/settlements")).status === 403, "a guard cannot");

const charges = (await owner.get("/finance/charges")).json.charges;
const owing = charges.find(c => c.balance > 0);
const intent = await owner.post("/payments/intent", { purpose: "charge", chargeId: owing.id });
check(intent.status === 503, "starting a payment with no key returns a clear 503, not a crash", `${intent.status}`);
check(/STRIPE_SECRET_KEY/.test(intent.json?.error?.message ?? ""), "naming the variable to set", intent.json?.error?.message);
check((await guard.post("/payments/intent", { purpose: "charge", chargeId: owing.id })).status === 403,
  "and a guard is refused before any of that");

// The webhook must reject anything it cannot verify.
const unsigned = await fetch(`${BASE}/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "evt_fake", type: "payment_intent.succeeded", data: { object: { id: "pi_fake", status: "succeeded", amount: 999999 } } }) });
check(unsigned.status === 400, "an unsigned webhook is rejected", `${unsigned.status}`);
const badSig = await fetch(`${BASE}/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" }, body: "{}" });
check(badSig.status === 400, "and so is a forged signature", `${badSig.status}`);



console.log("\nSTRIPE CONNECT");
{
  const connectOwner = await s("owner@paltas.co.ke");
  const st = await connectOwner.get("/payments/connect");
  check(st.status === 200, "the owner can read payout status", `${st.status}`);
  check(st.json.connected === false, "not connected until they onboard", `${st.json?.connected}`);
  check(st.json.mode === "unconfigured", "and reports the server has no key", st.json?.mode);
  check(st.json.platformFeeBasisPoints === 0, "with the platform fee stated", `${st.json?.platformFeeBasisPoints}`);

  const start = await connectOwner.post("/payments/connect", {});
  check(start.status === 503, "onboarding cannot start without a key, and says so", `${start.status}`);

  const mgrConnect = await s("joseph.kamau@paltas.co.ke");
  check((await mgrConnect.get("/payments/connect")).status === 403,
    "a property manager cannot touch payout settings");
  const guardConnect = await s("john.mutiso@paltas.co.ke");
  check((await guardConnect.post("/payments/connect", {})).status === 403,
    "and neither can a guard");

  // account.updated must be signature-verified like every other webhook.
  const forged = await fetch(`${BASE}/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=00" },
    body: JSON.stringify({ id: "evt_x", type: "account.updated", data: { object: { id: "acct_fake", charges_enabled: true } } }),
  });
  check(forged.status === 400, "a forged account.updated cannot switch payouts on", `${forged.status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
