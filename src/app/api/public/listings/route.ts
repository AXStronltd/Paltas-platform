import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * The public marketplace feed.
 *
 * Unauthenticated by design — a published listing is an advertisement. Like the
 * offers endpoint, it is a separate projection rather than a filtered view of
 * the private query: only PUBLISHED rows, only the fields a shopfront needs, and
 * nothing identifying the tenant, the internal unit, or who drafted it. Building
 * it as its own query means a new private field cannot leak here by default.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const city = url.searchParams.get("city");
    const maxPrice = Number(url.searchParams.get("maxPrice")) || undefined;
    const guests = Number(url.searchParams.get("guests")) || undefined;

    const listings = await prisma.propertyListing.findMany({
      where: {
        status: "PUBLISHED",
        org: { isPlatform: false },
        ...(kind ? { kind: kind as "STAY" | "RENT" | "SALE" } : {}),
        ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
        ...(maxPrice ? { price: { lte: maxPrice } } : {}),
        ...(guests ? { maxGuests: { gte: guests } } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: 60,
      select: {
        id: true, title: true, summary: true, description: true,
        kind: true, price: true, currency: true,
        maxGuests: true, bedrooms: true, bathrooms: true,
        amenities: true, images: true, city: true, location: true,
        hostName: true, hostKind: true, publishedAt: true,
      },
    });

    return ok({
      listings: listings.map((l) => ({
        ...l,
        /** Stated per listing so a shopfront never has to guess the unit. */
        priceUnit: l.kind === "STAY" ? "per night" : l.kind === "RENT" ? "per month" : "total",
      })),
    });
  });
}
