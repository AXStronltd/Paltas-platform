import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { newPassCode, newQrToken } from "@/server/passes";
import { decide } from "@/lib/security/authorize";
import { PERMISSIONS } from "@/lib/security/permissions";
import { presentInvitation } from "@/server/presenters";
import type { InvitationStatus, VisitorType } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Expected visitors: invitations raised by residents or by security staff. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as InvitationStatus | null;
    const propertyId = url.searchParams.get("propertyId");
    const unitId = url.searchParams.get("unitId");
    const activeOnly = url.searchParams.get("active") === "true";

    const g = await guardList(PERMISSIONS.INVITATION_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const invitations = await prisma.visitorInvitation.findMany({
      where: {
        ...scoped,
        ...(status ? { status } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(unitId ? { unitId } : {}),
        // "Active" is the gate's view: approved and inside its validity window.
        ...(activeOnly ? { status: "APPROVED", validFrom: { lte: new Date() }, validTo: { gte: new Date() } } : {}),
      },
      orderBy: { validFrom: "desc" },
      take: 200,
      include: {
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
        resident: { select: { id: true, fullName: true } },
      },
    });

    return ok({ invitations: invitations.map(presentInvitation) });
  });
}

/**
 * Raise an invitation and mint its pass.
 *
 * Whether it arrives approved depends on who raised it: security staff holding
 * `visitor.approve` for that unit approve as they create, while a resident's
 * invitation lands as PENDING for the gate to approve. The rule is expressed by
 * asking the same engine the endpoints use, not by checking a role name.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      unitId?: string; visitorName?: string; visitorPhone?: string;
      visitorType?: VisitorType; purpose?: string;
      validFrom?: string; validTo?: string;
      recurring?: boolean; recurrenceRule?: string; maxUses?: number;
      vehiclePlate?: string; visitorId?: string; residentId?: string;
    }>(req);
    if (!body?.unitId || !body.visitorName) return badRequest("unitId and visitorName are required.");

    const g = await guard(PERMISSIONS.INVITATION_CREATE, { unitId: body.unitId });
    if (!g.ok) return g.response;

    const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
    const validTo = body.validTo ? new Date(body.validTo) : new Date(Date.now() + 12 * 60 * 60 * 1000);
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
      return badRequest("validFrom and validTo must be valid dates.");
    }
    if (validTo <= validFrom) return badRequest("validTo must be after validFrom.");

    const canApprove = decide(g.actor, PERMISSIONS.VISITOR_APPROVE, g.scope.chain).allowed;

    const invitation = await prisma.visitorInvitation.create({
      data: {
        propertyId: g.scope.propertyId!,
        unitId: body.unitId,
        residentId: body.residentId,
        visitorId: body.visitorId,
        visitorName: body.visitorName.trim(),
        visitorPhone: body.visitorPhone?.trim(),
        visitorType: body.visitorType ?? "FAMILY_FRIEND",
        purpose: body.purpose?.trim(),
        validFrom,
        validTo,
        recurring: body.recurring ?? false,
        recurrenceRule: body.recurrenceRule,
        maxUses: body.recurring ? Math.max(1, body.maxUses ?? 20) : Math.max(1, body.maxUses ?? 1),
        vehiclePlate: body.vehiclePlate?.trim().toUpperCase(),
        passCode: await newPassCode(),
        qrToken: newQrToken(),
        status: canApprove ? "APPROVED" : "PENDING",
        createdById: g.actor.id,
        approvedById: canApprove ? g.actor.id : null,
        approvedAt: canApprove ? new Date() : null,
      },
      include: {
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
        resident: { select: { id: true, fullName: true } },
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "invitation.create",
      permission: PERMISSIONS.INVITATION_CREATE,
      entityType: "VisitorInvitation",
      entityId: invitation.id,
      propertyId: invitation.propertyId,
      unitId: invitation.unitId,
      summary: `Invited ${invitation.visitorName} to ${invitation.unit.name} (${invitation.status.toLowerCase()})`,
      after: {
        visitorName: invitation.visitorName,
        visitorType: invitation.visitorType,
        validFrom: invitation.validFrom,
        validTo: invitation.validTo,
        status: invitation.status,
      },
    });

    return ok({ invitation: presentInvitation(invitation) }, 201);
  });
}
