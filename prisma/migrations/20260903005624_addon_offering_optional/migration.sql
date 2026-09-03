-- DropForeignKey
ALTER TABLE "BookingAddon" DROP CONSTRAINT "BookingAddon_offeringId_fkey";

-- AlterTable
ALTER TABLE "BookingAddon" ALTER COLUMN "offeringId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "BookingAddon" ADD CONSTRAINT "BookingAddon_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
