import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guardList, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { LeadStage } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * The sales pipeline.
 *
 * One model serves agents and developers alike: an agent chasing a buyer for a
 * resale and a developer chasing one for an off-plan unit are the same object
 * pointed at a different target. Scoped by property like everything else, so a
 * scoped agent sees their own pipeline without any new authorisation machinery.
 *
 * A lead with no property yet — someone still only browsing — is visible to
 * anyone in the organisation who may read leads at all. There is nothing to
 * scope it by, and the alternative is enquiries that nobody can see.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const stage = url.searchParams.get("stage") as LeadStage | null;
    const mine = url.searchParams.get("mine") === "true";

    const g = await guardList(PERMISSIONS.LEAD_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const leads = await prisma.lead.findMany({
      where: {
        ...(g.access.kind === "platform" ? {} : { orgId: g.actor.orgId }),
        OR: [scoped, { propertyId: null }],
        ...(stage ? { stage } : {}),
        ...(mine ? { assignedToId: g.actor.id } : {}),
      },
      orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
      take: 300,
      include: {
        property: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { viewings: true } },
      },
    });

    const byStage = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.stage] = (acc[l.stage] ?? 0) + 1;
      return acc;
    }, {});

    return ok({
      leads,
      byStage,
      // Open pipeline value: what is still in play. Closed and lost are excluded
      // — counting them would flatter every forecast on the platform.
      pipelineValue: leads
        .filter((l) => l.stage !== "CLOSED" && l.stage !== "LOST")
        .reduce((t, l) => t + (l.budget ?? 0), 0),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      name?: string; email?: string; phone?: string; interestedIn?: string;
      budget?: number; currency?: string; propertyId?: string; unitId?: string;
      listingId?: string; projectId?: string; source?: string; notes?: string;
    }>(req);
    if (!body?.name?.trim()) return badRequest("A lead needs a name.");
    // Without one of these the lead cannot be followed up, which makes it a
    // record of nothing.
    if (!body.email?.trim() && !body.phone?.trim()) {
      return badRequest("A lead needs an email address or a phone number.");
    }

    // A lead with no property yet is authorised by holding lead.create
    // anywhere — see guardMaybeScoped.
    const g = await guardMaybeScoped(PERMISSIONS.LEAD_CREATE, body.propertyId);
    if (!g.ok) return g.response;

    const budget = body.budget === undefined ? null : Number(body.budget);
    if (budget !== null && (!Number.isInteger(budget) || budget < 0)) {
      return badRequest("A budget must be a whole number of minor units.");
    }

    const created = await prisma.lead.create({
      data: {
        orgId: g.actor.orgId,
        name: body.name.trim(),
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        interestedIn: body.interestedIn?.trim() || null,
        budget,
        currency: body.currency ?? "KES",
        propertyId: body.propertyId ?? null,
        unitId: body.unitId ?? null,
        listingId: body.listingId ?? null,
        projectId: body.projectId ?? null,
        source: body.source?.trim() || null,
        notes: body.notes?.slice(0, 2000) || null,
        // Whoever logs it owns it until someone reassigns it. An unassigned
        // lead is one nobody is chasing.
        assignedToId: g.actor.id,
        createdById: g.actor.id,
        lastContactAt: new Date(),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "lead.create",
      permission: PERMISSIONS.LEAD_CREATE,
      entityType: "Lead",
      entityId: created.id,
      propertyId: created.propertyId,
      summary: `Logged lead "${created.name}"${created.interestedIn ? ` — ${created.interestedIn}` : ""}.`,
      after: created,
    });

    return ok({ lead: created }, 201);
  });
}
