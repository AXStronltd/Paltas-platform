import { NextResponse } from "next/server";
import { prisma } from "./db";
import { resolveScope } from "./scope";
import { badRequest, fail } from "./http";
import { buildScopeChain, decide } from "@/lib/security/authorize";
import { isKnownPermission } from "@/lib/security/permissions";
import type { Actor, ScopeType } from "@/lib/security/types";

/**
 * Helpers shared by the staff endpoints.
 *
 * The escalation check below is the load-bearing one: without it, `staff.create`
 * on its own would be a path to full access — create an account, grant it
 * everything, sign in as it. Held here rather than in a route file so both
 * creation and permission editing are held to exactly the same rule.
 */

export interface ScopeRef {
  scopeType: ScopeType;
  scopeId: string;
}

/** Turn a scope reference into the shape `guard()` and `resolveScope()` expect. */
export function scopeInput(scope: ScopeRef) {
  return {
    propertyId: scope.scopeType === "PROPERTY" ? scope.scopeId : null,
    buildingId: scope.scopeType === "BUILDING" ? scope.scopeId : null,
    unitId: scope.scopeType === "UNIT" ? scope.scopeId : null,
  };
}

export function dedupeScopes<T extends ScopeRef>(scopes: T[]): T[] {
  const seen = new Set<string>();
  return scopes.filter((s) => {
    const key = `${s.scopeType}:${s.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Refuse to hand out authority the granter does not have.
 *
 * Checked permission by permission, at the exact scope it would be granted at.
 * Role keys are expanded to the permissions they carry, so assigning a role is
 * held to the same standard as ticking its permissions one by one. Ancestors are
 * resolved from the database rather than assumed, so a granter holding a
 * property-wide permission may still grant it on one building inside it.
 */
export async function checkNoEscalation(
  orgId: string,
  actor: Actor,
  roles: (ScopeRef & { key: string })[],
  permissions: (ScopeRef & { permission: string; effect?: "ALLOW" | "DENY" })[],
): Promise<NextResponse | null> {
  if (actor.isOwner) return null;

  const roleRows = await prisma.role.findMany({
    where: { key: { in: roles.map((r) => r.key) }, OR: [{ orgId }, { orgId: null }] },
    include: { permissions: true },
  });

  const wanted: (ScopeRef & { permission: string })[] = [];
  for (const r of roles) {
    const row = roleRows.find((x) => x.key === r.key);
    if (!row) continue;
    for (const p of row.permissions) {
      wanted.push({ permission: p.permission, scopeType: r.scopeType, scopeId: r.scopeId });
    }
  }
  // A DENY takes access away and cannot escalate, so only ALLOWs are checked.
  for (const p of permissions) {
    if ((p.effect ?? "ALLOW") === "ALLOW") wanted.push(p);
  }

  const chains = new Map<string, Awaited<ReturnType<typeof resolveScope>>>();
  for (const w of wanted) {
    if (!isKnownPermission(w.permission) && !w.permission.includes("*")) {
      return badRequest(`Unknown permission "${w.permission}".`);
    }
    const key = `${w.scopeType}:${w.scopeId}`;
    if (!chains.has(key)) chains.set(key, await resolveScope(orgId, scopeInput(w)));
    const chain = chains.get(key)?.chain ?? buildScopeChain({ orgId });
    if (!decide(actor, w.permission, chain).allowed) {
      return fail(403, {
        code: "escalation_refused",
        message: `You cannot grant "${w.permission}" because you do not hold it here yourself.`,
        permission: w.permission,
      });
    }
  }
  return null;
}

export interface StaffTarget {
  orgId: string;
  roleAssignments: { scopeType: ScopeType; scopeId: string }[];
  grants: { scopeType: ScopeType; scopeId: string }[];
}

/**
 * The scope an action against this user is authorised at: the narrowest place
 * they are attached to, falling back to the organisation for the owner and for
 * anyone not yet assigned anywhere.
 */
export function primaryScope(target: StaffTarget): ScopeRef {
  const assignment = target.roleAssignments[0] ?? target.grants[0];
  if (!assignment) return { scopeType: "ORGANIZATION", scopeId: target.orgId };
  return { scopeType: assignment.scopeType, scopeId: assignment.scopeId };
}
