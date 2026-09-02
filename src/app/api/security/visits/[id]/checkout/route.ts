import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** Close out a visit on departure and stamp the exit in the access history. */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ gateId?: string; notes?: string }>(req);

    const visit = await prisma.visitorVisit.findUnique({
      where: { id: params.id },
      select: { id: true, propertyId: true, unitId: true, status: true, visitorName: true, visitorId: true, checkInAt: true },
    });
    if (!visit) return notFound("Visit not found.");

    const g = await guard(PERMISSIONS.VISITOR_CHECKOUT, {
      unitId: visit.unitId,
      propertyId: visit.propertyId,
    });
    if (!g.ok) return g.response;

    if (visit.status !== "ON_SITE") return conflict("This visitor is already checked out.");

    const checkOutAt = new Date();
    const updated = await prisma.visitorVisit.update({
      where: { id: visit.id },
      data: { status: "CHECKED_OUT", checkOutAt, checkOutById: g.actor.id, notes: body?.notes ?? undefined },
    });

    await prisma.accessEvent.create({
      data: {
        propertyId: visit.propertyId,
        gateId: body?.gateId,
        unitId: visit.unitId,
        direction: "OUT",
        method: "MANUAL",
        result: "GRANTED",
        subjectType: "visitor",
        subjectId: visit.visitorId,
        subjectName: visit.visitorName,
        recordedById: g.actor.id,
      },
    });

    const minutes = Math.round((checkOutAt.getTime() - visit.checkInAt.getTime()) / 60000);
    await writeAudit({
      actor: g.actor,
      action: "visitor.checkout",
      permission: PERMISSIONS.VISITOR_CHECKOUT,
      entityType: "VisitorVisit",
      entityId: visit.id,
      propertyId: visit.propertyId,
      unitId: visit.unitId,
      summary: `Checked out ${visit.visitorName} after ${minutes} min on site`,
      before: { status: "ON_SITE", checkOutAt: null },
      after: { status: "CHECKED_OUT", checkOutAt },
    });

    return ok({ visit: updated });
  });
}
