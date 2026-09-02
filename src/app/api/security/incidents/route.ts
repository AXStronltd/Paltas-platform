import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { incidentReference } from "@/server/passes";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { IncidentSeverity, IncidentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as IncidentStatus | null;
    const severity = url.searchParams.get("severity") as IncidentSeverity | null;
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.SECURITY_INCIDENT_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access, { building: true });
    const incidents = await prisma.securityIncident.findMany({
      where: {
        ...scoped,
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
      include: {
        property: { select: { name: true } },
        unit: { select: { name: true, building: { select: { name: true } } } },
      },
    });

    return ok({
      incidents: incidents.map((i) => ({
        id: i.id,
        reference: i.reference,
        propertyId: i.propertyId,
        propertyName: i.property.name,
        unitName: i.unit ? `${i.unit.building.name} · ${i.unit.name}` : null,
        category: i.category,
        severity: i.severity,
        title: i.title,
        description: i.description,
        location: i.location,
        occurredAt: i.occurredAt,
        reportedByName: i.reportedByName,
        status: i.status,
        resolvedAt: i.resolvedAt,
        resolutionNotes: i.resolutionNotes,
      })),
    });
  });
}

/** File an incident. Guards hold this permission; most other staff do not. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; buildingId?: string; unitId?: string;
      category?: string; severity?: IncidentSeverity; title?: string;
      description?: string; location?: string; occurredAt?: string;
      visitorId?: string; vehicleId?: string;
    }>(req);
    if (!body?.title || !body.description) return badRequest("title and description are required.");
    if (!body.propertyId && !body.unitId && !body.buildingId) return badRequest("A property, building or unit is required.");

    const g = await guard(PERMISSIONS.SECURITY_INCIDENT_CREATE, {
      propertyId: body.propertyId ?? null,
      buildingId: body.buildingId ?? null,
      unitId: body.unitId ?? null,
    });
    if (!g.ok) return g.response;

    const incident = await prisma.securityIncident.create({
      data: {
        propertyId: g.scope.propertyId!,
        buildingId: g.scope.buildingId,
        unitId: g.scope.unitId,
        reference: incidentReference(),
        category: body.category?.trim() || "general",
        severity: body.severity ?? "MEDIUM",
        title: body.title.trim(),
        description: body.description.trim(),
        location: body.location?.trim(),
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        reportedById: g.actor.id,
        reportedByName: g.actor.name,
        visitorId: body.visitorId,
        vehicleId: body.vehicleId,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "security.incident.create",
      permission: PERMISSIONS.SECURITY_INCIDENT_CREATE,
      entityType: "SecurityIncident",
      entityId: incident.id,
      propertyId: incident.propertyId,
      buildingId: incident.buildingId,
      unitId: incident.unitId,
      summary: `Reported ${incident.severity.toLowerCase()} incident ${incident.reference}: ${incident.title}`,
      after: { severity: incident.severity, category: incident.category, title: incident.title },
    });

    return ok({ incident }, 201);
  });
}
