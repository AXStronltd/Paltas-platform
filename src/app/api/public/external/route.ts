import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok } from "@/server/http";
import { evaluateLicence, applyLicence } from "@/lib/external/licence";

export const dynamic = "force-dynamic";

/**
 * Third-party listings, for the public marketplace.
 *
 * A separate endpoint from /api/public/listings on purpose. These are other
 * people's properties, described in other people's words, and this platform
 * cannot vouch for them, cannot take a booking for them, and does not hold the
 * money. Mixing them into the same response as our own hosts' inventory would
 * make all four of those things ambiguous to whoever consumes it.
 *
 * Three defences, deliberately redundant, because publishing an unlicensed
 * photograph commercially is not a bug you get to fix after the fact:
 *
 *   1. The query filters on `displayable`, a column the licence gate wrote.
 *   2. The gate is re-evaluated here at read time, so a licence that expired
 *      an hour ago stops publishing without waiting for a sweep.
 *   3. `applyLicence` strips images and agent contact details out of the
 *      payload when those specific rights are absent — removed, not hidden,
 *      because hidden is one CSS change away from published.
 *
 * Every row says what it is and where it came from. A visitor must never be
 * left thinking they can book this here.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const country = url.searchParams.get("country");
    const city = url.searchParams.get("city");
    const kind = url.searchParams.get("kind");
    const take = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 30));

    const rows = await prisma.externalListing.findMany({
      where: {
        // Defence 1. Written by the gate; never computed in this query.
        displayable: true,
        suppressed: false,
        goneAt: null,
        ...(country ? { country: country.toUpperCase() } : {}),
        ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
        ...(kind ? { kind: kind.toUpperCase() } : {}),
        source: { active: true },
      },
      orderBy: { lastSeenAt: "desc" },
      take,
      select: {
        id: true, title: true, description: true, kind: true,
        price: true, currency: true, priceRaw: true,
        country: true, city: true, district: true,
        bedrooms: true, bathrooms: true, areaSqm: true,
        amenities: true, images: true,
        agentName: true, agentPhone: true, agentEmail: true, agencyName: true,
        sourceUrl: true, sourceSite: true, lastSeenAt: true,
        source: {
          select: {
            key: true, name: true, attribution: true, licenceStatus: true,
            displayRights: true, imageRights: true, contactDataRights: true,
            territories: true, licenceExpiry: true, active: true,
          },
        },
      },
    });

    const now = new Date();
    const listings = rows
      .map((row) => {
        // Defence 2. The stored flag could be stale by up to one sweep; the
        // licence itself is the authority and it is checked again here.
        const verdict = evaluateLicence({
          key: row.source.key,
          licenceStatus: row.source.licenceStatus,
          displayRights: row.source.displayRights,
          imageRights: row.source.imageRights,
          contactDataRights: row.source.contactDataRights,
          territories: row.source.territories,
          licenceExpiry: row.source.licenceExpiry,
          active: row.source.active,
        }, { country: row.country }, now);

        if (!verdict.displayable) return null;

        // Defence 3. Strip, do not hide.
        const { source, ...listing } = applyLicence(row, verdict);

        return {
          ...listing,
          /** Stated on every row, so no consumer can mistake it for our own. */
          external: true,
          bookable: false,
          provider: source.name,
          attribution: source.attribution,
          /** Where to see it, and whom to contact about it. */
          sourceUrl: listing.sourceUrl,
          disclosure:
            "Listed by a third party and shown here for reference. PALTAS does not "
            + "verify, represent or take payment for this property.",
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    return ok({
      listings,
      /** Said plainly so a client cannot present these as bookable inventory. */
      external: true,
      bookable: false,
      notice: "Third-party listings, shown for reference only. Bookings are not taken through PALTAS.",
    });
  });
}
