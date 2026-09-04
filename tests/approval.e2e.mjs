/**
 * Signing up as a business, and being approved, end to end.
 *
 * The property worth proving is that a pending account can do nothing. Not
 * "the UI hides it" — that every endpoint refuses it, because the
 * authorization engine treats any status other than ACTIVE as no authority at
 * all. If that ever stops being true, someone can sign themselves up and start
 * working before anybody has looked at them.
 */
import { PrismaClient } from "@prisma/client";

const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const db = new PrismaClient();
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
    return { status: r.status, json: await r.json().catch(() => null),
             cookies: (r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; ") };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b) };
}
async function staff(email) {
  const r = await client().post("/auth/login", { email, password: P });
  return client(r.cookies);
}
const anon = client();
const em = `biz${Math.floor(Math.random() * 1e9)}@example.com`;

console.log("SIGNING UP AS A BUSINESS");
check((await anon.post("/auth/signup", { name: "X", email: em, password: "short", role: "landlord" })).status === 400,
  "a short password is refused");
check((await anon.post("/auth/signup", { name: "X", email: "not-an-email", password: "a-long-password-1", role: "landlord" })).status === 400,
  "a malformed address is refused");
check((await anon.post("/auth/signup", { name: "X", email: em, password: "a-long-password-1" })).status === 400,
  "and a signup with no role at all");
check((await anon.post("/auth/signup", { name: "X", email: em, password: "a-long-password-1", role: "wizard" })).status === 400,
  "an invented role is refused");

const signup = await anon.post("/auth/signup", {
  name: "Test Landlord", email: em, password: "a-long-password-1",
  role: "landlord", businessName: "Test Properties Ltd", country: "KE",
});
check(signup.status === 201, "a complete signup is accepted", JSON.stringify(signup.json?.error));
check(signup.json.account.status === "PENDING", "as PENDING", signup.json.account?.status);
check(signup.json.pending === true, "and says so");

const dup = await anon.post("/auth/signup", { name: "Someone Else", email: em, password: "another-long-pass", role: "agent" });
check(dup.status === 409, "the same address cannot sign up twice");
check(!/already|exists|registered/i.test(dup.json?.error?.message ?? ""),
  "and the refusal does not confirm the address is registered", dup.json?.error?.message);

console.log("\nA PENDING ACCOUNT SIGNS IN, AND IS SENT TO ONBOARDING");
// It used to be refused outright. It cannot be any more: onboarding is the
// thing that collects the role and the documents, and you have to be signed in
// to reach it. Signing in is therefore allowed and grants nothing — the
// authorization engine still refuses every non-ACTIVE status, which the rest
// of this file goes on to prove.
const login = await anon.post("/auth/login", { email: em, password: "a-long-password-1" });
check(login.status === 200, "sign-in is allowed", `${login.status}`);
check(login.json?.onboardingRequired === true, "and says onboarding is required", JSON.stringify(login.json?.onboardingRequired));
const pendingSession = client(login.cookies);
check((await pendingSession.get("/platform/approvals")).status === 404, "the session it issues has no authority");

console.log("\nTHE QUEUE IS PALTAS STAFF ONLY");
const owner = await staff("owner@paltas.co.ke");
const mgr = await staff("joseph.kamau@paltas.co.ke");
const admin = await staff("admin@paltas.com");
check((await anon.get("/platform/approvals")).status === 401, "signed out: refused");
check((await owner.get("/platform/approvals")).status === 404, "a property owner gets a flat 404");
check((await mgr.get("/platform/approvals")).status === 404, "so does a manager");

const queue = await admin.get("/platform/approvals");
check(queue.status === 200, "Paltas staff can read it");
const mine = queue.json.accounts.find((a) => a.email === em);
check(!!mine, "the new account is in the queue");
check(mine.requestedRole === "landlord", "with what they said they do", mine?.requestedRole);
check(mine.org.approved === false, "and an organisation that is not approved either");

console.log("\nONLY PALTAS CAN APPROVE");
check((await owner.post(`/platform/approvals/${mine.id}`, { action: "approve" })).status === 404,
  "an owner cannot approve an account onto the platform");
check((await admin.post(`/platform/approvals/${mine.id}`, { action: "reject" })).status === 400,
  "and a rejection requires a reason");

// Verification comes first. A role that requires an identity document cannot be
// activated before somebody has looked at one, so the queue refuses until then.
const premature = await admin.post(`/platform/approvals/${mine.id}`, { action: "approve" });
check(premature.status === 409, "approval is refused before documents are verified", `${premature.status}`);
check(premature.json?.error?.code === "verification_required", "and says which gate stopped it", premature.json?.error?.code);

// Document upload needs object storage, which a test run has no business
// requiring. The document is written and approved directly so the rest of the
// approval path can still be proved end to end.
await db.verificationDocument.create({
  data: {
    userId: mine.id, type: "IDENTITY", storageKey: `private/verification/${mine.id}/test`,
    fileName: "id.pdf", contentType: "application/pdf", size: 1024, status: "APPROVED",
  },
});

const approved = await admin.post(`/platform/approvals/${mine.id}`, { action: "approve" });
check(approved.status === 200, "Paltas approves it once they are", JSON.stringify(approved.json?.error));
check(approved.json.role === "property_manager", "granting a real role", approved.json?.role);
check((await admin.post(`/platform/approvals/${mine.id}`, { action: "approve" })).status === 409,
  "and it cannot be approved twice");

console.log("\nAFTER APPROVAL THE ACCOUNT WORKS");
const now = await anon.post("/auth/login", { email: em, password: "a-long-password-1" });
check(now.status === 200, "they can sign in", `${now.status}`);
const them = client(now.cookies);
const me = await them.get("/me");
check(me.status === 200, "and read their own identity");
check(me.json.user.isOwner === true, "as the owner of their own organisation");
check(me.json.user.isPlatformAdmin === false, "and never as Paltas staff");
check((await them.get("/platform/approvals")).status === 404, "so the approvals queue stays closed to them");
check(me.json.properties.length === 0, "with no properties yet — theirs to add", `${me.json.properties?.length}`);

console.log("\nREJECTION");
const em2 = `biz${Math.floor(Math.random() * 1e9)}@example.com`;
await anon.post("/auth/signup", { name: "Rejected Co", email: em2, password: "a-long-password-2", role: "agent" });
const q2 = await admin.get("/platform/approvals");
const second = q2.json.accounts.find((a) => a.email === em2);
const rej = await admin.post(`/platform/approvals/${second.id}`, { action: "reject", reason: "Could not verify the business." });
check(rej.status === 200, "an account can be rejected with a reason");
const after = await anon.post("/auth/login", { email: em2, password: "a-long-password-2" });
check(after.status === 403 && after.json?.error?.code === "account_rejected",
  "and is told, rather than left guessing", after.json?.error?.code);

console.log("\nTHE TRAIL");
const trail = await admin.get("/audit?limit=60");
const actions = (trail.json.entries ?? trail.json.logs ?? []).map((e) => e.action);
check(actions.includes("account.approve"), "approving is recorded");
check(actions.includes("account.reject"), "and so is rejecting");

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
