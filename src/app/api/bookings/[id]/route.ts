import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok, fail } from "@/server/http";
import { requireGuest } from "@/server/guest";

export const dynamic = "force-dynamic";

/** One booking, readable only by the guest who made it. */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const auth = await requireGuest();
    if (!auth.ok) return fail(401, { code: "unauthenticated", message: "Sign in to continue." });

    const booking = await prisma.booking.findFirst({
      // The ownership test is part of the query, not a check afterwards — there
      // is then no path where the row is loaded and the check is skipped.
      where: { id: params.id, guestId: auth.guest.id },
      select: {
        id: true, reference: true, checkIn: true, checkOut: true, nights: true,
        guests: true, rooms: true, nightlyRate: true, subtotal: true, cleaningFee: true,
        serviceFee: true, taxes: true, discountAmount: true, total: true, currency: true,
        status: true, guestNote: true, cancelReason: true, createdAt: true, confirmedAt: true,
        listing: {
          select: {
            id: true, title: true, description: true, city: true, location: true,
            images: true, hostName: true, hostKind: true, kind: true, amenities: true,
          },
        },
        roomType: { select: { name: true, beds: true } },
        events: { orderBy: { at: "asc" }, select: { status: true, note: true, at: true, actor: true } },
        review: { select: { id: true, stars: true, body: true, hostReply: true } },
      },
    });

    if (!booking) return fail(404, { code: "not_found", message: "Booking not found." });
    return ok({ booking });
  });
}
