-- CreateEnum
CREATE TYPE "CommunityCategory" AS ENUM ('GAME', 'LOCATION', 'INTEREST', 'SCHOOL', 'CLUB', 'ORGANISATION', 'CREATOR');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('HARASSMENT', 'HATE', 'SPAM', 'SCAM', 'SEXUAL', 'CHEATING', 'THREATS', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityReportTarget" AS ENUM ('MESSAGE', 'MEMBER', 'COMMUNITY', 'THREAD');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'ESCALATED', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AppealKind" AS ENUM ('COMMUNITY_SUSPENSION', 'ACCOUNT_SUSPENSION');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'UPHELD', 'OVERTURNED');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "slowModeSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "category" "CommunityCategory",
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMute" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedById" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "targetType" "CommunityReportTarget" NOT NULL,
    "messageId" TEXT,
    "messageContent" TEXT,
    "targetUserId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "escalatedAt" TIMESTAMP(3),
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "kind" "AppealKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "communityId" TEXT,
    "message" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMute_communityId_userId_key" ON "CommunityMute"("communityId", "userId");

-- CreateIndex
CREATE INDEX "CommunityReport_communityId_status_idx" ON "CommunityReport"("communityId", "status");

-- CreateIndex
CREATE INDEX "CommunityReport_status_idx" ON "CommunityReport"("status");

-- CreateIndex
CREATE INDEX "Appeal_status_idx" ON "Appeal"("status");

-- CreateIndex
CREATE INDEX "Appeal_userId_idx" ON "Appeal"("userId");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMute" ADD CONSTRAINT "CommunityMute_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMute" ADD CONSTRAINT "CommunityMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: game hubs are GAME communities; Google-created/linked accounts
-- have a Google-verified email.
UPDATE "Community" SET "category" = 'GAME' WHERE "kind" = 'GAME_HUB';
UPDATE "User" u SET "emailVerifiedAt" = u."createdAt"
FROM "AuthIdentity" ai WHERE ai."userId" = u."id" AND ai."provider" = 'google' AND lower(ai."email") = lower(u."email");

-- Circuit Global becomes announcements + introductions (slow mode). Other
-- channels keep their history but become read-only; empty ones are removed.
UPDATE "Channel" ch SET "modOnly" = true
FROM "Community" c WHERE c."id" = ch."communityId" AND c."kind" = 'GLOBAL' AND ch."key" <> 'announcements';
DELETE FROM "Channel" ch USING "Community" c
WHERE c."id" = ch."communityId" AND c."kind" = 'GLOBAL' AND ch."key" NOT IN ('announcements')
  AND NOT EXISTS (SELECT 1 FROM "Message" m WHERE m."channelId" = ch."id");
UPDATE "Channel" ch SET "position" = 0 FROM "Community" c WHERE c."id" = ch."communityId" AND c."kind" = 'GLOBAL' AND ch."key" = 'announcements';
INSERT INTO "Channel" ("id", "communityId", "key", "name", "position", "modOnly", "slowModeSeconds", "createdAt")
SELECT 'ch_intro_' || c."id", c."id", 'introductions', 'introductions', 1, false, 600, CURRENT_TIMESTAMP
FROM "Community" c WHERE c."kind" = 'GLOBAL'
ON CONFLICT DO NOTHING;
