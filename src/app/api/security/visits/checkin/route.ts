import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { VisitorType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Admit a visitor.
 *
 * Two ways in: against an existing invitation (the usual case — the pass was
 * scanned a moment ago), or as a walk-in the guard records by hand. Both produce
 * the same visit row and the same access event, so the history does not have a
 * hole where the QR scanner failed.
 *
 * Checking in against an invitation consumes one use inside the same transaction
 * as the visit is created, so two guards scanning the same single-use pass at two
 * gates cannot both admit.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      invitationId?: string;
      propertyId?: string; unitId?: string;
      visitorId?: string; visitorName?: string; visitorPhone?: string; visitorType?: VisitorType;
      gateId?: string; badgeNo?: string; vehiclePlate?: string; notes?: string;
    }>(req);
    if (!body) return badRequest("A body is required.");

    if (body.invitationId) return checkInInvited(body);
    return checkInWalkIn(body);

    async function checkInInvited(input: NonNullable<typeof body>) {
      const invitation = await prisma.visitorInvitation.findUnique({
        where: { id: input.invitationId! },
        select: {
          id: true, propertyId: true, unitId: true, visitorId: true, visitorName: true,
          visitorPhone: true, visitorType: true, status: true, validFrom: true, validTo: true,
          maxUses: true, useCount: true, vehiclePlate: true,
        },
      });
      if (!invitation) return notFound("Invitation not found.");

      const g = await guard(PERMISSIONS.VISITOR_CHECKIN, { unitId: invitation.unitId });
      if (!g.ok) return g.response;

      const now = new Date();
      if (invitation.status !== "APPROVED") return conflict(`This visit is ${invitation.status.toLowerCase()}, not approved.`);
      if (now < invitation.validFrom || now > invitation.validTo) return conflict("This pass is outside its valid window.");
      if (invitation.useCount >= invitation.maxUses) return conflict("This pass has no uses left.");

      const visit = await prisma.$transaction(async (tx) => {
        // Guarded by the use count in the WHERE clause: a concurrent check-in on
        // the same pass updates zero rows and is rejected rather than admitted.
        const consumed = await tx.visitorInvitation.updateMany({
          where: { id: invitation.id, useCount: invitation.useCount },
          data: {
            useCount: { increment: 1 },
            status: invitation.useCount + 1 >= invitation.maxUses ? "USED" : "APPROVED",
          },
        });
        if (consumed.count === 0) throw new ConcurrentUse();

        const created = await tx.visitorVisit.create({
          data: {
            propertyId: invitation.propertyId,
            unitId: invitation.unitId,
            invitationId: invitation.id,
            visitorId: invitation.visitorId,
            visitorName: invitation.visitorName,
            visitorPhone: invitation.visitorPhone,
            visitorType: invitation.visitorType,
            gateId: input.gateId,
            badgeNo: input.badgeNo,
            vehiclePlate: input.vehiclePlate?.toUpperCase() ?? invitation.vehiclePlate,
            checkInById: g.actor.id,
            notes: input.notes,
          },
        });

        await tx.accessEvent.create({
          data: {
            propertyId: invitation.propertyId,
            gateId: input.gateId,
            unitId: invitation.unitId,
            direction: "IN",
            method: "QR",
            result: "GRANTED",
            subjectType: "visitor",
            subjectId: invitation.visitorId,
            subjectName: invitation.visitorName,
            invitationId: invitation.id,
            recordedById: g.actor.id,
          },
        });

        return created;
      }).catch((e) => {
        if (e instanceof ConcurrentUse) return null;
        throw e;
      });

      if (!visit) return conflict("This pass was used at another gate a moment ago.");

      await writeAudit({
        actor: g.actor,
        action: "visitor.checkin",
        permission: PERMISSIONS.VISITOR_CHECKIN,
        entityType: "VisitorVisit",
        entityId: visit.id,
        propertyId: visit.propertyId,
        unitId: visit.unitId,
        summary: `Checked in ${visit.visitorName}`,
        after: { checkInAt: visit.checkInAt, badgeNo: visit.badgeNo, vehiclePlate: visit.vehiclePlate },
      });

      return ok({ visit }, 201);
    }

    async function checkInWalkIn(input: NonNullable<typeof body>) {
      if (!input.visitorName) return badRequest("visitorName is required for a walk-in.");
      if (!input.unitId && !input.propertyId) return badRequest("unitId or propertyId is required.");

      const g = await guard(PERMISSIONS.VISITOR_CHECKIN, {
        unitId: input.unitId ?? null,
        propertyId: input.propertyId ?? null,
      });
      if (!g.ok) return g.response;

      const visit = await prisma.visitorVisit.create({
        data: {
          propertyId: g.scope.propertyId!,
          unitId: g.scope.unitId,
          visitorId: input.visitorId,
          visitorName: input.visitorName.trim(),
          visitorPhone: input.visitorPhone?.trim(),
          visitorType: input.visitorType ?? "OTHER",
          gateId: input.gateId,
          badgeNo: input.badgeNo,
          vehiclePlate: input.vehiclePlate?.trim().toUpperCase(),
          checkInById: g.actor.id,
          notes: input.notes,
        },
      });

      await prisma.accessEvent.create({
        data: {
          propertyId: visit.propertyId,
          gateId: input.gateId,
          unitId: visit.unitId,
          direction: "IN",
          method: "MANUAL",
          result: "GRANTED",
          subjectType: "visitor",
          subjectId: visit.visitorId,
          subjectName: visit.visitorName,
          reason: "Walk-in recorded by guard",
          recordedById: g.actor.id,
        },
      });

      await writeAudit({
        actor: g.actor,
        action: "visitor.checkin",
        permission: PERMISSIONS.VISITOR_CHECKIN,
        entityType: "VisitorVisit",
        entityId: visit.id,
        propertyId: visit.propertyId,
        unitId: visit.unitId,
        summary: `Checked in walk-in visitor ${visit.visitorName}`,
        after: { checkInAt: visit.checkInAt, visitorType: visit.visitorType },
      });

      return ok({ visit }, 201);
    }
  });
}

/** Signals that another gate consumed the same pass first. */
class ConcurrentUse extends Error {}
