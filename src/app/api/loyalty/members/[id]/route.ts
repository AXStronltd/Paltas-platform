import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { summariseMember } from "@/server/presenters";
import { balanceFrom, pointsForStay, tierForSpend, qualifyingSpendFrom, type LedgerEntry } from "@/lib/loyalty/loyalty";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.LOYALTY_VIEW, {});
    if (!g.ok) return g.response;

    const member = await prisma.loyaltyMember.findUnique({
      where: { id: params.id },
      include: { entries: { orderBy: { at: "desc" } } },
    });
    if (!member) return notFound("Member not found.");
    if (member.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Member not found.");

    return ok({ member: summariseMember(member) });
  });
}

/**
 * Move points.
 *
 * `stay` records a completed stay and earns at the member's current tier rate —
 * earning on completion rather than on booking, so nothing has to be clawed back
 * when a guest cancels. `adjust` moves points by hand and always demands a
 * reason, because an unexplained balance change is indistinguishable from an
 * error.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      stay?: { amount: number; reference?: string };
      adjust?: { points: number; reason: string };
      redeem?: { points: number; reference?: string };
    }>(req);
    if (!body) return badRequest("A body is required.");

    const member = await prisma.loyaltyMember.findUnique({
      where: { id: params.id },
      include: { entries: { orderBy: { at: "desc" } } },
    });
    if (!member) return notFound("Member not found.");

    const manual = body.adjust !== undefined;
    const permission = manual ? PERMISSIONS.LOYALTY_ADJUST : PERMISSIONS.LOYALTY_MANAGE;
    const g = await guard(permission, {});
    if (!g.ok) return g.response;
    if (member.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Member not found.");

    const ledger: LedgerEntry[] = member.entries.map((e) => ({
      points: e.points, at: e.at, kind: e.kind as LedgerEntry["kind"], qualifyingSpend: e.qualifyingSpend ?? undefined,
    }));

    if (body.stay) {
      const amount = Math.round(body.stay.amount);
      if (amount <= 0) return badRequest("A stay must have a positive value.");
      // Earned at the tier the member holds now, from their rolling spend.
      const tier = tierForSpend(qualifyingSpendFrom(ledger));
      const points = pointsForStay(amount, tier);

      await prisma.loyaltyEntry.create({
        data: {
          memberId: member.id, kind: "EARN", points, qualifyingSpend: amount,
          reason: `Completed stay — earned at ${tier.name} rate (${tier.earnRatePer100} per 100)`,
          reference: body.stay.reference?.trim(), createdById: g.actor.id,
        },
      });

      await writeAudit({
        actor: g.actor, action: "loyalty.earn", permission,
        entityType: "LoyaltyMember", entityId: member.id,
        summary: `${member.name} earned ${points.toLocaleString()} points on a KES ${amount.toLocaleString()} stay (${tier.name})`,
        after: { points, qualifyingSpend: amount, tier: tier.name },
      });
    } else if (body.redeem) {
      const points = Math.round(body.redeem.points);
      if (points <= 0) return badRequest("Redeem a positive number of points.");
      const balance = balanceFrom(ledger);
      if (points > balance) return conflict(`Only ${balance.toLocaleString()} points available.`);

      await prisma.loyaltyEntry.create({
        data: {
          memberId: member.id, kind: "REDEEM", points: -points,
          reason: `Redeemed against a booking — KES ${points.toLocaleString()} off`,
          reference: body.redeem.reference?.trim(), createdById: g.actor.id,
        },
      });

      await writeAudit({
        actor: g.actor, action: "loyalty.redeem", permission,
        entityType: "LoyaltyMember", entityId: member.id,
        summary: `${member.name} redeemed ${points.toLocaleString()} points (KES ${points.toLocaleString()} off)`,
        before: { balance }, after: { balance: balance - points },
      });
    } else if (body.adjust) {
      if (!body.adjust.reason?.trim()) return badRequest("A reason is required to adjust points by hand.");
      const points = Math.round(body.adjust.points);
      if (points === 0) return badRequest("An adjustment of zero does nothing.");
      const balance = balanceFrom(ledger);
      if (balance + points < 0) return conflict("That would take the balance below zero.");

      await prisma.loyaltyEntry.create({
        data: { memberId: member.id, kind: "ADJUST", points, reason: body.adjust.reason.trim(), createdById: g.actor.id },
      });

      await writeAudit({
        actor: g.actor, action: "loyalty.adjust", permission,
        entityType: "LoyaltyMember", entityId: member.id,
        summary: `Adjusted ${member.name}'s points by ${points > 0 ? "+" : ""}${points.toLocaleString()} — ${body.adjust.reason.trim()}`,
        before: { balance }, after: { balance: balance + points, reason: body.adjust.reason.trim() },
      });
    } else {
      return badRequest("Provide one of stay, redeem or adjust.");
    }

    const refreshed = await prisma.loyaltyMember.findUnique({
      where: { id: member.id },
      include: { entries: { orderBy: { at: "desc" } } },
    });
    return ok({ member: summariseMember(refreshed!) });
  });
}
