import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, handle, notFound, ok, readJson } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { describeDiscount, presentDiscount } from "@/server/presenters";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      name?: string; description?: string; value?: number;
      minNights?: number; minGuests?: number; minUnits?: number;
      startsAt?: string; endsAt?: string; active?: boolean;
    }>(req);
    if (!body) return badRequest("A body is required.");

    const existing = await prisma.discount.findUnique({ where: { id: params.id } });
    if (!existing) return notFound("Discount not found.");

    const g = await guard(PERMISSIONS.DISCOUNT_UPDATE, { propertyId: existing.propertyId });
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Discount not found.");

    if (body.value !== undefined) {
      if (body.value <= 0) return badRequest("value must be positive.");
      if (existing.valueType === "PERCENTAGE" && body.value > 100) return badRequest("A percentage discount cannot exceed 100.");
    }

    const updated = await prisma.discount.update({
      where: { id: existing.id },
      data: {
        name: body.name?.trim() ?? undefined,
        description: body.description?.trim() ?? undefined,
        value: body.value !== undefined ? Math.round(body.value) : undefined,
        minNights: body.minNights ?? undefined,
        minGuests: body.minGuests ?? undefined,
        minUnits: body.minUnits ?? undefined,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        active: body.active ?? undefined,
      },
      include: { property: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true, status: true } } },
    });

    await writeAudit({
      actor: g.actor,
      action: "discount.update",
      permission: PERMISSIONS.DISCOUNT_UPDATE,
      entityType: "Discount",
      entityId: existing.id,
      propertyId: existing.propertyId,
      summary: `Updated discount "${updated.name}" — now ${describeDiscount(updated)}${updated.active ? "" : " (inactive)"}`,
      ...changes(existing as unknown as Record<string, unknown>, {
        name: updated.name, value: updated.value, active: updated.active,
        minGuests: updated.minGuests, minUnits: updated.minUnits,
        startsAt: updated.startsAt, endsAt: updated.endsAt,
      }),
    });

    return ok({ discount: presentDiscount(updated) });
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.discount.findUnique({ where: { id: params.id } });
    if (!existing) return notFound("Discount not found.");

    const g = await guard(PERMISSIONS.DISCOUNT_DELETE, { propertyId: existing.propertyId });
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Discount not found.");

    await prisma.discount.delete({ where: { id: existing.id } });

    await writeAudit({
      actor: g.actor,
      action: "discount.delete",
      permission: PERMISSIONS.DISCOUNT_DELETE,
      entityType: "Discount",
      entityId: existing.id,
      propertyId: existing.propertyId,
      summary: `Deleted discount "${existing.name}" (${describeDiscount(existing)}), redeemed ${existing.redemptionCount} time(s)`,
      before: { name: existing.name, kind: existing.kind, value: existing.value, redemptionCount: existing.redemptionCount },
      after: null,
    });

    return ok({ deleted: true });
  });
}
