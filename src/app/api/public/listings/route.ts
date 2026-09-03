import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok } from "@/server/http";
import { HOLDS_INVENTORY } from "@/server/booking";
import { peakOccupancy } from "@/lib/booking/availability";

export const dynamic = "force-dynamic";

/** A calendar date, or nothing. Anything else is ignored rather than guessed at. */
function day(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The public marketplace feed.
 *
 * Unauthenticated by design — a published listing is an advertisement. Like the
 * offers endpoint, it is a separate projection rather than a filtered view of
 * the private query: only PUBLISHED rows, only the fields a shopfront needs, and
 * nothing identifying the tenant, the internal unit, or who drafted it. Building
 * it as its own query means a new private field cannot leak here by default.
 *
 * `availableFrom` / `availableTo` exist because the homepage says things like
 * "Available this weekend in Diani". That is a promise about inventory, and the
 * only honest way to print it is to ask the same tables a booking asks. The
 * answer is advisory in the same sense as the quote endpoint: `createBooking`
 * re-checks under a serializable transaction, and that check is the one that
 * decides.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const city = url.searchParams.get("city");
    const country = url.searchParams.get("country");
    const maxPrice = Number(url.searchParams.get("maxPrice")) || undefined;
    const guests = Number(url.searchParams.get("guests")) || undefined;
    const from = day(url.searchParams.get("availableFrom"));
    const to = day(url.searchParams.get("availableTo"));
    // A backwards or zero-length window is not a question about availability.
    const window = from && to && to > from ? { from, to } : null;

    const listings = await prisma.propertyListing.findMany({
      where: {
        status: "PUBLISHED",
        org: { isPlatform: false },
        ...(kind ? { kind: kind as "STAY" | "RENT" | "SALE" } : {}),
        ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
        ...(country ? { country: country.toUpperCase() } : {}),
        ...(maxPrice ? { price: { lte: maxPrice } } : {}),
        ...(guests ? { maxGuests: { gte: guests } } : {}),
      },
      orderBy: { publishedAt: "desc" },
      // Enough for a homepage of themed rows drawn from one fetch. The rows
      // overlap, so this is the whole shopfront rather than one row's worth.
      take: 200,
      select: {
        id: true, title: true, summary: true, description: true,
        kind: true, price: true, currency: true,
        maxGuests: true, bedrooms: true, bathrooms: true,
        amenities: true, images: true, city: true, location: true, country: true,
        hostName: true, hostKind: true, publishedAt: true,
        ...(window ? { roomTypes: { select: { id: true, totalRooms: true } } } : {}),
      },
    });

    const available = window
      ? new Set(await availableIn(
          listings.map((l) => ({
            id: l.id,
            // Zero means the whole place is let as one, not that it has no rooms.
            totalRooms: ("roomTypes" in l ? l.roomTypes : []).reduce((n, r) => n + r.totalRooms, 0),
          })),
          window,
        ))
      : null;

    return ok({
      listings: listings
        .filter((l) => !available || available.has(l.id))
        .map(({ roomTypes, ...l }) => ({
          ...l,
          /** Stated per listing so a shopfront never has to guess the unit. */
          priceUnit: l.kind === "STAY" ? "per night" : l.kind === "RENT" ? "per month" : "total",
        })),
    });
  });
}

/**
 * Which of these listings could take a stay across the whole window.
 *
 * Two queries rather than one per listing, because the homepage asks this for
 * several date ranges at once and a row is not worth a hundred round trips.
 *
 * A block is absolute: a host who closed the dates has closed them. Bookings
 * count differently depending on what is being sold. A whole house is gone if
 * anything overlaps it. A hotel with twelve rooms and one booking has eleven
 * left, so its rooms are counted at their busiest point in the window rather
 * than summed — the same peak, and the same half-open convention, the booking
 * engine uses when it decides for real.
 */
async function availableIn(
  candidates: { id: string; totalRooms: number }[],
  window: { from: Date; to: Date },
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);

  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        listingId: { in: ids },
        status: { in: HOLDS_INVENTORY },
        checkIn: { lt: window.to },
        checkOut: { gt: window.from },
      },
      select: { listingId: true, checkIn: true, checkOut: true, rooms: true },
    }),
    prisma.availabilityBlock.findMany({
      where: {
        listingId: { in: ids },
        from: { lt: window.to },
        to: { gt: window.from },
      },
      select: { listingId: true },
    }),
  ]);

  const blocked = new Set(blocks.map((b) => b.listingId).filter(Boolean) as string[]);
  const byListing = new Map<string, { from: Date; to: Date; rooms: number }[]>();
  for (const b of bookings) {
    byListing.set(b.listingId, [
      ...(byListing.get(b.listingId) ?? []),
      { from: b.checkIn, to: b.checkOut, rooms: b.rooms },
    ]);
  }

  return candidates
    .filter((c) => {
      if (blocked.has(c.id)) return false;
      const taken = byListing.get(c.id) ?? [];
      if (taken.length === 0) return true;
      // Only a listing that sells rooms can be partly booked and still open.
      if (c.totalRooms <= 0) return false;
      return peakOccupancy(taken, window) < c.totalRooms;
    })
    .map((c) => c.id);
}
