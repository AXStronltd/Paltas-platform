import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { MaintenanceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Move a maintenance request along, or assign it.
 *
 * Resolving is its own permission, separate from updating. A contractor may
 * legitimately post progress on a job without being able to declare it finished
 * — closing a request is what stops anyone chasing it, so it needs the
 * authority that goes with that.
 */
const NEEDS_RESOLVE: MaintenanceStatus[] = ["RESOLVED", "CLOSED"];

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.maintenanceRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true, title: true, status: true, priority: true, propertyId: true,
        unitId: true, assignedToId: true, resolutionNote: true,
      },
    });
    if (!existing) return fail(404, { code: "not_found", message: "Request not found." });

    const body = await readJson<{ status?: MaintenanceStatus; assignedToId?: string | null; note?: string }>(req);
    if (!body) return badRequest("Expected a JSON body.");

    const wantsResolve = body.status !== undefined && NEEDS_RESOLVE.includes(body.status);
    const wantsAssign = body.assignedToId !== undefined;
    const permission = wantsResolve
      ? PERMISSIONS.MAINTENANCE_RESOLVE
      : wantsAssign
        ? PERMISSIONS.MAINTENANCE_ASSIGN
        : PERMISSIONS.MAINTENANCE_UPDATE;

    const g = await guard(permission, { propertyId: existing.propertyId, unitId: existing.unitId ?? undefined });
    if (!g.ok) return g.response;

    // An assignee must be a real member of the same organisation. Without this
    // a request could be parked on a user id from another tenant, where nobody
    // can see it and nobody will ever do the work.
    if (body.assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: body.assignedToId, orgId: g.actor.orgId, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      if (!assignee) return badRequest("That person is not a member of this organisation.");
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: existing.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(wantsAssign ? { assignedToId: body.assignedToId } : {}),
        ...(body.note !== undefined ? { resolutionNote: body.note.slice(0, 1000) } : {}),
        // Stamped when it is resolved, and cleared if it is reopened — a
        // request showing both OPEN and a resolution date reads as finished.
        ...(body.status !== undefined
          ? { resolvedAt: NEEDS_RESOLVE.includes(body.status) ? new Date() : null }
          : {}),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: wantsResolve ? "maintenance.resolve" : wantsAssign ? "maintenance.assign" : "maintenance.update",
      permission,
      entityType: "MaintenanceRequest",
      entityId: updated.id,
      propertyId: updated.propertyId,
      unitId: updated.unitId,
      summary: wantsResolve
        ? `Marked "${updated.title}" ${updated.status.toLowerCase()}.`
        : wantsAssign
          ? `Reassigned "${updated.title}".`
          : `Updated "${updated.title}".`,
      ...changes(existing, updated),
    });

    return ok({ request: updated });
  });
}
