-- CreateEnum
CREATE TYPE "QuickMatchStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuickMatchRecipientStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Battle" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "quickMatchChallengeId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Registration" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tournament" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WalletTransaction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "QuickMatchChallenge" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "stakeAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "QuickMatchStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedByUserId" TEXT,
    "battleId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "QuickMatchChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickMatchRecipient" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" "QuickMatchRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "QuickMatchRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickMatchChallenge_battleId_key" ON "QuickMatchChallenge"("battleId");

-- CreateIndex
CREATE INDEX "QuickMatchChallenge_hostId_idx" ON "QuickMatchChallenge"("hostId");

-- CreateIndex
CREATE INDEX "QuickMatchChallenge_status_idx" ON "QuickMatchChallenge"("status");

-- CreateIndex
CREATE INDEX "QuickMatchChallenge_expiresAt_idx" ON "QuickMatchChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "QuickMatchRecipient_recipientUserId_status_idx" ON "QuickMatchRecipient"("recipientUserId", "status");

-- CreateIndex
CREATE INDEX "QuickMatchRecipient_challengeId_status_idx" ON "QuickMatchRecipient"("challengeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuickMatchRecipient_challengeId_recipientUserId_key" ON "QuickMatchRecipient"("challengeId", "recipientUserId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_quickMatchChallengeId_type_idx" ON "EscrowTransaction"("quickMatchChallengeId", "type");

-- CreateIndex
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

-- AddForeignKey
ALTER TABLE "QuickMatchChallenge" ADD CONSTRAINT "QuickMatchChallenge_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickMatchChallenge" ADD CONSTRAINT "QuickMatchChallenge_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickMatchChallenge" ADD CONSTRAINT "QuickMatchChallenge_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickMatchRecipient" ADD CONSTRAINT "QuickMatchRecipient_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "QuickMatchChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickMatchRecipient" ADD CONSTRAINT "QuickMatchRecipient_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_quickMatchChallengeId_fkey" FOREIGN KEY ("quickMatchChallengeId") REFERENCES "QuickMatchChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
