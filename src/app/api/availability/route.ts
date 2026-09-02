import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { isValidRange } from "@/lib/booking/availability";

export const dynamic = "force-dynamic";

/**
 * Dates a host has withheld from sale.
 *
 * Blocks are absolute: a blocked date cannot be booked however much inventory
 * is otherwise free. That is what makes them useful for maintenance, an owner's
 * own stay, or a closed season — and why creating one is a permission of its
 * own rather than part of general listing editing.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const listingId = url.searchParams.get("listingId");

    const g = await guardList(PERMISSIONS.ROOMTYPE_VIEW);
    if (!g.ok) return g.response;

    const blocks = await prisma.availabilityBlock.findMany({
      where: {
        ...whereByProperty(g.access),
        ...(propertyId ? { propertyId } : {}),
        ...(listingId ? { listingId } : {}),
      },
      orderBy: { from: "asc" },
      include: {
        property: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true } },
        roomType: { select: { id: true, name: true } },
      },
      take: 300,
    });

    return ok({ blocks });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; listingId?: string; roomTypeId?: string;
      from?: string; to?: string; reason?: string;
    }>(req);
    if (!body?.propertyId) return badRequest("A property is required.");
    if (!body.reason?.trim()) return badRequest("A block needs a reason — it is what the host sees months later.");

    const from = new Date(String(body.from));
    const to = new Date(String(body.to));
    // Past dates are allowed here, unlike a booking: a host recording that the
    // property was closed last month is legitimate record-keeping.
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return badRequest("Those dates are not valid.");
    if (to <= from) return badRequest("The block must end after it starts.");

    const g = await guard(PERMISSIONS.AVAILABILITY_MANAGE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    // Both must belong to the property being blocked, or a host could withhold
    // dates on somebody else's listing.
    if (body.listingId) {
      const listing = await prisma.propertyListing.findFirst({
        where: { id: body.listingId, propertyId: body.propertyId }, select: { id: true },
      });
      if (!listing) return badRequest("That listing does not belong to this property.");
    }
    if (body.roomTypeId) {
      const roomType = await prisma.hotelRoomType.findFirst({
        where: { id: body.roomTypeId, propertyId: body.propertyId }, select: { id: true },
      });
      if (!roomType) return badRequest("That room type does not belong to this property.");
    }

    const created = await prisma.availabilityBlock.create({
      data: {
        propertyId: body.propertyId,
        listingId: body.listingId ?? null,
        roomTypeId: body.roomTypeId ?? null,
        from, to,
        reason: body.reason.trim().slice(0, 300),
        createdById: g.actor.id,
      },
    });

    // Bookings already taken over these dates are not cancelled. The block stops
    // new sales; undoing existing ones is a deliberate act with its own permission.
    const affected = await prisma.booking.count({
      where: {
        ...(body.listingId ? { listingId: body.listingId } : { propertyId: body.propertyId }),
        status: { in: ["PENDING", "CONFIRMED"] },
        checkIn: { lt: to }, checkOut: { gt: from },
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "availability.block",
      permission: PERMISSIONS.AVAILABILITY_MANAGE,
      entityType: "AvailabilityBlock",
      entityId: created.id,
      propertyId: created.propertyId,
      summary: `Blocked ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)} — ${created.reason}.`,
      after: created,
    });

    return ok({
      block: created,
      warning: affected > 0
        ? `${affected} existing bookings fall inside these dates. They were not cancelled.`
        : null,
    }, 201);
  });
}
