import { prisma } from "@/server/db";
import { composeModules } from "@/lib/security/modules";

/**
 * Which modules an organisation may use.
 *
 * Composed from two sources, in this order: the plan its subscription names,
 * then any deliberate exception recorded against the organisation. Exceptions
 * are stored only where they differ from the plan — a copy of every plan module
 * per organisation would be the same fact written twice, and on the day the two
 * disagree there is no way to tell which one is true.
 */

export async function entitledModulesFor(orgId: string): Promise<string[]> {
  const [subscription, exceptions] = await Promise.all([
    prisma.subscription.findUnique({
      where: { orgId },
      select: { status: true, plan: { select: { modules: true } } },
    }),
    prisma.entitlement.findMany({
      where: { orgId },
      select: { module: true, granted: true, expiresAt: true },
    }),
  ]);

  return composeModules(
    subscription ? { status: subscription.status, modules: subscription.plan.modules } : null,
    exceptions,
  );
}

/** Put an organisation on a plan. Safe to call twice. */
export async function ensureSubscription(orgId: string, planKey = "enterprise"): Promise<void> {
  try {
    const plan = await prisma.plan.findUnique({ where: { key: planKey }, select: { id: true } });
    if (!plan) return;
    await prisma.subscription.upsert({
      where: { orgId },
      update: {},
      create: { orgId, planId: plan.id },
    });
  } catch {
    // Never the reason a signup fails. An organisation without a subscription
    // still works — entitledModulesFor treats it as unrestricted — and the
    // sweep records it properly at the next boot.
  }
}

/**
 * Give every organisation the subscription the migration would have given it.
 *
 * The same lesson Membership taught: a migration backfills what exists when it
 * runs, and everything created afterwards is on its own. Four routes create
 * organisations. This makes the gap self-closing rather than trusting all four,
 * and once the table is in step it is one indexed anti-join returning nothing.
 */
export async function syncSubscriptions(): Promise<number> {
  return prisma.$executeRawUnsafe(`
    INSERT INTO "Subscription" ("id", "orgId", "planId", "status", "createdAt", "updatedAt")
    SELECT 'sub_' || "o"."id", "o"."id", 'plan_enterprise', 'ACTIVE', NOW(), NOW()
    FROM "Organization" AS "o"
    WHERE NOT EXISTS (
      SELECT 1 FROM "Subscription" AS "s" WHERE "s"."orgId" = "o"."id"
    )
    ON CONFLICT ("orgId") DO NOTHING
  `);
}
