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
        id: true, title: true, summary: true, description: true, kind: true,
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

    const stars = listing.reviews.map((r) => r.stars);
    const rating = stars.length
      ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10
      : null;

    return ok({
      listing: {
        ...listing,
        priceUnit: listing.kind === "STAY" ? "per night" : listing.kind === "RENT" ? "per month" : "total",
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
