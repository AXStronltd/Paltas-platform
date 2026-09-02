import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { conflict, guard, handle, notFound, ok } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** Return a suspended card to service. A revoked card never comes back. */
export async function POST(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const card = await prisma.accessCard.findUnique({ where: { id: params.id } });
    if (!card) return notFound("Card not found.");

    const g = await guard(PERMISSIONS.CARD_REINSTATE, { unitId: card.unitId, propertyId: card.propertyId });
    if (!g.ok) return g.response;

    if (card.status === "REVOKED") return conflict("A revoked card cannot be reinstated — issue a new one.");
    if (card.status !== "SUSPENDED") return conflict("This card is not suspended.");

    const updated = await prisma.accessCard.update({
      where: { id: card.id },
      data: { status: "ACTIVE", suspendedAt: null, suspendedById: null, suspendReason: null },
    });

    await writeAudit({
      actor: g.actor,
      action: "card.reinstate",
      permission: PERMISSIONS.CARD_REINSTATE,
      entityType: "AccessCard",
      entityId: card.id,
      propertyId: card.propertyId,
      unitId: card.unitId,
      summary: `Reinstated access card ${card.cardNumber}`,
      ...changes(card as unknown as Record<string, unknown>, { status: updated.status, suspendReason: null }),
    });

    return ok({ card: updated });
  });
}
