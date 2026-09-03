import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { BookingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * The host's arrivals board.
 *
 * Scoped like every other staff list: a guard assigned to one building sees the
 * bookings for that building's property and no further. The guest's contact
 * details are included because a front desk genuinely needs them — but this is
 * the only staff endpoint that returns them, and it is behind booking.view.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as BookingStatus | null;
    const propertyId = url.searchParams.get("propertyId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const g = await guardList(PERMISSIONS.BOOKING_VIEW);
    if (!g.ok) return g.response;

    const bookings = await prisma.booking.findMany({
      where: {
        // Booking is keyed by propertyId (and unitId), not by the Property
        // table's own id — see the note on whereForUnitTable for why that
        // distinction has its own helpers.
        ...whereByPropertyOrUnit(g.access),
        ...(status ? { status } : {}),
        ...(propertyId ? { propertyId } : {}),
        // A date window filters on overlap, not on check-in alone — a guest
        // mid-stay on the day being viewed is very much an arrival board entry.
        ...(from && to ? { checkIn: { lt: new Date(to) }, checkOut: { gt: new Date(from) } } : {}),
      },
      orderBy: { checkIn: "asc" },
      take: 300,
      select: {
        id: true, reference: true, checkIn: true, checkOut: true, nights: true,
        guests: true, rooms: true, total: true, currency: true, status: true,
        guestNote: true, createdAt: true, confirmedAt: true, cancelReason: true,
        guest: { select: { id: true, name: true, email: true, phone: true, country: true } },
        listing: { select: { id: true, title: true } },
        property: { select: { id: true, name: true } },
        roomType: { select: { id: true, name: true } },
        addonsTotal: true,
        // What else has to be arranged: a transfer to meet, a clean to book.
        addons: {
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, kind: true, quantity: true, amount: true,
                    currency: true, scheduledFor: true, note: true, status: true },
        },
      },
    });

    const counts = bookings.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] ?? 0) + 1;
      return acc;
    }, {});

    return ok({
      bookings,
      counts,
      // Revenue from bookings that still stand. Cancelled ones are excluded —
      // counting them would flatter every dashboard on the platform.
      revenue: bookings
        .filter((b) => b.status !== "CANCELLED" && b.status !== "REFUNDED")
        .reduce((total, b) => total + b.total, 0),
    });
  });
}
