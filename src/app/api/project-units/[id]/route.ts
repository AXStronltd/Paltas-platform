import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { ProjectUnitStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Reserve, sell, or release a unit.
 *
 * Selling is its own permission, separate from managing stock, because it moves
 * inventory and records a figure that ends up in a revenue report. Someone who
 * can add apartments to a development should not automatically be able to
 * declare them sold.
 *
 * `agreedPrice` is recorded separately from `price` because the two are
 * routinely different, and a revenue figure built from asking prices is a
 * forecast pretending to be an accounting record.
 */
const MOVES: Record<string, { from: ProjectUnitStatus[]; to: ProjectUnitStatus; verb: string }> = {
  reserve: { from: ["AVAILABLE"],            to: "RESERVED",  verb: "Reserved" },
  sell:    { from: ["AVAILABLE", "RESERVED"], to: "SOLD",      verb: "Sold" },
  release: { from: ["RESERVED"],             to: "AVAILABLE", verb: "Released" },
};

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      action?: string; buyerName?: string; agreedPrice?: number;
      price?: number; type?: string; bedrooms?: number;
    }>(req);
    if (!body) return badRequest("Expected a JSON body.");

    const unit = await prisma.projectUnit.findUnique({
      where: { id: params.id },
      include: { project: { select: { id: true, name: true, orgId: true, propertyId: true, currency: true } } },
    });
    if (!unit) return fail(404, { code: "not_found", message: "Unit not found." });

    const move = body.action ? MOVES[body.action] : undefined;
    if (body.action && !move) {
      return badRequest(`Unknown action. Expected one of: ${Object.keys(MOVES).join(", ")}.`);
    }

    const permission = move ? PERMISSIONS.PROJECT_UNIT_SELL : PERMISSIONS.PROJECT_UNIT_MANAGE;
    const g = await guardMaybeScoped(permission, unit.project.propertyId);
    if (!g.ok) return g.response;
    if (unit.project.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Unit not found." });
    }

    if (move) {
      // Authorisation first, then the state check, so an unauthorised caller
      // learns nothing about whether the unit is still for sale.
      if (!move.from.includes(unit.status)) {
        return fail(409, {
          code: "conflict",
          message: `A ${unit.status.toLowerCase()} unit cannot be ${move.verb.toLowerCase()}.`,
        });
      }
      if (move.to === "SOLD" && !body.buyerName?.trim()) {
        return badRequest("Recording a sale requires the buyer's name.");
      }
      const agreed = body.agreedPrice === undefined ? null : Number(body.agreedPrice);
      if (agreed !== null && (!Number.isInteger(agreed) || agreed <= 0)) {
        return badRequest("An agreed price must be a whole number above zero.");
      }
    }

    const updated = await prisma.projectUnit.update({
      where: { id: unit.id },
      data: move
        ? {
            status: move.to,
            ...(move.to === "RESERVED" ? { reservedAt: new Date(), buyerName: body.buyerName?.trim() || null } : {}),
            ...(move.to === "SOLD" ? {
              soldAt: new Date(),
              buyerName: body.buyerName!.trim(),
              agreedPrice: body.agreedPrice === undefined ? unit.price : Number(body.agreedPrice),
            } : {}),
            // Releasing clears the buyer: keeping the name on an available unit
            // reads as though it is still spoken for.
            ...(move.to === "AVAILABLE" ? { buyerName: null, reservedAt: null, agreedPrice: null } : {}),
          }
        : {
            ...(body.price !== undefined ? { price: Number(body.price) } : {}),
            ...(body.type !== undefined ? { type: body.type.trim() || null } : {}),
            ...(body.bedrooms !== undefined ? { bedrooms: Number(body.bedrooms) } : {}),
          },
    });

    await writeAudit({
      actor: g.actor,
      action: move ? `project.unit.${body.action}` : "project.unit.update",
      permission,
      entityType: "ProjectUnit",
      entityId: updated.id,
      propertyId: unit.project.propertyId,
      summary: move
        ? `${move.verb} unit ${updated.unitNo} in "${unit.project.name}"`
          + (updated.buyerName ? ` to ${updated.buyerName}` : "")
          + (updated.agreedPrice ? ` for ${updated.agreedPrice} ${unit.project.currency}` : "") + "."
        : `Updated unit ${updated.unitNo} in "${unit.project.name}".`,
      ...changes(unit, updated),
    });

    return ok({ unit: updated });
  });
}
