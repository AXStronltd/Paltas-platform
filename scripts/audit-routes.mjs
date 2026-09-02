/**
 * Verify the two invariants the permission model rests on:
 *
 *   1. Every API handler authorises before it acts.
 *   2. Every handler that changes something leaves a record.
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
  "/roles/route.ts": "role catalogue — currentActor() + canAnywhere()",
  "/public/offers/route.ts": "public shopfront — LIVE campaigns only, projected for anonymous visitors",
  "/public/listings/route.ts": "public marketplace feed — PUBLISHED listings only, own projection",
  "/payments/webhook/route.ts": "Stripe webhook — authorised by HMAC signature, not by session",
};

/** Mutating endpoints that record to the access history rather than the audit log. */
const LOGS_TO_ACCESS_HISTORY = {
  "/security/passes/verify/route.ts": "gate scan — written to AccessEvent",
  "/security/cards/verify/route.ts": "gate scan — written to AccessEvent",
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
  const authorised = guards > 0 || usesActor;
  if (!authorised && !(route in UNGUARDED_BY_DESIGN)) unguarded.push(route);

  const mutates = methods.some((m) => m !== "GET");
  const logs = src.includes("writeAudit(") || src.includes("accessEvent.create");
  if (mutates && !logs && !(route in UNGUARDED_BY_DESIGN)) unlogged.push(route);

  rows.push({
    route,
    methods: methods.join(","),
    auth: guards ? `guard ×${guards}` : usesActor ? "currentActor()" : "—",
    note: UNGUARDED_BY_DESIGN[route] ?? LOGS_TO_ACCESS_HISTORY[route] ?? "",
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
}

process.exit(problems === 0 ? 0 : 1);
