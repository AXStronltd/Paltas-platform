ALTER TABLE "User" ADD COLUMN "supabaseUserId" TEXT;
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");

ALTER TABLE "Guest" ADD COLUMN "supabaseUserId" TEXT;
CREATE UNIQUE INDEX "Guest_supabaseUserId_key" ON "Guest"("supabaseUserId");