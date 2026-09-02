/**
 * Leads, viewings and developments, end to end.
 *
 * The things worth asserting here are the ones a CRM gets wrong: a closed deal
 * quietly reopening, revenue computed from asking prices rather than what was
 * agreed, a lead lost with no reason recorded, and one tenant reading another's
 * pipeline.
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
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b),
           patch: (p, b) => call("PATCH", p, b), del: (p) => call("DELETE", p) };
}
async function staff(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: P }),
  });
  return client((r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; "));
}
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

const anon = client();
const mgr = await staff("joseph.kamau@paltas.co.ke");
const owner = await staff("owner@paltas.co.ke");
const guard = await staff("john.mutiso@paltas.co.ke");
const accountant = await staff("david.omondi@paltas.co.ke");
const salim = await staff("owner@coastalliving.co.ke");

console.log("WHO CAN SEE THE PIPELINE");
check((await anon.get("/leads")).status === 401, "not the public");
check((await guard.get("/leads")).status === 403, "not a security guard");
check((await mgr.get("/leads")).status === 200, "a property manager can");
check((await accountant.get("/leads")).status === 200, "and an accountant, to forecast");

const seeded = await mgr.get("/leads");
check(seeded.json.leads.length >= 7, "the seeded pipeline is there", `${seeded.json.leads?.length}`);
check((await salim.get("/leads")).json.leads.length === 0, "the other tenant sees none of it");

console.log("\nPIPELINE VALUE EXCLUDES WHAT IS NO LONGER IN PLAY");
const open = seeded.json.leads.filter((l) => l.stage !== "CLOSED" && l.stage !== "LOST");
const expected = open.reduce((t, l) => t + (l.budget ?? 0), 0);
check(seeded.json.pipelineValue === expected, "open leads only", `${seeded.json.pipelineValue} vs ${expected}`);
check(seeded.json.leads.some((l) => l.stage === "CLOSED"), "even though closed deals exist");
check(seeded.json.leads.some((l) => l.stage === "LOST"), "and lost ones too");

console.log("\nCREATING A LEAD");
check((await mgr.post("/leads", { name: "No Contact" })).status === 400,
  "a lead with no phone or email is refused — it could never be followed up");
check((await mgr.post("/leads", { phone: "+254 700 000 000" })).status === 400, "and one with no name");
check((await accountant.post("/leads", { name: "X", phone: "+254 1" })).status === 403,
  "an accountant can read the pipeline but not add to it");

const made = await mgr.post("/leads", {
  name: "E2E Buyer", phone: "+254 700 123 456", interestedIn: "2-bed", budget: 12_000_000,
});
check(made.status === 201, "a complete lead is accepted", JSON.stringify(made.json?.error));
check(made.json.lead.stage === "NEW", "starting at NEW", made.json.lead?.stage);
check(!!made.json.lead.assignedToId, "assigned to whoever logged it — an unowned lead is one nobody chases");
const leadId = made.json.lead.id;

console.log("\nTHE PIPELINE IS ORDERED");
check((await mgr.patch(`/leads/${leadId}`, { stage: "CONTACTED" })).status === 200, "NEW → CONTACTED");
check((await mgr.patch(`/leads/${leadId}`, { stage: "OFFER" })).status === 200, "and forward again");
// Deals genuinely do slip backwards; that is allowed.
check((await mgr.patch(`/leads/${leadId}`, { stage: "VIEWING" })).status === 200,
  "a deal may slip backwards — that happens");
check((await mgr.patch(`/leads/${leadId}`, { stage: "NONSENSE" })).status === 400, "an invented stage is refused");

const noReason = await mgr.patch(`/leads/${leadId}`, { stage: "LOST" });
check(noReason.status === 400, "losing a lead requires a reason", `${noReason.status}`);
const lost = await mgr.patch(`/leads/${leadId}`, { stage: "LOST", lostReason: "Bought elsewhere." });
check(lost.status === 200 && lost.json.lead.lostReason === "Bought elsewhere.", "recorded with the reason");
check(!!lost.json.lead.closedAt, "and stamped");

const reopen = await mgr.patch(`/leads/${leadId}`, { stage: "NEW" });
check(reopen.status === 409, "a lost lead cannot be reopened — log a new enquiry instead", `${reopen.status}`);

console.log("\nVIEWINGS");
const fresh = await mgr.post("/leads", { name: "Viewing Tester", phone: "+254 700 999 888" });
const vlead = fresh.json.lead.id;
check((await guard.post("/viewings", { clientName: "X", scheduledAt: day(1) })).status === 403,
  "a guard cannot book viewings");
check((await mgr.post("/viewings", { clientName: "X" })).status === 400, "a viewing needs a time");
check((await mgr.post("/viewings", { scheduledAt: day(1) })).status === 400, "and a client or a lead");

const booked = await mgr.post("/viewings", { leadId: vlead, scheduledAt: day(2) });
check(booked.status === 201, "a viewing is booked", JSON.stringify(booked.json?.error));
check(booked.json.viewing.clientName === "Viewing Tester", "taking the client's name from the lead");

// Booking a viewing is evidence the lead moved on; the stage should follow.
const after = await mgr.get(`/leads/${vlead}`);
check(after.json.lead.stage === "VIEWING", "and the lead advances to VIEWING automatically", after.json.lead?.stage);

const vid = booked.json.viewing.id;
check((await mgr.patch(`/viewings/${vid}`, { status: "COMPLETED", outcome: "Liked it." })).status === 200,
  "the outcome is recorded");
check((await mgr.patch(`/viewings/${vid}`, { status: "SCHEDULED" })).status === 409,
  "a finished viewing cannot be reopened — the diary is a record, not a draft");
check((await mgr.patch(`/viewings/${vid}`, { scheduledAt: day(9) })).status === 409, "nor moved");

console.log("\nDEVELOPMENTS");
check((await guard.get("/projects")).status === 403, "a guard cannot see developments");
const projects = await mgr.get("/projects");
check(projects.status === 200 && projects.json.projects.length >= 1, "the seeded development is there");
const riverside = projects.json.projects.find((p) => p.name.includes("Riverside"));
check(!!riverside, "Riverside Gardens");
check(riverside.totalUnits === 12, "with its unit stock", `${riverside?.totalUnits}`);
check(riverside.sold === 2 && riverside.reserved === 1, "2 sold, 1 reserved",
  `${riverside?.sold}/${riverside?.reserved}`);

console.log("\nREVENUE IS WHAT WAS AGREED, NOT WHAT WAS ASKED");
const stock = await mgr.get(`/projects/${riverside.id}/units`);
const soldUnits = stock.json.units.filter((u) => u.status === "SOLD");
const agreedTotal = soldUnits.reduce((t, u) => t + (u.agreedPrice ?? u.price), 0);
const askingTotal = soldUnits.reduce((t, u) => t + u.price, 0);
check(riverside.revenue === agreedTotal, "revenue sums the agreed prices", `${riverside.revenue} vs ${agreedTotal}`);
check(agreedTotal !== askingTotal, "which differs from the asking total — one unit was discounted",
  `agreed ${agreedTotal}, asking ${askingTotal}`);
check(riverside.remainingValue === stock.json.units.filter((u) => u.status !== "SOLD")
  .reduce((t, u) => t + u.price, 0), "and unsold stock is valued at asking, separately");

console.log("\nSELLING A UNIT");
const available = stock.json.units.find((u) => u.status === "AVAILABLE");
check((await mgr.post(`/projects/${riverside.id}/units`, { unitNo: "FREE", price: 0 })).status === 400,
  "a unit priced at zero is refused, not defaulted");
check((await accountant.patch(`/project-units/${available.id}`, { action: "sell", buyerName: "X" })).status === 403,
  "an accountant cannot record a sale");
check((await mgr.patch(`/project-units/${available.id}`, { action: "sell" })).status === 400,
  "a sale requires the buyer's name");

const sold = await mgr.patch(`/project-units/${available.id}`,
  { action: "sell", buyerName: "E2E Buyer", agreedPrice: available.price - 500_000 });
check(sold.status === 200 && sold.json.unit.status === "SOLD", "a unit is sold");
check(sold.json.unit.agreedPrice === available.price - 500_000, "at the agreed figure, not the asking one");
check(!!sold.json.unit.soldAt, "and stamped");
check((await mgr.patch(`/project-units/${available.id}`, { action: "sell", buyerName: "Someone Else" })).status === 409,
  "and cannot be sold twice");

const reserved = stock.json.units.find((u) => u.status === "RESERVED");
const released = await mgr.patch(`/project-units/${reserved.id}`, { action: "release" });
check(released.status === 200 && released.json.unit.status === "AVAILABLE", "a reservation can be released");
check(released.json.unit.buyerName === null,
  "which clears the buyer — a name on an available unit reads as still spoken for");

console.log("\nISOLATION");
check((await salim.get("/projects")).json.projects.length === 0, "the other tenant sees no developments");
check((await salim.patch(`/project-units/${available.id}`, { action: "release" })).status === 404,
  "and gets a flat 404 on our units, not a hint they exist");
check((await salim.get(`/leads/${vlead}`)).status === 404, "same for our leads");

console.log("\nTHE TRAIL");
const trail = await owner.get("/audit?limit=200");
const actions = (trail.json.entries ?? trail.json.logs ?? []).map((e) => e.action);
check(actions.includes("lead.create"), "logging a lead is recorded");
check(actions.includes("lead.advance"), "so is moving one");
check(actions.includes("viewing.schedule"), "booking a viewing");
check(actions.includes("project.unit.sell"), "and selling a unit");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
