-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('HELD', 'PAYABLE', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "HostEarning" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "gross" INTEGER NOT NULL,
    "platformFee" INTEGER NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'HELD',
    "checkOut" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "clawedBack" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "stripeTransferId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostEarning_bookingId_key" ON "HostEarning"("bookingId");

-- CreateIndex
CREATE INDEX "HostEarning_orgId_status_idx" ON "HostEarning"("orgId", "status");

-- CreateIndex
CREATE INDEX "HostEarning_status_checkOut_idx" ON "HostEarning"("status", "checkOut");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_stripeTransferId_key" ON "Payout"("stripeTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_idempotencyKey_key" ON "Payout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payout_orgId_createdAt_idx" ON "Payout"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "HostEarning" ADD CONSTRAINT "HostEarning_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostEarning" ADD CONSTRAINT "HostEarning_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostEarning" ADD CONSTRAINT "HostEarning_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
