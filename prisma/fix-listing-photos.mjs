/**
 * Take the PALTAS logo off listings that are wearing it as a photograph.
 *
 * The logo was the placeholder for a listing with no picture, which made a
 * shopfront of fifty-eight properties look like a page of missing images. New
 * databases no longer do this; one that was seeded before the change still has
 * the old rows, and the seed does not run twice.
 *
 * Two rules, and the second one matters more than the first:
 *
 *   A listing whose title is in the sample catalogue gets the photograph the
 *   catalogue chose for it.
 *
 *   Anything else has the logo removed and nothing put in its place. A real
 *   host's listing is a real property a real person is asked to pay for, and a
 *   stock photograph of a different building is not a placeholder — it is a
 *   false statement about the thing being sold. An empty list renders as an
 *   honest "photo coming" panel instead.
 *
 * A listing that already has a genuine photograph is never touched, including
 * one that has the logo *and* a real picture: only the logo is taken out.
 *
 * Run with: node prisma/fix-listing-photos.mjs [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { SAMPLE_LISTINGS } from "./sample-inventory.mjs";

const prisma = new PrismaClient();
const LOGO = "/paltas-logo.png";
const dry = process.argv.includes("--dry");

/**
 * A handful of sample listings are written directly into seed.mjs rather than
 * into sample-listings.json — the hotel with its room types, the tenant-isolation
 * fixtures — so the catalogue alone does not know about them. Named here so they
 * get a photograph too instead of falling through to the empty state.
 */
const INLINE_SEED_PHOTOS = {
  "Bright 1-bed in Kilimani, walk to Yaya": "/property/apartment-city.jpg",
  "Nyali Court Hotel — rooms and suites": "/property/hotel-suite.jpg",
  "Four-bedroom townhouse, Lavington": "/property/house-garden.jpg",
  "Diani Palms — beachfront two-bed": "/property/beach-house.jpg",
};

const photoByTitle = new Map([
  ...SAMPLE_LISTINGS.filter((l) => l.image).map((l) => [l.title, l.image]),
  ...Object.entries(INLINE_SEED_PHOTOS),
]);

async function main() {
  const affected = await prisma.propertyListing.findMany({
    where: { images: { has: LOGO } },
    select: { id: true, title: true, images: true },
  });

  if (affected.length === 0) {
    console.log("No listing is using the logo as a photograph. Nothing to do.");
    return;
  }

  let replaced = 0;
  let emptied = 0;

  for (const l of affected) {
    const withoutLogo = l.images.filter((i) => i !== LOGO);
    const catalogue = photoByTitle.get(l.title);

    let images;
    if (withoutLogo.length > 0) {
      // It already had a real picture behind the logo; keep only that.
      images = withoutLogo;
      replaced++;
    } else if (catalogue) {
      images = [catalogue];
      replaced++;
    } else {
      images = [];
      emptied++;
    }

    console.log(
      `  ${images.length ? "→" : "·"} ${l.title}` +
      (images.length ? `  ${images[0].split("/").pop()}` : "  (no photograph — honest empty state)"),
    );
    if (!dry) {
      await prisma.propertyListing.update({ where: { id: l.id }, data: { images } });
    }
  }

  console.log(
    `\n${dry ? "Would fix" : "Fixed"} ${affected.length}: ` +
    `${replaced} given a photograph, ${emptied} left honestly empty.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
