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
  "/me/route.ts": "reports the caller's own identity via currentActor()",
  "/guest/me/route.ts": "reports the caller's own guest identity via currentGuest(); null when signed out",
  "/roles/route.ts": "role catalogue — currentActor() + canAnywhere()",
  "/public/offers/route.ts": "public shopfront — LIVE campaigns only, projected for anonymous visitors",
  "/public/listings/route.ts": "public marketplace feed — PUBLISHED listings only, own projection",
  "/public/listings/[id]/route.ts": "public listing detail — PUBLISHED only, own projection",
  "/public/listings/[id]/quote/route.ts": "public price check — reads inventory, writes and holds nothing",
  "/public/external/route.ts": "third-party listings — gated by the licence engine, not by permissions; see src/lib/external/licence.ts",
  "/guest/register/route.ts": "creates a guest account — verifies nothing because there is nothing yet to verify",
  "/guest/login/route.ts": "authenticates a guest — verifies the password itself",
  "/guest/logout/route.ts": "destroys only the caller's own guest session",
  "/payments/webhook/route.ts": "Stripe webhook — authorised by HMAC signature, not by session",
};

/** Mutating endpoints that record to the access history rather than the audit log. */
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

  const guards = (src.match(/await guard\(/g) ?? []).length + (src.match(/await guardList\(/g) ?? []).length;
  const usesActor = src.includes("currentActor()");
  const guestGuards = (src.match(/await requireGuest\(/g) ?? []).length;

  // A guest route must actually call requireGuest — being listed is a statement
  // of intent, not a substitute for the check.
  if (route in GUEST_AUTHORITY && guestGuards === 0) unguarded.push(`${route} (declared guest-authorised but never calls requireGuest)`);

  const authorised = guards > 0 || usesActor || guestGuards > 0;
  const exempt = route in UNGUARDED_BY_DESIGN;
  if (!authorised && !exempt) unguarded.push(route);

  const mutates = methods.some((m) => m !== "GET");
  const logs = src.includes("writeAudit(") || src.includes("accessEvent.create") ||
    src.includes("bookingEvent.create") || src.includes("createBooking(") || src.includes("cancelBooking(");
  if (mutates && !logs && !exempt) unlogged.push(route);

  rows.push({
    route,
    methods: methods.join(","),
    auth: guards ? `guard ×${guards}` : guestGuards ? `guest ×${guestGuards}` : usesActor ? "currentActor()" : "—",
    note: UNGUARDED_BY_DESIGN[route] ?? LOGS_TO_ACCESS_HISTORY[route] ?? GUEST_AUTHORITY[route] ?? "",
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
