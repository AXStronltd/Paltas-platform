import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guardList, guardMaybeScoped, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** The unit stock in a development. */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardList(PERMISSIONS.PROJECT_VIEW);
    if (!g.ok) return g.response;

    const project = await prisma.project.findFirst({
      where: {
        id: params.id,
        ...(g.access.kind === "platform" ? {} : { orgId: g.actor.orgId }),
      },
      select: { id: true, name: true, currency: true },
    });
    if (!project) return fail(404, { code: "not_found", message: "Development not found." });

    const units = await prisma.projectUnit.findMany({
      where: { projectId: project.id },
      orderBy: [{ status: "asc" }, { unitNo: "asc" }],
      take: 1000,
    });

    return ok({ project, units });
  });
}

/**
 * Add stock.
 *
 * Accepts a single unit or a batch, because a developer entering 120 apartments
 * one request at a time is not a workflow anyone will use.
 */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      units?: { unitNo: string; type?: string; floor?: number; bedrooms?: number;
                bathrooms?: number; areaSqm?: number; price: number }[];
      unitNo?: string; type?: string; floor?: number; bedrooms?: number;
      bathrooms?: number; areaSqm?: number; price?: number;
    }>(req);
    if (!body) return badRequest("Expected a JSON body.");

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true, name: true, propertyId: true },
    });
    if (!project) return fail(404, { code: "not_found", message: "Development not found." });

    const g = await guardMaybeScoped(PERMISSIONS.PROJECT_UNIT_MANAGE, project.propertyId);
    if (!g.ok) return g.response;
    if (project.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) {
      return fail(404, { code: "not_found", message: "Development not found." });
    }

    const incoming = body.units ?? (body.unitNo
      ? [{ unitNo: body.unitNo, type: body.type, floor: body.floor, bedrooms: body.bedrooms,
           bathrooms: body.bathrooms, areaSqm: body.areaSqm, price: body.price ?? 0 }]
      : []);
    if (incoming.length === 0) return badRequest("No units were given.");
    if (incoming.length > 500) return badRequest("At most 500 units per request.");

    for (const u of incoming) {
      if (!u.unitNo?.trim()) return badRequest("Every unit needs a unit number.");
      // Refused rather than defaulted to zero: a free apartment is a typo, and
      // it should surface here rather than in a sales report.
      if (!Number.isInteger(Number(u.price)) || Number(u.price) <= 0) {
        return badRequest(`Unit ${u.unitNo} needs a price above zero, as a whole number.`);
      }
    }

    const result = await prisma.projectUnit.createMany({
      data: incoming.map((u) => ({
        projectId: project.id,
        unitNo: u.unitNo.trim(),
        type: u.type?.trim() || null,
        floor: u.floor ?? null,
        bedrooms: u.bedrooms ?? null,
        bathrooms: u.bathrooms ?? null,
        areaSqm: u.areaSqm ?? null,
        price: Number(u.price),
      })),
      // A repeated upload should not fail wholesale on one duplicate number.
      skipDuplicates: true,
    });

    await writeAudit({
      actor: g.actor,
      action: "project.unit.create",
      permission: PERMISSIONS.PROJECT_UNIT_MANAGE,
      entityType: "Project",
      entityId: project.id,
      propertyId: project.propertyId,
      summary: `Added ${result.count} unit(s) to "${project.name}"`
        + (result.count < incoming.length ? `; ${incoming.length - result.count} skipped as duplicates.` : "."),
      after: { added: result.count, submitted: incoming.length },
    });

    return ok({ added: result.count, skipped: incoming.length - result.count }, 201);
  });
}
