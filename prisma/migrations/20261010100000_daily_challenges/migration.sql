-- Daily Challenges, step 1 (docs/daily-challenges-spec.md): solo, scored, asynchronous competitions.
--
-- Everything money-related rides on the existing ledgers: new EscrowType / WalletTransactionType values, and
-- two fill-in-only links on EscrowTransaction. The kill switch (PlatformSetting.dailyChallengesEnabled) is
-- OFF by default, so applying this migration changes nothing a player can see.
--
-- Enum values are added here and not used in this migration, which is why they can share a transaction.

-- CreateEnum
CREATE TYPE "DailyChallengeStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'LIVE', 'SUBMISSIONS_CLOSED', 'UNDER_REVIEW', 'PROVISIONAL', 'FINALIZED', 'SETTLING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScoreDirection" AS ENUM ('HIGHER', 'LOWER');

-- CreateEnum
CREATE TYPE "DailyChallengeEntryStatus" AS ENUM ('ENTERED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'DISQUALIFIED', 'WITHDRAWN', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DailyChallengeSubmissionStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DailyChallengeDisputeStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EscrowType" ADD VALUE 'CHALLENGE_ENTRY';
ALTER TYPE "EscrowType" ADD VALUE 'CHALLENGE_PLATFORM_FEE';
ALTER TYPE "EscrowType" ADD VALUE 'CHALLENGE_PRIZE';
ALTER TYPE "EscrowType" ADD VALUE 'CHALLENGE_REFUND';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletTransactionType" ADD VALUE 'CHALLENGE_ENTRY_DEBIT';
ALTER TYPE "WalletTransactionType" ADD VALUE 'CHALLENGE_ENTRY_REFUND';
ALTER TYPE "WalletTransactionType" ADD VALUE 'CHALLENGE_PRIZE_CREDIT';

-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "dailyChallengeEntryId" TEXT,
ADD COLUMN     "dailyChallengeId" TEXT;

-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "dailyChallengesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxChallengeEntrants" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "maxChallengeEntryFeeKobo" INTEGER NOT NULL DEFAULT 200000;

-- CreateTable
CREATE TABLE "DailyChallenge" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameModeId" TEXT,
    "gameName" TEXT NOT NULL,
    "modeName" TEXT,
    "title" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "evidenceRequirements" TEXT NOT NULL,
    "requireRecording" BOOLEAN NOT NULL DEFAULT false,
    "metricLabel" TEXT NOT NULL,
    "metricUnit" TEXT,
    "direction" "ScoreDirection" NOT NULL DEFAULT 'HIGHER',
    "tiebreakLabel" TEXT,
    "tiebreakDirection" "ScoreDirection" NOT NULL DEFAULT 'HIGHER',
    "tiebreakRule" TEXT NOT NULL DEFAULT 'Prize shares are split between the entries that are level.',
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "minEntrants" INTEGER NOT NULL DEFAULT 2,
    "maxEntrants" INTEGER NOT NULL,
    "prizeSplit" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "platformFeeBps" INTEGER NOT NULL DEFAULT 0,
    "entryOpensAt" TIMESTAMP(3) NOT NULL,
    "entryClosesAt" TIMESTAMP(3) NOT NULL,
    "windowStartsAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "submissionsCloseAt" TIMESTAMP(3) NOT NULL,
    "disputeWindowMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "DailyChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "pausedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "provisionalAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "payoutApprovedAt" TIMESTAMP(3),
    "payoutApprovedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengeEntry" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inGameName" TEXT NOT NULL,
    "status" "DailyChallengeEntryStatus" NOT NULL DEFAULT 'ENTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallengeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengeSubmission" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tiebreakScore" INTEGER,
    "evidenceRef" TEXT NOT NULL,
    "evidenceMime" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DailyChallengeSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedScore" INTEGER,
    "verifiedTiebreakScore" INTEGER,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallengeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengeReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonCode" TEXT,
    "note" TEXT,
    "scoreBefore" INTEGER,
    "scoreAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengeDispute" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DailyChallengeDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "ruling" TEXT,
    "ruledById" TEXT,
    "ruledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengeDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengeSponsorship" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChallengeSponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChallenge_status_entryOpensAt_idx" ON "DailyChallenge"("status", "entryOpensAt");

-- CreateIndex
CREATE INDEX "DailyChallenge_gameId_status_idx" ON "DailyChallenge"("gameId", "status");

-- CreateIndex
CREATE INDEX "DailyChallenge_windowEndsAt_idx" ON "DailyChallenge"("windowEndsAt");

-- CreateIndex
CREATE INDEX "DailyChallengeEntry_userId_idx" ON "DailyChallengeEntry"("userId");

-- CreateIndex
CREATE INDEX "DailyChallengeEntry_challengeId_status_idx" ON "DailyChallengeEntry"("challengeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeEntry_challengeId_userId_key" ON "DailyChallengeEntry"("challengeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeSubmission_entryId_key" ON "DailyChallengeSubmission"("entryId");

-- CreateIndex
CREATE INDEX "DailyChallengeSubmission_evidenceHash_idx" ON "DailyChallengeSubmission"("evidenceHash");

-- CreateIndex
CREATE INDEX "DailyChallengeSubmission_status_idx" ON "DailyChallengeSubmission"("status");

-- CreateIndex
CREATE INDEX "DailyChallengeReview_submissionId_idx" ON "DailyChallengeReview"("submissionId");

-- CreateIndex
CREATE INDEX "DailyChallengeDispute_submissionId_idx" ON "DailyChallengeDispute"("submissionId");

-- CreateIndex
CREATE INDEX "DailyChallengeDispute_status_idx" ON "DailyChallengeDispute"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeSponsorship_challengeId_key" ON "DailyChallengeSponsorship"("challengeId");

-- CreateIndex
CREATE INDEX "DailyChallengeSponsorship_recordedById_idx" ON "DailyChallengeSponsorship"("recordedById");

-- CreateIndex
CREATE INDEX "EscrowTransaction_dailyChallengeId_type_idx" ON "EscrowTransaction"("dailyChallengeId", "type");

-- CreateIndex
CREATE INDEX "EscrowTransaction_dailyChallengeEntryId_idx" ON "EscrowTransaction"("dailyChallengeEntryId");

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_dailyChallengeId_fkey" FOREIGN KEY ("dailyChallengeId") REFERENCES "DailyChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_dailyChallengeEntryId_fkey" FOREIGN KEY ("dailyChallengeEntryId") REFERENCES "DailyChallengeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_gameModeId_fkey" FOREIGN KEY ("gameModeId") REFERENCES "GameMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeEntry" ADD CONSTRAINT "DailyChallengeEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeEntry" ADD CONSTRAINT "DailyChallengeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeSubmission" ADD CONSTRAINT "DailyChallengeSubmission_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DailyChallengeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeReview" ADD CONSTRAINT "DailyChallengeReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DailyChallengeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeReview" ADD CONSTRAINT "DailyChallengeReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeDispute" ADD CONSTRAINT "DailyChallengeDispute_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DailyChallengeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeDispute" ADD CONSTRAINT "DailyChallengeDispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeDispute" ADD CONSTRAINT "DailyChallengeDispute_ruledById_fkey" FOREIGN KEY ("ruledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeSponsorship" ADD CONSTRAINT "DailyChallengeSponsorship_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeSponsorship" ADD CONSTRAINT "DailyChallengeSponsorship_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------
-- Hand-written below: constraints and guards Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------------------------------------

-- Bad configuration is refused at the database, not only in the admin form. The timeline is ordered, a
-- challenge can be full by one entrant at most, and money is never negative.
ALTER TABLE "DailyChallenge"
  ADD CONSTRAINT "DailyChallenge_money_check" CHECK ("entryFee" >= 0 AND "platformFeeBps" >= 0 AND "platformFeeBps" <= 10000),
  ADD CONSTRAINT "DailyChallenge_entrants_check" CHECK ("minEntrants" >= 1 AND "maxEntrants" >= "minEntrants"),
  ADD CONSTRAINT "DailyChallenge_timeline_check" CHECK (
    "entryOpensAt" < "entryClosesAt"
    AND "entryClosesAt" <= "windowStartsAt"
    AND "windowStartsAt" < "windowEndsAt"
    AND "windowEndsAt" <= "submissionsCloseAt"
  ),
  ADD CONSTRAINT "DailyChallenge_dispute_window_check" CHECK ("disputeWindowMinutes" >= 0);

ALTER TABLE "DailyChallengeSponsorship"
  ADD CONSTRAINT "DailyChallengeSponsorship_amount_check" CHECK ("amountKobo" > 0);

-- The escrow ledger guard already refuses to change a row's amount, type or owner and refuses to re-point a
-- link that is already set. It has to know about the two new links, or a CHALLENGE_* row could be re-pointed
-- at a different challenge after the fact.
CREATE OR REPLACE FUNCTION circuit_escrow_ledger_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR (OLD."tournamentId" IS NOT NULL AND NEW."tournamentId" IS NOT NULL AND NEW."tournamentId" <> OLD."tournamentId")
     OR (OLD."registrationId" IS NOT NULL AND NEW."registrationId" IS NOT NULL AND NEW."registrationId" <> OLD."registrationId")
     OR (OLD."battleId" IS NOT NULL AND NEW."battleId" IS NOT NULL AND NEW."battleId" <> OLD."battleId")
     OR (OLD."quickMatchChallengeId" IS NOT NULL AND NEW."quickMatchChallengeId" IS NOT NULL AND NEW."quickMatchChallengeId" <> OLD."quickMatchChallengeId")
     OR (OLD."dailyChallengeId" IS NOT NULL AND NEW."dailyChallengeId" IS NOT NULL AND NEW."dailyChallengeId" <> OLD."dailyChallengeId")
     OR (OLD."dailyChallengeEntryId" IS NOT NULL AND NEW."dailyChallengeEntryId" IS NOT NULL AND NEW."dailyChallengeEntryId" <> OLD."dailyChallengeEntryId") THEN
    RAISE EXCEPTION 'EscrowTransaction % is append-only: its amount, type and owner cannot be changed', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A reviewer's decision is a record of what happened. Changing your mind is a new row, never an edit.
CREATE OR REPLACE FUNCTION circuit_challenge_review_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DailyChallengeReview % is append-only: add a new review instead of changing this one', OLD."id"
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DailyChallengeReview_append_only"
  BEFORE UPDATE ON "DailyChallengeReview"
  FOR EACH ROW EXECUTE FUNCTION circuit_challenge_review_guard();
