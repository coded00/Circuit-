-- DropForeignKey
ALTER TABLE "Community" DROP CONSTRAINT "Community_tournamentId_fkey";

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "isGlobal" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "tournamentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
