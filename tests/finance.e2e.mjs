/**
 * Financial management and Paltas Rewards, end to end.
 *
 * Fee schedule, charges (including the monthly bulk run), payroll with its
 * separation-of-duties control, and the rewards ledger. Requires a freshly
 * seeded database and a running server.
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
  return { get: p => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b) };
}

const owner = await s("owner@paltas.co.ke");
const acct = await s("david.omondi@paltas.co.ke");
const mgr = await s("joseph.kamau@paltas.co.ke");
const guard = await s("john.mutiso@paltas.co.ke");

console.log("FEE SCHEDULE");
const cats = await acct.get("/finance/categories");
check(cats.status === 200 && cats.json.categories.length === 10, "10 categories seeded", `${cats.json.categories?.length}`);
check(cats.json.categories.filter(c => c.kind === "INCOME").length === 7, "7 income categories");
check(cats.json.categories.filter(c => c.kind === "EXPENSE").length === 3, "3 expense categories");
check((await guard.get("/finance/categories")).status === 403, "a guard cannot see the fee schedule");
check((await mgr.get("/finance/categories")).status === 200, "a property manager can");
check((await mgr.post("/finance/categories", { name: "Gym levy", defaultAmount: 1000 })).status === 403, "but cannot add one");
const made = await acct.post("/finance/categories", { name: "Borehole levy", defaultAmount: 1200, kind: "INCOME" });
check(made.status === 201 && made.json.category.code === "BOREHOLE_LEVY", "the accountant can, and gets a readable code", made.json.category?.code);
check((await acct.post("/finance/categories", { name: "Borehole levy" })).status === 409, "duplicate codes are refused");

console.log("\nCHARGES");
const charges = await acct.get("/finance/charges");
check(charges.status === 200 && charges.json.charges.length === 12, "12 charges from the monthly run", `${charges.json.charges?.length}`);
check(charges.json.totals.billed > 0 && charges.json.totals.outstanding > 0, "billed and outstanding both computed",
  JSON.stringify(charges.json.totals));
const settledCount = charges.json.charges.filter(c => c.status === "PAID").length;
check(settledCount === 8, "8 settled, 4 outstanding", `${settledCount} settled`);
check((await guard.get("/finance/charges")).status === 403, "a guard cannot see what residents owe");

// The monthly run: bill every occupied unit at once.
const props = (await acct.get("/properties")).json.properties;
const kilimani = props.find(p => p.name === "Kilimani Heights");
const svc = cats.json.categories.find(c => c.code === "SERVICE");
const bulk = await acct.post("/finance/charges", { propertyId: kilimani.id, categoryId: svc.id, allUnits: true, periodLabel: "Next month" });
check(bulk.status === 201 && bulk.json.created === 4, "bulk run bills all 4 occupied units", `${bulk.json?.created}`);

const one = charges.json.charges.find(c => c.status !== "PAID");
const part = await acct.patch(`/finance/charges/${one.id}`, { settle: { amount: Math.floor(one.balance / 2), reference: "TEST" } });
check(part.status === 200 && part.json.outstanding > 0, "a part payment leaves a balance", JSON.stringify(part.json));
const over = await acct.patch(`/finance/charges/${one.id}`, { settle: { amount: 999_999 } });
check(over.status === 400, "overpaying a charge is refused", `${over.status}`);

const noReason = await owner.patch(`/finance/charges/${one.id}`, { waive: true });
check(noReason.status === 400, "waiving without a reason is refused");
const waived = await owner.patch(`/finance/charges/${one.id}`, { waive: true, reason: "Goodwill — lift outage" });
check(waived.status === 200, "waiving with a reason succeeds");
// The accountant does hold waive — deliberately, and named explicitly in the
// role rather than absorbed by a wildcard. A guard does not.
const guardWaive = await guard.patch(`/finance/charges/${one.id}`, { waive: true, reason: "no" });
check(guardWaive.status === 403, "a guard cannot waive a charge", `${guardWaive.status}`);
const twice = await acct.patch(`/finance/charges/${one.id}`, { waive: true, reason: "again" });
check(twice.status === 409, "and a charge cannot be waived twice", `${twice.status}`);

console.log("\nPAYROLL");
const sal = await acct.get("/payroll/salaries");
check(sal.status === 200 && sal.json.salaries.length === 7, "7 salary profiles", `${sal.json.salaries?.length}`);
check(sal.json.totalMonthly === 612000, "monthly payroll totals correctly", `${sal.json.totalMonthly}`);
check((await guard.get("/payroll/salaries")).status === 403, "a guard cannot see salaries");
check((await mgr.get("/payroll/salaries")).status === 403, "nor can the property manager");

const johnId = sal.json.salaries.find(x => x.name === "John Mutiso").userId;
const raise = await acct.post("/payroll/salaries", { userId: johnId, grossMonthly: 46000, jobTitle: "Senior Security Guard" });
check(raise.status === 201, "a raise creates a new profile");
const after = await acct.get("/payroll/salaries");
check(after.json.salaries.filter(x => x.name === "John Mutiso").length === 1, "superseding leaves exactly one active profile");
check(after.json.salaries.find(x => x.name === "John Mutiso").grossMonthly === 46000, "at the new figure");

const runs = await acct.get("/payroll/runs");
check(runs.status === 200 && runs.json.runs.length === 1, "last month's run is present");
const paid = runs.json.runs[0];
check(paid.status === "PAID" && paid.headcount === 7, "paid, 7 payslips", `${paid.status}/${paid.headcount}`);
check(paid.totalGross - paid.totalDeductions === paid.totalNet, "gross − deductions === net",
  `${paid.totalGross} - ${paid.totalDeductions} = ${paid.totalNet}`);
check(paid.payslips.every(p => p.gross - p.totalDeductions === p.net), "and on every individual payslip");

const newRun = await acct.post("/payroll/runs", {
  propertyId: kilimani.id, periodLabel: "Test period",
  deductions: [{ label: "PAYE", percent: 20 }, { label: "NSSF", amount: 1080 }],
});
check(newRun.status === 201, "a new run builds from the active profiles", JSON.stringify(newRun.json?.error));
check(newRun.json.run.payslips.length === 7, "7 payslips", `${newRun.json.run?.payslips?.length}`);
check(newRun.json.run.totalNet === newRun.json.run.totalGross - newRun.json.run.totalDeductions, "totals reconcile");

// Separation of duties: the accountant holds payroll.approve, and is still
// refused on the run they prepared themselves.
const selfApprove = await acct.patch(`/payroll/runs/${newRun.json.run.id}`, { status: "APPROVED" });
check(selfApprove.status === 409, "the preparer cannot approve their own run", `${selfApprove.status}`);
const approved = await owner.patch(`/payroll/runs/${newRun.json.run.id}`, { status: "APPROVED" });
check(approved.status === 200, "someone else can");
const payBeforeApprove = await owner.patch(`/payroll/runs/${paid.id}`, { status: "APPROVED" });
check(payBeforeApprove.status === 409, "an already-paid run cannot be re-approved");
check((await acct.post("/payroll/runs", { propertyId: kilimani.id, periodLabel: "Test period" })).status === 409,
  "a duplicate period is refused");

console.log("\nPALTAS REWARDS");
const mem = await acct.get("/loyalty/members");
check(mem.status === 200 && mem.json.members.length === 4, "4 members", `${mem.json.members?.length}`);
const omar = mem.json.members.find(m => m.name === "Omar Farah");
check(omar.tier === "platinum", "Omar reaches platinum on rolling spend", omar.tier);
check(omar.balance === omar.balanceValue, "a point is worth a shilling");
check(omar.nextExpiry !== null, "the next expiry is surfaced, not sprung");
const lucy = mem.json.members.find(m => m.name === "Lucy Njeri");
check(lucy.tier === "bronze" && lucy.nextTier === "Silver", "Lucy is bronze with silver next", `${lucy.tier}/${lucy.nextTier}`);
check(lucy.toNextTier > 0 && lucy.tierPercent >= 0, "with honest progress", `${lucy.tierPercent}%`);
check((await guard.get("/loyalty/members")).status === 403, "a guard cannot see the rewards programme");

const earn = await owner.post(`/loyalty/members/${lucy.id}`, { stay: { amount: 100_000, reference: "BK-TEST" } });
check(earn.status === 200, "a completed stay earns points");
check(earn.json.member.balance > lucy.balance, "balance rose", `${lucy.balance} → ${earn.json.member?.balance}`);
const tooMuch = await owner.post(`/loyalty/members/${lucy.id}`, { redeem: { points: 9_999_999 } });
check(tooMuch.status === 409, "cannot redeem more than the balance");
const noWhy = await owner.post(`/loyalty/members/${lucy.id}`, { adjust: { points: 500, reason: "" } });
check(noWhy.status === 400, "a hand adjustment demands a reason");
const adj = await owner.post(`/loyalty/members/${lucy.id}`, { adjust: { points: 500, reason: "Goodwill after a late check-in" } });
check(adj.status === 200, "with one, it goes through");
check((await acct.post(`/loyalty/members/${lucy.id}`, { adjust: { points: 100, reason: "x" } })).status === 403,
  "the accountant cannot adjust points by hand");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
