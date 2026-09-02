import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Verify a card at the gate. Like the QR check, this answers go / no-go and
 * writes the attempt to the access history whichever way it goes.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ cardNumber?: string; gateId?: string; direction?: "IN" | "OUT" }>(req);
    const number = body?.cardNumber?.trim().toUpperCase();
    if (!number) return badRequest("A card number is required.");

    const g = await guardList(PERMISSIONS.CARD_VERIFY);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const card = await prisma.accessCard.findFirst({
      where: { ...scoped, cardNumber: number },
      include: { unit: { select: { name: true, building: { select: { name: true } } } } },
    });

    if (!card) {
      return ok({ result: "DENIED", reason: "Card not recognised at this property.", card: null });
    }

    const now = new Date();
    const problem =
      card.status === "SUSPENDED" ? `Card suspended — ${card.suspendReason ?? "no reason recorded"}.`
      : card.status === "REVOKED" ? "Card revoked."
      : card.status === "LOST" ? "Card reported lost."
      : card.status === "EXPIRED" ? "Card expired."
      : card.expiresAt && card.expiresAt < now ? "Card expired."
      : null;

    const result = problem ? "DENIED" : "GRANTED";

    await prisma.accessEvent.create({
      data: {
        propertyId: card.propertyId,
        gateId: body?.gateId,
        unitId: card.unitId,
        direction: body?.direction ?? "IN",
        method: "CARD",
        result,
        subjectType: "resident",
        subjectId: card.residentId,
        subjectName: card.holderName,
        cardId: card.id,
        reason: problem ?? undefined,
        recordedById: g.actor.id,
      },
    });

    return ok({
      result,
      reason: problem,
      card: {
        id: card.id,
        cardNumber: card.cardNumber,
        holderName: card.holderName,
        type: card.type,
        status: card.status,
        unitName: card.unit ? `${card.unit.building.name} · ${card.unit.name}` : null,
        accessZones: card.accessZones,
      },
    });
  });
}
