import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Room types — a hotel's sellable inventory.
 *
 * A whole-property stay needs none of this: the listing is one unit and sells
 * once. A hotel sells the same "Deluxe Double" thirty times over, so the
 * inventory count lives here rather than on the listing.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.ROOMTYPE_VIEW);
    if (!g.ok) return g.response;

    const roomTypes = await prisma.hotelRoomType.findMany({
      where: {
        ...whereByProperty(g.access),
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: [{ propertyId: "asc" }, { rate: "asc" }],
      include: {
        property: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true, status: true } },
        _count: { select: { bookings: true } },
      },
      take: 200,
    });

    return ok({ roomTypes });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; listingId?: string; name?: string; description?: string;
      rate?: number; currency?: string; totalRooms?: number; maxGuests?: number;
      beds?: string; amenities?: string[];
    }>(req);
    if (!body?.propertyId) return badRequest("A property is required.");
    if (!body.name?.trim()) return badRequest("A room type needs a name.");

    const rate = Number(body.rate);
    const totalRooms = Number(body.totalRooms);
    // Inventory of zero would make the room type unsellable but still visible;
    // a negative rate would pay the guest. Both are refused rather than clamped,
    // so a typo surfaces instead of quietly becoming something else.
    if (!Number.isInteger(rate) || rate < 0) return badRequest("The nightly rate must be a whole number of minor units.");
    if (!Number.isInteger(totalRooms) || totalRooms < 1) return badRequest("A room type needs at least one room.");

    const g = await guard(PERMISSIONS.ROOMTYPE_MANAGE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    // The listing must belong to the same property, or a host could attach
    // their own cheap room type to somebody else's advert.
    if (body.listingId) {
      const listing = await prisma.propertyListing.findFirst({
        where: { id: body.listingId, propertyId: body.propertyId },
        select: { id: true },
      });
      if (!listing) return badRequest("That listing does not belong to this property.");
    }

    const created = await prisma.hotelRoomType.create({
      data: {
        propertyId: body.propertyId,
        listingId: body.listingId ?? null,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        rate,
        currency: body.currency ?? "KES",
        totalRooms,
        maxGuests: Math.max(1, Number(body.maxGuests) || 2),
        beds: body.beds?.trim() || null,
        amenities: Array.isArray(body.amenities) ? body.amenities.slice(0, 40) : [],
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "roomtype.create",
      permission: PERMISSIONS.ROOMTYPE_MANAGE,
      entityType: "HotelRoomType",
      entityId: created.id,
      propertyId: created.propertyId,
      summary: `Added room type "${created.name}" — ${created.totalRooms} rooms at ${created.rate} ${created.currency}/night.`,
      after: created,
    });

    return ok({ roomType: created }, 201);
  });
}
