import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { summariseMember } from "@/server/presenters";

export const dynamic = "force-dynamic";

/**
 * Paltas Rewards members.
 *
 * Balance and tier are derived from the ledger on every read rather than stored,
 * so they cannot drift from the entries that justify them. With a few hundred
 * entries per member that is cheap; if it ever stops being cheap, the fix is a
 * checkpoint row, not a mutable balance.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const q = new URL(req.url).searchParams.get("q")?.trim();

    const g = await guardList(PERMISSIONS.LOYALTY_VIEW);
    if (!g.ok) return g.response;

    const members = await prisma.loyaltyMember.findMany({
      where: {
        ...(g.access.kind === "platform" ? { org: { isPlatform: false } } : { orgId: g.actor.orgId }),
        active: true,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { entries: { orderBy: { at: "desc" } } },
      orderBy: { joinedAt: "desc" },
      take: 200,
    });

    return ok({ members: members.map(summariseMember) });
  });
}

/** Enrol a member. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ email?: string; name?: string; phone?: string; openingPoints?: number }>(req);
    if (!body?.email?.trim() || !body.name?.trim()) return badRequest("email and name are required.");

    const g = await guard(PERMISSIONS.LOYALTY_MANAGE, {});
    if (!g.ok) return g.response;

    const email = body.email.toLowerCase().trim();
    if (await prisma.loyaltyMember.findFirst({ where: { orgId: g.actor.orgId, email }, select: { id: true } })) {
      return conflict("That email is already enrolled.");
    }

    const member = await prisma.loyaltyMember.create({
      data: {
        orgId: g.actor.orgId,
        email,
        name: body.name.trim(),
        phone: body.phone?.trim(),
        entries: body.openingPoints
          ? { create: { kind: "ADJUST", points: Math.round(body.openingPoints), reason: "Opening balance on enrolment", createdById: g.actor.id } }
          : undefined,
      },
      include: { entries: true },
    });

    await writeAudit({
      actor: g.actor,
      action: "loyalty.member.create",
      permission: PERMISSIONS.LOYALTY_MANAGE,
      entityType: "LoyaltyMember",
      entityId: member.id,
      summary: `Enrolled ${member.name} in Paltas Rewards${body.openingPoints ? ` with ${body.openingPoints.toLocaleString()} opening points` : ""}`,
      after: { name: member.name, email, openingPoints: body.openingPoints ?? 0 },
    });

    return ok({ member: summariseMember(member) }, 201);
  });
}
