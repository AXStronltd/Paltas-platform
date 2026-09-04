ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "onboardingRole" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingData" JSONB;

-- Existing approved accounts already have an established role/authority.
UPDATE "User" SET "onboardingCompletedAt" = "createdAt"
WHERE "status" = 'ACTIVE' AND "onboardingCompletedAt" IS NULL;