-- AlterEnum
ALTER TYPE "CommunityKind" ADD VALUE 'OFFICIAL';

-- CreateTable
CREATE TABLE "CommunityTeam" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityTeam_teamId_idx" ON "CommunityTeam"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTeam_communityId_teamId_key" ON "CommunityTeam"("communityId", "teamId");

-- AddForeignKey
ALTER TABLE "CommunityTeam" ADD CONSTRAINT "CommunityTeam_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTeam" ADD CONSTRAINT "CommunityTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

