import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { hashPassword } from "@/server/password";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** The guard roster, with each guard's current shift if they are on one. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const propertyId = new URL(req.url).searchParams.get("propertyId");
    const g = await guardList(PERMISSIONS.GUARD_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByProperty(g.access);
    const guards = await prisma.guard.findMany({
      where: {
        ...scoped,
        ...(propertyId ? { propertyId } : {}),
        active: true,
      },
      include: {
        user: { select: { id: true, name: true, email: true, status: true } },
        shifts: {
          where: { status: "ACTIVE" },
          take: 1,
          include: { gate: { select: { name: true } } },
        },
      },
      orderBy: { badgeNumber: "asc" },
    });

    return ok({
      guards: guards.map((gd) => ({
        id: gd.id,
        propertyId: gd.propertyId,
        userId: gd.userId,
        name: gd.user.name,
        email: gd.user.email,
        accountStatus: gd.user.status,
        badgeNumber: gd.badgeNumber,
        phone: gd.phone,
        onShift: gd.shifts.length > 0,
        currentGate: gd.shifts[0]?.gate?.name ?? null,
        shiftEndsAt: gd.shifts[0]?.endsAt ?? null,
      })),
    });
  });
}

/**
 * Add a guard.
 *
 * This creates the login as well as the roster entry, and assigns the Security
 * Guard role scoped to this property alone — so a guard hired for one estate can
 * see nothing at another, which is the behaviour the data-isolation requirement
 * asks for and the easiest thing to get wrong by hand.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; name?: string; email?: string; phone?: string;
      badgeNumber?: string; temporaryPassword?: string;
    }>(req);
    if (!body?.propertyId || !body.name || !body.email || !body.badgeNumber) {
      return badRequest("propertyId, name, email and badgeNumber are required.");
    }
    if (!body.temporaryPassword || body.temporaryPassword.length < 8) {
      return badRequest("A temporary password of at least 8 characters is required.");
    }

    // Creating a guard creates a staff account, so it needs that permission too.
    const g = await guard(PERMISSIONS.GUARD_MANAGE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;
    const staffCheck = await guard(PERMISSIONS.STAFF_CREATE, { propertyId: body.propertyId });
    if (!staffCheck.ok) return staffCheck.response;

    const email = body.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return conflict("An account with that email already exists.");
    }
    if (await prisma.guard.findUnique({ where: { badgeNumber: body.badgeNumber }, select: { id: true } })) {
      return conflict("That badge number is already in use.");
    }

    const role = await prisma.role.findFirst({
      where: { key: "security_guard", OR: [{ orgId: g.actor.orgId }, { orgId: null }] },
      select: { id: true },
    });
    if (!role) return conflict("The Security Guard role is missing — seed the roles first.");

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          orgId: g.actor.orgId,
          email,
          name: body.name!.trim(),
          phone: body.phone?.trim(),
          passwordHash: await hashPassword(body.temporaryPassword!),
          title: "Security Guard",
          createdById: g.actor.id,
        },
      });
      await tx.roleAssignment.create({
        data: { userId: user.id, roleId: role.id, scopeType: "PROPERTY", scopeId: body.propertyId!, grantedById: g.actor.id },
      });
      const guardRow = await tx.guard.create({
        data: { propertyId: body.propertyId!, userId: user.id, badgeNumber: body.badgeNumber!.trim(), phone: body.phone?.trim() },
      });
      return { user, guardRow };
    });

    await writeAudit({
      actor: g.actor,
      action: "guard.create",
      permission: PERMISSIONS.GUARD_MANAGE,
      entityType: "Guard",
      entityId: created.guardRow.id,
      propertyId: body.propertyId,
      summary: `Added guard ${created.user.name} (badge ${created.guardRow.badgeNumber}), scoped to this property`,
      after: { name: created.user.name, email, badgeNumber: created.guardRow.badgeNumber, role: "Security Guard" },
    });

    return ok({
      guard: {
        id: created.guardRow.id,
        userId: created.user.id,
        name: created.user.name,
        email,
        badgeNumber: created.guardRow.badgeNumber,
      },
    }, 201);
  });
}
