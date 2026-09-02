import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { conflict, guard, handle, notFound, ok } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** Withdraw an invitation before it is used. The pass stops working at once. */
export async function POST(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.visitorInvitation.findUnique({
      where: { id: params.id },
      select: { id: true, unitId: true, propertyId: true, status: true, visitorName: true },
    });
    if (!existing) return notFound("Invitation not found.");

    const g = await guard(PERMISSIONS.INVITATION_CANCEL, { unitId: existing.unitId });
    if (!g.ok) return g.response;

    if (existing.status === "CANCELLED") return conflict("Already cancelled.");

    await prisma.visitorInvitation.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });

    await writeAudit({
      actor: g.actor,
      action: "invitation.cancel",
      permission: PERMISSIONS.INVITATION_CANCEL,
      entityType: "VisitorInvitation",
      entityId: existing.id,
      propertyId: existing.propertyId,
      unitId: existing.unitId,
      summary: `Cancelled invitation for ${existing.visitorName}`,
      before: { status: existing.status },
      after: { status: "CANCELLED" },
    });

    return ok({ cancelled: true });
  });
}
