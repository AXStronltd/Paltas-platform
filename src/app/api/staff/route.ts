import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { accessiblePropertyIds } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { hashPassword } from "@/server/password";
import { PERMISSIONS } from "@/lib/security/permissions";
import { checkNoEscalation, dedupeScopes, scopeInput } from "@/server/staffScopes";
import type { Actor, ScopeType } from "@/lib/security/types";

export const dynamic = "force-dynamic";

/**
 * The staff directory.
 *
 * Scoped like everything else: an administrator who only manages one property
 * sees the staff attached to that property, not the whole organisation's payroll.
 * The owner is listed but marked, because the owner is not an editable staff row.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardList(PERMISSIONS.STAFF_VIEW);
    if (!g.ok) return g.response;

    const visibleProperties = await accessiblePropertyIds(g.access);

    const users = await prisma.user.findMany({
      where: { orgId: g.actor.orgId },
      include: {
        roleAssignments: { include: { role: { select: { key: true, name: true } } } },
        grants: true,
      },
      orderBy: [{ isOwner: "desc" }, { name: "asc" }],
    });

    const staff = users
      .filter((u) => {
        if (g.access.kind === "all") return true;
        if (u.isOwner) return true; // visible, but never editable by staff
        const scopeIds = [
          ...u.roleAssignments.map((a) => a.scopeId),
          ...u.grants.map((gr) => gr.scopeId),
        ];
        return scopeIds.some((id) => visibleProperties.includes(id));
      })
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        title: u.title,
        isOwner: u.isOwner,
        status: u.status,
        createdAt: u.createdAt,
        roles: u.roleAssignments.map((a) => ({
          key: a.role.key,
          name: a.role.name,
          scopeType: a.scopeType,
          scopeId: a.scopeId,
        })),
        customPermissions: u.grants.map((gr) => ({
          permission: gr.permission,
          effect: gr.effect,
          scopeType: gr.scopeType,
          scopeId: gr.scopeId,
        })),
      }));

    return ok({ staff });
  });
}

interface CreateStaffBody {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  temporaryPassword?: string;
  /** Role keys with the scope each is granted at. */
  roles?: { key: string; scopeType: ScopeType; scopeId: string }[];
  /** Individual permissions, allowed or denied, on top of the roles. */
  permissions?: { permission: string; effect?: "ALLOW" | "DENY"; scopeType: ScopeType; scopeId: string }[];
}

/**
 * Create a staff account.
 *
 * Two rules do the heavy lifting here:
 *
 *  - Nobody can grant what they do not themselves hold at that scope. Without
 *    this, `staff.create` alone would be a route to full access: create a user,
 *    give them everything, sign in as them.
 *  - Only the owner can mint an owner, and this endpoint will not do it at all.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<CreateStaffBody>(req);
    if (!body?.name || !body.email) return badRequest("name and email are required.");
    if (!body.temporaryPassword || body.temporaryPassword.length < 8) {
      return badRequest("A temporary password of at least 8 characters is required.");
    }

    const roles = body.roles ?? [];
    const permissions = body.permissions ?? [];
    if (roles.length === 0 && permissions.length === 0) {
      return badRequest("Assign at least one role or permission — an account with no access is not useful.");
    }

    // Authorise against every scope the new account will touch, so a manager
    // scoped to Property A cannot create staff for Property B.
    const scopes = dedupeScopes([...roles, ...permissions].map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId })));
    let actor: Actor | null = null;
    for (const scope of scopes) {
      const g = await guard(PERMISSIONS.STAFF_CREATE, scopeInput(scope));
      if (!g.ok) return g.response;
      actor = g.actor;

      // Hand-picking permissions is a separate capability from hiring: an office
      // manager may create a Maintenance account without being able to decide
      // that this one also sees the rent roll.
      if (permissions.length > 0) {
        const pg = await guard(PERMISSIONS.STAFF_PERMISSIONS_MANAGE, scopeInput(scope));
        if (!pg.ok) return pg.response;
      }
    }
    if (!actor) return badRequest("At least one role or permission scope is required.");

    const escalation = await checkNoEscalation(actor.orgId, actor, roles, permissions);
    if (escalation) return escalation;

    const email = body.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return conflict("An account with that email already exists.");
    }

    const roleRows = await prisma.role.findMany({
      where: { key: { in: roles.map((r) => r.key) }, OR: [{ orgId: actor.orgId }, { orgId: null }] },
      select: { id: true, key: true, name: true },
    });
    if (roles.length && roleRows.length === 0) return badRequest("None of those roles exist.");
    const missing = roles.filter((r) => !roleRows.some((row) => row.key === r.key));
    if (missing.length) return badRequest(`Unknown role: ${missing.map((m) => m.key).join(", ")}`);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          orgId: actor.orgId,
          email,
          name: body.name!.trim(),
          phone: body.phone?.trim(),
          title: body.title?.trim(),
          passwordHash: await hashPassword(body.temporaryPassword!),
          createdById: actor.id,
        },
      });

      for (const r of roles) {
        const row = roleRows.find((x) => x.key === r.key)!;
        await tx.roleAssignment.create({
          data: { userId: created.id, roleId: row.id, scopeType: r.scopeType, scopeId: r.scopeId, grantedById: actor.id },
        });
      }
      for (const p of permissions) {
        await tx.permissionGrant.create({
          data: {
            userId: created.id,
            permission: p.permission,
            effect: p.effect ?? "ALLOW",
            scopeType: p.scopeType,
            scopeId: p.scopeId,
            grantedById: actor.id,
          },
        });
      }
      return created;
    });

    await writeAudit({
      actor,
      action: "staff.create",
      permission: PERMISSIONS.STAFF_CREATE,
      entityType: "User",
      entityId: user.id,
      propertyId: scopes.find((s) => s.scopeType === "PROPERTY")?.scopeId ?? null,
      summary: `Created staff account for ${user.name} (${roleRows.map((r) => r.name).join(", ") || "custom permissions"})`,
      after: {
        name: user.name,
        email: user.email,
        roles: roles.map((r) => `${r.key}@${r.scopeType.toLowerCase()}`),
        permissions: permissions.map((p) => `${p.effect ?? "ALLOW"} ${p.permission}`),
      },
    });

    return ok({ staff: { id: user.id, name: user.name, email: user.email, status: user.status } }, 201);
  });
}
