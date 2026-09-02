import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, handle, notFound, ok, readJson } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** One property, with its buildings — the first rung of the owner's drill-down. */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.PROPERTY_VIEW, { propertyId: params.id });
    if (!g.ok) return g.response;

    const property = await prisma.property.findUnique({
      where: { id: params.id },
      include: {
        buildings: {
          orderBy: { name: "asc" },
          include: { _count: { select: { units: true } } },
        },
        _count: { select: { units: true, residents: true, gates: true, guards: true } },
      },
    });
    if (!property) return notFound("Property not found.");

    return ok({
      property: {
        id: property.id,
        name: property.name,
        address: property.address,
        city: property.city,
        country: property.country,
        kind: property.kind,
        totals: {
          units: property._count.units,
          residents: property._count.residents,
          gates: property._count.gates,
          guards: property._count.guards,
        },
        buildings: property.buildings.map((b) => ({
          id: b.id,
          name: b.name,
          floors: b.floors,
          units: b._count.units,
        })),
      },
    });
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ name?: string; address?: string; city?: string; kind?: string }>(req);
    if (!body) return badRequest("A body is required.");

    const g = await guard(PERMISSIONS.PROPERTY_UPDATE, { propertyId: params.id });
    if (!g.ok) return g.response;

    const existing = await prisma.property.findUnique({ where: { id: params.id } });
    if (!existing) return notFound("Property not found.");

    const updated = await prisma.property.update({
      where: { id: params.id },
      data: {
        name: body.name?.trim() ?? undefined,
        address: body.address?.trim() ?? undefined,
        city: body.city?.trim() ?? undefined,
        kind: body.kind?.trim() ?? undefined,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "property.update",
      permission: PERMISSIONS.PROPERTY_UPDATE,
      entityType: "Property",
      entityId: updated.id,
      propertyId: updated.id,
      summary: `Updated property "${updated.name}"`,
      ...changes(existing as unknown as Record<string, unknown>, {
        name: updated.name,
        address: updated.address,
        city: updated.city,
        kind: updated.kind,
      }),
    });

    return ok({ property: updated });
  });
}

/**
 * Delete a property and everything beneath it.
 *
 * The counts of what is about to go are recorded in the audit entry *before* the
 * delete, because afterwards there is nothing left to count.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.PROPERTY_DELETE, { propertyId: params.id });
    if (!g.ok) return g.response;

    const property = await prisma.property.findUnique({
      where: { id: params.id },
      include: { _count: { select: { buildings: true, units: true, residents: true, incidents: true } } },
    });
    if (!property) return notFound("Property not found.");

    await prisma.property.delete({ where: { id: property.id } });

    await writeAudit({
      actor: g.actor,
      action: "property.delete",
      permission: PERMISSIONS.PROPERTY_DELETE,
      entityType: "Property",
      entityId: property.id,
      propertyId: property.id,
      summary: `Deleted property "${property.name}" with ${property._count.buildings} buildings, ${property._count.units} units and ${property._count.residents} residents`,
      before: {
        name: property.name,
        address: property.address,
        buildings: property._count.buildings,
        units: property._count.units,
        residents: property._count.residents,
      },
      after: null,
    });

    return ok({ deleted: true });
  });
}
