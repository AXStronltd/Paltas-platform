-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing account belongs to the organisation it already
-- points at, and that one is its default.
--
-- Additive and idempotent. Nobody gains reach they did not have — this records
-- the single membership each account has always had, so the day User.orgId
-- stops being the only answer, every existing row already has the right one.
INSERT INTO "Membership" ("id", "userId", "orgId", "isDefault", "createdAt")
SELECT
  'mbr_' || "u"."id",
  "u"."id",
  "u"."orgId",
  true,
  NOW()
FROM "User" AS "u"
ON CONFLICT ("userId", "orgId") DO NOTHING;
