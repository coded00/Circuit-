-- AlterEnum
ALTER TYPE "EscrowType" ADD VALUE 'PLATFORM_FEE';

-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "platformFeeBps" INTEGER NOT NULL DEFAULT 500;
