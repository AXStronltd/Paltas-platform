import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.serviceOffering.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Service not found." });

    const g = await guardMaybeScoped(PERMISSIONS.SERVICE_MANAGE, existing.propertyId);
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Service not found." });
    }

    const body = await readJson<{
      name?: string; description?: string; price?: number; active?: boolean;
      noticeHours?: number; dailyCapacity?: number | null; providerName?: string;
    }>(req);
    if (!body) return badRequest("Expected a JSON body.");
    if (body.price !== undefined && (!Number.isInteger(Number(body.price)) || Number(body.price) <= 0)) {
      return badRequest("A price must be a whole number above zero.");
    }

    const updated = await prisma.serviceOffering.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.slice(0, 1000) || null } : {}),
        ...(body.price !== undefined ? { price: Number(body.price) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.noticeHours !== undefined ? { noticeHours: Math.max(0, Math.min(720, Number(body.noticeHours))) } : {}),
        ...(body.dailyCapacity !== undefined
          ? { dailyCapacity: body.dailyCapacity === null ? null : Math.max(1, Number(body.dailyCapacity)) } : {}),
        ...(body.providerName !== undefined ? { providerName: body.providerName.trim() || null } : {}),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "service.update",
      permission: PERMISSIONS.SERVICE_MANAGE,
      entityType: "ServiceOffering",
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Updated service "${updated.name}".`,
      ...changes(existing, updated),
    });

    // Raising a price does not touch bookings already taken: BookingAddon
    // copies the figure at the time. Said here because it is the thing a host
    // will worry about the first time they edit one.
    return ok({ service: updated });
  });
}

/**
 * Retire a service.
 *
 * Deactivates rather than deletes once a guest has booked it — a booking whose
 * add-on pointed at nothing would leave a guest expecting an airport pickup
 * that the records no longer describe.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.serviceOffering.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Service not found." });

    const g = await guardMaybeScoped(PERMISSIONS.SERVICE_MANAGE, existing.propertyId);
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Service not found." });
    }

    const booked = await prisma.bookingAddon.count({ where: { offeringId: existing.id } });
    if (booked > 0) {
      await prisma.serviceOffering.update({ where: { id: existing.id }, data: { active: false } });
    } else {
      await prisma.serviceOffering.delete({ where: { id: existing.id } });
    }

    await writeAudit({
      actor: g.actor,
      action: "service.delete",
      permission: PERMISSIONS.SERVICE_MANAGE,
      entityType: "ServiceOffering",
      entityId: existing.id,
      propertyId: existing.propertyId,
      summary: booked > 0
        ? `Deactivated service "${existing.name}" — kept because ${booked} bookings reference it.`
        : `Deleted service "${existing.name}".`,
      before: existing,
    });

    return ok({ deleted: booked === 0, deactivated: booked > 0 });
  });
}
