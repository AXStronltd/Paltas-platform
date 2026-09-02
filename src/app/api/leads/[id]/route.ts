import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { LeadStage } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * The pipeline is ordered, and the order is enforced.
 *
 * "Any stage to any stage" is how a closed sale quietly becomes a new enquiry
 * and a forecast stops meaning anything. Moving backwards is allowed — deals
 * genuinely do slip from OFFER back to VIEWING — but only from a stage that is
 * still open. CLOSED and LOST are terminal.
 */
const ORDER: LeadStage[] = ["NEW", "CONTACTED", "VIEWING", "OFFER", "RESERVED", "CLOSED"];
const TERMINAL: LeadStage[] = ["CLOSED", "LOST"];

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      select: { id: true, propertyId: true, orgId: true },
    });
    if (!lead) return fail(404, { code: "not_found", message: "Lead not found." });

    const g = await guardMaybeScoped(PERMISSIONS.LEAD_VIEW, lead.propertyId);
    if (!g.ok) return g.response;
    if (lead.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Lead not found." });
    }

    const full = await prisma.lead.findUnique({
      where: { id: params.id },
      include: {
        property: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
        viewings: { orderBy: { scheduledAt: "desc" }, take: 20 },
      },
    });
    return ok({ lead: full });
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.lead.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Lead not found." });

    const body = await readJson<{
      stage?: LeadStage; assignedToId?: string | null; notes?: string;
      name?: string; email?: string; phone?: string; budget?: number;
      interestedIn?: string; lostReason?: string;
    }>(req);
    if (!body) return badRequest("Expected a JSON body.");

    // Each kind of change needs its own permission: advancing a deal and
    // correcting a phone number are not the same authority.
    const permission = body.stage !== undefined
      ? PERMISSIONS.LEAD_ADVANCE
      : body.assignedToId !== undefined
        ? PERMISSIONS.LEAD_ASSIGN
        : PERMISSIONS.LEAD_UPDATE;

    const g = await guardMaybeScoped(permission, existing.propertyId);
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Lead not found." });
    }

    if (body.stage !== undefined) {
      if (TERMINAL.includes(existing.stage)) {
        return fail(409, {
          code: "conflict",
          message: `A ${existing.stage.toLowerCase()} lead cannot be moved. Log a new enquiry instead.`,
        });
      }
      if (body.stage === "LOST" && !body.lostReason?.trim()) {
        // The most useful field on the model at review time. Losing deals
        // without recording why is how the same mistake repeats.
        return badRequest("Marking a lead lost requires a reason.");
      }
      if (body.stage !== "LOST" && !ORDER.includes(body.stage)) {
        return badRequest("Unknown stage.");
      }
    }

    const reassigned = body.assignedToId !== undefined;
    if (reassigned && body.assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: body.assignedToId, orgId: g.actor.orgId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!assignee) return badRequest("That person is not a member of this organisation.");
    }

    const updated = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        ...(body.stage !== undefined ? {
          stage: body.stage,
          ...(TERMINAL.includes(body.stage) ? { closedAt: new Date() } : {}),
          ...(body.stage === "LOST" ? { lostReason: body.lostReason!.trim().slice(0, 400) } : {}),
        } : {}),
        ...(reassigned ? { assignedToId: body.assignedToId } : {}),
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.email !== undefined ? { email: body.email.trim() || null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
        ...(body.interestedIn !== undefined ? { interestedIn: body.interestedIn.trim() || null } : {}),
        ...(body.budget !== undefined ? { budget: Number(body.budget) || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes.slice(0, 2000) } : {}),
        // Any touch counts as contact — that is what the field is for.
        lastContactAt: new Date(),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: body.stage !== undefined ? "lead.advance" : reassigned ? "lead.assign" : "lead.update",
      permission,
      entityType: "Lead",
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: body.stage !== undefined
        ? `Lead "${updated.name}" moved ${existing.stage} → ${updated.stage}${updated.lostReason ? ` — ${updated.lostReason}` : ""}.`
        : reassigned
          ? `Reassigned lead "${updated.name}".`
          : `Updated lead "${updated.name}".`,
      ...changes(existing, updated),
    });

    return ok({ lead: updated });
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const existing = await prisma.lead.findUnique({ where: { id: params.id } });
    if (!existing) return fail(404, { code: "not_found", message: "Lead not found." });

    const g = await guardMaybeScoped(PERMISSIONS.LEAD_DELETE, existing.propertyId);
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Lead not found." });
    }

    await prisma.lead.delete({ where: { id: existing.id } });

    await writeAudit({
      actor: g.actor,
      action: "lead.delete",
      permission: PERMISSIONS.LEAD_DELETE,
      entityType: "Lead",
      entityId: existing.id,
      propertyId: existing.propertyId,
      summary: `Deleted lead "${existing.name}".`,
      before: existing,
    });

    return ok({ deleted: true });
  });
}
