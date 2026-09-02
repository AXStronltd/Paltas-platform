/**
 * Enforce the frontend/backend boundary.
 *
 * Run with: npm run audit:layers
 *
 * Next.js is full-stack in one tree, which is convenient and also the reason
 * this check exists: nothing in the framework stops a `"use client"` component
 * from importing the Prisma client or the Stripe module. It would compile. It
 * would then ship the database driver — and anything sitting in the same module
 * as a secret — to the browser.
 *
 * The boundary held when this was written. This keeps it holding.
 *
 * The layers, from the outside in:
 *
 *   src/components   frontend. React, browser APIs, no server imports.
 *   src/app/api      HTTP handlers. The only callers of src/server.
 *   src/server       backend only. Database, sessions, Stripe secret, audit.
 *   src/lib          isomorphic. Pure logic and types, safe on both sides.
 */

import fs from "node:fs";
import path from "node:path";

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(entry.name)) files.push(p);
  }
})("src");

/** Things that must never reach the browser. */
const SERVER_ONLY = [
  { pattern: /from ["']@\/server\//, what: "src/server (database, sessions, Stripe secret)" },
  { pattern: /from ["']@prisma\/client["']/, what: "the Prisma client" },
  { pattern: /from ["']node:/, what: "a Node built-in" },
  { pattern: /from ["']next\/headers["']/, what: "next/headers" },
];

const problems = [];
let clientCount = 0;
let serverCount = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["']/m.test(src);

  if (isClient) {
    clientCount++;
    for (const rule of SERVER_ONLY) {
      if (rule.pattern.test(src)) {
        problems.push(`${file}\n    is a client component but imports ${rule.what}`);
      }
    }
  }

  // The reverse: server modules must not depend on React components, or the
  // dependency graph stops telling you which direction data flows.
  if (file.startsWith("src/server/")) {
    serverCount++;
    if (/from ["']@\/components\//.test(src)) {
      problems.push(`${file}\n    is a server module but imports a component`);
    }
  }
}

// src/lib is shared, so it must not reach into src/server either — anything
// there could be pulled into a client bundle by a single import.
for (const file of files.filter((f) => f.startsWith("src/lib/"))) {
  const src = fs.readFileSync(file, "utf8");
  if (/from ["']@\/server\//.test(src)) {
    problems.push(`${file}\n    is shared code but imports from src/server`);
  }
}

console.log(`${files.length} source files · ${clientCount} client components · ${serverCount} server modules`);
console.log("─".repeat(70));

if (problems.length === 0) {
  console.log("✓ No client component imports server-only code.");
  console.log("✓ No server module depends on a component.");
  console.log("✓ Shared code in src/lib stays isomorphic.");
  process.exit(0);
}

console.log(`\n${problems.length} boundary violation(s):\n`);
for (const p of problems) console.log(`  ${p}\n`);
process.exit(1);
