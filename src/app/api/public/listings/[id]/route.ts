import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok, fail } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * One published listing, for the public detail page.
 *
 * Like the feed, this is its own projection rather than a filtered private
 * query: only PUBLISHED rows, and only the fields a shopfront needs. Reviews
 * come with a first name only — a guest reviewing a stay is not consenting to
 * have their full identity indexed alongside the dates they were there.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const listing = await prisma.propertyListing.findFirst({
      where: { id: params.id, status: "PUBLISHED", org: { isPlatform: false } },
      select: {
        id: true, orgId: true, propertyId: true,
        title: true, summary: true, description: true, kind: true,
        price: true, currency: true, maxGuests: true, bedrooms: true, bathrooms: true,
        amenities: true, images: true, city: true, location: true,
        hostName: true, hostKind: true, publishedAt: true,
        roomTypes: {
          where: { active: true },
          orderBy: { rate: "asc" },
          select: {
            id: true, name: true, description: true, rate: true, currency: true,
            totalRooms: true, maxGuests: true, beds: true, amenities: true,
          },
        },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true, stars: true, title: true, body: true, hostReply: true, createdAt: true,
            guest: { select: { name: true } },
          },
        },
      },
    });

    if (!listing) return fail(404, { code: "not_found", message: "Listing not found." });

    // The rest of the trip: transfers, cleaning, a driver. Deciding where to
    // stay and how to get there from the airport is one decision, not two.
    //
    // Queried separately rather than through the relation, because an offering
    // may be attached to the listing, the property, or the whole organisation.
    // These conditions must match what priceAndCheck accepts exactly — a
    // service shown here and refused at checkout is worse than one never shown.
    const services = await prisma.serviceOffering.findMany({
      where: {
        active: true,
        orgId: listing.orgId,
        OR: [{ propertyId: null }, { propertyId: listing.propertyId }, { listingId: listing.id }],
      },
      orderBy: [{ kind: "asc" }, { price: "asc" }],
      select: {
        id: true, kind: true, name: true, description: true,
        price: true, currency: true, pricing: true,
        noticeHours: true, providerName: true,
      },
    });

    const stars = listing.reviews.map((r) => r.stars);
    const rating = stars.length
      ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10
      : null;

    // Stripped on the way out: they were needed to find the services, and a
    // public projection must not carry a tenant or internal identifier.
    const { orgId: _org, propertyId: _prop, ...publicListing } = listing;

    return ok({
      listing: {
        ...publicListing,
        priceUnit: listing.kind === "STAY" ? "per night" : listing.kind === "RENT" ? "per month" : "total",
        services,
        rating,
        reviewCount: stars.length,
        reviews: listing.reviews.map(({ guest, ...r }) => ({
          ...r,
          // First name only. Enough to read as a person, not enough to identify one.
          guestName: guest.name.split(" ")[0],
        })),
      },
    });
  });
}
