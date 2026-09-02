import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { describeDiscount, presentDiscount } from "@/server/presenters";
import type { DiscountKind, DiscountValueType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Discount rules: group, seasonal, early-bird, long-stay, promo code, member.
 *
 * Scoped like everything else — a manager assigned to one property sets prices
 * for that property and sees nobody else's.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const kind = url.searchParams.get("kind") as DiscountKind | null;

    const g = await guardList(PERMISSIONS.DISCOUNT_VIEW);
    if (!g.ok) return g.response;

    const discounts = await prisma.discount.findMany({
      where: {
        // Organisation-wide discounts carry no propertyId, so they are matched
        // by the org clause rather than the property one.
        OR: [whereByProperty(g.access), { orgId: g.actor.orgId, propertyId: null }],
        ...(propertyId ? { propertyId } : {}),
        ...(kind ? { kind } : {}),
      },
      orderBy: [{ active: "desc" }, { startsAt: "desc" }],
      include: {
        property: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true, status: true } },
      },
      take: 200,
    });

    return ok({ discounts: discounts.map((d) => presentDiscount(d)) });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; campaignId?: string; name?: string; description?: string;
      kind?: DiscountKind; valueType?: DiscountValueType; value?: number; code?: string;
      minNights?: number; minGuests?: number; minUnits?: number; minLeadDays?: number;
      maxRedemptions?: number; startsAt?: string; endsAt?: string;
    }>(req);
    if (!body?.name?.trim()) return badRequest("name is required.");
    if (typeof body.value !== "number" || body.value <= 0) return badRequest("value must be a positive number.");

    const valueType = body.valueType ?? "PERCENTAGE";
    if (valueType === "PERCENTAGE" && body.value > 100) {
      return badRequest("A percentage discount cannot exceed 100.");
    }

    const g = await guard(PERMISSIONS.DISCOUNT_CREATE, { propertyId: body.propertyId ?? null });
    if (!g.ok) return g.response;

    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(Date.now() + 90 * 86400000);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return badRequest("Invalid dates.");
    if (endsAt <= startsAt) return badRequest("endsAt must be after startsAt.");

    const kind = body.kind ?? "SEASONAL";
    // A group discount that never states a group size is just a discount.
    if (kind === "GROUP" && !body.minGuests && !body.minUnits) {
      return badRequest("A group discount needs a minimum number of guests or units.");
    }

    const code = body.code?.trim().toUpperCase() || null;
    if (code && (await prisma.discount.findUnique({ where: { code }, select: { id: true } }))) {
      return conflict(`The code ${code} is already in use.`);
    }

    const discount = await prisma.discount.create({
      data: {
        orgId: g.scope.propertyId ? g.scope.orgId : g.actor.orgId,
        propertyId: body.propertyId ?? null,
        campaignId: body.campaignId ?? null,
        name: body.name.trim(),
        description: body.description?.trim(),
        kind,
        valueType,
        value: Math.round(body.value),
        code,
        minNights: body.minNights,
        minGuests: body.minGuests,
        minUnits: body.minUnits,
        minLeadDays: body.minLeadDays,
        maxRedemptions: body.maxRedemptions,
        startsAt,
        endsAt,
        createdById: g.actor.id,
      },
      include: { property: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true, status: true } } },
    });

    await writeAudit({
      actor: g.actor,
      action: "discount.create",
      permission: PERMISSIONS.DISCOUNT_CREATE,
      entityType: "Discount",
      entityId: discount.id,
      propertyId: discount.propertyId,
      summary: `Created ${kind.toLowerCase().replace("_", " ")} discount "${discount.name}" — ${describeDiscount(discount)}`,
      after: { name: discount.name, kind, valueType, value: discount.value, startsAt, endsAt },
    });

    return ok({ discount: presentDiscount(discount) }, 201);
  });
}
