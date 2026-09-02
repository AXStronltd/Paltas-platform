import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, fail, guard, handle, notFound, ok, readJson } from "@/server/http";
import { changes, writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { primaryScope, scopeInput } from "@/server/staffScopes";

export const dynamic = "force-dynamic";

/**
 * A single staff member, with the roles and individual permissions that decide
 * what they can reach.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const target = await loadTarget(params.id);
    if (!target) return notFound("Staff member not found.");

    const g = await guard(PERMISSIONS.STAFF_VIEW, scopeInput(primaryScope(target)));
    if (!g.ok) return g.response;
    if (target.orgId !== g.actor.orgId) return notFound("Staff member not found.");

    return ok({ staff: presentTarget(target) });
  });
}

/**
 * Update or suspend an account.
 *
 * The owner is deliberately immovable here: no staff member, however broadly
 * permitted, can rename, suspend or demote them. That is the whole point of
 * `isOwner` being a column rather than a permission.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ name?: string; phone?: string; title?: string; status?: "ACTIVE" | "SUSPENDED" }>(req);
    if (!body) return badRequest("A body is required.");

    const target = await loadTarget(params.id);
    if (!target) return notFound("Staff member not found.");

    const suspending = body.status !== undefined;
    const permission = suspending ? PERMISSIONS.STAFF_SUSPEND : PERMISSIONS.STAFF_UPDATE;

    const g = await guard(permission, scopeInput(primaryScope(target)));
    if (!g.ok) return g.response;
    if (target.orgId !== g.actor.orgId) return notFound("Staff member not found.");

    if (target.isOwner && !g.actor.isOwner) {
      return fail(403, {
        code: "owner_protected",
        message: "The property owner's account cannot be changed by staff.",
      });
    }
    if (target.id === g.actor.id && body.status === "SUSPENDED") {
      return conflict("You cannot suspend your own account.");
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        name: body.name?.trim() ?? undefined,
        phone: body.phone?.trim() ?? undefined,
        title: body.title?.trim() ?? undefined,
        status: body.status ?? undefined,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: suspending ? "staff.suspend" : "staff.update",
      permission,
      entityType: "User",
      entityId: target.id,
      propertyId: primaryScope(target).scopeType === "PROPERTY" ? primaryScope(target).scopeId : null,
      summary: suspending
        ? `${body.status === "SUSPENDED" ? "Suspended" : "Reactivated"} ${target.name}'s account`
        : `Updated ${target.name}'s details`,
      ...changes(target as unknown as Record<string, unknown>, {
        name: updated.name,
        phone: updated.phone,
        title: updated.title,
        status: updated.status,
      }),
    });

    return ok({ staff: { id: updated.id, name: updated.name, status: updated.status } });
  });
}

/** Remove an account. Sessions go with it, so access ends immediately. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const target = await loadTarget(params.id);
    if (!target) return notFound("Staff member not found.");

    const g = await guard(PERMISSIONS.STAFF_DELETE, scopeInput(primaryScope(target)));
    if (!g.ok) return g.response;
    if (target.orgId !== g.actor.orgId) return notFound("Staff member not found.");

    if (target.isOwner) {
      return fail(403, { code: "owner_protected", message: "The property owner's account cannot be removed." });
    }
    if (target.id === g.actor.id) return conflict("You cannot delete your own account.");

    await prisma.user.delete({ where: { id: target.id } });

    await writeAudit({
      actor: g.actor,
      action: "staff.delete",
      permission: PERMISSIONS.STAFF_DELETE,
      entityType: "User",
      entityId: target.id,
      summary: `Deleted staff account for ${target.name} (${target.email})`,
      before: { name: target.name, email: target.email, roles: target.roleAssignments.map((a) => a.role.name) },
      after: null,
    });

    return ok({ deleted: true });
  });
}

/* -------------------------------------------------------------------------- */

async function loadTarget(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      roleAssignments: { include: { role: { select: { key: true, name: true } } } },
      grants: true,
    },
  });
}

type Target = NonNullable<Awaited<ReturnType<typeof loadTarget>>>;

/** The wire shape of one staff member, roles and individual grants included. */
function presentTarget(target: Target) {
  return {
    id: target.id,
    name: target.name,
    email: target.email,
    phone: target.phone,
    title: target.title,
    isOwner: target.isOwner,
    status: target.status,
    createdAt: target.createdAt,
    roles: target.roleAssignments.map((a) => ({
      key: a.role.key,
      name: a.role.name,
      scopeType: a.scopeType,
      scopeId: a.scopeId,
    })),
    customPermissions: target.grants.map((gr) => ({
      permission: gr.permission,
      effect: gr.effect,
      scopeType: gr.scopeType,
      scopeId: gr.scopeId,
      note: gr.note,
    })),
  };
}
