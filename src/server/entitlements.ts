import { prisma } from "@/server/db";
import { ALL_MODULES, ALWAYS_ON, type ModuleKey } from "@/lib/security/modules";

/**
 * Which modules an organisation may use.
 *
 * Composed from two sources, in this order: the plan its subscription names,
 * then any deliberate exception recorded against the organisation. Exceptions
 * are stored only where they differ from the plan — a copy of every plan module
 * per organisation would be the same fact written twice, and on the day the two
 * disagree there is no way to tell which one is true.
 */

/** The plan every existing organisation was grandfathered onto. */
const FULL_ACCESS: ModuleKey[] = ALL_MODULES.filter((m) => !ALWAYS_ON.includes(m));

/** Statuses that still buy access. Past-due keeps working; chasing an invoice is not the same as cutting someone off mid-tenancy. */
const PAYING = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);

export async function entitledModulesFor(orgId: string): Promise<string[]> {
  const [subscription, exceptions] = await Promise.all([
    prisma.subscription.findUnique({
      where: { orgId },
      select: { status: true, plan: { select: { modules: true } } },
    }),
    prisma.entitlement.findMany({
      where: { orgId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { module: true, granted: true },
    }),
  ]);

  // No subscription means nobody has decided yet, not that everything is
  // refused. Every organisation was grandfathered by the migration, so this is
  // reached only by one created since — and a new customer seeing an empty
  // product because a row was missed is a worse failure than one seeing too
  // much. The sweep below closes the gap on the next boot either way.
  const base = subscription
    ? PAYING.has(subscription.status)
      ? subscription.plan.modules
      : []
    : FULL_ACCESS;

  const modules = new Set<string>(base);
  for (const e of exceptions) {
    if (e.granted) modules.add(e.module);
    else modules.delete(e.module);
  }
  return [...modules];
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
