import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { conflict, guard, handle, notFound, ok } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { presentGroup } from "@/server/presenters";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Confirm a group once every share has arrived.
 *
 * The check is deliberately on the server: an organiser looking at a screen that
 * says "95% collected" should not be able to confirm anyway, and the discount's
 * redemption count is only incremented here — when the booking is real — rather
 * than when the group was merely opened.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const group = await prisma.groupBooking.findUnique({
      where: { id: params.id },
      include: {
        property: { select: { id: true, name: true } },
        discount: { select: { id: true, name: true } },
        members: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!group) return notFound("Group booking not found.");

    const g = await guard(PERMISSIONS.GROUP_CONFIRM, { propertyId: group.propertyId });
    if (!g.ok) return g.response;
    if (group.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Group booking not found.");
    if (group.status === "CONFIRMED") return conflict("This group is already confirmed.");
    if (group.status === "CANCELLED") return conflict("This group was cancelled.");

    const view = presentGroup(group);
    if (view.outstanding > 0) {
      return conflict(
        `${group.currency} ${view.outstanding.toLocaleString()} is still outstanding across ${
          group.members.filter((m) => m.shareStatus !== "PAID").length
        } traveller(s).`,
      );
    }

    const confirmed = await prisma.$transaction(async (tx) => {
      if (group.discountId) {
        await tx.discount.update({
          where: { id: group.discountId },
          data: { redemptionCount: { increment: 1 } },
        });
      }
      return tx.groupBooking.update({
        where: { id: group.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
        include: {
          property: { select: { id: true, name: true } },
          discount: { select: { id: true, name: true } },
          members: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    await writeAudit({
      actor: g.actor,
      action: "group.confirm",
      permission: PERMISSIONS.GROUP_CONFIRM,
      entityType: "GroupBooking",
      entityId: group.id,
      propertyId: group.propertyId,
      summary: `Confirmed group ${group.reference} "${group.name}" — ${group.currency} ${view.collected.toLocaleString()} collected from ${group.members.length} traveller(s)`,
      before: { status: group.status },
      after: { status: "CONFIRMED", collected: view.collected, discountRedeemed: group.discount?.name ?? null },
    });

    return ok({ group: presentGroup(confirmed) });
  });
}
