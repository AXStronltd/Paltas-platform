-- AlterTable
ALTER TABLE "PropertyListing" ADD COLUMN     "country" TEXT;

-- CreateIndex
CREATE INDEX "PropertyListing_status_country_idx" ON "PropertyListing"("status", "country");

-- CreateIndex
CREATE INDEX "PropertyListing_status_city_idx" ON "PropertyListing"("status", "city");
