import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Scan a pass at the gate.
 *
 * Answers one question — may this person come in, right now — and records the
 * attempt either way. A refusal is as much a security record as an admission, so
 * both are written to the access history before the guard sees the answer.
 *
 * Accepts either the QR payload (`PALTAS:<token>`) or the short code read off
 * the pass, so a failed scan never becomes a reason to wave someone through.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ code?: string; gateId?: string }>(req);
    const raw = body?.code?.trim();
    if (!raw) return badRequest("A pass code is required.");

    const g = await guardList(PERMISSIONS.PASS_VERIFY);
    if (!g.ok) return g.response;

    const token = raw.startsWith("PALTAS:") ? raw.slice("PALTAS:".length) : null;
    const passCode = token ? null : raw.toUpperCase();

    const scoped = whereByPropertyOrUnit(g.access);
    const invitation = await prisma.visitorInvitation.findFirst({
      where: {
        ...scoped,
        ...(token ? { qrToken: token } : { passCode: passCode! }),
      },
      include: {
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
        resident: { select: { fullName: true, phone: true } },
      },
    });

    if (!invitation) {
      return ok({
        result: "DENIED",
        reason: "Pass not recognised at this property.",
        invitation: null,
      });
    }

    const now = new Date();
    const problem =
      invitation.status === "CANCELLED" ? "This pass was cancelled."
      : invitation.status === "REJECTED" ? "This visit was rejected."
      : invitation.status === "PENDING" ? "This visit is still awaiting approval."
      : invitation.status === "EXPIRED" ? "This pass has expired."
      : now < invitation.validFrom ? `Not valid until ${invitation.validFrom.toLocaleString()}.`
      : now > invitation.validTo ? "This pass has expired."
      : invitation.useCount >= invitation.maxUses ? "This pass has already been used."
      : null;

    const result = problem ? "DENIED" : "GRANTED";

    await prisma.accessEvent.create({
      data: {
        propertyId: invitation.propertyId,
        gateId: body?.gateId,
        unitId: invitation.unitId,
        direction: "IN",
        method: "QR",
        result,
        subjectType: "visitor",
        subjectId: invitation.visitorId,
        subjectName: invitation.visitorName,
        invitationId: invitation.id,
        reason: problem ?? undefined,
        recordedById: g.actor.id,
      },
    });

    return ok({
      result,
      reason: problem,
      invitation: {
        id: invitation.id,
        visitorName: invitation.visitorName,
        visitorPhone: invitation.visitorPhone,
        visitorType: invitation.visitorType,
        purpose: invitation.purpose,
        unitId: invitation.unitId,
        unitName: `${invitation.unit.building.name} · ${invitation.unit.name}`,
        hostName: invitation.resident?.fullName,
        vehiclePlate: invitation.vehiclePlate,
        validTo: invitation.validTo,
        usesLeft: Math.max(0, invitation.maxUses - invitation.useCount),
      },
    });
  });
}
