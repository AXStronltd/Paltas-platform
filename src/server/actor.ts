import { prisma } from "./db";
import { entitledModulesFor } from "./entitlements";
import { currentUserId } from "./session";
import type { Actor, Grant } from "@/lib/security/types";

/**
 * Load the authenticated user together with everything the authorisation engine
 * needs to decide — their roles, the scope each role was assigned at, and their
 * individual permission grants.
 *
 * Roles and direct grants are flattened into one list of `Grant`s here so the
 * engine only ever reasons about one shape. Where a role and a direct grant
 * disagree, the engine's deny-wins rule settles it; this function does not
 * pre-resolve conflicts, because doing so would hide why a decision was made.
 */
export async function loadActor(userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: { include: { role: { include: { permissions: true } } } },
      grants: true,
    },
  });
  if (!user) return null;

  const grants: Grant[] = [];

  for (const assignment of user.roleAssignments) {
    for (const rp of assignment.role.permissions) {
      grants.push({
        permission: rp.permission,
        effect: "ALLOW",
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        source: "role",
        roleName: assignment.role.name,
      });
    }
  }

  for (const g of user.grants) {
    grants.push({
      permission: g.permission,
      effect: g.effect,
      scopeType: g.scopeType,
      scopeId: g.scopeId,
      source: "direct",
    });
  }

  return {
    id: user.id,
    orgId: user.orgId,
    name: user.name,
    email: user.email,
    isOwner: user.isOwner,
    isPlatformAdmin: user.isPlatformAdmin,
    status: user.status,
    onboardingCompletedAt: user.onboardingCompletedAt,
    onboardingRole: user.onboardingRole,
    roles: user.roleAssignments.map((a) => ({
      key: a.role.key,
      name: a.role.name,
      scopeType: a.scopeType,
      scopeId: a.scopeId,
    })),
    grants,
    // Loaded here so every authorisation decision in the request already knows
    // what the organisation has bought. One query per request, alongside the
    // grants it sits next to.
    entitledModules: await entitledModulesFor(user.orgId),
  };
}

/** The actor for the current request, or null when signed out. */
export async function currentActor(): Promise<Actor | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  return loadActor(userId);
}
