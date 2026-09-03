import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { accessiblePropertyIds } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * The audit trail.
 *
 * Scoped like everything else, with one wrinkle: entries that name no property —
 * creating a staff account, say — are organisation-level, and only someone whose
 * reach is the whole organisation should see them. Anyone narrower gets the
 * entries for their own properties.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const actorId = url.searchParams.get("actorId");
    const action = url.searchParams.get("action");
    const entityType = url.searchParams.get("entityType");
    const q = url.searchParams.get("q")?.trim();
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : null;
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : null;
    const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 100) || 100);
    const cursor = url.searchParams.get("cursor");

    const g = await guardList(PERMISSIONS.AUDIT_VIEW);
    if (!g.ok) return g.response;

    /*
     * Scoping the trail without losing the entries that have no property.
     *
     * Approving an account, changing a licence, registering an external source
     * — none belong to a property, so filtering on `propertyId IN (...)`
     * dropped every one of them. They were written faithfully and then never
     * shown, which is the worst state an audit trail can be in: it looks
     * complete and is not.
     */
    const scopeWhere =
      g.access.kind === "all" || g.access.kind === "platform"
        ? {}
        : {
            OR: [
              { propertyId: { in: await accessiblePropertyIds(g.access) } },
              // Organisation-level actions describe the organisation itself
              // rather than a property inside it.
              { propertyId: null },
            ],
          };

    const entries = await prisma.auditLog.findMany({
      where: {
        // Platform staff operate across organisations; everyone else stays
        // inside their own.
        ...(g.access.kind === "platform" ? {} : { orgId: g.actor.orgId }),
        ...scopeWhere,
        ...(propertyId ? { propertyId } : {}),
        ...(actorId ? { actorId } : {}),
        ...(action ? { action: { startsWith: action } } : {}),
        ...(entityType ? { entityType } : {}),
        ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" } }, { actorName: { contains: q, mode: "insensitive" } }] } : {}),
        ...(from && !Number.isNaN(from.getTime()) ? { at: { gte: from } } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { at: { lte: to } } : {}),
      },
      orderBy: { at: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;

    return ok({
      entries: page.map((e) => ({
        id: e.id,
        at: e.at,
        actorId: e.actorId,
        actorName: e.actorName,
        actorRole: e.actorRole,
        action: e.action,
        permission: e.permission,
        entityType: e.entityType,
        entityId: e.entityId,
        propertyId: e.propertyId,
        unitId: e.unitId,
        summary: e.summary,
        before: e.before,
        after: e.after,
        ip: e.ip,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  });
}
