import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { presentGroup } from "@/server/presenters";
import { splitEvenly } from "@/lib/pricing/groupPricing";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

const withRelations = {
  property: { select: { id: true, name: true } },
  discount: { select: { id: true, name: true } },
  members: { orderBy: { createdAt: "asc" as const } },
};

/**
 * Add a traveller to a group and give them a share.
 *
 * With `rebalance`, the unpaid shares are recomputed so the group still sums to
 * the amount owed — shares already paid are left exactly as they were, because
 * money that has arrived is not a number to be revised.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      name?: string; email?: string; phone?: string;
      shareAmount?: number; rebalance?: boolean;
    }>(req);
    if (!body?.name?.trim()) return badRequest("name is required.");

    const group = await prisma.groupBooking.findUnique({ where: { id: params.id }, include: withRelations });
    if (!group) return notFound("Group booking not found.");

    const g = await guard(PERMISSIONS.GROUP_UPDATE, { propertyId: group.propertyId });
    if (!g.ok) return g.response;
    if (group.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Group booking not found.");
    if (group.status === "CONFIRMED" || group.status === "COMPLETED") {
      return conflict("This group is confirmed — reopen it before changing the party.");
    }
    if (group.status === "CANCELLED") return conflict("This group was cancelled.");

    const payable = group.totalAmount - group.discountAmount;
    const paid = group.members.filter((m) => m.shareStatus === "PAID");
    const paidTotal = paid.reduce((a, m) => a + m.shareAmount, 0);

    const updated = await prisma.$transaction(async (tx) => {
      const member = await tx.groupMember.create({
        data: {
          groupBookingId: group.id,
          name: body.name!.trim(),
          email: body.email?.trim(),
          phone: body.phone?.trim(),
          shareAmount: body.shareAmount ?? 0,
        },
      });

      if (body.rebalance !== false && body.shareAmount === undefined) {
        const unpaid = [...group.members.filter((m) => m.shareStatus !== "PAID"), member];
        const shares = splitEvenly(payable - paidTotal, unpaid.length);
        for (let i = 0; i < unpaid.length; i++) {
          await tx.groupMember.update({ where: { id: unpaid[i].id }, data: { shareAmount: shares[i] } });
        }
      }

      return tx.groupBooking.findUnique({ where: { id: group.id }, include: withRelations });
    });

    await writeAudit({
      actor: g.actor,
      action: "group.member.add",
      permission: PERMISSIONS.GROUP_UPDATE,
      entityType: "GroupBooking",
      entityId: group.id,
      propertyId: group.propertyId,
      summary: `Added ${body.name.trim()} to group ${group.reference}; unpaid shares rebalanced`,
      after: { member: body.name.trim(), partySize: (updated?.members.length ?? 0) },
    });

    return ok({ group: presentGroup(updated!) }, 201);
  });
}

/**
 * Record one traveller's share as paid.
 *
 * Split payment is the whole point: each person settles their own part, and the
 * group's progress is the sum of what has actually arrived — never an assumption
 * that the organiser will collect and forward it.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ memberId?: string; reference?: string; unpay?: boolean }>(req);
    if (!body?.memberId) return badRequest("memberId is required.");

    const group = await prisma.groupBooking.findUnique({ where: { id: params.id }, include: withRelations });
    if (!group) return notFound("Group booking not found.");

    const g = await guard(PERMISSIONS.GROUP_PAYMENT_RECORD, { propertyId: group.propertyId });
    if (!g.ok) return g.response;
    if (group.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Group booking not found.");

    const member = group.members.find((m) => m.id === body.memberId);
    if (!member) return notFound("That traveller is not in this group.");
    if (!body.unpay && member.shareStatus === "PAID") return conflict(`${member.name}'s share is already recorded as paid.`);

    await prisma.groupMember.update({
      where: { id: member.id },
      data: body.unpay
        ? { shareStatus: "PENDING", paidAt: null, reference: null }
        : { shareStatus: "PAID", paidAt: new Date(), reference: body.reference?.trim() },
    });

    const updated = await prisma.groupBooking.findUnique({ where: { id: group.id }, include: withRelations });
    const view = presentGroup(updated!);

    await writeAudit({
      actor: g.actor,
      action: "group.payment.record",
      permission: PERMISSIONS.GROUP_PAYMENT_RECORD,
      entityType: "GroupBooking",
      entityId: group.id,
      propertyId: group.propertyId,
      summary: body.unpay
        ? `Reversed ${member.name}'s share on group ${group.reference}`
        : `Recorded ${member.name}'s share of ${group.currency} ${member.shareAmount.toLocaleString()} on group ${group.reference} — ${view.percentCollected}% collected`,
      before: { member: member.name, shareStatus: member.shareStatus },
      after: { member: member.name, shareStatus: body.unpay ? "PENDING" : "PAID", collected: view.collected, outstanding: view.outstanding },
    });

    return ok({ group: view });
  });
}
