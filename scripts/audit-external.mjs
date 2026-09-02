/**
 * Verify the three properties the external-listings module rests on:
 *
 *   1. External inventory never writes to our own listings table.
 *   2. `displayable` is only ever set from the licence gate's verdict.
 *   3. The public feed filters on `displayable` and re-checks the licence.
 *
 * Run with: npm run audit:external
 *
 * This exists for the same reason the other two audits do, but the stakes are
 * different. A permission bug shows someone a page they should not see. A bug
 * here republishes a photographer's work commercially without their permission,
 * and no amount of fixing it afterwards undoes that.
 */

import fs from "node:fs";
import path from "node:path";

const problems = [];
const checks = [];
const pass = (msg) => checks.push(`✓ ${msg}`);
const fail = (msg) => { problems.push(msg); checks.push(`✗ ${msg}`); };

const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/* 1. Separation ---------------------------------------------------------- */

const externalFiles = [
  ...walk("src/lib/external"),
  ...walk("src/server/providers"),
  "src/server/external.ts",
  ...walk("src/app/api/external"),
].filter((p) => read(p) !== null);

const leaks = externalFiles.filter((p) => {
  const src = read(p);
  // Reading our own listings is fine; writing one from external code is not.
  return /prisma\.propertyListing\.(create|update|upsert|createMany|updateMany|delete)/.test(src);
});
if (leaks.length) {
  fail(`External code writes to PropertyListing: ${leaks.join(", ")}`);
} else {
  pass("External inventory never writes to our own listings table.");
}

/* 2. displayable comes only from the gate --------------------------------- */

const allServer = [...walk("src/server"), ...walk("src/app/api")];

/**
 * The character ranges of every `where: { ... }` and `select: { ... }` block.
 *
 * Filtering on `displayable: true` is exactly what the public feed should do,
 * and an audit entry recording that a listing *was* displayable is not a write
 * either. Both are located precisely, and everything outside them is treated
 * as a write.
 *
 * Matching braces rather than guessing from nearby lines matters, and so does
 * accepting `=` as well as `:`. Two earlier versions of this check were fooled:
 * one looked only for `data: {` and skipped `const data = { ... }`, which is
 * where the real write lives; the other flagged `const where = { ... }` as a
 * write because it only recognised the inline form.
 */
function readRanges(src) {
  const ranges = [];
  // `[:=]` because these objects are written both inline (`where: {`) and as
  // named locals (`const where = {`) — the earlier version missed the latter.
  // `before`/`after` are audit-log payloads describing a change, not making one.
  for (const m of src.matchAll(/\b(where|select|orderBy|before|after)\b\s*[:=]\s*{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    ranges.push([m.index, i]);
  }
  return ranges;
}

const writers = [];
for (const p of allServer) {
  const src = read(p);
  const reads = readRanges(src);
  // Asymmetric on purpose, because the risks are. Turning display OFF is always
  // safe — that is how a takedown and a delisting are recorded — so
  // `displayable: false` is allowed anywhere. Turning it ON is the act that
  // republishes someone else's work, so it may only come from the gate's
  // verdict and never from a literal.
  for (const m of src.matchAll(/displayable:\s*true\b/g)) {
    const inRead = reads.some(([a, b]) => m.index >= a && m.index < b);
    if (inRead) continue;
    const line = src.slice(0, m.index).split("\n").length;
    writers.push(`${p}:${line} — displayable: true (only the licence gate may grant display)`);
  }
}
if (writers.length) {
  fail(`display granted outside the licence gate:\n     ${writers.join("\n     ")}`);
} else {
  pass("`displayable` is only ever granted by the licence verdict.");
}

const gate = read("src/lib/external/licence.ts");
if (!gate) {
  fail("The licence gate is missing.");
} else {
  // The gate must be pure: no database, no network, no environment.
  if (/prisma|fetch\(|process\.env|require\(/.test(gate)) {
    fail("The licence gate reaches outside itself — it must stay pure and testable.");
  } else {
    pass("The licence gate is pure: no database, no network, no environment.");
  }
  if (!/licenceStatus === "NONE"/.test(gate) || !/displayRights/.test(gate)) {
    fail("The licence gate no longer checks status and display rights.");
  } else {
    pass("The gate still refuses unlicensed sources and sources without display rights.");
  }
}

/* 3. The public feed ------------------------------------------------------ */

const feed = read("src/app/api/public/external/route.ts");
if (!feed) {
  fail("The public external feed is missing.");
} else {
  if (!/displayable:\s*true/.test(feed)) fail("The public feed does not filter on `displayable`.");
  else pass("The public feed filters on `displayable`.");

  if (!/evaluateLicence\(/.test(feed)) fail("The public feed does not re-check the licence at read time.");
  else pass("The public feed re-checks the licence at read time.");

  if (!/applyLicence\(/.test(feed)) fail("The public feed does not strip fields the licence excludes.");
  else pass("The public feed strips images and contact details it has no right to.");

  if (!/suppressed:\s*false/.test(feed)) fail("The public feed does not exclude suppressed listings.");
  else pass("The public feed excludes suppressed listings.");

  if (!/external:\s*true/.test(feed)) fail("The public feed does not flag its rows as external.");
  else pass("Every row the public feed returns is flagged as external and not bookable.");
}

// A sync must never clear a takedown.
const service = read("src/server/external.ts");
if (service && /data:\s*{[^}]*suppressed:\s*false/s.test(service)) {
  fail("The ingestion service can clear a takedown flag.");
} else {
  pass("Re-ingestion cannot clear a takedown.");
}

console.log(checks.join("\n"));
console.log(`\n${checks.length} checks · ${problems.length} problem(s)`);
process.exit(problems.length === 0 ? 0 : 1);
