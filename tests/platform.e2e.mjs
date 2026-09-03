/**
 * Cross-organisation checks: the platform administrator reaches every tenant,
 * and no tenant can see another. Requires a seeded database and a running
 * server — see tests/permissions.e2e.mjs.
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
let pass = 0, fail = 0;
const check = (ok, label, d = "") => { ok ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}  → ${d}`)); };

async function s(email) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: P }) });
  if (!r.ok) throw new Error(`${email}: ${r.status}`);
  const c = (r.headers.getSetCookie() ?? []).map(x => x.split(";")[0]).join("; ");
  return { get: async (p) => { const x = await fetch(BASE + p, { headers: { Cookie: c } }); return { status: x.status, json: await x.json().catch(() => null) }; },
           del: async (p) => { const x = await fetch(BASE + p, { method: "DELETE", headers: { Cookie: c } }); return { status: x.status, json: await x.json().catch(() => null) }; },
           patch: async (p, b) => { const x = await fetch(BASE + p, { method: "PATCH", headers: { Cookie: c, "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: x.status, json: await x.json().catch(() => null) }; } };
}

console.log("PLATFORM ADMIN — admin@paltas.com");
const admin = await s("admin@paltas.com");
const me = await admin.get("/me");
check(me.json.user.isPlatformAdmin === true, "flagged as platform admin");
check(me.json.properties.length === 3, "sees all 3 properties across both tenants", `${me.json.properties?.length}`);
const orgs = [...new Set(me.json.properties.map(p => p.orgName))];
check(orgs.length === 2, "spanning 2 organisations", JSON.stringify(orgs));
check(me.json.properties.every(p => p.permissions.length >= 70), "holds full permissions at every property");

const props = await admin.get("/properties");
check(props.json.properties.length === 3, "GET /properties returns all tenants", `${props.json.properties?.length}`);
const units = await admin.get("/units");
check(units.json.units.length === 10, "sees all 10 units across tenants", `${units.json.units?.length}`);
const dash = await admin.get("/owner/dashboard");
check(dash.json.portfolio.properties === 3, "dashboard spans tenants", `${dash.json.portfolio?.properties}`);
const aud = await admin.get("/audit");
check(aud.status === 200, "reads the audit trail");
const cards = await admin.get("/security/cards");
check(cards.status === 200, "reads security across tenants");

console.log("\nTENANT ISOLATION — the two owners cannot see each other");
const amina = await s("owner@paltas.co.ke");
const salim = await s("owner@coastalliving.co.ke");
const aProps = await amina.get("/properties");
const sProps = await salim.get("/properties");
check(aProps.json.properties.length === 2 && aProps.json.properties.every(p => p.name !== "Diani Palms"),
  "Amina sees her 2, not Diani Palms", JSON.stringify(aProps.json.properties.map(p => p.name)));
check(sProps.json.properties.length === 1 && sProps.json.properties[0].name === "Diani Palms",
  "Salim sees only Diani Palms", JSON.stringify(sProps.json.properties.map(p => p.name)));

const diani = me.json.properties.find(p => p.name === "Diani Palms");
const kilimani = me.json.properties.find(p => p.name === "Kilimani Heights");
const cross1 = await amina.get(`/properties/${diani.id}`);
check(cross1.status === 404, "an owner probing the other tenant gets 404, not 403", `got ${cross1.status}`);
const cross2 = await salim.get(`/properties/${kilimani.id}`);
check(cross2.status === 404, "and the same in reverse", `got ${cross2.status}`);

const aUnits = await amina.get("/units");
check(aUnits.json.units.every(u => u.propertyName !== "Diani Palms"), "no cross-tenant unit leaks into a listing");
const aAudit = await amina.get("/audit?limit=200");
check(aAudit.json.entries.every(e => e.propertyId !== diani.id), "no cross-tenant audit entry leaks");

console.log("\nPLATFORM ADMIN reaches into a tenant");
const inTenant = await admin.get(`/properties/${diani.id}`);
check(inTenant.status === 200, "opens Diani Palms directly", `got ${inTenant.status}`);
const inTenant2 = await admin.get(`/properties/${kilimani.id}`);
check(inTenant2.status === 200, "and Kilimani Heights", `got ${inTenant2.status}`);


console.log("\nOPERATIONS CONSOLE — PALTAS STAFF ONLY");
const mgr = await s("joseph.kamau@paltas.co.ke");
const guard = await s("john.mutiso@paltas.co.ke");
// 404 rather than 403: a tenant probing for an operations console should not
// learn that one exists.
const opsAnon = await fetch(`${BASE}/platform/overview`);
check(opsAnon.status === 401, "signed out: refused", `${opsAnon.status}`);
check((await amina.get("/platform/overview")).status === 404,
  "a property owner gets a flat 404, not a 403");
check((await mgr.get("/platform/overview")).status === 404, "so does a property manager");
check((await guard.get("/platform/overview")).status === 404, "and a guard");

const ops = await admin.get("/platform/overview");
check(ops.status === 200, "Paltas platform staff can read it", `${ops.status}`);
check(ops.json.portfolio.organisations >= 2, "it spans every organisation",
  `${ops.json.portfolio?.organisations}`);
check(ops.json.organisations.length >= 2, "and lists them");
check(typeof ops.json.operations.openIncidents === "number", "with operational counts");

// The console sits open on shared screens all day. It must carry no personal data.
const opsBlob = JSON.stringify(ops.json);
check(!/@/.test(opsBlob), "no email address appears anywhere in it");
check(!opsBlob.includes("passwordHash") && !opsBlob.includes("phone"),
  "no credentials and no phone numbers");
const residentNames = ["Daniel Mwangi", "Faith Achieng", "Brian Otieno"];
check(!residentNames.some((n) => opsBlob.includes(n)), "and no resident names — counts, not records");

console.log("\nEVERYONE MAY EDIT THEMSELVES, AND NOBODY MAY DO MORE");
const before = (await guard.get("/me")).json.user.name;
const renamed = await guard.patch("/me", { name: "John M. Mutiso" });
check(renamed.status === 200 && renamed.json.user.name === "John M. Mutiso",
  "a guard with almost no permissions can still rename themselves", `${renamed.status}`);
check((await guard.patch("/me", { name: "X" })).status === 400, "but not to a single character");

// The fields that decide authority are columns, not permissions, precisely so
// that no self-service edit can mint them.
await guard.patch("/me", {
  name: "John Mutiso", isPlatformAdmin: true, isOwner: true,
  email: "attacker@example.com", status: "ACTIVE", orgId: "someone-elses",
});
const after = (await guard.get("/me")).json;
check(after.user.isPlatformAdmin === false, "self-editing cannot grant platform authority");
check(after.user.isOwner === false, "nor ownership");
check(after.user.email !== "attacker@example.com", "nor change the sign-in identity",
  after.user.email);
check(after.user.name === before, "and the name is back as it was");
check((await guard.get("/platform/overview")).status === 404,
  "so the operations console is still closed to them");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
