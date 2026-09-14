-- AlterEnum
ALTER TYPE "BattleVisibility" ADD VALUE 'FRIENDS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EscrowType" ADD VALUE 'STAKE';
ALTER TYPE "EscrowType" ADD VALUE 'STAKE_PAYOUT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletTransactionType" ADD VALUE 'STAKE_DEBIT';
ALTER TYPE "WalletTransactionType" ADD VALUE 'STAKE_PAYOUT_CREDIT';

-- DropForeignKey
ALTER TABLE "EscrowTransaction" DROP CONSTRAINT "EscrowTransaction_tournamentId_fkey";

-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "battleId" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "tournamentId" DROP NOT NULL,
ALTER COLUMN "provider" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "EscrowTransaction_battleId_type_idx" ON "EscrowTransaction"("battleId", "type");

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
