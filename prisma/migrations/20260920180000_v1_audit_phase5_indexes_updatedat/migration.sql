-- AlterTable: updatedAt on money-relevant models
ALTER TABLE "User" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WalletTransaction" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Tournament" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Registration" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Battle" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EscrowTransaction" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Tournament_organizerId_idx" ON "Tournament"("organizerId");

-- CreateIndex
CREATE INDEX "Registration_userId_idx" ON "Registration"("userId");

-- CreateIndex
CREATE INDEX "Match_playerAId_idx" ON "Match"("playerAId");

-- CreateIndex
CREATE INDEX "Match_playerBId_idx" ON "Match"("playerBId");

-- CreateIndex
CREATE INDEX "Battle_creatorId_idx" ON "Battle"("creatorId");

-- CreateIndex
CREATE INDEX "Battle_targetUserId_idx" ON "Battle"("targetUserId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_userId_idx" ON "EscrowTransaction"("userId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_registrationId_idx" ON "EscrowTransaction"("registrationId");

-- Consistency fix: EscrowTransaction.userId was ON DELETE SET NULL while
-- WalletTransaction.userId (the equivalent "who does this money belong
-- to" FK) is ON DELETE RESTRICT — deleting a User could silently orphan
-- their Battle-payout/organizer-revenue ledger rows. Nothing deletes a
-- User today, so this is a defensive fix, not a behavior change for any
-- live code path.
ALTER TABLE "EscrowTransaction" DROP CONSTRAINT "EscrowTransaction_userId_fkey";
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
