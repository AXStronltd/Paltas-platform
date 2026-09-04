-- CreateTable
CREATE TABLE "SupportUsage" (
    "id" TEXT NOT NULL,
    "callerHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportUsage_windowStart_idx" ON "SupportUsage"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "SupportUsage_callerHash_windowStart_key" ON "SupportUsage"("callerHash", "windowStart");
