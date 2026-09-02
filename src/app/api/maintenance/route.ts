import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { MaintenancePriority, MaintenanceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as MaintenanceStatus | null;
    const propertyId = url.searchParams.get("propertyId");
    const assignedToMe = url.searchParams.get("assignedToMe") === "true";

    const g = await guardList(PERMISSIONS.MAINTENANCE_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access, { building: true });
    const requests = await prisma.maintenanceRequest.findMany({
      where: {
        ...scoped,
        ...(status ? { status } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(assignedToMe ? { assignedToId: g.actor.id } : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        property: { select: { name: true } },
        unit: { select: { name: true, building: { select: { name: true } } } },
      },
    });

    return ok({
      requests: requests.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        propertyName: r.property.name,
        unitName: r.unit ? `${r.unit.building.name} · ${r.unit.name}` : null,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
        raisedByName: r.raisedByName,
        assignedToId: r.assignedToId,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      })),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      unitId?: string; propertyId?: string; title?: string;
      description?: string; priority?: MaintenancePriority;
    }>(req);
    if (!body?.title?.trim() || !body.description?.trim()) return badRequest("title and description are required.");
    if (!body.unitId && !body.propertyId) return badRequest("unitId or propertyId is required.");

    const g = await guard(PERMISSIONS.MAINTENANCE_CREATE, {
      unitId: body.unitId ?? null,
      propertyId: body.propertyId ?? null,
    });
    if (!g.ok) return g.response;

    const request = await prisma.maintenanceRequest.create({
      data: {
        propertyId: g.scope.propertyId!,
        buildingId: g.scope.buildingId,
        unitId: g.scope.unitId,
        title: body.title.trim(),
        description: body.description.trim(),
        priority: body.priority ?? "MEDIUM",
        raisedByName: g.actor.name,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "maintenance.create",
      permission: PERMISSIONS.MAINTENANCE_CREATE,
      entityType: "MaintenanceRequest",
      entityId: request.id,
      propertyId: request.propertyId,
      unitId: request.unitId,
      summary: `Raised ${request.priority.toLowerCase()}-priority request: ${request.title}`,
      after: { title: request.title, priority: request.priority, status: request.status },
    });

    return ok({ request }, 201);
  });
}
