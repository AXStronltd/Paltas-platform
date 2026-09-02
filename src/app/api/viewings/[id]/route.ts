import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { ViewingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Record what happened, or move it.
 *
 * A completed or cancelled viewing is history and does not go back to
 * scheduled — rewriting the diary after the fact makes it useless as a record
 * of what an agent actually did.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.viewing.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Viewing not found." });

    const g = await guardMaybeScoped(PERMISSIONS.VIEWING_UPDATE, existing.propertyId);
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Viewing not found." });
    }

    const body = await readJson<{
      status?: ViewingStatus; outcome?: string; notes?: string; scheduledAt?: string;
    }>(req);
    if (!body) return badRequest("Expected a JSON body.");

    if (existing.status !== "SCHEDULED" && body.status === "SCHEDULED") {
      return fail(409, { code: "conflict", message: "A finished viewing cannot be reopened." });
    }
    if (body.scheduledAt && existing.status !== "SCHEDULED") {
      return fail(409, { code: "conflict", message: "A finished viewing cannot be moved." });
    }

    const updated = await prisma.viewing.update({
      where: { id: existing.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.outcome !== undefined ? { outcome: body.outcome.slice(0, 1000) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes.slice(0, 1000) } : {}),
        ...(body.scheduledAt ? { scheduledAt: new Date(body.scheduledAt) } : {}),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "viewing.update",
      permission: PERMISSIONS.VIEWING_UPDATE,
      entityType: "Viewing",
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Viewing for ${updated.clientName} — ${updated.status.toLowerCase()}${updated.outcome ? `: ${updated.outcome}` : ""}.`,
      ...changes(existing, updated),
    });

    return ok({ viewing: updated });
  });
}
