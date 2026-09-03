/**
 * Add the sample listings to a database that was already seeded.
 *
 * The same gap `sync-roles` closes, for inventory: `seed.mjs` only ever runs on
 * an empty database, so widening the sample catalogue reached new deployments
 * and no existing one. The live marketplace kept showing three listings while
 * the repository described eleven.
 *
 * Two rules:
 *
 *   It only ADDS, matching on title within the organisation. A listing someone
 *   edited, unpublished or repriced is left exactly as it is — this must never
 *   overwrite a decision a host made.
 *
 *   It attaches to whichever property already exists in that organisation, so
 *   it creates no buildings and invents no addresses.
 *
 * These rows are sample inventory for a platform that has not launched. Delete
 * them once real hosts publish: `npm run db:sync-listings -- --list` names them.
 *
 * Run with: npm run db:sync-listings
 */
import { PrismaClient } from "@prisma/client";
import { addMissingSampleListings, SAMPLE_LISTINGS } from "./sample-inventory.mjs";

const prisma = new PrismaClient();

async function main() {
  const listOnly = process.argv.includes("--list");

  // The organisation with the most properties, not merely the oldest: a seeded
  // database also carries small fixture organisations, and the first one by
  // creation date turned out to be one of those, with nowhere to put a listing.
  const orgs = await prisma.organization.findMany({
    where: { approved: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, _count: { select: { properties: true } } },
  });
  const org = orgs.filter((o) => o._count.properties > 0)
    .sort((a, b) => b._count.properties - a._count.properties)[0];
  if (!org) {
    console.log("No approved organisation has any property. Run the seed first.");
    return;
  }

  const present = new Set(
    (await prisma.propertyListing.findMany({
      where: { orgId: org.id },
      select: { title: true },
    })).map((l) => l.title),
  );

  if (listOnly) {
    const have = SAMPLE_LISTINGS.filter((l) => present.has(l.title)).length;
    console.log(`${org.name}: ${have} of ${SAMPLE_LISTINGS.length} sample listings present.`);
    for (const l of SAMPLE_LISTINGS) {
      console.log(`  ${present.has(l.title) ? "✓" : "·"} ${l.title} — ${l.city}, ${l.country}`);
    }
    return;
  }

  const owner = await prisma.user.findFirst({
    where: { orgId: org.id, isOwner: true },
    select: { id: true },
  });

  const { added, total } = await addMissingSampleListings(prisma, {
    orgId: org.id,
    ownerId: owner?.id,
    log: (line) => console.log(line),
  });

  if (added === 0) {
    console.log(`${org.name}: all ${total} sample listings are already present. Nothing to do.`);
    return;
  }

  const published = await prisma.propertyListing.count({
    where: { orgId: org.id, status: "PUBLISHED" },
  });
  const cities = await prisma.propertyListing.findMany({
    where: { orgId: org.id, status: "PUBLISHED" },
    select: { city: true }, distinct: ["city"],
  });
  console.log(`Added ${added}. ${org.name} now publishes ${published} listings across ${cities.length} cities.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
