import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereForBuildingTable } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const propertyId = new URL(req.url).searchParams.get("propertyId");
    const g = await guardList(PERMISSIONS.BUILDING_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereForBuildingTable(g.access);
    const buildings = await prisma.building.findMany({
      where: {
        ...scoped,
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: { name: "asc" },
      include: { _count: { select: { units: true } }, property: { select: { name: true } } },
    });

    return ok({
      buildings: buildings.map((b) => ({
        id: b.id,
        propertyId: b.propertyId,
        propertyName: b.property.name,
        name: b.name,
        floors: b.floors,
        units: b._count.units,
      })),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ propertyId?: string; name?: string; floors?: number }>(req);
    if (!body?.propertyId || !body.name?.trim()) return badRequest("propertyId and name are required.");

    const g = await guard(PERMISSIONS.BUILDING_CREATE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    const building = await prisma.building.create({
      data: { propertyId: body.propertyId, name: body.name.trim(), floors: Math.max(1, body.floors ?? 1) },
    });

    await writeAudit({
      actor: g.actor,
      action: "building.create",
      permission: PERMISSIONS.BUILDING_CREATE,
      entityType: "Building",
      entityId: building.id,
      propertyId: building.propertyId,
      buildingId: building.id,
      summary: `Added building "${building.name}"`,
      after: { name: building.name, floors: building.floors },
    });

    return ok({ building }, 201);
  });
}
