import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { canAnywhere } from "@/lib/security/authorize";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { ResidentType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Residents and tenants.
 *
 * Contact details are behind their own permission. A guard checking who lives in
 * A-204 sees the name; the phone number and lease dates need
 * `resident.contact.view`, which the Security Guard role does not carry.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const unitId = url.searchParams.get("unitId");
    const propertyId = url.searchParams.get("propertyId");
    const q = url.searchParams.get("q")?.trim();

    const g = await guardList(PERMISSIONS.RESIDENT_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const residents = await prisma.resident.findMany({
      where: {
        ...scoped,
        ...(unitId ? { unitId } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(q ? { fullName: { contains: q, mode: "insensitive" } } : {}),
        active: true,
      },
      orderBy: { fullName: "asc" },
      take: 500,
      include: {
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
      },
    });

    const showContact = canAnywhere(g.actor, PERMISSIONS.RESIDENT_CONTACT_VIEW);

    return ok({
      residents: residents.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        unitId: r.unitId,
        unitName: `${r.unit.building.name} · ${r.unit.name}`,
        fullName: r.fullName,
        type: r.type,
        isPrimary: r.isPrimary,
        ...(showContact
          ? { email: r.email, phone: r.phone, moveInAt: r.moveInAt, leaseEnd: r.leaseEnd }
          : {}),
      })),
      contactVisible: showContact,
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      unitId?: string; fullName?: string; email?: string; phone?: string;
      type?: ResidentType; isPrimary?: boolean; moveInAt?: string; leaseEnd?: string;
    }>(req);
    if (!body?.unitId || !body.fullName?.trim()) return badRequest("unitId and fullName are required.");

    const g = await guard(PERMISSIONS.RESIDENT_CREATE, { unitId: body.unitId });
    if (!g.ok) return g.response;

    const resident = await prisma.$transaction(async (tx) => {
      const created = await tx.resident.create({
        data: {
          unitId: body.unitId!,
          propertyId: g.scope.propertyId!,
          fullName: body.fullName!.trim(),
          email: body.email?.toLowerCase().trim(),
          phone: body.phone?.trim(),
          type: body.type ?? "TENANT",
          isPrimary: body.isPrimary ?? false,
          moveInAt: body.moveInAt ? new Date(body.moveInAt) : new Date(),
          leaseEnd: body.leaseEnd ? new Date(body.leaseEnd) : null,
        },
      });
      // A unit with someone living in it is occupied; keeping that in step here
      // means occupancy on the owner dashboard is never a stale derived number.
      await tx.unit.update({ where: { id: body.unitId! }, data: { status: "OCCUPIED" } });
      return created;
    });

    await writeAudit({
      actor: g.actor,
      action: "resident.create",
      permission: PERMISSIONS.RESIDENT_CREATE,
      entityType: "Resident",
      entityId: resident.id,
      propertyId: resident.propertyId,
      unitId: resident.unitId,
      summary: `Added resident ${resident.fullName}`,
      after: { fullName: resident.fullName, type: resident.type, moveInAt: resident.moveInAt },
    });

    return ok({ resident }, 201);
  });
}
