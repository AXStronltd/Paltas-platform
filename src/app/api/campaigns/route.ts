import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { CampaignStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Seasonal campaigns — a scheduled bundle of discounts with public copy. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const status = new URL(req.url).searchParams.get("status") as CampaignStatus | null;

    const g = await guardList(PERMISSIONS.CAMPAIGN_VIEW);
    if (!g.ok) return g.response;

    const campaigns = await prisma.campaign.findMany({
      where: {
        OR: [whereByProperty(g.access), { orgId: g.actor.orgId, propertyId: null }],
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
      include: {
        property: { select: { id: true, name: true } },
        discounts: { select: { id: true, name: true, kind: true, valueType: true, value: true, currency: true } },
      },
      take: 100,
    });

    return ok({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        bannerText: c.bannerText,
        status: c.status,
        propertyId: c.propertyId,
        propertyName: c.property?.name ?? null,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        publishedAt: c.publishedAt,
        discounts: c.discounts,
      })),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; name?: string; description?: string;
      bannerText?: string; startsAt?: string; endsAt?: string;
    }>(req);
    if (!body?.name?.trim()) return badRequest("name is required.");

    const g = await guard(PERMISSIONS.CAMPAIGN_CREATE, { propertyId: body.propertyId ?? null });
    if (!g.ok) return g.response;

    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(Date.now() + 60 * 86400000);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return badRequest("Invalid dates.");
    if (endsAt <= startsAt) return badRequest("endsAt must be after startsAt.");

    const campaign = await prisma.campaign.create({
      data: {
        orgId: g.scope.propertyId ? g.scope.orgId : g.actor.orgId,
        propertyId: body.propertyId ?? null,
        name: body.name.trim(),
        description: body.description?.trim(),
        bannerText: body.bannerText?.trim(),
        startsAt,
        endsAt,
        createdById: g.actor.id,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "campaign.create",
      permission: PERMISSIONS.CAMPAIGN_CREATE,
      entityType: "Campaign",
      entityId: campaign.id,
      propertyId: campaign.propertyId,
      summary: `Drafted campaign "${campaign.name}"`,
      after: { name: campaign.name, startsAt, endsAt, status: campaign.status },
    });

    return ok({ campaign }, 201);
  });
}
