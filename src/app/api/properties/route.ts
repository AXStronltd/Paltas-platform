import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereForBuildingTable, whereForUnitTable, whereByPropertyOrUnit, wherePropertyTable } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * The portfolio root.
 *
 * This is the endpoint where data isolation is most visible: staff assigned to
 * one property get a one-item list, and nothing about the response hints that
 * others exist.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardList(PERMISSIONS.PROPERTY_VIEW);
    if (!g.ok) return g.response;

    const properties = await prisma.property.findMany({
      where: wherePropertyTable(g.access),
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, city: true, country: true, kind: true },
    });
    const ids = properties.map((p) => p.id);
    if (ids.length === 0) return ok({ properties: [] });

    // Counted within the caller's own scope rather than across the whole
    // property. A supervisor assigned to one block should not learn from this
    // response how many units the other blocks contain — the count is itself
    // information about a part of the portfolio they were not given.
    const scopedTo = (where: Record<string, unknown> | null) =>
      where ? { AND: [{ propertyId: { in: ids } }, where] } : { propertyId: { in: ids } };

    const [buildings, units, occupied, residents] = await Promise.all([
      prisma.building.groupBy({
        by: ["propertyId"],
        where: scopedTo(whereForBuildingTable(g.access)),
        _count: { _all: true },
      }),
      prisma.unit.groupBy({
        by: ["propertyId"],
        where: scopedTo(whereForUnitTable(g.access)),
        _count: { _all: true },
      }),
      prisma.unit.groupBy({
        by: ["propertyId"],
        where: { AND: [scopedTo(whereForUnitTable(g.access)), { status: "OCCUPIED" as const }] },
        _count: { _all: true },
      }),
      prisma.resident.groupBy({
        by: ["propertyId"],
        where: { AND: [scopedTo(whereByPropertyOrUnit(g.access)), { active: true as const }] },
        _count: { _all: true },
      }),
    ]);

    const count = (rows: { propertyId: string; _count: { _all: number } }[], id: string) =>
      rows.find((r) => r.propertyId === id)?._count._all ?? 0;

    return ok({
      properties: properties.map((p) => {
        const unitCount = count(units, p.id);
        const occ = count(occupied, p.id);
        return {
          id: p.id,
          name: p.name,
          address: p.address,
          city: p.city,
          country: p.country,
          kind: p.kind,
          buildings: count(buildings, p.id),
          units: unitCount,
          residents: count(residents, p.id),
          occupiedUnits: occ,
          occupancyRate: unitCount ? Math.round((occ / unitCount) * 100) : 0,
        };
      }),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ name?: string; address?: string; city?: string; country?: string; kind?: string }>(req);
    if (!body?.name?.trim()) return badRequest("name is required.");

    // Creating a property is organisation-level: there is no property to scope to
    // yet, so the grant has to reach the organisation itself.
    const g = await guard(PERMISSIONS.PROPERTY_CREATE, {});
    if (!g.ok) return g.response;

    const property = await prisma.property.create({
      data: {
        orgId: g.actor.orgId,
        name: body.name.trim(),
        address: body.address?.trim(),
        city: body.city?.trim(),
        country: body.country?.trim() || "KE",
        kind: body.kind?.trim() || "residential",
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "property.create",
      permission: PERMISSIONS.PROPERTY_CREATE,
      entityType: "Property",
      entityId: property.id,
      propertyId: property.id,
      summary: `Added property "${property.name}"`,
      after: { name: property.name, city: property.city, address: property.address },
    });

    return ok({ property }, 201);
  });
}
