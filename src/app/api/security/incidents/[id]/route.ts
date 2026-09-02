import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, handle, notFound, ok, readJson } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { IncidentSeverity, IncidentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const incident = await prisma.securityIncident.findUnique({
      where: { id: params.id },
      include: {
        property: { select: { name: true } },
        unit: { select: { name: true, building: { select: { name: true } } } },
        visitor: { select: { id: true, fullName: true } },
        vehicle: { select: { id: true, plate: true } },
      },
    });
    if (!incident) return notFound("Incident not found.");

    const g = await guard(PERMISSIONS.SECURITY_INCIDENT_VIEW, {
      propertyId: incident.propertyId,
      buildingId: incident.buildingId,
      unitId: incident.unitId,
    });
    if (!g.ok) return g.response;

    return ok({ incident });
  });
}

/**
 * Update or resolve an incident. Moving one to RESOLVED requires the resolve
 * permission specifically, so an investigator can add findings without being
 * able to close the case.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      status?: IncidentStatus; severity?: IncidentSeverity;
      description?: string; resolutionNotes?: string; category?: string;
    }>(req);
    if (!body) return badRequest("A body is required.");

    const incident = await prisma.securityIncident.findUnique({ where: { id: params.id } });
    if (!incident) return notFound("Incident not found.");

    const closing = body.status === "RESOLVED" || body.status === "CLOSED";
    const permission = closing ? PERMISSIONS.SECURITY_INCIDENT_RESOLVE : PERMISSIONS.SECURITY_INCIDENT_UPDATE;

    const g = await guard(permission, {
      propertyId: incident.propertyId,
      buildingId: incident.buildingId,
      unitId: incident.unitId,
    });
    if (!g.ok) return g.response;

    if (closing && !body.resolutionNotes?.trim()) {
      return badRequest("Resolution notes are required when closing an incident.");
    }

    const updated = await prisma.securityIncident.update({
      where: { id: incident.id },
      data: {
        status: body.status ?? undefined,
        severity: body.severity ?? undefined,
        category: body.category?.trim() ?? undefined,
        description: body.description?.trim() ?? undefined,
        resolutionNotes: body.resolutionNotes?.trim() ?? undefined,
        ...(closing ? { resolvedAt: new Date(), resolvedById: g.actor.id } : {}),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: closing ? "security.incident.resolve" : "security.incident.update",
      permission,
      entityType: "SecurityIncident",
      entityId: incident.id,
      propertyId: incident.propertyId,
      unitId: incident.unitId,
      summary: closing
        ? `Resolved incident ${incident.reference}: ${incident.title}`
        : `Updated incident ${incident.reference}`,
      ...changes(incident as unknown as Record<string, unknown>, {
        status: updated.status,
        severity: updated.severity,
        category: updated.category,
        description: updated.description,
        resolutionNotes: updated.resolutionNotes,
      }),
    });

    return ok({ incident: updated });
  });
}
