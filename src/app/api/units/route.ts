import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereForUnitTable } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { canAnywhere } from "@/lib/security/authorize";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { UnitStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Units.
 *
 * Rent is stripped from the response for anyone without financial permission —
 * a guard needs to know that A-204 exists and who lives there, and has no
 * business knowing what they pay for it.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const buildingId = url.searchParams.get("buildingId");
    const status = url.searchParams.get("status") as UnitStatus | null;
    const q = url.searchParams.get("q")?.trim();

    const g = await guardList(PERMISSIONS.UNIT_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereForUnitTable(g.access);
    const units = await prisma.unit.findMany({
      where: {
        ...scoped,
        ...(propertyId ? { propertyId } : {}),
        ...(buildingId ? { buildingId } : {}),
        ...(status ? { status } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take: 500,
      include: {
        building: { select: { id: true, name: true } },
        property: { select: { id: true, name: true } },
        residents: { where: { active: true }, select: { id: true, fullName: true, isPrimary: true } },
      },
    });

    const showRent = canAnywhere(g.actor, PERMISSIONS.FINANCE_VIEW);

    return ok({
      units: units.map((u) => ({
        id: u.id,
        propertyId: u.propertyId,
        propertyName: u.property.name,
        buildingId: u.buildingId,
        buildingName: u.building.name,
        name: u.name,
        floor: u.floor,
        bedrooms: u.bedrooms,
        status: u.status,
        residents: u.residents.map((r) => ({ id: r.id, fullName: r.fullName, isPrimary: r.isPrimary })),
        ...(showRent ? { rentAmount: u.rentAmount, currency: u.currency } : {}),
      })),
      /** Told plainly, so the UI shows an explanatory blank rather than a zero. */
      rentVisible: showRent,
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      buildingId?: string; name?: string; floor?: number;
      bedrooms?: number; rentAmount?: number; status?: UnitStatus;
    }>(req);
    if (!body?.buildingId || !body.name?.trim()) return badRequest("buildingId and name are required.");

    const g = await guard(PERMISSIONS.UNIT_CREATE, { buildingId: body.buildingId });
    if (!g.ok) return g.response;

    const unit = await prisma.unit.create({
      data: {
        buildingId: body.buildingId,
        propertyId: g.scope.propertyId!,
        name: body.name.trim(),
        floor: body.floor,
        bedrooms: body.bedrooms,
        rentAmount: body.rentAmount,
        status: body.status ?? "VACANT",
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "unit.create",
      permission: PERMISSIONS.UNIT_CREATE,
      entityType: "Unit",
      entityId: unit.id,
      propertyId: unit.propertyId,
      buildingId: unit.buildingId,
      unitId: unit.id,
      summary: `Added unit ${unit.name}`,
      after: { name: unit.name, floor: unit.floor, bedrooms: unit.bedrooms, status: unit.status },
    });

    return ok({ unit }, 201);
  });
}
