-- Daily Challenges, upgrade (docs/daily-challenges-spec.md §11): challenge kind and weapon, a mandatory minimum score,
-- the no-winner policy, multiple prize categories with fixed amounts, a per-entrant verification code, the payout cap,
-- and the ledger type for what the house keeps at settlement.
--
-- Nothing here changes how an existing challenge behaves: every new column has a default that matches today's rules,
-- and a challenge with no prize categories keeps paying by its rank split.

-- CreateEnum
CREATE TYPE "ChallengeKind" AS ENUM ('STANDARD', 'WEAPON', 'SKILL', 'COMBINED');

-- CreateEnum
CREATE TYPE "NoWinnerPolicy" AS ENUM ('HOUSE_KEEPS', 'REFUND_ENTRIES');

-- CreateEnum
CREATE TYPE "ChallengeCadence" AS ENUM ('ONE_OFF', 'DAILY');

-- AlterEnum
ALTER TYPE "EscrowType" ADD VALUE 'CHALLENGE_HOUSE_REVENUE';

-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "maxChallengePayoutBps" INTEGER NOT NULL DEFAULT 7000;

-- AlterTable
ALTER TABLE "DailyChallenge" ADD COLUMN     "cadence" "ChallengeCadence" NOT NULL DEFAULT 'ONE_OFF',
ADD COLUMN     "kind" "ChallengeKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "minScore" INTEGER,
ADD COLUMN     "noWinnerPolicy" "NoWinnerPolicy" NOT NULL DEFAULT 'HOUSE_KEEPS',
ADD COLUMN     "scoreNeedsRecording" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weaponLabel" TEXT;

-- AlterTable
ALTER TABLE "DailyChallengeEntry" ADD COLUMN     "verificationCode" TEXT;

-- AlterTable
ALTER TABLE "DailyChallengeRequirement" ADD COLUMN     "gate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "needsRecording" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DailyChallengePrizeCategory" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "metricRequirementId" TEXT,
    "place" INTEGER NOT NULL DEFAULT 1,
    "requiresRequirementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comboOfCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyChallengePrizeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChallengePrizeCategory_challengeId_sortOrder_idx" ON "DailyChallengePrizeCategory"("challengeId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DailyChallengePrizeCategory" ADD CONSTRAINT "DailyChallengePrizeCategory_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengePrizeCategory" ADD CONSTRAINT "DailyChallengePrizeCategory_metricRequirementId_fkey" FOREIGN KEY ("metricRequirementId") REFERENCES "DailyChallengeRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------
-- Hand-written below: constraints and guards Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------------------------------------

ALTER TABLE "DailyChallenge"
  ADD CONSTRAINT "DailyChallenge_min_score_check" CHECK ("minScore" IS NULL OR "minScore" >= 0);

ALTER TABLE "DailyChallengePrizeCategory"
  ADD CONSTRAINT "DailyChallengePrizeCategory_amount_check" CHECK ("amountKobo" > 0),
  ADD CONSTRAINT "DailyChallengePrizeCategory_place_check" CHECK ("place" >= 1 AND "place" <= 8);

-- Prize categories, like requirements, can only be added, changed or removed while the challenge is a draft. If the
-- challenge row is already gone (the cascade from deleting a draft, or a test cleanup) there is nothing left to protect.
CREATE OR REPLACE FUNCTION circuit_challenge_prize_category_guard() RETURNS trigger AS $$
DECLARE
  parent_id text;
  parent_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_id := OLD."challengeId";
  ELSE
    parent_id := NEW."challengeId";
  END IF;
  SELECT "status"::text INTO parent_status FROM "DailyChallenge" WHERE "id" = parent_id;
  IF parent_status IS NOT NULL AND parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Prize categories of a published daily challenge cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DailyChallengePrizeCategory_draft_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "DailyChallengePrizeCategory"
  FOR EACH ROW EXECUTE FUNCTION circuit_challenge_prize_category_guard();

-- Once a challenge is published, the promise players paid against cannot be edited: not the rules, the scoring, the
-- money, the prize or no-winner policy. Only its progress may move (status, pause, deadlines shifted by a resume,
-- when it was finalized or settled). `gameModeId` is left out on purpose: deleting a game mode nulls it by foreign key.
CREATE OR REPLACE FUNCTION circuit_challenge_rules_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (
        NEW."gameId" IS DISTINCT FROM OLD."gameId"
     OR NEW."gameName" IS DISTINCT FROM OLD."gameName"
     OR NEW."modeName" IS DISTINCT FROM OLD."modeName"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."rules" IS DISTINCT FROM OLD."rules"
     OR NEW."evidenceRequirements" IS DISTINCT FROM OLD."evidenceRequirements"
     OR NEW."requireRecording" IS DISTINCT FROM OLD."requireRecording"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."weaponLabel" IS DISTINCT FROM OLD."weaponLabel"
     OR NEW."scoreNeedsRecording" IS DISTINCT FROM OLD."scoreNeedsRecording"
     OR NEW."minScore" IS DISTINCT FROM OLD."minScore"
     OR NEW."noWinnerPolicy" IS DISTINCT FROM OLD."noWinnerPolicy"
     OR NEW."cadence" IS DISTINCT FROM OLD."cadence"
     OR NEW."metricLabel" IS DISTINCT FROM OLD."metricLabel"
     OR NEW."metricUnit" IS DISTINCT FROM OLD."metricUnit"
     OR NEW."direction" IS DISTINCT FROM OLD."direction"
     OR NEW."tiebreakLabel" IS DISTINCT FROM OLD."tiebreakLabel"
     OR NEW."tiebreakDirection" IS DISTINCT FROM OLD."tiebreakDirection"
     OR NEW."tiebreakRule" IS DISTINCT FROM OLD."tiebreakRule"
     OR NEW."entryFee" IS DISTINCT FROM OLD."entryFee"
     OR NEW."minEntrants" IS DISTINCT FROM OLD."minEntrants"
     OR NEW."maxEntrants" IS DISTINCT FROM OLD."maxEntrants"
     OR NEW."prizeSplit" IS DISTINCT FROM OLD."prizeSplit"
     OR NEW."platformFeeBps" IS DISTINCT FROM OLD."platformFeeBps"
     OR NEW."disputeWindowMinutes" IS DISTINCT FROM OLD."disputeWindowMinutes"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
  ) THEN
    RAISE EXCEPTION 'The rules and prizes of a published daily challenge cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DailyChallenge_rules_locked"
  BEFORE UPDATE ON "DailyChallenge"
  FOR EACH ROW EXECUTE FUNCTION circuit_challenge_rules_guard();
