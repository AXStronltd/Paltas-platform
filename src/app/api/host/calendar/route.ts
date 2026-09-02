import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";
import { peakOccupancy, overlaps } from "@/lib/booking/availability";

export const dynamic = "force-dynamic";

/** A day, at UTC midnight — the grid is per night, not per instant. */
function midnight(offsetDays: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/**
 * The host's availability grid: how many of each room type are free, per night.
 *
 * Computed here rather than in the browser, using the same engine the booking
 * path uses. A dashboard that estimated its own occupancy would eventually
 * disagree with what the booking endpoint will actually sell, and the host would
 * believe the dashboard.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(60, Number(url.searchParams.get("days")) || 14));
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.ROOMTYPE_VIEW);
    if (!g.ok) return g.response;

    const from = midnight(0);
    const to = midnight(days);

    const roomTypes = await prisma.hotelRoomType.findMany({
      where: { ...whereByProperty(g.access), active: true, ...(propertyId ? { propertyId } : {}) },
      orderBy: { rate: "asc" },
      select: { id: true, name: true, rate: true, currency: true, totalRooms: true, propertyId: true },
    });
    if (roomTypes.length === 0) return ok({ days: [], rows: [], from, to });

    const ids = roomTypes.map((r) => r.id);
    const [bookings, blocks] = await Promise.all([
      prisma.booking.findMany({
        where: {
          roomTypeId: { in: ids },
          status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED"] },
          checkIn: { lt: to }, checkOut: { gt: from },
        },
        select: { roomTypeId: true, checkIn: true, checkOut: true, rooms: true },
      }),
      prisma.availabilityBlock.findMany({
        where: {
          OR: [{ roomTypeId: { in: ids } }, { propertyId: { in: roomTypes.map((r) => r.propertyId) } }],
          from: { lt: to }, to: { gt: from },
        },
        select: { roomTypeId: true, propertyId: true, from: true, to: true, reason: true },
      }),
    ]);

    const grid = Array.from({ length: days }, (_, i) => ({ from: midnight(i), to: midnight(i + 1) }));

    const rows = roomTypes.map((rt) => {
      const mine = bookings
        .filter((b) => b.roomTypeId === rt.id)
        .map((b) => ({ from: b.checkIn, to: b.checkOut, rooms: b.rooms }));
      // A block on the property closes every room type in it; a block naming a
      // room type closes only that one.
      const myBlocks = blocks.filter((b) => b.roomTypeId === rt.id || (!b.roomTypeId && b.propertyId === rt.propertyId));

      return {
        roomTypeId: rt.id,
        name: rt.name,
        rate: rt.rate,
        currency: rt.currency,
        totalRooms: rt.totalRooms,
        nights: grid.map((night) => {
          const block = myBlocks.find((b) => overlaps(b, night));
          if (block) return { date: night.from, available: 0, blocked: true, reason: block.reason };
          const taken = peakOccupancy(mine, night);
          return { date: night.from, available: Math.max(0, rt.totalRooms - taken), blocked: false, reason: null };
        }),
      };
    });

    return ok({
      from, to,
      days: grid.map((d) => d.from),
      rows,
      // Occupancy tonight, across every room type the caller can see.
      tonight: (() => {
        const total = rows.reduce((t, r) => t + r.totalRooms, 0);
        const free = rows.reduce((t, r) => t + (r.nights[0]?.available ?? 0), 0);
        return { total, free, occupancyPct: total === 0 ? 0 : Math.round(((total - free) / total) * 100) };
      })(),
    });
  });
}
