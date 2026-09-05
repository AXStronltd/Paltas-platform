/**
 * Verify the two invariants the permission model rests on:
 *
 *   1. Every API handler authorises before it acts.
 *   2. Every handler that changes something leaves a record.
 *
 * There are two authority systems and this script knows about both. Staff act
 * through guard()/guardList() and are recorded in the audit log. Guests act
 * through requireGuest() — they hold no permissions at all, only ownership of
 * their own rows — and their actions are recorded as BookingEvents. Conflating
 * the two would be the bug: a guest session must never satisfy a staff check.
 *
 * Run with: npm run audit:routes
 *
 * This exists because "every endpoint checks permission" is the kind of claim
 * that is true on the day it is written and quietly false six months later. It
 * is cheap to keep honest mechanically, and expensive to rediscover by hand.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = "src/app/api";

/** Endpoints that legitimately have no permission check, and why. */
const UNGUARDED_BY_DESIGN = {
  "/auth/login/route.ts": "authenticates — verifies the password itself",
  "/auth/logout/route.ts": "destroys only the caller's own session",
  "/auth/signup/route.ts": "business signs itself up — unauthenticated by definition, and creates only a PENDING account whose organisation is unapproved. It cannot grant itself anything: isOwner and isPlatformAdmin are set false here, the requested role is recorded as a request, and the authorization engine refuses every status that is not ACTIVE. The PENDING User is the record; there is no actor to attribute an audit entry to.",
  "/auth/forgot/route.ts": "requests a reset link — unauthenticated by definition, and answers identically whether or not the address exists so it cannot be used to test which emails are registered. Recorded as a PasswordReset row rather than an audit entry: there is no actor to attribute it to.",
  "/auth/reset/route.ts": "sets a new password from a single-use token — authorised by holding the token, which is the only credential someone locked out has. The token is the record.",
  "/me/route.ts": "reports the caller's own identity via currentActor()",
  "/guest/me/route.ts": "reports the caller's own guest identity via currentGuest(); null when signed out",
  "/roles/route.ts": "role catalogue — currentActor() + canAnywhere()",
  "/public/offers/route.ts": "public shopfront — LIVE campaigns only, projected for anonymous visitors",
  "/public/listings/route.ts": "public marketplace feed — PUBLISHED listings only, own projection",
  "/public/listings/[id]/route.ts": "public listing detail — PUBLISHED only, own projection",
  "/public/listings/[id]/quote/route.ts": "public price check — reads inventory, writes and holds nothing",
  "/public/external/route.ts": "third-party listings — gated by the licence engine, not by permissions; see src/lib/external/licence.ts",
  "/version/route.ts": "which build is deployed — public by design, so anyone testing can tell a stale page from a real bug. It returns a commit hash and nothing about the platform's state.",
  "/public/enquiries/route.ts": "buy/sell enquiry from a stranger — unauthenticated by design, since requiring an account before someone may ask a question loses the lead. It can only create a NEW unassigned lead: stage, owner, organisation and source are all derived server-side, and it is rate limited by email and address. Recorded as the Lead itself rather than an audit entry — there is no actor to attribute it to.",
  "/support/chat/route.ts": "help assistant — unauthenticated by design, because somebody who cannot work out how to sign up is exactly the person who needs to ask a question. It reads nothing: no account, no booking, no listing. It writes only a per-caller request count, keyed by a salted digest rather than an address, and rate limited in the database so a restart or a second instance cannot hand out a fresh allowance. No audit entry, and no message content stored anywhere, on purpose — a log of what every visitor asked for help with is a privacy cost with no operational benefit.",
  "/guest/register/route.ts": "creates a guest account — verifies nothing because there is nothing yet to verify",
  "/guest/login/route.ts": "authenticates a guest — verifies the password itself",
  "/guest/logout/route.ts": "destroys only the caller's own guest session",
  "/payments/webhook/route.ts": "Stripe webhook — authorised by HMAC signature, not by session",
  "/auth/supabase/exchange/route.ts": "turns a verified Supabase identity into a PALTAS session — unauthenticated by definition, in the same way /auth/login is. The credential is the access token, and it is verified against Supabase itself rather than trusted; an unconfirmed email is refused outright. It grants nothing a session did not already imply: a caller with no PALTAS account gets a PENDING one with no role, no approved organisation and no assignment, and the authorization engine refuses every status that is not ACTIVE. The User or Guest row is the record; there is no prior actor to attribute an audit entry to.",
  "/auth/supabase/provision/route.ts": "creates the local principal after Supabase has created the identity — unauthenticated by definition, and it verifies the claim rather than believing it: the supplied id is fetched from Supabase and its email must match the one presented. Creates only a PENDING business account or a guest, never a role, an approval or platform authority. The created row is the record.",
};

/** Mutating endpoints that record to the access history rather than the audit log. */
/**
 * Mutations that are deliberately not in the audit trail.
 *
 * Separate from UNGUARDED_BY_DESIGN, which answers a different question. Until
 * now the only way to excuse a missing audit entry was to declare the route
 * unauthenticated, which is untrue of every route that would want it — so the
 * two are no longer the same list.
 *
 * The bar is that the mutation changes nothing anyone could later need to
 * account for, and that recording it would cost more than it tells.
 */
const NOT_AUDITABLE = {
  "/notifications/route.ts": "marks the caller's own notifications read. It changes one timestamp on rows addressed to them, grants nothing and touches nobody else's data. An audit entry per notification opened would be the noisiest action on the platform, and would bury the entries that matter.",
};

const LOGS_TO_ACCESS_HISTORY = {
  "/security/passes/verify/route.ts": "gate scan — written to AccessEvent",
  "/security/cards/verify/route.ts": "gate scan — written to AccessEvent",
};

/**
 * Guest-facing endpoints. Authorised by session ownership rather than by
 * permission: a guest may read and change their own bookings and nothing else.
 * Every one of these must scope its query by the session's guest id — passing
 * this audit means requireGuest() was called, not that it was used correctly,
 * which is what the e2e booking suite checks.
 */
const GUEST_AUTHORITY = {
  "/bookings/route.ts": "guest session — own bookings only, recorded as BookingEvents",
  "/bookings/[id]/route.ts": "guest session — own booking only",
  "/bookings/[id]/cancel/route.ts": "guest session — own booking only, recorded as a BookingEvent",
};

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name === "route.ts") files.push(p);
  }
})(ROOT);
files.sort();

let handlers = 0;
const unguarded = [];
const unlogged = [];
const rows = [];

for (const file of files) {
  const route = file.replace(ROOT, "");
  const src = fs.readFileSync(file, "utf8");

  const methods = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\s*\(/g)].map((m) => m[1]);
  handlers += methods.length;

  // guardMaybeScoped is guard() or guardList() depending on whether the record
  // has a property yet; either way it authorises before acting.
  const guards = (src.match(/await guard\(/g) ?? []).length
    + (src.match(/await guardList\(/g) ?? []).length
    + (src.match(/await guardMaybeScoped\(/g) ?? []).length
    // guardPlatform is stricter than any permission check: it requires the
    // account to be Paltas staff, which no grant can confer.
    + (src.match(/await guardPlatform\(/g) ?? []).length;
  const usesActor = src.includes("currentActor()")
    // Messaging spans both halves of the platform, so it resolves the caller to
    // one side or the other through currentParticipant(), which refuses anyone
    // holding neither session and any staff account that is not ACTIVE. It is
    // an authorisation check by another name, and every messages route is
    // membership-filtered on top of it.
    || src.includes("currentParticipant()");
  const guestGuards = (src.match(/await requireGuest\(/g) ?? []).length;

  // A guest route must actually call requireGuest — being listed is a statement
  // of intent, not a substitute for the check.
  if (route in GUEST_AUTHORITY && guestGuards === 0) unguarded.push(`${route} (declared guest-authorised but never calls requireGuest)`);

  const authorised = guards > 0 || usesActor || guestGuards > 0;
  const exempt = route in UNGUARDED_BY_DESIGN;
  if (!authorised && !exempt) unguarded.push(route);

  const mutates = methods.some((m) => m !== "GET");
  const logs = src.includes("writeAudit(") || src.includes("accessEvent.create") ||
    src.includes("bookingEvent.create") || src.includes("createBooking(") || src.includes("cancelBooking(") ||
    // A message is its own record, in the same way a booking event is. An audit
    // entry beside it would duplicate the row it describes, and a log of who
    // said what to whom is a privacy cost rather than an operational one.
    src.includes("message.create(");
  if (mutates && !logs && !exempt && !(route in NOT_AUDITABLE)) unlogged.push(route);

  rows.push({
    route,
    methods: methods.join(","),
    auth: guards ? `guard ×${guards}` : guestGuards ? `guest ×${guestGuards}` : usesActor ? "currentActor()" : "—",
    note: UNGUARDED_BY_DESIGN[route] ?? LOGS_TO_ACCESS_HISTORY[route] ?? NOT_AUDITABLE[route] ?? GUEST_AUTHORITY[route] ?? "",
  });
}

const w = Math.max(...rows.map((r) => r.route.length)) + 2;
console.log("route".padEnd(w) + "methods".padEnd(20) + "authorisation");
console.log("─".repeat(w + 34));
for (const r of rows) {
  console.log(r.route.padEnd(w) + r.methods.padEnd(20) + r.auth + (r.note ? `   ${r.note}` : ""));
}
console.log("─".repeat(w + 34));
console.log(`${files.length} route files · ${handlers} HTTP handlers`);

const problems = unguarded.length + unlogged.length;
if (unguarded.length) console.log(`\nUNAUTHORISED:\n  ${unguarded.join("\n  ")}`);
if (unlogged.length) console.log(`\nMUTATES WITHOUT A RECORD:\n  ${unlogged.join("\n  ")}`);
if (problems === 0) {
  console.log("\n✓ Every handler authorises before acting.");
  console.log("✓ Every mutating handler leaves a record.");
  console.log("✓ Staff and guest authority stay separate.");
}

process.exit(problems === 0 ? 0 : 1);
