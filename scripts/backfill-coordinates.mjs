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
/*
 * Server-side only, and it needs a key that carries no HTTP referrer
 * restriction — Google refuses those outright for the Geocoding web service,
 * whatever else the key is allowed to do.
 *
 * GOOGLE_GEOCODING_API_KEY exists because that requirement is the opposite of
 * the browser's. The browser key must be referrer-restricted or anybody can
 * lift it off the page and spend your quota; this one must not be, or it
 * cannot make this call at all. One key cannot satisfy both, and trying to
 * make it is how geocoding quietly stopped working while the map kept going.
 *
 * It falls back to GOOGLE_MAPS_API_KEY for deployments where that key is still
 * unrestricted, which is the older single-key arrangement.
 */
const key = (
  process.env.GOOGLE_GEOCODING_API_KEY
  || process.env.GOOGLE_MAPS_API_KEY
  || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  || ""
).trim();
const force = process.argv.includes("--force");

if (!key) {
  console.error("No geocoding key. Set GOOGLE_GEOCODING_API_KEY (server-side, no referrer restriction).");
  process.exit(1);
}

/**
 * The one failure worth interrupting for.
 *
 * A referrer-restricted key does not fail per address, it fails for every
 * address identically — so reporting it once and stopping beats printing the
 * same refusal beside each of a hundred properties, and beats the previous
 * behaviour of failing quietly enough that nobody noticed for a day.
 */
function fatalKeyProblem(message) {
  if (!/referer restrictions/i.test(message ?? "")) return false;
  console.error("\n  The geocoding key has an HTTP referrer restriction, which Google refuses");
  console.error("  for server-side calls. This is expected of the browser key and wrong for");
  console.error("  this one.\n");
  console.error("  Fix: create a second key in Google Cloud with NO application restriction");
  console.error("  (or an IP restriction), limit it to the Geocoding API, and set it in");
  console.error("  Render as GOOGLE_GEOCODING_API_KEY. Leave GOOGLE_MAPS_BROWSER_KEY alone.\n");
  return true;
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
  if (fatalKeyProblem(result.error)) { failed++; break; }
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
