-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "userId" TEXT,
    "orgId" TEXT,
    "listingId" TEXT,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "subject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderGuestId" TEXT,
    "senderUserId" TEXT,
    "readByGuestAt" TIMESTAMP(3),
    "readByUserAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageThread_guestId_lastMessageAt_idx" ON "MessageThread"("guestId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "MessageThread_userId_lastMessageAt_idx" ON "MessageThread"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "MessageThread_official_lastMessageAt_idx" ON "MessageThread"("official", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "PropertyListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
