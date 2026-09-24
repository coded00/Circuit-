-- AlterEnum
ALTER TYPE "EscrowType" ADD VALUE 'ORGANIZER_REVENUE';

-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'ORGANIZER_REVENUE_CREDIT';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "organizerRevenueSettlementHours" INTEGER NOT NULL DEFAULT 24;
