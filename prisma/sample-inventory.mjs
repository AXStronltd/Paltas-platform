import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Putting the sample catalogue into a database.
 *
 * Shared by `seed.mjs`, which runs once on an empty database, and by
 * `sync-listings.mjs`, which tops up one that was seeded before the catalogue
 * grew. They used to place listings differently — the seed filed anything
 * coastal under Nyali Court and everything else under Kilimani Heights — which
 * was serviceable while every property was in Kenya and nonsense the moment one
 * was in Paris. One placement rule, in one file, so the two cannot drift.
 *
 * Everything here only ever ADDS. A listing whose title already exists in the
 * organisation is left exactly as it is: someone may have edited its price,
 * unpublished it, or rewritten its description, and a top-up must not overrule
 * a decision a person made.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CATALOGUE = JSON.parse(readFileSync(join(here, "sample-listings.json"), "utf8"));

export const SAMPLE_PROPERTIES = CATALOGUE.properties;
export const SAMPLE_LISTINGS = CATALOGUE.listings;

/**
 * The photograph a sample listing shows.
 *
 * Every sample listing used to wear the PALTAS logo, which made the whole
 * shopfront look like a page of missing images. They now carry a real
 * photograph chosen to suit the listing — see public/property/CREDITS.md.
 *
 * These are stock photographs standing in for invented properties. They are
 * only ever attached here, to the sample catalogue. A real host's listing with
 * no photograph gets an honest empty state instead: showing a stranger's living
 * room as somebody's actual property is not a placeholder, it is a lie about
 * something a person is being asked to pay for.
 */
const FALLBACK_PHOTO = "/property/apartment-city.jpg";

/** Deterministic, so re-running places a listing on the same day it did before. */
function publishedDaysAgo(title, now) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return new Date(now.getTime() - ((hash % 45) + 1) * 86_400_000);
}

/**
 * Ensure every property the catalogue refers to exists in this organisation,
 * returning a name → id map. Matching is by name within the organisation, so a
 * property someone renamed is treated as absent and a fresh one is created
 * rather than a stranger's building being quietly written to.
 */
export async function ensureSampleProperties(prisma, orgId, log = () => {}) {
  const existing = await prisma.property.findMany({
    where: { orgId },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((p) => [p.name, p.id]));

  for (const spec of SAMPLE_PROPERTIES) {
    if (byName.has(spec.name)) continue;
    const created = await prisma.property.create({
      data: {
        orgId,
        name: spec.name,
        address: spec.address,
        city: spec.city,
        country: spec.country,
      },
      select: { id: true },
    });
    byName.set(spec.name, created.id);
    log(`  + property ${spec.name} (${spec.city}, ${spec.country})`);
  }

  return byName;
}

/**
 * Add every sample listing this organisation does not already have.
 *
 * `now` is passed in rather than read, so a seeded database and a topped-up one
 * can be given the same clock in a test.
 */
export async function addMissingSampleListings(prisma, {
  orgId, ownerId, createdById, now = new Date(), log = () => {},
}) {
  const properties = await ensureSampleProperties(prisma, orgId, log);

  const present = new Set(
    (await prisma.propertyListing.findMany({
      where: { orgId },
      select: { title: true },
    })).map((l) => l.title),
  );

  const missing = SAMPLE_LISTINGS.filter((l) => !present.has(l.title));
  for (const l of missing) {
    const propertyId = properties.get(l.property);
    if (!propertyId) {
      log(`  ! ${l.title} names property "${l.property}", which is not in the catalogue`);
      continue;
    }
    await prisma.propertyListing.create({
      data: {
        orgId,
        propertyId,
        title: l.title, summary: l.summary, description: l.description,
        kind: l.kind, status: "PUBLISHED",
        // Each city's own currency, never converted — a price quoted in one
        // currency and charged in another is a broken promise, not a rounding.
        price: l.price, currency: l.currency,
        maxGuests: l.maxGuests, bedrooms: l.bedrooms, bathrooms: l.bathrooms,
        amenities: l.amenities, images: [l.image ?? FALLBACK_PHOTO],
        city: l.city, location: l.location, country: l.country,
        hostName: l.hostName ?? "Amina Yusuf",
        hostKind: l.kind === "SALE" ? "Agent" : "Landlord",
        publishedAt: publishedDaysAgo(l.title, now),
        publishedById: ownerId ?? null,
        createdById: createdById ?? ownerId ?? null,
      },
    });
    log(`  + ${l.title} — ${l.city}, ${l.country}`);
  }

  return { added: missing.length, total: SAMPLE_LISTINGS.length };
}
