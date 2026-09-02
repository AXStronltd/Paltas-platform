import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** Take ownership of a live alert, or stand it down. */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ resolve?: boolean }>(req);
    const resolving = body?.resolve === true;

    const alert = await prisma.emergencyAlert.findUnique({ where: { id: params.id } });
    if (!alert) return notFound("Alert not found.");

    const g = await guard(PERMISSIONS.SECURITY_EMERGENCY_ACKNOWLEDGE, { propertyId: alert.propertyId });
    if (!g.ok) return g.response;

    if (alert.status === "RESOLVED") return conflict("This alert is already resolved.");

    const updated = await prisma.emergencyAlert.update({
      where: { id: alert.id },
      data: resolving
        ? { status: "RESOLVED", resolvedAt: new Date() }
        : { status: "ACKNOWLEDGED", acknowledgedById: g.actor.id, acknowledgedAt: new Date() },
    });

    await writeAudit({
      actor: g.actor,
      action: resolving ? "security.emergency.resolve" : "security.emergency.acknowledge",
      permission: PERMISSIONS.SECURITY_EMERGENCY_ACKNOWLEDGE,
      entityType: "EmergencyAlert",
      entityId: alert.id,
      propertyId: alert.propertyId,
      summary: `${resolving ? "Stood down" : "Acknowledged"} ${alert.type} alert`,
      before: { status: alert.status },
      after: { status: updated.status },
    });

    return ok({ alert: updated });
  });
}
