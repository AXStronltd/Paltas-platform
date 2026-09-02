import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Suspend a card — the action behind the audit line an owner is most likely to
 * go looking for. Reason is mandatory: a suspension with no stated cause is
 * worthless three weeks later when someone asks why the card stopped working.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ reason?: string; revoke?: boolean }>(req);
    if (!body?.reason?.trim()) return badRequest("A reason is required.");

    const card = await prisma.accessCard.findUnique({
      where: { id: params.id },
      include: { unit: { select: { name: true, building: { select: { name: true } } } } },
    });
    if (!card) return notFound("Card not found.");

    // Revoking is permanent, so it is a separate permission from suspending.
    const permission = body.revoke ? PERMISSIONS.CARD_REVOKE : PERMISSIONS.CARD_SUSPEND;
    const g = await guard(permission, { unitId: card.unitId, propertyId: card.propertyId });
    if (!g.ok) return g.response;

    if (card.status === "REVOKED") return conflict("This card has been revoked.");
    if (!body.revoke && card.status === "SUSPENDED") return conflict("This card is already suspended.");

    const updated = await prisma.accessCard.update({
      where: { id: card.id },
      data: {
        status: body.revoke ? "REVOKED" : "SUSPENDED",
        suspendedAt: new Date(),
        suspendedById: g.actor.id,
        suspendReason: body.reason.trim(),
      },
    });

    const where = card.unit ? ` · ${card.unit.building.name} ${card.unit.name}` : "";
    await writeAudit({
      actor: g.actor,
      action: body.revoke ? "card.revoke" : "card.suspend",
      permission,
      entityType: "AccessCard",
      entityId: card.id,
      propertyId: card.propertyId,
      unitId: card.unitId,
      summary: `${body.revoke ? "Revoked" : "Suspended"} access card ${card.cardNumber}${where} — ${body.reason.trim()}`,
      ...changes(card as unknown as Record<string, unknown>, {
        status: updated.status,
        suspendReason: updated.suspendReason,
      }),
    });

    return ok({ card: updated });
  });
}
