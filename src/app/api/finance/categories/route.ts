import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { FeeKind, Recurrence } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * The chart of charges.
 *
 * Categories rather than a hard-coded enum, because every estate runs a slightly
 * different book — one bills a borehole levy, another a lift fund, a third a
 * security contribution split by unit size. A finance module that cannot express
 * theirs is one they will keep a spreadsheet alongside.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") as FeeKind | null;
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.FEE_CATEGORY_VIEW);
    if (!g.ok) return g.response;

    const categories = await prisma.feeCategory.findMany({
      where: {
        OR: [whereByProperty(g.access), { orgId: g.actor.orgId, propertyId: null }],
        ...(kind ? { kind } : {}),
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { property: { select: { id: true, name: true } }, _count: { select: { charges: true } } },
    });

    return ok({
      categories: categories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description,
        kind: c.kind,
        defaultAmount: c.defaultAmount,
        currency: c.currency,
        recurrence: c.recurrence,
        taxable: c.taxable,
        active: c.active,
        propertyId: c.propertyId,
        propertyName: c.property?.name ?? null,
        chargeCount: c._count.charges,
      })),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; code?: string; name?: string; description?: string;
      kind?: FeeKind; defaultAmount?: number; recurrence?: Recurrence; taxable?: boolean;
    }>(req);
    if (!body?.name?.trim()) return badRequest("name is required.");

    const g = await guard(PERMISSIONS.FEE_CATEGORY_MANAGE, { propertyId: body.propertyId ?? null });
    if (!g.ok) return g.response;

    const orgId = g.scope.propertyId ? g.scope.orgId : g.actor.orgId;
    // A readable code beats a cuid on a statement line the resident will read.
    const code = (body.code?.trim() || body.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")).slice(0, 24);

    if (await prisma.feeCategory.findFirst({ where: { orgId, code }, select: { id: true } })) {
      return conflict(`A category with the code ${code} already exists.`);
    }
    if (body.defaultAmount !== undefined && body.defaultAmount < 0) {
      return badRequest("defaultAmount cannot be negative.");
    }

    const category = await prisma.feeCategory.create({
      data: {
        orgId,
        propertyId: body.propertyId ?? null,
        code,
        name: body.name.trim(),
        description: body.description?.trim(),
        kind: body.kind ?? "INCOME",
        defaultAmount: body.defaultAmount,
        recurrence: body.recurrence ?? "MONTHLY",
        taxable: body.taxable ?? false,
        createdById: g.actor.id,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "finance.category.create",
      permission: PERMISSIONS.FEE_CATEGORY_MANAGE,
      entityType: "FeeCategory",
      entityId: category.id,
      propertyId: category.propertyId,
      summary: `Added ${category.kind.toLowerCase()} category "${category.name}" (${category.code}), ${category.recurrence.toLowerCase().replace("_", " ")}`,
      after: { code, name: category.name, kind: category.kind, defaultAmount: category.defaultAmount },
    });

    return ok({ category }, 201);
  });
}
