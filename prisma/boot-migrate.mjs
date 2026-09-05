/**
 * Apply migrations at boot, clearing the tombstone of one that left nothing.
 *
 * Prisma records a migration that errored as failed and then refuses to apply
 * anything after it, for a good reason: continuing past a half-applied schema
 * is how a database reaches a state nobody can reason about. But on Postgres
 * that reason often does not apply. DDL is transactional here, so a migration
 * that failed on a syntax error rolled back completely and left no objects
 * behind — the tombstone is all that remains, and clearing it by hand needs a
 * shell somebody may not have.
 *
 * So: clear only tombstones, then apply, and fail loudly if applying fails.
 *
 * What this will NOT do is paper over a real failure. It resolves a migration
 * only when Prisma never recorded it as finished, which on Postgres means the
 * transaction rolled back. If `migrate deploy` then fails for any reason, this
 * exits non-zero and the container refuses to serve — which is the whole point
 * of the `&&` in the boot line, and is not weakened by anything here.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const PRISMA = "node_modules/prisma/build/index.js";
const run = (...args) => execFileSync(process.execPath, [PRISMA, ...args], { stdio: "inherit" });

const db = new PrismaClient();

try {
  let failed = [];
  try {
    failed = await db.$queryRawUnsafe(`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      ORDER BY started_at ASC
    `);
  } catch {
    // No _prisma_migrations table yet: a genuinely empty database, which is
    // the ordinary first deploy. `migrate deploy` will create it.
    failed = [];
  }

  for (const { migration_name: name } of failed) {
    console.log(`[boot] "${name}" is recorded as failed and is blocking every migration after it.`);
    console.log("[boot] Postgres rolls a failed migration back in full, so there is nothing to undo.");
    run("migrate", "resolve", "--rolled-back", name);
    console.log(`[boot] cleared. It will be attempted again below.`);
  }
} finally {
  await db.$disconnect();
}

// Fatal on purpose. A container that serves a schema older than its code turns
// a loud failure into a 500 somebody finds days later.
run("migrate", "deploy");

/**
 * Give any property that still lacks coordinates some, once.
 *
 * Nothing about "nearby" can work while a property is only an address string,
 * and the alternative — a shell command somebody has to remember to run after
 * every batch of new inventory — is a step that will eventually be forgotten.
 * This is the same script, invoked here, and it is cheap to leave in: it asks
 * for properties with a null latitude, and once there are none that is a single
 * indexed query per boot and nothing else.
 *
 * Non-fatal, and silent when there is no key. Geocoding is a nicety; a
 * deployment must never refuse to serve because Google was slow.
 */
try {
  const { execFileSync } = await import("node:child_process");
  const hasKey = (
    process.env.GOOGLE_GEOCODING_API_KEY
    || process.env.GOOGLE_MAPS_API_KEY
    || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    || ""
  ).trim();
  if (hasKey) {
    execFileSync(process.execPath, ["scripts/backfill-coordinates.mjs"], { stdio: "inherit" });
  } else {
    console.log("[boot] no geocoding key — skipping backfill; \"nearby\" stays empty until GOOGLE_GEOCODING_API_KEY is set.");
  }
} catch {
  // The script prints the reason itself, including the referrer-restriction
  // case — the one that otherwise looks like nothing happening at all.
  console.log("[boot] coordinate backfill did not finish — see the lines above. Continuing to serve.");
}

/**
 * Give every account the membership its own orgId already implies.
 *
 * The migration backfilled the accounts that existed when it ran, which is all
 * a migration can do. That is not enough on its own: the seed then created
 * eleven more users and not one of them had a membership, and nothing
 * complained — an account with no membership works perfectly right up until the
 * day it needs a second workspace and has none to offer.
 *
 * So it is repaired here, every boot, rather than trusted to six creation paths
 * all remembering. Once the table is in step this is one indexed anti-join and
 * zero rows.
 *
 * Non-fatal. `User.orgId` remains the account's active organisation either way,
 * so a failure here costs the workspace list, not the login.
 */
try {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const added = await db.$executeRawUnsafe(`
    INSERT INTO "Membership" ("id", "userId", "orgId", "isDefault", "createdAt")
    SELECT 'mbr_' || "u"."id", "u"."id", "u"."orgId", true, NOW()
    FROM "User" AS "u"
    WHERE NOT EXISTS (
      SELECT 1 FROM "Membership" AS "m"
      WHERE "m"."userId" = "u"."id" AND "m"."orgId" = "u"."orgId"
    )
    ON CONFLICT ("userId", "orgId") DO NOTHING
  `);
  if (added > 0) console.log(`[boot] recorded ${added} missing membership(s).`);
  await db.$disconnect();
} catch {
  console.log("[boot] membership sync did not run. Continuing to serve.");
}
