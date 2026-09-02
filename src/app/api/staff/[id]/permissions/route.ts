import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, fail, guard, handle, notFound, ok, readJson } from "@/server/http";
import { resolveScope } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { loadActor } from "@/server/actor";
import { decide } from "@/lib/security/authorize";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/security/permissions";
import type { ScopeType } from "@/lib/security/types";
import { checkNoEscalation, dedupeScopes, primaryScope, scopeInput } from "@/server/staffScopes";

export const dynamic = "force-dynamic";

/**
 * What this staff member can actually do, permission by permission, at a given
 * property — resolved through the same engine the API enforces with, so the
 * editor shows the truth rather than a second opinion about it.
 *
 * `via` explains each answer: which role granted it, or that it was set by hand.
 */
export async function GET(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const propertyId = new URL(req.url).searchParams.get("propertyId");

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      include: { roleAssignments: { include: { role: true } }, grants: true },
    });
    if (!target) return notFound("Staff member not found.");

    const g = await guard(PERMISSIONS.STAFF_VIEW, scopeInput(primaryScope(target)));
    if (!g.ok) return g.response;
    if (target.orgId !== g.actor.orgId) return notFound("Staff member not found.");

    const targetActor = await loadActor(target.id);
    if (!targetActor) return notFound("Staff member not found.");

    const scope = await resolveScope(target.orgId, { propertyId });
    if (!scope) return badRequest("Unknown property.");

    return ok({
      staffId: target.id,
      name: target.name,
      isOwner: target.isOwner,
      propertyId: scope.propertyId,
      permissions: ALL_PERMISSIONS.map((permission) => {
        const d = decide(targetActor, permission, scope.chain);
        return {
          permission,
          allowed: d.allowed,
          via: d.matched?.source ?? null,
          roleName: d.matched?.roleName ?? null,
          reason: d.reason,
        };
      }),
    });
  });
}

interface PutBody {
  roles?: { key: string; scopeType: ScopeType; scopeId: string }[];
  permissions?: { permission: string; effect?: "ALLOW" | "DENY"; scopeType: ScopeType; scopeId: string; note?: string }[];
}

/**
 * Replace a staff member's roles and individual permissions.
 *
 * This is the endpoint behind "select individual permissions for John". It is a
 * whole-set replacement rather than a series of toggles, so the state the owner
 * sees on screen is the state that gets saved — no drift from a lost request.
 *
 * The escalation rule from staff creation applies unchanged: an administrator
 * cannot hand out authority they do not hold at that scope themselves.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<PutBody>(req);
    if (!body) return badRequest("A body is required.");
    const roles = body.roles ?? [];
    const permissions = body.permissions ?? [];

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      include: { roleAssignments: { include: { role: true } }, grants: true },
    });
    if (!target) return notFound("Staff member not found.");

    const g = await guard(PERMISSIONS.STAFF_PERMISSIONS_MANAGE, scopeInput(primaryScope(target)));
    if (!g.ok) return g.response;
    if (target.orgId !== g.actor.orgId) return notFound("Staff member not found.");

    if (target.isOwner) {
      return fail(403, {
        code: "owner_protected",
        message: "The property owner's permissions cannot be changed.",
      });
    }
    // Editing your own permissions is how a limited administrator would quietly
    // become an unlimited one.
    if (target.id === g.actor.id) {
      return conflict("You cannot change your own permissions.");
    }

    // Authorise at every scope being written to, not just the one they sit at now.
    for (const scope of dedupeScopes([...roles, ...permissions].map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId })))) {
      const sg = await guard(PERMISSIONS.STAFF_PERMISSIONS_MANAGE, scopeInput(scope));
      if (!sg.ok) return sg.response;
    }

    const escalation = await checkNoEscalation(g.actor.orgId, g.actor, roles, permissions);
    if (escalation) return escalation;

    const roleRows = await prisma.role.findMany({
      where: { key: { in: roles.map((r) => r.key) }, OR: [{ orgId: g.actor.orgId }, { orgId: null }] },
      select: { id: true, key: true, name: true },
    });
    const unknown = roles.filter((r) => !roleRows.some((row) => row.key === r.key));
    if (unknown.length) return badRequest(`Unknown role: ${unknown.map((u) => u.key).join(", ")}`);

    const before = {
      roles: target.roleAssignments.map((a) => `${a.role.key}@${a.scopeType.toLowerCase()}:${a.scopeId}`).sort(),
      permissions: target.grants.map((gr) => `${gr.effect} ${gr.permission}@${gr.scopeType.toLowerCase()}:${gr.scopeId}`).sort(),
    };

    await prisma.$transaction(async (tx) => {
      await tx.roleAssignment.deleteMany({ where: { userId: target.id } });
      await tx.permissionGrant.deleteMany({ where: { userId: target.id } });

      for (const r of roles) {
        const row = roleRows.find((x) => x.key === r.key)!;
        await tx.roleAssignment.create({
          data: { userId: target.id, roleId: row.id, scopeType: r.scopeType, scopeId: r.scopeId, grantedById: g.actor.id },
        });
      }
      for (const p of permissions) {
        await tx.permissionGrant.create({
          data: {
            userId: target.id,
            permission: p.permission,
            effect: p.effect ?? "ALLOW",
            scopeType: p.scopeType,
            scopeId: p.scopeId,
            grantedById: g.actor.id,
            note: p.note,
          },
        });
      }
    });

    const after = {
      roles: roles.map((r) => `${r.key}@${r.scopeType.toLowerCase()}:${r.scopeId}`).sort(),
      permissions: permissions.map((p) => `${p.effect ?? "ALLOW"} ${p.permission}@${p.scopeType.toLowerCase()}:${p.scopeId}`).sort(),
    };

    await writeAudit({
      actor: g.actor,
      action: "staff.permissions.manage",
      permission: PERMISSIONS.STAFF_PERMISSIONS_MANAGE,
      entityType: "User",
      entityId: target.id,
      propertyId: dedupeScopes([...roles, ...permissions].map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId })))
        .find((s) => s.scopeType === "PROPERTY")?.scopeId ?? null,
      summary: `Changed ${target.name}'s access — ${summarise(before, after)}`,
      before,
      after,
    });

    return ok({ updated: true, roles: after.roles, permissions: after.permissions });
  });
}

/** A one-line description of what moved, for the audit summary. */
function summarise(before: { roles: string[]; permissions: string[] }, after: { roles: string[]; permissions: string[] }): string {
  const added = [...after.roles, ...after.permissions].filter((x) => ![...before.roles, ...before.permissions].includes(x));
  const removed = [...before.roles, ...before.permissions].filter((x) => ![...after.roles, ...after.permissions].includes(x));
  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} added`);
  if (removed.length) parts.push(`${removed.length} removed`);
  return parts.length ? parts.join(", ") : "no effective change";
}
