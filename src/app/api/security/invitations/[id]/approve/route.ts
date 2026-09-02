import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { presentInvitation } from "@/server/presenters";

export const dynamic = "force-dynamic";

/** Approve or reject a pending invitation. */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ approve?: boolean; reason?: string }>(req);
    const approve = body?.approve ?? true;
    if (!approve && !body?.reason?.trim()) return badRequest("A reason is required when rejecting.");

    const existing = await prisma.visitorInvitation.findUnique({
      where: { id: params.id },
      select: { id: true, unitId: true, propertyId: true, status: true, visitorName: true },
    });
    if (!existing) return notFound("Invitation not found.");

    const g = await guard(PERMISSIONS.VISITOR_APPROVE, { unitId: existing.unitId });
    if (!g.ok) return g.response;

    if (existing.status !== "PENDING") {
      return conflict(`This invitation is already ${existing.status.toLowerCase()}.`);
    }

    const updated = await prisma.visitorInvitation.update({
      where: { id: existing.id },
      data: approve
        ? { status: "APPROVED", approvedById: g.actor.id, approvedAt: new Date() }
        : { status: "REJECTED", rejectedReason: body?.reason?.trim() },
      include: {
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
        resident: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit({
      actor: g.actor,
      action: approve ? "visitor.approve" : "visitor.reject",
      permission: PERMISSIONS.VISITOR_APPROVE,
      entityType: "VisitorInvitation",
      entityId: updated.id,
      propertyId: updated.propertyId,
      unitId: updated.unitId,
      summary: `${approve ? "Approved" : "Rejected"} visitor ${updated.visitorName} for ${updated.unit.name}`,
      before: { status: existing.status },
      after: { status: updated.status, reason: updated.rejectedReason ?? undefined },
    });

    return ok({ invitation: presentInvitation(updated) });
  });
}
