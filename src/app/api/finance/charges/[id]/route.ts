import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Amend, settle or waive a charge.
 *
 * Waiving is held to its own permission and demands a reason: writing off what
 * someone owes is a different decision from correcting a typo in the amount, and
 * an estate that cannot show why a balance disappeared has no ledger worth the
 * name.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      amount?: number; dueDate?: string; description?: string;
      waive?: boolean; reason?: string;
      /** Record money received against this charge. */
      settle?: { amount: number; reference?: string };
    }>(req);
    if (!body) return badRequest("A body is required.");

    const charge = await prisma.charge.findUnique({
      where: { id: params.id },
      include: { category: { select: { name: true } }, payments: { select: { amount: true, status: true } } },
    });
    if (!charge) return notFound("Charge not found.");

    const waiving = body.waive === true;
    const settling = body.settle !== undefined;
    const permission = waiving
      ? PERMISSIONS.CHARGE_WAIVE
      : settling
        ? PERMISSIONS.FINANCE_PAYMENT_RECORD
        : PERMISSIONS.CHARGE_UPDATE;

    const g = await guard(permission, { propertyId: charge.propertyId, unitId: charge.unitId });
    if (!g.ok) return g.response;
    if (charge.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Charge not found.");
    if (charge.status === "WAIVED") return conflict("This charge has already been waived.");

    const settled = charge.payments.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amount, 0);

    if (waiving) {
      if (!body.reason?.trim()) return badRequest("A reason is required to waive a charge.");
      const updated = await prisma.charge.update({
        where: { id: charge.id },
        data: { status: "WAIVED", waivedReason: body.reason.trim() },
      });
      await writeAudit({
        actor: g.actor,
        action: "finance.charge.waive",
        permission,
        entityType: "Charge",
        entityId: charge.id,
        propertyId: charge.propertyId,
        unitId: charge.unitId,
        summary: `Waived ${charge.currency} ${(charge.amount - settled).toLocaleString()} outstanding on ${charge.reference} (${charge.category.name}) — ${body.reason.trim()}`,
        before: { status: charge.status, outstanding: charge.amount - settled },
        after: { status: "WAIVED", reason: body.reason.trim() },
      });
      return ok({ charge: updated });
    }

    if (settling) {
      const amount = Math.round(body.settle!.amount);
      if (amount <= 0) return badRequest("A payment must be a positive amount.");
      const outstanding = charge.amount - settled;
      if (amount > outstanding) {
        return badRequest(`That is more than the ${charge.currency} ${outstanding.toLocaleString()} outstanding.`);
      }

      const payment = await prisma.payment.create({
        data: {
          propertyId: charge.propertyId,
          unitId: charge.unitId,
          residentId: charge.residentId,
          chargeId: charge.id,
          kind: "SERVICE_CHARGE",
          amount,
          currency: charge.currency,
          dueDate: charge.dueDate,
          paidAt: new Date(),
          status: "PAID",
          reference: body.settle!.reference?.trim(),
        },
      });

      const nowSettled = settled + amount;
      await prisma.charge.update({
        where: { id: charge.id },
        data: { status: nowSettled >= charge.amount ? "PAID" : "PART_PAID" },
      });

      await writeAudit({
        actor: g.actor,
        action: "finance.payment.record",
        permission,
        entityType: "Charge",
        entityId: charge.id,
        propertyId: charge.propertyId,
        unitId: charge.unitId,
        summary: `Received ${charge.currency} ${amount.toLocaleString()} against ${charge.reference} (${charge.category.name}) — ${charge.currency} ${(charge.amount - nowSettled).toLocaleString()} still outstanding`,
        before: { settled, outstanding: charge.amount - settled },
        after: { settled: nowSettled, outstanding: charge.amount - nowSettled, reference: payment.reference },
      });

      return ok({ settled: nowSettled, outstanding: charge.amount - nowSettled });
    }

    // Plain amendment.
    if (body.amount !== undefined && body.amount < settled) {
      return badRequest(`Cannot reduce below the ${charge.currency} ${settled.toLocaleString()} already received.`);
    }
    const updated = await prisma.charge.update({
      where: { id: charge.id },
      data: {
        amount: body.amount !== undefined ? Math.round(body.amount) : undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        description: body.description?.trim() ?? undefined,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "finance.charge.update",
      permission,
      entityType: "Charge",
      entityId: charge.id,
      propertyId: charge.propertyId,
      unitId: charge.unitId,
      summary: `Amended charge ${charge.reference} (${charge.category.name})`,
      ...changes(charge as unknown as Record<string, unknown>, {
        amount: updated.amount, dueDate: updated.dueDate, description: updated.description,
      }),
    });

    return ok({ charge: updated });
  });
}
