import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guardList, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { ServiceKind, ServicePricing } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * What a host offers alongside the room.
 *
 * An offering can hang off one listing, one property, or the whole
 * organisation — an airport transfer usually serves every property in a city,
 * while a mid-stay clean belongs to one flat. The booking path accepts all
 * three, and so does this.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.SERVICE_VIEW);
    if (!g.ok) return g.response;

    const services = await prisma.serviceOffering.findMany({
      where: {
        ...(g.access.kind === "platform" ? {} : { orgId: g.actor.orgId }),
        // Organisation-wide offerings have no property to scope by, so they are
        // visible to anyone who may read services at all.
        OR: [{ propertyId: null }, whereByProperty(g.access)],
        ...(propertyId ? { OR: [{ propertyId }, { propertyId: null }] } : {}),
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: {
        property: { select: { id: true, name: true } },
        _count: { select: { addons: true } },
      },
      take: 200,
    });

    return ok({ services });
  });
}

const KINDS: ServiceKind[] = ["AIRPORT_TRANSFER", "CAR_HIRE", "DRIVER", "CLEANING", "LAUNDRY",
                              "BREAKFAST", "CHEF", "TOUR", "CHILDCARE", "OTHER"];
const PRICING: ServicePricing[] = ["FLAT", "PER_NIGHT", "PER_GUEST", "PER_GUEST_NIGHT"];

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      kind?: ServiceKind; name?: string; description?: string;
      price?: number; currency?: string; pricing?: ServicePricing;
      propertyId?: string; listingId?: string;
      noticeHours?: number; dailyCapacity?: number; providerName?: string;
    }>(req);
    if (!body?.name?.trim()) return badRequest("A service needs a name.");
    if (!body.kind || !KINDS.includes(body.kind)) {
      return badRequest(`kind must be one of: ${KINDS.join(", ")}.`);
    }
    if (body.pricing && !PRICING.includes(body.pricing)) {
      return badRequest(`pricing must be one of: ${PRICING.join(", ")}.`);
    }
    const price = Number(body.price);
    // Refused rather than defaulted: a free airport transfer is a typo, and it
    // should surface here rather than in a month's takings.
    if (!Number.isInteger(price) || price <= 0) {
      return badRequest("A service needs a price above zero, as a whole number of minor units.");
    }

    const g = await guardMaybeScoped(PERMISSIONS.SERVICE_MANAGE, body.propertyId);
    if (!g.ok) return g.response;

    if (body.listingId) {
      const listing = await prisma.propertyListing.findFirst({
        where: { id: body.listingId, orgId: g.actor.orgId },
        select: { id: true },
      });
      if (!listing) return badRequest("That listing does not belong to this organisation.");
    }

    const created = await prisma.serviceOffering.create({
      data: {
        orgId: g.actor.orgId,
        propertyId: body.propertyId ?? null,
        listingId: body.listingId ?? null,
        kind: body.kind,
        name: body.name.trim(),
        description: body.description?.slice(0, 1000) || null,
        price,
        currency: body.currency ?? "KES",
        pricing: body.pricing ?? "FLAT",
        noticeHours: Math.max(0, Math.min(720, Number(body.noticeHours) || 0)),
        dailyCapacity: body.dailyCapacity ? Math.max(1, Number(body.dailyCapacity)) : null,
        providerName: body.providerName?.trim() || null,
        createdById: g.actor.id,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "service.create",
      permission: PERMISSIONS.SERVICE_MANAGE,
      entityType: "ServiceOffering",
      entityId: created.id,
      propertyId: created.propertyId,
      summary: `Added service "${created.name}" at ${created.price} ${created.currency} (${created.pricing}).`,
      after: created,
    });

    return ok({ service: created }, 201);
  });
}
