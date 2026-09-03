-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('AIRPORT_TRANSFER', 'CAR_HIRE', 'DRIVER', 'CLEANING', 'LAUNDRY', 'BREAKFAST', 'CHEF', 'TOUR', 'CHILDCARE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServicePricing" AS ENUM ('FLAT', 'PER_NIGHT', 'PER_GUEST', 'PER_GUEST_NIGHT');

-- CreateEnum
CREATE TYPE "AddonStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "addonsTotal" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ServiceOffering" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "propertyId" TEXT,
    "listingId" TEXT,
    "kind" "ServiceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "pricing" "ServicePricing" NOT NULL DEFAULT 'FLAT',
    "noticeHours" INTEGER NOT NULL DEFAULT 0,
    "dailyCapacity" INTEGER,
    "providerName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAddon" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "note" TEXT,
    "status" "AddonStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingAddon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOffering_orgId_active_idx" ON "ServiceOffering"("orgId", "active");

-- CreateIndex
CREATE INDEX "ServiceOffering_propertyId_active_idx" ON "ServiceOffering"("propertyId", "active");

-- CreateIndex
CREATE INDEX "BookingAddon_bookingId_idx" ON "BookingAddon"("bookingId");

-- CreateIndex
CREATE INDEX "BookingAddon_offeringId_status_idx" ON "BookingAddon"("offeringId", "status");

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "PropertyListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAddon" ADD CONSTRAINT "BookingAddon_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAddon" ADD CONSTRAINT "BookingAddon_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
