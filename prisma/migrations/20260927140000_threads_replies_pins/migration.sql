-- AlterTable
ALTER TABLE "CommunityReport" ADD COLUMN     "threadId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" TEXT,
ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "threadId" TEXT;

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "starterMessageId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Thread_starterMessageId_key" ON "Thread"("starterMessageId");

-- CreateIndex
CREATE INDEX "Thread_communityId_lastMessageAt_idx" ON "Thread"("communityId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Thread_channelId_lastMessageAt_idx" ON "Thread"("channelId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_channelId_pinnedAt_idx" ON "Message"("channelId", "pinnedAt");

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_starterMessageId_fkey" FOREIGN KEY ("starterMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

