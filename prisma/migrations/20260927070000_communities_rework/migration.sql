-- CreateEnum
CREATE TYPE "CommunityKind" AS ENUM ('GLOBAL', 'TOURNAMENT', 'GAME_HUB', 'PLAYER');

-- CreateEnum
CREATE TYPE "CommunityJoinPolicy" AS ENUM ('OPEN', 'APPLY', 'INVITE');

-- CreateEnum
CREATE TYPE "CommunityRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "CommunityApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "modOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "applicationQuestion" TEXT,
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "gameId" TEXT,
ADD COLUMN     "iconUrl" TEXT,
ADD COLUMN     "joinPolicy" "CommunityJoinPolicy" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "kind" "CommunityKind" NOT NULL DEFAULT 'TOURNAMENT',
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "rules" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "tag" TEXT;

-- AlterTable
ALTER TABLE "CommunityMember" ADD COLUMN     "role" "CommunityRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "hostCommunityId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "featuredCommunityId" TEXT;

-- CreateTable
CREATE TABLE "CommunityInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityApplication" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "status" "CommunityApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityBan" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityInvite_code_key" ON "CommunityInvite"("code");

-- CreateIndex
CREATE INDEX "CommunityInvite_communityId_idx" ON "CommunityInvite"("communityId");

-- CreateIndex
CREATE INDEX "CommunityApplication_communityId_status_idx" ON "CommunityApplication"("communityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityApplication_communityId_userId_key" ON "CommunityApplication"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityBan_communityId_userId_key" ON "CommunityBan"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE INDEX "Community_kind_enabled_idx" ON "Community"("kind", "enabled");

-- CreateIndex
CREATE INDEX "Community_gameId_idx" ON "Community"("gameId");

-- CreateIndex
CREATE INDEX "CommunityMember_userId_idx" ON "CommunityMember"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_featuredCommunityId_fkey" FOREIGN KEY ("featuredCommunityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_hostCommunityId_fkey" FOREIGN KEY ("hostCommunityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityInvite" ADD CONSTRAINT "CommunityInvite_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityInvite" ADD CONSTRAINT "CommunityInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityApplication" ADD CONSTRAINT "CommunityApplication_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityApplication" ADD CONSTRAINT "CommunityApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBan" ADD CONSTRAINT "CommunityBan_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBan" ADD CONSTRAINT "CommunityBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: the platform-wide community becomes kind GLOBAL at /communities/circuit.
UPDATE "Community" SET "kind" = 'GLOBAL', "slug" = 'circuit', "name" = 'Circuit',
  "description" = 'Everyone on Circuit. Say hi, find people to play with, and keep up with what''s happening.'
WHERE "isGlobal" = true;

-- Existing channels keep their fixed order; #announcements becomes moderator-only.
UPDATE "Channel" SET "position" = CASE "key"
  WHEN 'general' THEN 0 WHEN 'announcements' THEN 1 WHEN 'matches' THEN 2 WHEN 'results' THEN 3 ELSE 10 END;
UPDATE "Channel" SET "modOnly" = true WHERE "key" = 'announcements';

-- Seed activity ranking from existing history.
UPDATE "Community" c SET "lastActivityAt" = m.last
FROM (SELECT ch."communityId", MAX(msg."createdAt") AS last FROM "Message" msg JOIN "Channel" ch ON ch."id" = msg."channelId" GROUP BY ch."communityId") m
WHERE m."communityId" = c."id";
