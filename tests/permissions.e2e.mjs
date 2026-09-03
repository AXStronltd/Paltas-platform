/**
 * End-to-end permission checks against a running PALTAS.
 *
 * Every assertion here is a real HTTP response to a really signed-in account.
 * That matters: the point of the permission model is that it holds at the API,
 * not in the browser, so testing it through the browser's own idea of what is
 * allowed would prove nothing. Each account below signs in for real and is told
 * "no" by the server.
 *
 * Requires a seeded database and a running server:
 *
 *   npm run dev              # serves on :3000 by default
 *   npm run test:e2e         # reseeds, then runs
 *
 * Point it elsewhere with PALTAS_URL=http://localhost:3000
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const PASSWORD = process.env.SEED_PASSWORD || "paltas-demo-2026";

let pass = 0, fail = 0;
const results = [];
function check(ok, label, detail = "") {
  if (ok) { pass++; results.push(`  ✓ ${label}`); }
  else { fail++; results.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`); }
}

async function session(email, password = PASSWORD) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const call = async (method, path, body) => {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch {}
    return { status: r.status, json };
  };
  return {
    email,
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b),
    patch: (p, b) => call("PATCH", p, b),
    put: (p, b) => call("PUT", p, b),
    del: (p) => call("DELETE", p),
  };
}

const line = (t) => results.push(`\n${t}`);

// ---------------------------------------------------------------- OWNER ----
line("OWNER — Amina Yusuf (owner@paltas.co.ke)");
const owner = await session("owner@paltas.co.ke");

const me = await owner.get("/me");
check(me.status === 200 && me.json.user.isOwner === true, "identified as owner");
// Every property in their own organisation and none of anyone else's. The
// count used to be written out as 2, which stopped being the invariant the
// moment the sample catalogue reached beyond Kenya.
check(me.json.properties.length >= 2, "sees the organisation's properties", `saw ${me.json.properties?.length}`);
check(!me.json.properties.some((p) => /Diani Palms/.test(p.name)), "and none of the other tenant's");
check(me.json.permissions.length >= 70, "holds the whole catalogue", `${me.json.permissions?.length} keys`);
check(["finance.view", "audit.view", "property.delete", "staff.permissions.manage", "owner.info.view"]
  .every((p) => me.json.permissions.includes(p)), "including every sensitive permission");

const dash = await owner.get("/owner/dashboard");
check(dash.status === 200, "owner dashboard returns 200");
check(dash.json.financeVisible === true && dash.json.finance !== null, "finance block present for owner");
// Tied to the other endpoint rather than to a literal: the point is that the
// dashboard counts the same portfolio /me reports, whatever size it has grown to.
check(dash.json.portfolio.properties === me.json.properties.length
  && dash.json.portfolio.units === 8, "portfolio totals agree with /me",
  JSON.stringify(dash.json.portfolio));
check(dash.json.security.onSiteVisitors === 2, "2 visitors on site", `saw ${dash.json.security?.onSiteVisitors}`);

const auditOwner = await owner.get("/audit?limit=100");
check(auditOwner.status === 200 && auditOwner.json.entries.length >= 6, "audit trail readable",
  `${auditOwner.json.entries?.length} entries`);
const cardEntry = auditOwner.json.entries.find((e) => e.action === "card.suspend");
check(!!cardEntry && /A204-02/.test(cardEntry.summary), "card suspension entry present", cardEntry?.summary);
check(cardEntry?.before?.status === "ACTIVE" && cardEntry?.after?.status === "SUSPENDED",
  "audit entry records previous and new value",
  JSON.stringify({ before: cardEntry?.before, after: cardEntry?.after }));

const props = await owner.get("/properties");
const kilimani = props.json.properties.find((p) => p.name === "Kilimani Heights");
const nyali = props.json.properties.find((p) => p.name === "Nyali Court");
check(!!kilimani && !!nyali, "owner lists both properties");

const staffList = await owner.get("/staff");
check(staffList.status === 200 && staffList.json.staff.length === 9, "9 accounts in directory",
  `saw ${staffList.json.staff?.length}`);
const john = staffList.json.staff.find((s) => s.email === "john.mutiso@paltas.co.ke");
check(john?.customPermissions.length === 6, "John carries 6 individual grants",
  `${john?.customPermissions?.length}`);

// ------------------------------------------------------- GUARD (custom) ----
line("SECURITY GUARD — John Mutiso, with custom permissions");
const guard = await session("john.mutiso@paltas.co.ke");

const guardMe = await guard.get("/me");
check(guardMe.json.user.isOwner === false, "not an owner");
check(guardMe.json.properties.length === 1 && guardMe.json.properties[0].name === "Kilimani Heights",
  "sees only Kilimani Heights", JSON.stringify(guardMe.json.properties?.map((p) => p.name)));

// ✅ the permissions the brief grants him
const gPerms = guardMe.json.permissions;
for (const p of ["resident.view", "visitor.approve", "visitor.checkin", "visitor.checkout",
                 "pass.verify", "security.incident.view", "security.incident.create"]) {
  check(gPerms.includes(p), `holds ${p}`);
}
// ❌ the permissions the brief denies him
for (const p of ["finance.view", "staff.create", "property.delete", "owner.info.view",
                 "staff.permissions.manage", "audit.view", "owner.dashboard.view"]) {
  check(!gPerms.includes(p), `does NOT hold ${p}`);
}

// The API refuses, not just the UI.
const gFinance = await guard.get("/finance/payments");
check(gFinance.status === 403, "GET /finance/payments → 403", `got ${gFinance.status}`);
check(/permission/i.test(gFinance.json?.error?.message ?? ""), "403 explains itself",
  gFinance.json?.error?.reason ?? gFinance.json?.error?.message);

const gAudit = await guard.get("/audit");
check(gAudit.status === 403, "GET /audit → 403", `got ${gAudit.status}`);
const gDash = await guard.get("/owner/dashboard");
check(gDash.status === 403, "GET /owner/dashboard → 403", `got ${gDash.status}`);
const gStaff = await guard.post("/staff", {
  name: "Sneaky", email: "sneaky@x.co", temporaryPassword: "password123",
  roles: [{ key: "property_manager", scopeType: "PROPERTY", scopeId: kilimani.id }],
});
check(gStaff.status === 403, "POST /staff → 403", `got ${gStaff.status}`);
const gDelete = await guard.del(`/properties/${kilimani.id}`);
check(gDelete.status === 403, "DELETE /properties/:id → 403", `got ${gDelete.status}`);
const gExpense = await guard.post("/finance/expenses", { propertyId: kilimani.id, category: "x", amount: 1 });
check(gExpense.status === 403, "POST /finance/expenses → 403", `got ${gExpense.status}`);

// Cross-property: Nyali is not merely hidden, it is refused.
const gNyali = await guard.get(`/properties/${nyali.id}`);
check(gNyali.status === 403 || gNyali.status === 404, "cannot open Nyali Court", `got ${gNyali.status}`);

// What he CAN do — the gate console path.
const gVisits = await guard.get("/security/visits?status=ON_SITE");
check(gVisits.status === 200 && gVisits.json.visits.length === 2, "sees who is on site",
  `${gVisits.json.visits?.length}`);

const gInv = await guard.get("/security/invitations?propertyId=" + kilimani.id);
check(gInv.status === 200, "reads invitations");
const livePass = gInv.json.invitations.find((i) => i.visitorName === "Mary Njoki");
const futurePass = gInv.json.invitations.find((i) => i.visitorName === "Kevin (Plumber)");
check(!!livePass && !!futurePass, "finds the recurring passes");

const verify = await guard.post("/security/passes/verify", { code: livePass.passCode });
check(verify.status === 200 && verify.json.result === "GRANTED", "in-window pass → GRANTED",
  JSON.stringify({ r: verify.json?.result, why: verify.json?.reason }));

const early = await guard.post("/security/passes/verify", { code: futurePass.passCode });
check(early.json.result === "DENIED" && /not valid until/i.test(early.json.reason ?? ""),
  "pass presented before its window → DENIED", early.json?.reason);

const pendingInv = gInv.json.invitations.find((i) => i.status === "PENDING");
if (pendingInv) {
  const unapproved = await guard.post("/security/passes/verify", { code: pendingInv.passCode });
  check(unapproved.json.result === "DENIED" && /approval/i.test(unapproved.json.reason ?? ""),
    "unapproved invitation → DENIED", unapproved.json?.reason);
}

const bogus = await guard.post("/security/passes/verify", { code: "ZZZZ-9999" });
check(bogus.status === 200 && bogus.json.result === "DENIED", "unknown pass → DENIED");

// Rent is stripped from unit responses for someone without finance permission.
const gUnits = await guard.get("/units?propertyId=" + kilimani.id);
check(gUnits.status === 200 && gUnits.json.rentVisible === false, "units respond with rentVisible:false");
check(gUnits.json.units.every((u) => u.rentAmount === undefined), "no rent figure reaches the guard");

// Resident contact details need their own permission, which the guard lacks.
const gRes = await guard.get("/residents?propertyId=" + kilimani.id);
check(gRes.status === 200 && gRes.json.contactVisible === false, "residents respond with contactVisible:false");
check(gRes.json.residents.every((r) => r.phone === undefined && r.email === undefined),
  "no resident phone or email reaches the guard");

// Suspended card is refused at the gate, with the reason recorded at suspension.
const cardCheck = await guard.post("/security/cards/verify", { cardNumber: "A204-02" });
check(cardCheck.json?.result === "DENIED" && /suspended/i.test(cardCheck.json?.reason ?? ""),
  "suspended card refused with its reason", cardCheck.json?.reason);

// ------------------------------------------------- DATA ISOLATION -----------
line("DATA ISOLATION — two property managers");
const joseph = await session("joseph.kamau@paltas.co.ke");
const hassan = await session("hassan.omar@paltas.co.ke");

const jProps = await joseph.get("/properties");
const hProps = await hassan.get("/properties");
check(jProps.json.properties.length === 1 && jProps.json.properties[0].name === "Kilimani Heights",
  "Joseph sees only Kilimani", JSON.stringify(jProps.json.properties?.map((p) => p.name)));
check(hProps.json.properties.length === 1 && hProps.json.properties[0].name === "Nyali Court",
  "Hassan sees only Nyali", JSON.stringify(hProps.json.properties?.map((p) => p.name)));

const jUnits = await joseph.get("/units");
const hUnits = await hassan.get("/units");
check(jUnits.json.units.every((u) => u.propertyName === "Kilimani Heights"), "Joseph's units are all Kilimani");
check(hUnits.json.units.every((u) => u.propertyName === "Nyali Court"), "Hassan's units are all Nyali");
check(jUnits.json.units.length === 6 && hUnits.json.units.length === 2, "unit counts match the seed",
  `${jUnits.json.units.length} / ${hUnits.json.units.length}`);

const jNyali = await joseph.get(`/properties/${nyali.id}`);
check(jNyali.status === 403, "Joseph refused Nyali by id", `got ${jNyali.status}`);
const hKilimani = await hassan.get(`/properties/${kilimani.id}`);
check(hKilimani.status === 403, "Hassan refused Kilimani by id", `got ${hKilimani.status}`);

// A building-scoped supervisor sees one block, not the property.
const ruth = await session("ruth.chebet@paltas.co.ke");
const rUnits = await ruth.get("/units");
check(rUnits.status === 200 && rUnits.json.units.every((u) => u.buildingName === "Block B"),
  "building-scoped supervisor sees only Block B",
  JSON.stringify([...new Set(rUnits.json.units?.map((u) => u.buildingName))]));
check(rUnits.json.units.length === 2, "Block B has 2 units", `${rUnits.json.units.length}`);

// ------------------------------------------------- ROLE BOUNDARIES ----------
line("ROLE BOUNDARIES — accountant and maintenance");
const acct = await session("david.omondi@paltas.co.ke");
const aPay = await acct.get("/finance/payments");
check(aPay.status === 200, "accountant reads payments");
check(aPay.json.payments.length > 0, "payments returned", `${aPay.json.payments?.length}`);
const aCards = await acct.get("/security/cards");
check(aCards.status === 403, "accountant refused access cards", `got ${aCards.status}`);
const aVisits = await acct.get("/security/visits");
check(aVisits.status === 403, "accountant refused visitor list", `got ${aVisits.status}`);

const maint = await session("alice.nduta@paltas.co.ke");
const mReq = await maint.get("/maintenance");
check(mReq.status === 200 && mReq.json.requests.length > 0, "maintenance reads work orders");
const mPay = await maint.get("/finance/payments");
check(mPay.status === 403, "maintenance refused payments", `got ${mPay.status}`);
const mCards = await maint.get("/security/cards");
check(mCards.status === 403, "maintenance refused access cards", `got ${mCards.status}`);

// ------------------------------------------------- ESCALATION --------------
line("PRIVILEGE ESCALATION & OWNER PROTECTION");
const mercy = await session("mercy.njeri@paltas.co.ke");

// Mercy has staff.view but not staff.create — creating anyone is refused.
const mCreate = await mercy.post("/staff", {
  name: "Test", email: "t1@paltas.co.ke", temporaryPassword: "password123",
  roles: [{ key: "accountant", scopeType: "PROPERTY", scopeId: kilimani.id }],
});
check(mCreate.status === 403, "security manager cannot create staff", `got ${mCreate.status}`);

// The owner CAN create, but not grant beyond their own reach — the owner's reach
// is total, so instead check the rule via a delegate who has staff.create.
const owner2 = await session("owner@paltas.co.ke");
const delegate = await owner2.post("/staff", {
  name: "Limited Admin", email: "limited.admin@paltas.co.ke", temporaryPassword: "password123",
  title: "Office Administrator",
  roles: [{ key: "property_manager", scopeType: "PROPERTY", scopeId: kilimani.id }],
  permissions: [
    { permission: "staff.create", effect: "ALLOW", scopeType: "PROPERTY", scopeId: kilimani.id },
    { permission: "staff.permissions.manage", effect: "ALLOW", scopeType: "PROPERTY", scopeId: kilimani.id },
  ],
});
check(delegate.status === 201, "owner creates a limited administrator", JSON.stringify(delegate.json));

const limited = await session("limited.admin@paltas.co.ke", "password123");
// This delegate has no finance.view of their own beyond the PM role's read-only
// set, and certainly no finance.expense.create — so granting it must be refused.
const escalate = await limited.post("/staff", {
  name: "Puppet", email: "puppet@paltas.co.ke", temporaryPassword: "password123",
  roles: [],
  permissions: [{ permission: "finance.expense.create", effect: "ALLOW", scopeType: "PROPERTY", scopeId: kilimani.id }],
});
check(escalate.status === 403 && escalate.json?.error?.code === "escalation_refused",
  "cannot grant a permission you do not hold", `${escalate.status} ${JSON.stringify(escalate.json?.error)}`);

const escalate2 = await limited.post("/staff", {
  name: "Puppet2", email: "puppet2@paltas.co.ke", temporaryPassword: "password123",
  permissions: [{ permission: "property.delete", effect: "ALLOW", scopeType: "PROPERTY", scopeId: kilimani.id }],
});
check(escalate2.status === 403, "cannot grant property.delete either", `got ${escalate2.status}`);

// Cross-property: the delegate is scoped to Kilimani and cannot staff Nyali.
const crossProperty = await limited.post("/staff", {
  name: "Puppet3", email: "puppet3@paltas.co.ke", temporaryPassword: "password123",
  roles: [{ key: "maintenance_staff", scopeType: "PROPERTY", scopeId: nyali.id }],
});
check(crossProperty.status === 403, "cannot create staff at another property", `got ${crossProperty.status}`);

// But a grant within their own reach succeeds.
const legitimate = await limited.post("/staff", {
  name: "New Technician", email: "tech@paltas.co.ke", temporaryPassword: "password123",
  roles: [{ key: "maintenance_staff", scopeType: "PROPERTY", scopeId: kilimani.id }],
});
check(legitimate.status === 201, "a grant within their own reach is allowed", JSON.stringify(legitimate.json?.error));

// Owner protection.
// The delegate is first given organisation-wide staff authority — otherwise the
// attempts below would be refused for want of the permission, and the owner
// guard itself would never be exercised.
const ownerRow = staffList.json.staff.find((s) => s.isOwner);
const limitedId = (await limited.get("/me")).json.user.id;
const empower = await owner2.put(`/staff/${limitedId}/permissions`, {
  roles: [{ key: "property_manager", scopeType: "PROPERTY", scopeId: kilimani.id }],
  permissions: [
    { permission: "staff.create", effect: "ALLOW", scopeType: "PROPERTY", scopeId: kilimani.id },
    { permission: "staff.permissions.manage", effect: "ALLOW", scopeType: "ORGANIZATION", scopeId: me.json.orgId },
    { permission: "staff.suspend", effect: "ALLOW", scopeType: "ORGANIZATION", scopeId: me.json.orgId },
    { permission: "staff.delete", effect: "ALLOW", scopeType: "ORGANIZATION", scopeId: me.json.orgId },
    { permission: "staff.view", effect: "ALLOW", scopeType: "ORGANIZATION", scopeId: me.json.orgId },
  ],
});
check(empower.status === 200, "owner widens the delegate to organisation-wide staff authority",
  JSON.stringify(empower.json?.error));

// Proof the widening took: they can now suspend an ordinary account.
const techRow = (await limited.get("/staff")).json.staff.find((s) => s.email === "tech@paltas.co.ke");
const suspendOrdinary = await limited.patch(`/staff/${techRow.id}`, { status: "SUSPENDED" });
check(suspendOrdinary.status === 200, "delegate can suspend an ordinary staff account",
  `${suspendOrdinary.status} ${JSON.stringify(suspendOrdinary.json?.error)}`);
await limited.patch(`/staff/${techRow.id}`, { status: "ACTIVE" });

// ...and still cannot touch the owner.
const demote = await limited.patch(`/staff/${ownerRow.id}`, { status: "SUSPENDED" });
check(demote.status === 403 && demote.json?.error?.code === "owner_protected",
  "staff cannot suspend the owner", `${demote.status} ${JSON.stringify(demote.json?.error)}`);
const rePermission = await limited.put(`/staff/${ownerRow.id}/permissions`, { roles: [], permissions: [] });
check(rePermission.status === 403 && rePermission.json?.error?.code === "owner_protected",
  "staff cannot re-permission the owner", `${rePermission.status}`);
const removeOwner = await limited.del(`/staff/${ownerRow.id}`);
check(removeOwner.status === 403 && removeOwner.json?.error?.code === "owner_protected",
  "staff cannot delete the owner", `${removeOwner.status} ${JSON.stringify(removeOwner.json?.error)}`);

// Self-editing is refused, even now that they hold staff.permissions.manage
// organisation-wide — which is precisely when it would matter.
const selfEdit = await limited.put(`/staff/${limitedId}/permissions`, {
  permissions: [{ permission: "finance.view", effect: "ALLOW", scopeType: "PROPERTY", scopeId: kilimani.id }],
});
check(selfEdit.status === 409, "cannot edit your own permissions", `got ${selfEdit.status}`);

// ------------------------------------------------- LIVE FLOW ---------------
line("LIVE FLOW — invite, approve, scan, admit, release");
const flowUnits = await mercy.get("/units?propertyId=" + kilimani.id);
const unitA101 = flowUnits.json.units.find((u) => u.name === "A-101");

const invite = await mercy.post("/security/invitations", {
  unitId: unitA101.id, visitorName: "E2E Test Visitor", visitorType: "FAMILY_FRIEND",
  purpose: "End-to-end check",
});
check(invite.status === 201, "security manager raises an invitation", JSON.stringify(invite.json?.error));
check(invite.json.invitation.status === "APPROVED",
  "auto-approved because she holds visitor.approve", invite.json.invitation?.status);

const scan = await guard.post("/security/passes/verify", { code: invite.json.invitation.passCode });
check(scan.json.result === "GRANTED", "guard scans it → GRANTED", scan.json?.reason);

const admit = await guard.post("/security/visits/checkin", { invitationId: invite.json.invitation.id });
check(admit.status === 201, "guard checks the visitor in", JSON.stringify(admit.json?.error));

const rescan = await guard.post("/security/passes/verify", { code: invite.json.invitation.passCode });
check(rescan.json.result === "DENIED" && /used/i.test(rescan.json.reason ?? ""),
  "single-use pass refuses a second scan", rescan.json?.reason);

const reuse = await guard.post("/security/visits/checkin", { invitationId: invite.json.invitation.id });
check(reuse.status === 409, "and a second check-in is a conflict", `got ${reuse.status}`);

const release = await guard.post(`/security/visits/${admit.json.visit.id}/checkout`, {});
check(release.status === 200, "guard checks the visitor out");

// Suspension requires a reason.
const cards = await mercy.get("/security/cards?propertyId=" + kilimani.id);
const liveCard = cards.json.cards.find((c) => c.status === "ACTIVE");
const noReason = await mercy.post(`/security/cards/${liveCard.id}/suspend`, {});
check(noReason.status === 400, "suspension without a reason is refused", `got ${noReason.status}`);
const withReason = await mercy.post(`/security/cards/${liveCard.id}/suspend`, { reason: "E2E verification" });
check(withReason.status === 200, "suspension with a reason succeeds");

// And it lands in the audit trail with before/after.
const auditAfter = await owner2.get("/audit?action=card.suspend&limit=5");
const newest = auditAfter.json.entries[0];
check(/E2E verification/.test(newest?.summary ?? ""), "suspension recorded in audit", newest?.summary);
check(newest?.before?.status === "ACTIVE" && newest?.after?.status === "SUSPENDED",
  "with previous and new value", JSON.stringify({ b: newest?.before, a: newest?.after }));

// Refused attempts are recorded too.
const denials = await owner2.get("/audit?action=access.denied&limit=100");
check(denials.json.entries.length > 0, "refused attempts are in the audit trail",
  `${denials.json.entries?.length} denial entries`);

// ------------------------------------------------- DRILL-DOWN -------------
line("DRILL-DOWN — same unit, three different viewers");
const a204 = flowUnits.json.units.find((u) => u.name === "A-204");

const ownerView = await owner2.get(`/units/${a204.id}`);
check(ownerView.status === 200 && Object.values(ownerView.json.sections).every(Boolean),
  "owner sees every block", JSON.stringify(ownerView.json.sections));

const guardView = await guard.get(`/units/${a204.id}`);
check(guardView.status === 200, "guard can open the unit");
check(guardView.json.sections.payments === false, "guard gets no payments block");
check(guardView.json.sections.visits === true && guardView.json.sections.cards === true,
  "but does get visitors and cards");
check(guardView.json.unit.rentAmount === undefined, "and no rent figure");

const acctView = await acct.get(`/units/${a204.id}`);
check(acctView.status === 200 && acctView.json.sections.payments === true, "accountant gets payments");
check(acctView.json.sections.cards === false && acctView.json.sections.visits === false,
  "but no cards and no visitor history",
  JSON.stringify({ cards: acctView.json.sections.cards, visits: acctView.json.sections.visits }));

// ------------------------------------------------- SUSPENSION -------------
line("ACCOUNT SUSPENSION");
const techList = await owner2.get("/staff");
const tech = techList.json.staff.find((s) => s.email === "tech@paltas.co.ke");
const preSuspend = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "tech@paltas.co.ke", password: "password123" }),
});
check(preSuspend.status === 200, "the new technician can sign in", `got ${preSuspend.status}`);

await owner2.patch(`/staff/${tech.id}`, { status: "SUSPENDED" });
const suspendedLogin = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "tech@paltas.co.ke", password: "password123" }),
});
check(suspendedLogin.status === 403, "a suspended account cannot sign in", `got ${suspendedLogin.status}`);

const badPassword = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "owner@paltas.co.ke", password: "wrong" }),
});
check(badPassword.status === 401, "wrong password is refused", `got ${badPassword.status}`);

// ---------------------------------------------------------------------------
console.log(results.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
