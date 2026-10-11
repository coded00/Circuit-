-- Daily Challenges: settlement (docs/daily-challenges-spec.md §11). A prize award is one prize paid to one player, written
-- once at settlement and never changed. The challenge keeps the three figures that reconcile it.

-- AlterTable
ALTER TABLE "DailyChallenge" ADD COLUMN     "awardedKobo" INTEGER,
ADD COLUMN     "collectedKobo" INTEGER,
ADD COLUMN     "houseKobo" INTEGER,
ADD COLUMN     "settlementNote" TEXT;

-- CreateTable
CREATE TABLE "DailyChallengePrizeAward" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallengePrizeAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChallengePrizeAward_userId_idx" ON "DailyChallengePrizeAward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengePrizeAward_challengeId_categoryKey_userId_key" ON "DailyChallengePrizeAward"("challengeId", "categoryKey", "userId");

-- AddForeignKey
ALTER TABLE "DailyChallengePrizeAward" ADD CONSTRAINT "DailyChallengePrizeAward_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengePrizeAward" ADD CONSTRAINT "DailyChallengePrizeAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "DailyChallengePrizeAward"
  ADD CONSTRAINT "DailyChallengePrizeAward_amount_check" CHECK ("amountKobo" > 0);

ALTER TABLE "DailyChallenge"
  ADD CONSTRAINT "DailyChallenge_settlement_figures_check" CHECK (
    ("collectedKobo" IS NULL OR "collectedKobo" >= 0)
    AND ("awardedKobo" IS NULL OR "awardedKobo" >= 0)
    AND ("houseKobo" IS NULL OR "houseKobo" >= 0)
  );

-- A prize award is a record of money paid: it can't be edited, and it can't be deleted — except by the cascade when the
-- whole challenge is deleted (which only ever happens to a draft, or to test data), when its parent row is already gone.
CREATE OR REPLACE FUNCTION circuit_challenge_award_guard() RETURNS trigger AS $$
DECLARE
  parent_exists boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'A prize award is a record of money paid and cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT EXISTS (SELECT 1 FROM "DailyChallenge" WHERE "id" = OLD."challengeId") INTO parent_exists;
  IF parent_exists THEN
    RAISE EXCEPTION 'A prize award is a record of money paid and cannot be deleted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DailyChallengePrizeAward_append_only"
  BEFORE UPDATE OR DELETE ON "DailyChallengePrizeAward"
  FOR EACH ROW EXECUTE FUNCTION circuit_challenge_award_guard();

-- One open dispute per submission: a second request while one is waiting fails here, whatever the application did.
CREATE UNIQUE INDEX "DailyChallengeDispute_one_open_per_submission"
  ON "DailyChallengeDispute"("submissionId") WHERE "status" = 'OPEN';
