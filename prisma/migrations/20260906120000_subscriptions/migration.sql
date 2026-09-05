-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modules" TEXT[],
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_orgId_key" ON "Subscription"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Entitlement_orgId_idx" ON "Entitlement"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_orgId_module_key" ON "Entitlement"("orgId", "module");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The catalogue. Fixed ids so this is the same row on every environment and a
-- later migration can refer to it.
INSERT INTO "Plan" ("id", "key", "name", "modules", "priceCents", "currency", "interval", "active", "createdAt")
VALUES
  ('plan_starter',      'starter',      'Starter',      ARRAY['bookings','marketplace']::TEXT[],                                              0, 'KES', 'month', true, NOW()),
  ('plan_professional', 'professional', 'Professional', ARRAY['bookings','marketplace','finance','maintenance','growth']::TEXT[],              0, 'KES', 'month', true, NOW()),
  ('plan_enterprise',   'enterprise',   'Enterprise',   ARRAY['bookings','marketplace','finance','maintenance','growth','security','projects']::TEXT[], 0, 'KES', 'month', true, NOW())
ON CONFLICT ("key") DO NOTHING;

-- Every organisation that already exists is grandfathered onto the plan that
-- includes everything.
--
-- This is the whole reason the migration is safe to run on a live database: an
-- account that can reach the finance module today can still reach it the second
-- after this deploys. Introducing billing must not be the same event as taking
-- features away from paying customers — those are two decisions, and only the
-- first one is being made here.
INSERT INTO "Subscription" ("id", "orgId", "planId", "status", "createdAt", "updatedAt")
SELECT 'sub_' || "o"."id", "o"."id", 'plan_enterprise', 'ACTIVE', NOW(), NOW()
FROM "Organization" AS "o"
WHERE NOT EXISTS (
  SELECT 1 FROM "Subscription" AS "s" WHERE "s"."orgId" = "o"."id"
)
ON CONFLICT ("orgId") DO NOTHING;
