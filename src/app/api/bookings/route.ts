import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok, fail } from "@/server/http";
import { requireGuest } from "@/server/guest";
import { createBooking } from "@/server/booking";

export const dynamic = "force-dynamic";

/**
 * A guest's own bookings.
 *
 * Scoped by the session, never by a client-supplied id — a `?guestId=` filter
 * would be a lookup table of everyone else's travel plans.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const auth = await requireGuest();
    if (!auth.ok) return fail(401, { code: "unauthenticated", message: "Sign in to see your bookings." });

    const bookings = await prisma.booking.findMany({
      where: { guestId: auth.guest.id },
      orderBy: { checkIn: "desc" },
      take: 100,
      select: {
        id: true, reference: true, checkIn: true, checkOut: true, nights: true,
        guests: true, rooms: true, total: true, currency: true, status: true,
        createdAt: true, cancelReason: true,
        listing: { select: { id: true, title: true, city: true, images: true, hostName: true, kind: true } },
        roomType: { select: { name: true } },
        review: { select: { id: true, stars: true } },
      },
    });

    return ok({ bookings });
  });
}

/**
 * Request a booking.
 *
 * Takes dates, a listing and a count — never a price. The total is computed
 * server-side from the listing's own rate, so editing the payload changes
 * nothing about what is owed.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const auth = await requireGuest();
    if (!auth.ok) return fail(401, { code: "unauthenticated", message: "Sign in to book." });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, { code: "bad_request", message: "Expected a JSON body." });

    const listingId = typeof body.listingId === "string" ? body.listingId : "";
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8
        ? body.idempotencyKey
        : "";
    if (!listingId) return fail(400, { code: "bad_request", message: "A listing is required." });
    if (!idempotencyKey) {
      // Without one, a double tap becomes a double booking. Refuse rather than
      // inventing a key server-side, which would defeat the point.
      return fail(400, { code: "bad_request", message: "An idempotency key of at least 8 characters is required." });
    }

    const checkIn = new Date(String(body.checkIn));
    const checkOut = new Date(String(body.checkOut));
    const guests = Math.max(1, Math.min(50, Number(body.guests) || 1));
    const rooms = Math.max(1, Math.min(20, Number(body.rooms) || 1));

    const result = await createBooking(auth.guest.id, {
      listingId,
      roomTypeId: typeof body.roomTypeId === "string" ? body.roomTypeId : null,
      checkIn, checkOut, guests, rooms,
      guestNote: typeof body.guestNote === "string" ? body.guestNote.slice(0, 800) : null,
      idempotencyKey,
    });

    if (!result.ok) {
      return fail(result.status, {
        code: result.status === 409 ? "conflict" : "bad_request",
        message: result.error,
      });
    }

    // A replayed request is not a new booking, so it answers 200, not 201.
    return ok({ booking: result.booking, reused: result.reused }, result.reused ? 200 : 201);
  });
}
