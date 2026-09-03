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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = JSON.parse(readFileSync(join(here, "sample-listings.json"), "utf8")).listings;

const coastal = (city) => city === "Mombasa" || city === "Kwale";

async function main() {
  const listOnly = process.argv.includes("--list");

  // The organisation with the most properties, not merely the oldest: a seeded
  // database also carries small fixture organisations, and the first one by
  // creation date turned out to be one of those, with nowhere to put a listing.
  const orgs = await prisma.organization.findMany({
    where: { approved: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true,
      properties: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, city: true },
      },
    },
  });
  const org = orgs.filter((o) => o.properties.length > 0)
    .sort((a, b) => b.properties.length - a.properties.length)[0];
  if (!org) {
    console.log("No approved organisation has any property to attach a listing to. Run the seed first.");
    return;
  }
  const properties = org.properties;

  // Prefer a property in the same city, so a Mombasa listing is not filed under
  // a Nairobi block. Falls back to the first, which is better than skipping.
  const propertyFor = (city) =>
    properties.find((p) => p.city === city)
    ?? properties.find((p) => coastal(p.city ?? "") === coastal(city))
    ?? properties[0];

  const owner = await prisma.user.findFirst({
    where: { orgId: org.id, isOwner: true },
    select: { id: true },
  });

  const existing = new Set(
    (await prisma.propertyListing.findMany({
      where: { orgId: org.id },
      select: { title: true },
    })).map((l) => l.title),
  );

  const missing = SAMPLE.filter((l) => !existing.has(l.title));

  if (listOnly) {
    console.log(`${org.name}: ${SAMPLE.length - missing.length} of ${SAMPLE.length} sample listings present.`);
    for (const l of SAMPLE) console.log(`  ${existing.has(l.title) ? "✓" : "·"} ${l.title}`);
    return;
  }

  if (missing.length === 0) {
    console.log(`${org.name}: all ${SAMPLE.length} sample listings are already present. Nothing to do.`);
    return;
  }

  for (const l of missing) {
    const property = propertyFor(l.city);
    await prisma.propertyListing.create({
      data: {
        orgId: org.id,
        propertyId: property.id,
        title: l.title, summary: l.summary, description: l.description,
        kind: l.kind, status: "PUBLISHED",
        price: l.price, currency: "KES",
        maxGuests: l.maxGuests, bedrooms: l.bedrooms, bathrooms: l.bathrooms,
        amenities: l.amenities, images: ["/paltas-logo.png"],
        city: l.city, location: l.location,
        hostName: coastal(l.city) ? "Hassan Omar" : "Amina Yusuf",
        hostKind: l.kind === "SALE" ? "Agent" : "Landlord",
        publishedAt: new Date(),
        publishedById: owner?.id ?? null,
        createdById: owner?.id ?? null,
      },
    });
    console.log(`  + ${l.title} → ${property.name}`);
  }

  const total = await prisma.propertyListing.count({ where: { orgId: org.id, status: "PUBLISHED" } });
  console.log(`Added ${missing.length}. ${org.name} now publishes ${total} listings.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
