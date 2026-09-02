import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Change a room type's rate, description or inventory.
 *
 * Note what reducing `totalRooms` does *not* do: it never cancels a booking
 * already taken. If a host drops from 20 rooms to 5 while 12 are sold, those 12
 * stand and the room type is simply oversold until they check out. Cancelling
 * a stranger's holiday to satisfy an inventory edit would be far worse, so the
 * host is warned instead.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.hotelRoomType.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Room type not found." });

    const g = await guard(PERMISSIONS.ROOMTYPE_MANAGE, { propertyId: existing.propertyId });
    if (!g.ok) return g.response;

    const body = await readJson<{
      name?: string; description?: string; rate?: number; currency?: string;
      totalRooms?: number; maxGuests?: number; beds?: string; amenities?: string[]; active?: boolean;
    }>(req);
    if (!body) return badRequest("Expected a JSON body.");

    if (body.rate !== undefined && (!Number.isInteger(Number(body.rate)) || Number(body.rate) < 0)) {
      return badRequest("The nightly rate must be a whole number of minor units.");
    }
    if (body.totalRooms !== undefined && (!Number.isInteger(Number(body.totalRooms)) || Number(body.totalRooms) < 1)) {
      return badRequest("A room type needs at least one room.");
    }

    const updated = await prisma.hotelRoomType.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
        ...(body.rate !== undefined ? { rate: Number(body.rate) } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.totalRooms !== undefined ? { totalRooms: Number(body.totalRooms) } : {}),
        ...(body.maxGuests !== undefined ? { maxGuests: Math.max(1, Number(body.maxGuests)) } : {}),
        ...(body.beds !== undefined ? { beds: body.beds?.trim() || null } : {}),
        ...(body.amenities !== undefined ? { amenities: body.amenities.slice(0, 40) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "roomtype.update",
      permission: PERMISSIONS.ROOMTYPE_MANAGE,
      entityType: "HotelRoomType",
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Updated room type "${updated.name}".`,
      ...changes(existing, updated),
    });

    // If the new inventory is below what is already sold, say so plainly rather
    // than letting the host discover it at the front desk.
    const held = await prisma.booking.count({
      where: { roomTypeId: updated.id, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } },
    });

    return ok({
      roomType: updated,
      warning: held > updated.totalRooms
        ? `${held} bookings already exist against this room type but only ${updated.totalRooms} rooms remain. Existing bookings were not cancelled.`
        : null,
    });
  });
}

/**
 * Retire a room type.
 *
 * Deactivates rather than deletes when bookings reference it — a deleted room
 * type would leave those bookings pointing at nothing, and a guest arriving
 * with a confirmation for a room that no longer exists in the records is a
 * worse outcome than a tidy database.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.hotelRoomType.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Room type not found." });

    const g = await guard(PERMISSIONS.ROOMTYPE_MANAGE, { propertyId: existing.propertyId });
    if (!g.ok) return g.response;

    const bookings = await prisma.booking.count({ where: { roomTypeId: existing.id } });
    if (bookings > 0) {
      await prisma.hotelRoomType.update({ where: { id: existing.id }, data: { active: false } });
    } else {
      await prisma.hotelRoomType.delete({ where: { id: existing.id } });
    }

    await writeAudit({
      actor: g.actor,
      action: "roomtype.delete",
      permission: PERMISSIONS.ROOMTYPE_MANAGE,
      entityType: "HotelRoomType",
      entityId: existing.id,
      propertyId: existing.propertyId,
      summary: bookings > 0
        ? `Deactivated room type "${existing.name}" — kept because ${bookings} bookings reference it.`
        : `Deleted room type "${existing.name}".`,
      before: existing,
    });

    return ok({ deleted: bookings === 0, deactivated: bookings > 0 });
  });
}
