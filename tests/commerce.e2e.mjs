/**
 * Discounts, campaigns, group bookings with split payments, and the public
 * shopfront. Requires a freshly seeded database and a running server.
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
let pass = 0, fail = 0;
const check = (ok, l, d = "") => { ok ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  → ${d}`)); };
async function s(email) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: P }) });
  if (!r.ok) throw new Error(`${email}: ${r.status}`);
  const c = (r.headers.getSetCookie() ?? []).map(x => x.split(";")[0]).join("; ");
  const call = async (m, p, b) => { const x = await fetch(BASE + p, { method: m, headers: { Cookie: c, ...(b ? { "Content-Type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: x.status, json: await x.json().catch(() => null) }; };
  return { get: p => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b), del: p => call("DELETE", p) };
}

console.log("DISCOUNTS & CAMPAIGNS");
const owner = await s("owner@paltas.co.ke");
const mgr = await s("joseph.kamau@paltas.co.ke");
const guard = await s("john.mutiso@paltas.co.ke");
const acct = await s("david.omondi@paltas.co.ke");

const d = await owner.get("/discounts");
check(d.status === 200 && d.json.discounts.length === 5, "5 discounts seeded", `${d.json.discounts?.length}`);
const live = d.json.discounts.filter(x => x.live);
check(live.length === 4, "4 currently live (the long-stay rule starts next week)", `${live.length}`);
const grp = d.json.discounts.find(x => x.name === "Group of 8 or more");
check(grp.label === "12% off" && grp.minGuests === 8, "group rule reads correctly", `${grp.label} @ ${grp.minGuests}`);

const c = await owner.get("/campaigns");
check(c.json.campaigns.length === 2, "2 campaigns", `${c.json.campaigns?.length}`);
check(c.json.campaigns.find(x => x.status === "LIVE"), "one is live");

check((await mgr.get("/discounts")).status === 200, "property manager may read discounts");

// Joseph is scoped to one property, so his commercial reach stops there too.
const mgrProps = (await mgr.get("/properties")).json.properties;
const kilimani = mgrProps[0];
const scoped = await mgr.post("/discounts", { propertyId: kilimani.id, name: "Kilimani weekday rate", value: 7, kind: "SEASONAL" });
check(scoped.status === 201, "and create one for his own property", `${scoped.status} ${JSON.stringify(scoped.json?.error)}`);
const orgWide = await mgr.post("/discounts", { name: "Everywhere", value: 5, kind: "SEASONAL" });
check(orgWide.status === 403, "but an organisation-wide discount is refused — that is the owner's call", `${orgWide.status}`);

check((await guard.get("/discounts")).status === 403, "a guard may not read discounts at all");
check((await acct.get("/discounts")).status === 200, "an accountant may read");
check((await acct.post("/discounts", { propertyId: kilimani.id, name: "X", value: 5 })).status === 403, "but not create");

// Publishing is a distinct permission from editing.
const propCampaign = await mgr.post("/campaigns", { propertyId: kilimani.id, name: "Kilimani winter", startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30 * 864e5).toISOString() });
check(propCampaign.status === 201, "manager drafts a campaign for his property", `${propCampaign.status}`);
const rename = await mgr.patch(`/campaigns/${propCampaign.json.campaign.id}`, { name: "Kilimani winter 2027" });
check(rename.status === 200, "and may edit his own draft", `${rename.status}`);
const emptyPublish = await owner.patch(`/campaigns/${propCampaign.json.campaign.id}`, { status: "LIVE" });
check(emptyPublish.status === 400, "publishing a campaign with no discounts is refused", `${emptyPublish.status}`);

const orgDraft = c.json.campaigns.find(x => x.status === "DRAFT");
const reachUp = await mgr.patch(`/campaigns/${orgDraft.id}`, { name: "nope" });
check(reachUp.status === 403, "and cannot reach an organisation-wide campaign", `${reachUp.status}`);

const bad = await owner.post("/discounts", { name: "Bad", value: 150, valueType: "PERCENTAGE" });
check(bad.status === 400, "a percentage over 100 is refused", `${bad.status}`);
const noThreshold = await owner.post("/discounts", { name: "Vague group", value: 10, kind: "GROUP" });
check(noThreshold.status === 400, "a group discount with no group size is refused", `${noThreshold.status}`);

console.log("\nGROUP BOOKING & SPLIT PAYMENTS");
const g = await owner.get("/groups");
check(g.status === 200 && g.json.groups.length === 1, "seeded group present");
const party = g.json.groups[0];
check(party.guests === 12 && party.members.length === 12, "12 travellers", `${party.guests}/${party.members.length}`);
check(party.discountName === "Group of 8 or more", "the 8+ rule was applied", party.discountName);
check(party.discountAmount === Math.round(party.totalAmount * 0.12), "12% taken off", `${party.discountAmount}`);
check(party.members.reduce((a, m) => a + m.shareAmount, 0) === party.payable,
  "shares sum exactly to the amount payable", `${party.members.reduce((a, m) => a + m.shareAmount, 0)} vs ${party.payable}`);
check(party.percentCollected === 33, "4 of 12 paid → 33% collected", `${party.percentCollected}%`);

const early = await owner.post(`/groups/${party.id}/confirm`);
check(early.status === 409, "cannot confirm while shares are outstanding", `${early.status}`);

// Pay the rest, then confirm.
for (const m of party.members.filter(m => m.shareStatus !== "PAID")) {
  await owner.patch(`/groups/${party.id}/members`, { memberId: m.id, reference: "E2E" });
}
const after = await owner.get(`/groups/${party.id}`);
check(after.json.group.percentCollected === 100, "all shares collected", `${after.json.group.percentCollected}%`);
const confirmed = await owner.post(`/groups/${party.id}/confirm`);
check(confirmed.status === 200 && confirmed.json.group.status === "CONFIRMED", "now it confirms", `${confirmed.status}`);

const redeemed = (await owner.get("/discounts")).json.discounts.find(x => x.name === "Group of 8 or more");
check(redeemed.redemptionCount === 1, "redemption counted only on confirmation", `${redeemed.redemptionCount}`);

// A new group picks the better of two applicable rules.
const big = await owner.post("/groups", {
  name: "Large Hajj party", purpose: "HAJJ", destination: "Makkah",
  organiserName: "Test Organiser", guests: 25, unitsRequested: 8, totalAmount: 1000000,
  members: Array.from({ length: 5 }, (_, i) => ({ name: `Traveller ${i + 1}` })),
});
check(big.status === 201, "opens a 25-guest group", JSON.stringify(big.json?.error));
check(big.json.group.discountName === "Group of 20 or more", "picks the better 20+ rule, not the 8+ one", big.json.group?.discountName);
check(big.json.group.discountAmount === 180000, "18% off", `${big.json.group?.discountAmount}`);
check(big.json.group.members.reduce((a, m) => a + m.shareAmount, 0) === big.json.group.payable, "5-way split is exact");

check((await guard.get("/groups")).status === 403, "a guard cannot see group bookings");

console.log("\nPUBLIC SHOPFRONT");
const pubRes = await fetch(`${BASE}/public/offers`);
const offers = await pubRes.json();
check(pubRes.status === 200, "offers are readable without signing in");
check(offers.offers.length === 1, "only the LIVE campaign is exposed", `${offers.offers?.length}`);
check(offers.offers[0].name === "Hajj & Umrah season", "the right one", offers.offers[0]?.name);
check(!JSON.stringify(offers).includes("redemptionCount"), "no internal counters leak");
check(!JSON.stringify(offers).includes("orgId"), "no tenant identifiers leak");
check(offers.offers[0].offers.some(o => o.conditions.includes("8+ guests")), "conditions stated up front");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
