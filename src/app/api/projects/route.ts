import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guardList, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { ProjectStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Developments.
 *
 * Distinct from Property on purpose: a project is sold off-plan, unit by unit,
 * and may not be built yet, whereas a Property is somewhere people already live
 * and which the security and maintenance modules act on. A project gains a
 * propertyId once it completes, and can then be managed like anything else.
 *
 * Sales figures are computed from the units rather than stored on the project,
 * so the headline number and the unit list cannot disagree.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as ProjectStatus | null;

    const g = await guardList(PERMISSIONS.PROJECT_VIEW);
    if (!g.ok) return g.response;

    const projects = await prisma.project.findMany({
      where: {
        ...(g.access.kind === "platform" ? {} : { orgId: g.actor.orgId }),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        units: { select: { status: true, price: true, agreedPrice: true } },
        _count: { select: { leads: true } },
      },
    });

    return ok({
      projects: projects.map(({ units, ...p }) => {
        const sold = units.filter((u) => u.status === "SOLD");
        const reserved = units.filter((u) => u.status === "RESERVED");
        return {
          ...p,
          totalUnits: units.length,
          sold: sold.length,
          reserved: reserved.length,
          available: units.filter((u) => u.status === "AVAILABLE").length,
          // What was actually agreed, falling back to the asking price only
          // when no figure was recorded. Never the asking price for unsold
          // stock — that would book revenue nobody has received.
          revenue: sold.reduce((t, u) => t + (u.agreedPrice ?? u.price), 0),
          /** Asking value of everything still for sale. */
          remainingValue: units
            .filter((u) => u.status !== "SOLD")
            .reduce((t, u) => t + u.price, 0),
        };
      }),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      name?: string; location?: string; city?: string; country?: string;
      description?: string; currency?: string; status?: ProjectStatus;
      completion?: number; expectedCompletionAt?: string; propertyId?: string;
    }>(req);
    if (!body?.name?.trim()) return badRequest("A development needs a name.");

    const g = await guardMaybeScoped(PERMISSIONS.PROJECT_MANAGE, body.propertyId);
    if (!g.ok) return g.response;

    const completion = Number(body.completion) || 0;
    if (completion < 0 || completion > 100) return badRequest("Completion must be between 0 and 100.");

    const created = await prisma.project.create({
      data: {
        orgId: g.actor.orgId,
        name: body.name.trim(),
        location: body.location?.trim() || null,
        city: body.city?.trim() || null,
        country: body.country ?? "KE",
        description: body.description?.slice(0, 4000) || null,
        currency: body.currency ?? "KES",
        status: body.status ?? "PLANNING",
        completion,
        propertyId: body.propertyId ?? null,
        expectedCompletionAt: body.expectedCompletionAt ? new Date(body.expectedCompletionAt) : null,
        createdById: g.actor.id,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "project.create",
      permission: PERMISSIONS.PROJECT_MANAGE,
      entityType: "Project",
      entityId: created.id,
      propertyId: created.propertyId,
      summary: `Created development "${created.name}".`,
      after: created,
    });

    return ok({ project: created }, 201);
  });
}
