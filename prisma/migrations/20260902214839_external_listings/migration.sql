-- CreateEnum
CREATE TYPE "ExternalLicenceStatus" AS ENUM ('NONE', 'RESEARCH_ONLY', 'LICENSED');

-- CreateTable
CREATE TABLE "ExternalSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "licenceStatus" "ExternalLicenceStatus" NOT NULL DEFAULT 'NONE',
    "licenceRef" TEXT,
    "licensedBy" TEXT,
    "licenceNote" TEXT,
    "licenceExpiry" TIMESTAMP(3),
    "displayRights" BOOLEAN NOT NULL DEFAULT false,
    "imageRights" BOOLEAN NOT NULL DEFAULT false,
    "contactDataRights" BOOLEAN NOT NULL DEFAULT false,
    "territories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attribution" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalListing" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceSite" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'SALE',
    "price" INTEGER,
    "currency" TEXT,
    "priceRaw" TEXT,
    "country" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "areaSqm" DOUBLE PRECISION,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agentName" TEXT,
    "agentPhone" TEXT,
    "agentEmail" TEXT,
    "agencyName" TEXT,
    "raw" JSONB,
    "displayable" BOOLEAN NOT NULL DEFAULT false,
    "displayNote" TEXT,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "suppressedReason" TEXT,
    "suppressedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "goneAt" TIMESTAMP(3),

    CONSTRAINT "ExternalListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSyncRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "displayableCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "triggeredBy" TEXT,

    CONSTRAINT "ExternalSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSource_key_key" ON "ExternalSource"("key");

-- CreateIndex
CREATE INDEX "ExternalListing_displayable_country_idx" ON "ExternalListing"("displayable", "country");

-- CreateIndex
CREATE INDEX "ExternalListing_sourceId_lastSeenAt_idx" ON "ExternalListing"("sourceId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ExternalListing_city_idx" ON "ExternalListing"("city");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalListing_sourceId_externalId_key" ON "ExternalListing"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "ExternalSyncRun_sourceId_startedAt_idx" ON "ExternalSyncRun"("sourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "ExternalListing" ADD CONSTRAINT "ExternalListing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ExternalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSyncRun" ADD CONSTRAINT "ExternalSyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ExternalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
