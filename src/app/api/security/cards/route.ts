import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { cardNumber } from "@/server/passes";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { CardStatus, CardType } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Access cards: resident, family, staff, temporary and contractor. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as CardStatus | null;
    const unitId = url.searchParams.get("unitId");
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.CARD_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const cards = await prisma.accessCard.findMany({
      where: {
        ...scoped,
        ...(status ? { status } : {}),
        ...(unitId ? { unitId } : {}),
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: [{ status: "asc" }, { issuedAt: "desc" }],
      take: 300,
      include: { unit: { select: { name: true, building: { select: { name: true } } } } },
    });

    return ok({
      cards: cards.map((c) => ({
        id: c.id,
        propertyId: c.propertyId,
        unitId: c.unitId,
        unitName: c.unit ? `${c.unit.building.name} · ${c.unit.name}` : null,
        holderName: c.holderName,
        cardNumber: c.cardNumber,
        type: c.type,
        status: c.status,
        accessZones: c.accessZones,
        issuedAt: c.issuedAt,
        expiresAt: c.expiresAt,
        suspendReason: c.suspendReason,
      })),
    });
  });
}

/**
 * Issue a card. Temporary and contractor cards must carry an expiry — a card
 * that never expires is not temporary, and the commonest way an estate leaks
 * access is by issuing one and forgetting it.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; unitId?: string; residentId?: string;
      holderName?: string; type?: CardType; expiresAt?: string; accessZones?: string[];
    }>(req);
    if (!body?.holderName) return badRequest("holderName is required.");
    if (!body.unitId && !body.propertyId) return badRequest("unitId or propertyId is required.");

    const g = await guard(PERMISSIONS.CARD_CREATE, {
      unitId: body.unitId ?? null,
      propertyId: body.propertyId ?? null,
    });
    if (!g.ok) return g.response;

    const type = body.type ?? "RESIDENT";
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if ((type === "TEMPORARY" || type === "CONTRACTOR") && !expiresAt) {
      return badRequest("Temporary and contractor cards must have an expiry date.");
    }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return badRequest("expiresAt must be a valid date.");

    const prefix = await numberPrefix(body.unitId ?? null, g.scope.propertyId!);
    const seq = (await prisma.accessCard.count({ where: { propertyId: g.scope.propertyId!, unitId: body.unitId ?? null } })) + 1;

    let card;
    try {
      card = await prisma.accessCard.create({
        data: {
          propertyId: g.scope.propertyId!,
          unitId: body.unitId ?? null,
          residentId: body.residentId ?? null,
          holderName: body.holderName.trim(),
          cardNumber: cardNumber(prefix, seq),
          type,
          expiresAt,
          accessZones: body.accessZones ?? [],
          issuedById: g.actor.id,
        },
      });
    } catch {
      return conflict("A card with that number already exists — try again.");
    }

    await writeAudit({
      actor: g.actor,
      action: "card.create",
      permission: PERMISSIONS.CARD_CREATE,
      entityType: "AccessCard",
      entityId: card.id,
      propertyId: card.propertyId,
      unitId: card.unitId,
      summary: `Issued ${card.type.toLowerCase()} card ${card.cardNumber} to ${card.holderName}`,
      after: { cardNumber: card.cardNumber, type: card.type, status: card.status, expiresAt: card.expiresAt },
    });

    return ok({ card }, 201);
  });
}

/** Card numbers read like the unit they belong to: A-204 → A204-02. */
async function numberPrefix(unitId: string | null, propertyId: string): Promise<string> {
  if (unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } });
    if (unit) return unit.name;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } });
  return property?.name ?? "CARD";
}
