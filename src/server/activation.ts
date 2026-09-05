import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/server/db";

/**
 * Turning an applicant into somebody who can work.
 *
 * One function, because there are now two ways to reach this state — a person
 * approving from the queue, and an account activating itself on completing
 * onboarding — and two copies of "create the role, assign it, flip the status"
 * would drift the moment either changed. What differs between the callers is
 * who decided and what is written in the audit trail, not what happens here.
 *
 * The role is scoped to the account's own organisation, which is the whole of
 * the safety. It is a workspace holding that person's properties and nobody
 * else's: the authorization engine resolves every request against the
 * organisation the record belongs to, so an activated account gains a dashboard
 * over its own data and no reach at all into another tenant's.
 */
const SYSTEM_ROLES = JSON.parse(
  readFileSync(join(process.cwd(), "src/lib/security/system-roles.json"), "utf8"),
) as { key: string; name: string; description?: string; permissions: string[] }[];

/** What each self-declared role is actually granted. */
export const ROLE_FOR: Record<string, string> = {
  landlord: "property_manager",
  agent: "property_manager",
  hotel: "property_manager",
  developer: "property_manager",
  seller: "property_manager",
  /** A tenant is not a manager of the building they live in. */
  resident: "resident",
};

export function roleDefinition(key: string) {
  return SYSTEM_ROLES.find((r) => r.key === key) ?? null;
}

/**
 * Activate an account and give it the role its declaration implies.
 *
 * Idempotent on status: an account already ACTIVE is left alone rather than
 * given a second role, so a resubmitted form cannot accumulate grants.
 */
export async function activateAccount(input: {
  userId: string;
  orgId: string;
  roleKey: string;
  isOwner: boolean;
  /** The approver, when a person decided. Null when the account activated itself. */
  approvedById?: string | null;
}): Promise<{ ok: false; reason: string } | { ok: true; role: string }> {
  const definition = roleDefinition(input.roleKey);
  if (!definition) return { ok: false, reason: `Unknown role "${input.roleKey}".` };

  const current = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { status: true },
  });
  if (!current) return { ok: false, reason: "Account not found." };
  if (current.status === "ACTIVE") return { ok: true, role: input.roleKey };
  if (current.status !== "PENDING") {
    return { ok: false, reason: `Account is ${current.status.toLowerCase()}.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: input.orgId }, data: { approved: true } });

    const role = await tx.role.create({
      data: {
        orgId: input.orgId,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
        permissions: { create: definition.permissions.map((permission) => ({ permission })) },
      },
      select: { id: true },
    });

    await tx.roleAssignment.create({
      data: {
        userId: input.userId,
        roleId: role.id,
        // Their whole organisation, and only theirs.
        scopeType: "ORGANIZATION",
        scopeId: input.orgId,
        grantedById: input.approvedById ?? input.userId,
      },
    });

    await tx.user.update({
      where: { id: input.userId },
      data: {
        status: "ACTIVE",
        isOwner: input.isOwner,
        approvedById: input.approvedById ?? null,
        approvedAt: new Date(),
      },
    });
  });

  return { ok: true, role: definition.key };
}
