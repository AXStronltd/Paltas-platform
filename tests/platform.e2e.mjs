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
           del: async (p) => { const x = await fetch(BASE + p, { method: "DELETE", headers: { Cookie: c } }); return { status: x.status, json: await x.json().catch(() => null) }; } };
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
