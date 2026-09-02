import { NextResponse } from "next/server";
import { handle, ok, fail } from "@/server/http";
import { priceAndCheck } from "@/server/booking";

export const dynamic = "force-dynamic";

/**
 * What would this stay cost, and can it be had?
 *
 * Public and unauthenticated: a shopfront must be able to show a total before
 * asking anyone to sign in. It writes nothing and holds nothing, so its answer
 * can go stale — `POST /api/bookings` re-checks under a transaction and that
 * check is the one that decides. Said plainly here so nobody later treats an
 * available quote as a reservation.
 */
export async function GET(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const checkIn = new Date(String(url.searchParams.get("checkIn")));
    const checkOut = new Date(String(url.searchParams.get("checkOut")));
    const rooms = Math.max(1, Math.min(20, Number(url.searchParams.get("rooms")) || 1));
    const roomTypeId = url.searchParams.get("roomTypeId");

    const result = await priceAndCheck({
      listingId: params.id,
      roomTypeId,
      checkIn,
      checkOut,
      rooms,
    });

    if (!result.ok) {
      return fail(result.status, {
        code: result.status === 404 ? "not_found" : "bad_request",
        message: result.error,
      });
    }

    return ok({
      available: result.availability.available,
      reason: result.availability.reason ?? null,
      roomsLeft: result.availability.roomsLeft,
      quote: result.quote,
      /** Advisory only — the booking request re-checks under a lock. */
      provisional: true,
    });
  });
}
