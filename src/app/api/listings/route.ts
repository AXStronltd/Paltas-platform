import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { presentListing } from "@/server/presenters";
import type { ListingKind, ListingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Listings an owner, landlord or agent has drafted for the marketplace.
 *
 * This is the private side: everything, at every status. The public sees a
 * different query entirely — see /api/public/listings — rather than this one
 * with a filter bolted on, so a draft cannot leak through a forgotten parameter.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as ListingStatus | null;
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.LISTING_VIEW);
    if (!g.ok) return g.response;

    const listings = await prisma.propertyListing.findMany({
      where: {
        ...whereByPropertyOrUnit(g.access),
        ...(status ? { status } : {}),
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        property: { select: { id: true, name: true, city: true } },
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
      },
      take: 200,
    });

    return ok({ listings: listings.map(presentListing) });
  });
}

/**
 * Draft a listing.
 *
 * Created as a DRAFT regardless of who is asking: publishing is a separate
 * permission and a separate call, so a role that can advertise a property cannot
 * do it by accident on the way to saving a description.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; unitId?: string; title?: string; summary?: string;
      description?: string; kind?: ListingKind; price?: number; currency?: string;
      maxGuests?: number; bedrooms?: number; bathrooms?: number;
      amenities?: string[]; images?: string[]; hostName?: string; hostKind?: string;
    }>(req);
    if (!body?.title?.trim()) return badRequest("title is required.");
    if (!body.description?.trim()) return badRequest("description is required — an advert with no copy helps nobody.");
    if (!body.price || body.price <= 0) return badRequest("price must be a positive amount.");
    if (!body.propertyId && !body.unitId) return badRequest("propertyId or unitId is required.");

    const g = await guard(PERMISSIONS.LISTING_CREATE, {
      propertyId: body.propertyId ?? null,
      unitId: body.unitId ?? null,
    });
    if (!g.ok) return g.response;

    const property = await prisma.property.findUnique({
      where: { id: g.scope.propertyId! },
      select: { name: true, city: true, address: true },
    });

    const listing = await prisma.propertyListing.create({
      data: {
        orgId: g.scope.orgId,
        propertyId: g.scope.propertyId!,
        unitId: g.scope.unitId,
        title: body.title.trim(),
        summary: body.summary?.trim(),
        description: body.description.trim(),
        kind: body.kind ?? "STAY",
        price: Math.round(body.price),
        currency: body.currency ?? "KES",
        maxGuests: Math.max(1, body.maxGuests ?? 2),
        bedrooms: Math.max(0, body.bedrooms ?? 1),
        bathrooms: Math.max(0, body.bathrooms ?? 1),
        amenities: body.amenities ?? [],
        images: body.images ?? [],
        city: property?.city ?? null,
        location: property?.address ?? property?.name ?? null,
        hostName: body.hostName?.trim() || g.actor.name,
        hostKind: body.hostKind?.trim() || "Landlord",
        createdById: g.actor.id,
      },
      include: {
        property: { select: { id: true, name: true, city: true } },
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "listing.create",
      permission: PERMISSIONS.LISTING_CREATE,
      entityType: "PropertyListing",
      entityId: listing.id,
      propertyId: listing.propertyId,
      unitId: listing.unitId,
      summary: `Drafted ${listing.kind.toLowerCase()} listing "${listing.title}" at ${listing.currency} ${listing.price.toLocaleString()}`,
      after: { title: listing.title, kind: listing.kind, price: listing.price, status: listing.status },
    });

    return ok({ listing: presentListing(listing) }, 201);
  });
}
