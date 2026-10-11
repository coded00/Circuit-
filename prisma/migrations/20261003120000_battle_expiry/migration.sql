-- AlterEnum
ALTER TYPE "BattleStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Battle" ADD COLUMN     "expiresAt" TIMESTAMP(3);
