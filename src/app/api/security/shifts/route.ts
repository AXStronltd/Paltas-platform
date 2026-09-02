import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** The shift roster. Defaults to the coming week. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date();
    const to = url.searchParams.get("to")
      ? new Date(url.searchParams.get("to")!)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const g = await guardList(PERMISSIONS.SHIFT_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByProperty(g.access);
    const shifts = await prisma.guardShift.findMany({
      where: {
        ...scoped,
        ...(propertyId ? { propertyId } : {}),
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: "asc" },
      include: {
        guard: { include: { user: { select: { name: true } } } },
        gate: { select: { id: true, name: true } },
      },
    });

    return ok({
      shifts: shifts.map((s) => ({
        id: s.id,
        propertyId: s.propertyId,
        guardId: s.guardId,
        guardName: s.guard.user.name,
        badgeNumber: s.guard.badgeNumber,
        gateName: s.gate?.name ?? null,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        checkInAt: s.checkInAt,
        checkOutAt: s.checkOutAt,
      })),
    });
  });
}

/** Schedule a shift. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ propertyId?: string; guardId?: string; gateId?: string; startsAt?: string; endsAt?: string }>(req);
    if (!body?.propertyId || !body.guardId || !body.startsAt || !body.endsAt) {
      return badRequest("propertyId, guardId, startsAt and endsAt are required.");
    }

    const g = await guard(PERMISSIONS.SHIFT_MANAGE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return badRequest("Invalid dates.");
    if (endsAt <= startsAt) return badRequest("A shift must end after it starts.");

    const guardRow = await prisma.guard.findUnique({ where: { id: body.guardId }, include: { user: { select: { name: true } } } });
    if (!guardRow || guardRow.propertyId !== body.propertyId) {
      return badRequest("That guard is not assigned to this property.");
    }

    const shift = await prisma.guardShift.create({
      data: { propertyId: body.propertyId, guardId: body.guardId, gateId: body.gateId, startsAt, endsAt },
    });

    await writeAudit({
      actor: g.actor,
      action: "shift.create",
      permission: PERMISSIONS.SHIFT_MANAGE,
      entityType: "GuardShift",
      entityId: shift.id,
      propertyId: shift.propertyId,
      summary: `Scheduled ${guardRow.user.name} from ${startsAt.toLocaleString()} to ${endsAt.toLocaleString()}`,
      after: { guard: guardRow.user.name, startsAt, endsAt },
    });

    return ok({ shift }, 201);
  });
}
