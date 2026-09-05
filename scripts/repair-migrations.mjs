/**
 * Report a deployment whose migration history has a failed entry.
 *
 * Read-only, deliberately. Prisma records a migration that errored as failed
 * and then refuses to apply anything after it — correctly, since continuing
 * past a possibly half-applied schema is how a database reaches a state nobody
 * can reason about. Clearing that is a decision with consequences, and it
 * belongs to a person with Prisma's own supported command rather than to a
 * script that might run unattended.
 *
 *   DATABASE_URL=... node scripts/repair-migrations.mjs
 *
 * What it is for: the symptom is invisible from outside. The container starts
 * whether or not migrations applied, so the site serves a build whose schema is
 * older than its code, and the failure surfaces later as a 500 from whichever
 * endpoint touches the missing column — a long way from the cause.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const failed = await db.$queryRawUnsafe(`
  SELECT migration_name, started_at, logs
  FROM "_prisma_migrations"
  WHERE finished_at IS NULL AND rolled_back_at IS NULL
  ORDER BY started_at ASC
`);

const applied = await db.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
`);

console.log(`\n${applied[0].n} migration(s) applied.`);

if (!failed.length) {
  console.log("No failed migrations. Nothing to repair.\n");
  await db.$disconnect();
  process.exit(0);
}

console.log(`\n${failed.length} FAILED — everything after this is blocked:\n`);
for (const m of failed) {
  console.log(`  ${m.migration_name}`);
  console.log(`    started: ${m.started_at}`);
  console.log(`    error:   ${String(m.logs ?? "").split("\n").find((l) => l.trim())?.slice(0, 140) ?? "(none recorded)"}\n`);
}

console.log("To clear it, once you have confirmed the migration left nothing behind");
console.log("(Postgres runs each in a transaction, so a syntax error leaves no objects):\n");
for (const m of failed) {
  console.log(`  npx prisma migrate resolve --rolled-back ${m.migration_name}`);
}
console.log("  npx prisma migrate deploy\n");

await db.$disconnect();
process.exit(1);
