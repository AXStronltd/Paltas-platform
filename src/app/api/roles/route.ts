import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok, unauthorized } from "@/server/http";
import { currentActor } from "@/server/actor";
import { canAnywhere } from "@/lib/security/authorize";
import { PERMISSIONS } from "@/lib/security/permissions";
import { fail } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Role definitions, for the permission editor.
 *
 * Roles are organisation-wide rather than property-scoped — it is the assignment
 * that carries a scope — so this is one of the few reads with no property filter.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();

    if (!canAnywhere(actor, PERMISSIONS.ROLE_VIEW) && !canAnywhere(actor, PERMISSIONS.STAFF_VIEW)) {
      return fail(403, { code: "forbidden", message: "You do not have permission to view roles.", permission: PERMISSIONS.ROLE_VIEW });
    }

    const roles = await prisma.role.findMany({
      where: { OR: [{ orgId: actor.orgId }, { orgId: null }] },
      include: { permissions: { select: { permission: true } } },
      orderBy: { name: "asc" },
    });

    return ok({
      roles: roles.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissions: r.permissions.map((p) => p.permission),
      })),
    });
  });
}
