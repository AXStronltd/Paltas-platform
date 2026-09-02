import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, handle, notFound, ok, readJson } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { CampaignStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Edit a campaign, or change its status.
 *
 * Going LIVE is held to `campaign.publish` rather than `campaign.update`: the
 * difference between adjusting a draft and putting prices in front of the public
 * is exactly the kind of thing an owner wants to delegate separately.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      name?: string; description?: string; bannerText?: string;
      status?: CampaignStatus; startsAt?: string; endsAt?: string;
    }>(req);
    if (!body) return badRequest("A body is required.");

    const existing = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!existing) return notFound("Campaign not found.");

    const publishing = body.status === "LIVE" || body.status === "SCHEDULED";
    const permission = publishing ? PERMISSIONS.CAMPAIGN_PUBLISH : PERMISSIONS.CAMPAIGN_UPDATE;

    const g = await guard(permission, { propertyId: existing.propertyId });
    if (!g.ok) return g.response;
    if (existing.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Campaign not found.");

    // A campaign with nothing in it would go live promising nothing.
    if (body.status === "LIVE") {
      const count = await prisma.discount.count({ where: { campaignId: existing.id, active: true } });
      if (count === 0) return badRequest("Add at least one active discount before publishing.");
    }

    const updated = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        name: body.name?.trim() ?? undefined,
        description: body.description?.trim() ?? undefined,
        bannerText: body.bannerText?.trim() ?? undefined,
        status: body.status ?? undefined,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        ...(body.status === "LIVE" && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: publishing ? "campaign.publish" : "campaign.update",
      permission,
      entityType: "Campaign",
      entityId: existing.id,
      propertyId: existing.propertyId,
      summary: body.status
        ? `Campaign "${updated.name}" is now ${updated.status.toLowerCase()}`
        : `Updated campaign "${updated.name}"`,
      ...changes(existing as unknown as Record<string, unknown>, {
        name: updated.name, status: updated.status, bannerText: updated.bannerText,
        startsAt: updated.startsAt, endsAt: updated.endsAt,
      }),
    });

    return ok({ campaign: updated });
  });
}
