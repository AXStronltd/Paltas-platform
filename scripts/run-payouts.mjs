/**
 * Ask the platform to pay whoever is owed.
 *
 * Deliberately dumb: it holds no ledger logic and makes no decision about
 * money. It calls one endpoint, prints what happened, and exits non-zero if the
 * call failed — everything that decides anything lives behind that endpoint,
 * where it is tested. A scheduler that computed payouts itself would be a
 * second implementation of the most expensive code in the repository.
 *
 * Run by the cron service in render.yaml. Locally:
 *
 *   PALTAS_URL=https://… PAYOUT_RUN_TOKEN=… node scripts/run-payouts.mjs --dry
 *
 * The token is read from the environment and never printed, including in an
 * error. A failure that echoes the credential is how a log becomes a breach.
 */

/**
 * Render's `hostport` property yields "service:10000" with no scheme, which
 * `fetch` rejects outright. Adding one when it is missing means the same
 * variable works whether it was set by the blueprint or typed by a person.
 */
const raw = (process.env.PALTAS_URL ?? "").trim().replace(/\/$/, "");
const url = raw && !/^https?:\/\//i.test(raw) ? `http://${raw}` : raw;
const token = process.env.PAYOUT_RUN_TOKEN ?? "";
const dry = process.argv.includes("--dry");

if (!url) {
  console.error("PALTAS_URL is not set. Nothing to call.");
  process.exit(2);
}
if (token.length < 32) {
  // Matches the endpoint, which refuses to enable the token path below this
  // length. Failing here gives a readable message instead of a silent 401.
  console.error("PAYOUT_RUN_TOKEN is missing or too short (32 characters or more).");
  process.exit(2);
}

const endpoint = `${url}/api/platform/payouts/run${dry ? "?dry=1" : ""}`;

let res;
try {
  res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
} catch (e) {
  console.error(`Could not reach ${url}: ${e.message}`);
  process.exit(1);
}

const body = await res.json().catch(() => null);

if (!res.ok) {
  // The endpoint's own message, never the token, and never the whole request.
  console.error(`Payout run refused (${res.status}): ${body?.error?.message ?? "no detail"}`);
  process.exit(1);
}

const { sent = [], failed = [], withheld = [], policy } = body ?? {};
const total = (rows) => rows.reduce((n, r) => n + (r.amount ?? 0), 0);

console.log(dry ? "Payout run (preview)" : "Payout run");
console.log(`  policy      : hold ${policy?.holdDays}d, minimum ${policy?.minimumPayout}`);
console.log(`  sent        : ${sent.length} payout(s), ${total(sent)} total`);
for (const s of sent) console.log(`    → ${s.orgId} ${s.currency} ${s.amount} (${s.earnings} earnings)`);

if (withheld.length) {
  // Named rather than counted: "3 withheld" tells nobody which host is waiting
  // on which document.
  console.log(`  withheld    : ${withheld.length}`);
  for (const w of withheld) console.log(`    · ${w.orgId} ${w.currency} ${w.amount} — ${w.reason}`);
}

if (failed.length) {
  console.error(`  failed      : ${failed.length}`);
  for (const f of failed) console.error(`    ✗ ${f.orgId} ${f.currency} ${f.amount} — ${f.error}`);
  // A refused transfer is not a crash — the earnings went back on the queue and
  // the next run will try again — but it must not look like a clean run either.
  process.exit(1);
}
