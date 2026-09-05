import { prisma } from "@/server/db";

/**
 * Which organisations a person may act inside.
 *
 * One place, because `User.orgId` and `Membership` have to agree and there are
 * six routes that create a user — signup, Supabase provisioning, the Google
 * exchange, staff invitations, guard creation and the seed. Six copies of
 * "and also record the membership" is five chances to forget, and forgetting is
 * invisible: the account works perfectly until the day it needs a second
 * workspace and has none.
 *
 * Membership deliberately carries no role. RoleAssignment already grants roles
 * scoped to an ORGANIZATION; this answers only "may they be here at all".
 */

/** Record that a person belongs to an organisation. Safe to call twice. */
export async function ensureMembership(
  userId: string,
  orgId: string,
  { isDefault = false }: { isDefault?: boolean } = {},
): Promise<void> {
  try {
    await prisma.membership.upsert({
      where: { userId_orgId: { userId, orgId } },
      // An existing membership is not downgraded by a later call that happens
      // not to be the default one.
      update: isDefault ? { isDefault: true } : {},
      create: { userId, orgId, isDefault },
    });
  } catch {
    // Never the reason an account fails to be created. The boot sweep below
    // repairs anything that slips through, and the account still works from
    // User.orgId in the meantime.
  }
}

/**
 * Give every account the membership its own orgId already implies.
 *
 * The migration backfilled the rows that existed when it ran, which is all a
 * migration can do — the seed then created eleven more users and none of them
 * had one. That is the shape of the problem: a one-time backfill cannot keep up
 * with a running system, and the gap is silent.
 *
 * So this runs at boot, costs one indexed anti-join once the table is in step,
 * and makes the drift impossible to accumulate rather than merely unlikely.
 */
export async function syncMemberships(): Promise<number> {
  const result = await prisma.$executeRawUnsafe(`
    INSERT INTO "Membership" ("id", "userId", "orgId", "isDefault", "createdAt")
    SELECT 'mbr_' || "u"."id", "u"."id", "u"."orgId", true, NOW()
    FROM "User" AS "u"
    WHERE NOT EXISTS (
      SELECT 1 FROM "Membership" AS "m"
      WHERE "m"."userId" = "u"."id" AND "m"."orgId" = "u"."orgId"
    )
    ON CONFLICT ("userId", "orgId") DO NOTHING
  `);
  return result;
}

/** The organisations this person belongs to, default first. */
export async function membershipsOf(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      orgId: true,
      isDefault: true,
      org: { select: { id: true, name: true, isPlatform: true } },
    },
  });
}
