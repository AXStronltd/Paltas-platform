import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guardList, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { ViewingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** The viewing diary. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as ViewingStatus | null;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const g = await guardList(PERMISSIONS.VIEWING_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const viewings = await prisma.viewing.findMany({
      where: {
        ...(g.access.kind === "platform" ? {} : { orgId: g.actor.orgId }),
        OR: [scoped, { propertyId: null }],
        ...(status ? { status } : {}),
        ...(from ? { scheduledAt: { gte: new Date(from) } } : {}),
        ...(to ? { scheduledAt: { lte: new Date(to) } } : {}),
      },
      orderBy: { scheduledAt: "asc" },
      take: 300,
      include: {
        lead: { select: { id: true, name: true, stage: true } },
        property: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true } },
      },
    });

    return ok({ viewings, upcoming: viewings.filter((v) => v.status === "SCHEDULED" && v.scheduledAt > new Date()).length });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      leadId?: string; clientName?: string; scheduledAt?: string; durationMins?: number;
      propertyId?: string; unitId?: string; listingId?: string; notes?: string;
    }>(req);
    if (!body?.scheduledAt) return badRequest("A viewing needs a date and time.");

    const when = new Date(body.scheduledAt);
    if (Number.isNaN(when.getTime())) return badRequest("That date is not valid.");

    const g = await guardMaybeScoped(PERMISSIONS.VIEWING_SCHEDULE, body.propertyId);
    if (!g.ok) return g.response;

    // The client's name is denormalised so a viewing still reads sensibly after
    // its lead is deleted. Taken from the lead when one is given.
    let clientName = body.clientName?.trim();
    if (body.leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: body.leadId, orgId: g.actor.orgId },
        select: { id: true, name: true },
      });
      if (!lead) return badRequest("That lead does not belong to this organisation.");
      clientName = clientName || lead.name;
    }
    if (!clientName) return badRequest("A viewing needs a client name or a lead.");

    const created = await prisma.viewing.create({
      data: {
        orgId: g.actor.orgId,
        leadId: body.leadId ?? null,
        clientName,
        scheduledAt: when,
        durationMins: Math.max(5, Math.min(480, Number(body.durationMins) || 30)),
        propertyId: body.propertyId ?? null,
        unitId: body.unitId ?? null,
        listingId: body.listingId ?? null,
        notes: body.notes?.slice(0, 1000) || null,
        agentId: g.actor.id,
        createdById: g.actor.id,
      },
    });

    // Booking a viewing is itself evidence the lead has progressed, so the
    // stage follows rather than waiting to be set by hand and forgotten.
    if (body.leadId) {
      await prisma.lead.updateMany({
        where: { id: body.leadId, stage: { in: ["NEW", "CONTACTED"] } },
        data: { stage: "VIEWING", lastContactAt: new Date() },
      });
    }

    await writeAudit({
      actor: g.actor,
      action: "viewing.schedule",
      permission: PERMISSIONS.VIEWING_SCHEDULE,
      entityType: "Viewing",
      entityId: created.id,
      propertyId: created.propertyId,
      summary: `Booked a viewing for ${created.clientName} on ${when.toISOString().slice(0, 16).replace("T", " ")}.`,
      after: created,
    });

    return ok({ viewing: created }, 201);
  });
}
