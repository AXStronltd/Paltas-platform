/**
 * Fetch the property photographs the sample catalogue uses.
 *
 * WHY THESE ARE COMMITTED RATHER THAN HOTLINKED
 *
 * The generated catalogue this replaces pointed at a third-party image host at
 * render time. That makes the shopfront depend on someone else's uptime, breaks
 * the installed PWA the moment it is offline, and leaks every visitor's IP to a
 * company they did not choose. Fifteen files in the repository is a smaller
 * price than any of that.
 *
 * WHY THIS IS A SCRIPT AND NOT A COMMITTED BLOB OF URLS
 *
 * So the provenance of every image is written down. Each entry names its source
 * and its licence, and re-running the script proves the set can be rebuilt from
 * scratch rather than being a pile of files somebody once dropped in.
 *
 * LICENCE
 *
 * All from Unsplash, under the Unsplash Licence: free to use commercially,
 * no permission needed, no attribution required. Attribution is included
 * anyway, in `public/property/CREDITS.md`, because photographers deserve it and
 * because a licence claim nobody can check is worth nothing.
 *
 * WHAT THESE ARE NOT
 *
 * They are stock photographs standing in for sample listings, which are
 * themselves invented. They must never be attached to a real host's listing:
 * showing a stranger's living room as somebody's actual property for sale is
 * not a placeholder, it is a misrepresentation.
 *
 *   node scripts/fetch-property-photos.mjs
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "public/property";

/**
 * One photograph per kind of place the catalogue contains, chosen so a listing
 * gets something plausible rather than a generic house: a riad looks like a
 * riad, a Stockholm flat does not look like a Kenyan beach cottage.
 */
/*
 * EVERY ONE OF THESE HAS BEEN LOOKED AT.
 *
 * That is not fussiness. A photo id says nothing about what the photo shows,
 * and the first pass at this list produced a public fountain for "riad", a
 * wheat field for "land", an apartment block photographed from the pavement
 * below, and one interior that turned out to be the same room as another from
 * a different angle. All four were dropped rather than shipped, because a
 * listing card is an advertisement and a picture that does not show somewhere
 * to stay is worse than no picture.
 *
 * `what` describes the photograph, not the slug's aspiration. If you add one,
 * open it before you commit it.
 */
const PHOTOS = [
  { slug: "villa-pool", id: "photo-1613490493576-7fde63acd811", by: "Vita Vilcina", what: "Modern villa with a pool, palms behind" },
  { slug: "townhouse", id: "photo-1512917774080-9991f1c4c750", by: "Ralph Kayden", what: "White modern house, pool and terrace" },
  { slug: "house-garden", id: "photo-1568605114967-8130f3a36994", by: "Dillon Kydd", what: "Timber house lit at dusk, planted garden" },
  { slug: "cabin-mountain", id: "photo-1449158743715-0a90ebb6d2d8", by: "Bailey Zindel", what: "Log cabin among pines" },
  { slug: "lakeside", id: "photo-1470770841072-f978cf4d019e", by: "Luca Bravo", what: "Timber boathouse on a mountain lake" },
  { slug: "beach-house", id: "photo-1499793983690-e29da59ef1c2", by: "Sasha • Stories", what: "Thatched house over turquoise water" },
  { slug: "terrace-sea", id: "photo-1520250497591-112f2f40a3f4", by: "Roberto Nickson", what: "Tropical pool, thatched villas, hills behind" },
  { slug: "resort-beach", id: "photo-1566073771259-6a8506099945", by: "Sasha • Stories", what: "Beach resort at dusk, pool and loungers" },
  { slug: "hotel-suite", id: "photo-1590490360182-c33d57733427", by: "Point3D Commercial Imaging", what: "Classic hotel bedroom with a sofa" },
  { slug: "apartment-modern", id: "photo-1502672260266-1c1ef2d93688", by: "Patrick Perkins", what: "Small flat, plants and a sofa by the window" },
  { slug: "apartment-city", id: "photo-1522708323590-d24dbb6b0267", by: "Kam Idris", what: "Bright flat, kitchen and living room" },
  { slug: "studio-small", id: "photo-1560448204-e02f11c3d0e2", by: "Sidekix Media", what: "Open-plan living room, wide windows" },
];

/** Wide enough for a card at 2× without being wasteful in the repository. */
const PARAMS = "w=1200&h=800&fit=crop&crop=entropy&q=72&fm=jpg";

mkdirSync(OUT, { recursive: true });

let fetched = 0;
let skipped = 0;
const failures = [];

for (const p of PHOTOS) {
  const file = join(OUT, `${p.slug}.jpg`);
  if (existsSync(file)) { skipped++; continue; }
  const url = `https://images.unsplash.com/${p.id}?${PARAMS}`;
  try {
    const res = await fetch(url);
    if (!res.ok) { failures.push(`${p.slug}: HTTP ${res.status}`); continue; }
    const bytes = Buffer.from(await res.arrayBuffer());
    // A few hundred bytes means an error page, not a photograph.
    if (bytes.length < 10_000) { failures.push(`${p.slug}: ${bytes.length} bytes, not an image`); continue; }
    writeFileSync(file, bytes);
    fetched++;
    console.log(`  ✓ ${p.slug}.jpg  ${(bytes.length / 1024).toFixed(0)} KB  — ${p.what}`);
  } catch (e) {
    failures.push(`${p.slug}: ${e.message}`);
  }
}

const credits = [
  "# Property photographs",
  "",
  "Stock photographs standing in for the sample catalogue. They are **not**",
  "pictures of real properties, and must never be attached to a real host's",
  "listing — showing a stranger's living room as somebody's actual property is",
  "not a placeholder, it is a misrepresentation.",
  "",
  "All from [Unsplash](https://unsplash.com) under the Unsplash Licence: free for",
  "commercial use, no permission needed, no attribution required. Credited anyway.",
  "",
  "Rebuild with `node scripts/fetch-property-photos.mjs`.",
  "",
  "| File | Photographer | Subject |",
  "| --- | --- | --- |",
  ...PHOTOS.map((p) => `| \`${p.slug}.jpg\` | ${p.by} | ${p.what} |`),
  "",
].join("\n");
writeFileSync(join(OUT, "CREDITS.md"), credits);

console.log(`\n${fetched} fetched, ${skipped} already present, ${failures.length} failed.`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
