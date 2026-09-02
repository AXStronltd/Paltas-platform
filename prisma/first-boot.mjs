/**
 * Seed, but only into an empty database.
 *
 * A freshly deployed instance has tables and no rows: no listings on the
 * marketplace, and no account anyone can sign in with. Health checks pass —
 * `/api/public/listings` cheerfully returns an empty array — so the deployment
 * looks successful while being unusable.
 *
 * The guard is the point. This counts users first and does nothing at all if
 * there are any. It therefore cannot overwrite real data, however many times it
 * runs, and running it on every boot is safe. That matters because `prisma/seed`
 * itself is destructive by design: it deletes and recreates the demo
 * organisations, which is right for a development database and catastrophic for
 * a live one.
 *
 * Set SKIP_FIRST_BOOT_SEED=true to disable it entirely — for a production
 * instance that should start genuinely empty and be populated by real sign-ups.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.SKIP_FIRST_BOOT_SEED === "true") {
    console.log("[first-boot] SKIP_FIRST_BOOT_SEED is set — leaving the database alone.");
    return;
  }

  const users = await prisma.user.count();
  if (users > 0) {
    console.log(`[first-boot] ${users} users already exist — nothing to do.`);
    return;
  }

  console.log("[first-boot] Empty database. Seeding demo data so the site is usable.");
  if (!process.env.SEED_PASSWORD) {
    // Worth saying out loud on a public host: the seed falls back to a
    // published default, and these accounts can sign in.
    console.warn("[first-boot] SEED_PASSWORD is not set — demo accounts will use the default password.");
  }
  await import("./seed.mjs");
}

main()
  .catch((e) => {
    // A failed seed must not stop the server. An instance serving an empty
    // marketplace is recoverable; one that will not boot is not.
    console.error("[first-boot] Seeding failed, continuing anyway:", e?.message ?? e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
