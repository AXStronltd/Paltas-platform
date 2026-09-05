/**
 * Give our properties coordinates, once.
 *
 * Nothing about "near me" can work while a property is only an address string,
 * and geocoding one on every search would be both slow and somebody's bill.
 * So it happens here: each property is resolved once, the result is stored, and
 * every search afterwards is a comparison between numbers we already hold.
 *
 *   GOOGLE_MAPS_API_KEY=... node scripts/backfill-coordinates.mjs [--force]
 *
 * Idempotent: a property that already has coordinates is skipped unless --force
 * is passed, so this can be re-run after adding inventory without re-billing
 * for the rows it did last time.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const key = (process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
const force = process.argv.includes("--force");

if (!key) {
  console.error("GOOGLE_MAPS_API_KEY is not set. Nothing to geocode with.");
  process.exit(1);
}

/** Google asks for no more than 50 requests a second; this is well under. */
const PAUSE_MS = 120;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address, country) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  // The country as a restriction rather than in the string: a two-letter code
  // concatenated into an address is just more text, and Google reads several of
  // them as US states — "Medina, Marrakesh, MA" resolves to Massachusetts.
  if (country) url.searchParams.set("components", `country:${country}`);
  url.searchParams.set("key", key);

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (payload.status !== "OK" || !payload.results?.length) {
    return { error: payload.error_message || payload.status };
  }
  const best = payload.results[0];
  return {
    latitude: best.geometry?.location?.lat,
    longitude: best.geometry?.location?.lng,
    placeId: best.place_id,
    formatted: best.formatted_address,
  };
}

const properties = await db.property.findMany({
  where: force ? {} : { OR: [{ latitude: null }, { longitude: null }] },
  select: { id: true, name: true, address: true, city: true, country: true },
});

console.log(`${properties.length} propert${properties.length === 1 ? "y" : "ies"} to geocode.\n`);

let done = 0, failed = 0, skipped = 0;
for (const property of properties) {
  // The address as a person would write it, most specific part first.
  const address = [property.address, property.city].filter(Boolean).join(", ");
  if (!address) {
    console.log(`  – ${property.name}: no address or city to work from`);
    skipped++;
    continue;
  }

  const result = await geocode(address, property.country);
  if (result.error || result.latitude == null) {
    console.log(`  ✗ ${property.name} (${address}): ${result.error ?? "no result"}`);
    failed++;
  } else {
    await db.property.update({
      where: { id: property.id },
      data: { latitude: result.latitude, longitude: result.longitude, placeId: result.placeId },
    });
    console.log(`  ✓ ${property.name} → ${result.formatted}`);
    done++;
  }
  await wait(PAUSE_MS);
}

console.log(`\n${done} geocoded, ${failed} failed, ${skipped} had no address.`);
await db.$disconnect();
process.exit(failed && !done ? 1 : 0);
