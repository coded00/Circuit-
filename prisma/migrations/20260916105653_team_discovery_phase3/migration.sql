-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "game" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "TeamMembership" ADD COLUMN     "requestedByMember" BOOLEAN NOT NULL DEFAULT false;
