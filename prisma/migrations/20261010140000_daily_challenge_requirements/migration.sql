-- Daily Challenges, step 4 (docs/daily-challenges-spec.md §6b): requirements — conditions and targets staff check by
-- hand — plus an optional screen recording on a submission.
--
-- A requirement is part of the promise a player pays against, so it is frozen once the challenge leaves DRAFT, and what a
-- player claimed and what they uploaded are frozen the moment they are written. The admin and submit code enforce
-- the same rules; these are the walls that hold if that code is ever wrong.

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('CONDITION', 'TARGET');

-- AlterTable
ALTER TABLE "DailyChallengeSubmission" ADD COLUMN     "recordingMime" TEXT,
ADD COLUMN     "recordingRef" TEXT;

-- CreateTable
CREATE TABLE "DailyChallengeRequirement" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "direction" "ScoreDirection",
    "threshold" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyChallengeRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChallengeRequirementResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "claimedMet" BOOLEAN,
    "claimedValue" INTEGER,
    "met" BOOLEAN,
    "verifiedValue" INTEGER,

    CONSTRAINT "DailyChallengeRequirementResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChallengeRequirement_challengeId_sortOrder_idx" ON "DailyChallengeRequirement"("challengeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallengeRequirementResult_submissionId_requirementId_key" ON "DailyChallengeRequirementResult"("submissionId", "requirementId");

-- AddForeignKey
ALTER TABLE "DailyChallengeRequirement" ADD CONSTRAINT "DailyChallengeRequirement_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeRequirementResult" ADD CONSTRAINT "DailyChallengeRequirementResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DailyChallengeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChallengeRequirementResult" ADD CONSTRAINT "DailyChallengeRequirementResult_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "DailyChallengeRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------
-- Hand-written below: constraints and guards Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------------------------------------

-- A condition carries no number; a target always has a direction and a threshold.
ALTER TABLE "DailyChallengeRequirement"
  ADD CONSTRAINT "DailyChallengeRequirement_shape_check" CHECK (
    ("kind" = 'CONDITION' AND "threshold" IS NULL AND "direction" IS NULL)
    OR ("kind" = 'TARGET' AND "threshold" IS NOT NULL AND "direction" IS NOT NULL AND "threshold" >= 0)
  );

ALTER TABLE "DailyChallengeSubmission"
  ADD CONSTRAINT "DailyChallengeSubmission_score_check" CHECK ("score" >= 0 AND ("tiebreakScore" IS NULL OR "tiebreakScore" >= 0));

-- Requirements can only be added, changed or removed while the challenge is a draft. If the challenge row is already
-- gone (the cascade from deleting a draft, or a test cleanup) there is nothing left to protect, so that is allowed.
CREATE OR REPLACE FUNCTION circuit_challenge_requirement_guard() RETURNS trigger AS $$
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
    RAISE EXCEPTION 'Requirements of a published daily challenge cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DailyChallengeRequirement_draft_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "DailyChallengeRequirement"
  FOR EACH ROW EXECUTE FUNCTION circuit_challenge_requirement_guard();

-- What a player submitted is evidence. The score, the files, their hashes and the server's upload time never change
-- after the row is written; only the review's outcome (status, verified values, reviewer) may move.
CREATE OR REPLACE FUNCTION circuit_challenge_submission_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."entryId" IS DISTINCT FROM OLD."entryId"
     OR NEW."score" IS DISTINCT FROM OLD."score"
     OR NEW."tiebreakScore" IS DISTINCT FROM OLD."tiebreakScore"
     OR NEW."evidenceRef" IS DISTINCT FROM OLD."evidenceRef"
     OR NEW."evidenceMime" IS DISTINCT FROM OLD."evidenceMime"
     OR NEW."evidenceHash" IS DISTINCT FROM OLD."evidenceHash"
     OR NEW."recordingRef" IS DISTINCT FROM OLD."recordingRef"
     OR NEW."recordingMime" IS DISTINCT FROM OLD."recordingMime"
     OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" THEN
    RAISE EXCEPTION 'DailyChallengeSubmission % is evidence: its score, files and upload time cannot be changed', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DailyChallengeSubmission_evidence_immutable"
  BEFORE UPDATE ON "DailyChallengeSubmission"
  FOR EACH ROW EXECUTE FUNCTION circuit_challenge_submission_guard();

-- The player's claim about a requirement is fixed when written; staff's verdict columns may be set.
CREATE OR REPLACE FUNCTION circuit_challenge_requirement_result_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."submissionId" IS DISTINCT FROM OLD."submissionId"
     OR NEW."requirementId" IS DISTINCT FROM OLD."requirementId"
     OR NEW."claimedMet" IS DISTINCT FROM OLD."claimedMet"
     OR NEW."claimedValue" IS DISTINCT FROM OLD."claimedValue" THEN
    RAISE EXCEPTION 'What a player claimed for a requirement cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DailyChallengeRequirementResult_claim_immutable"
  BEFORE UPDATE ON "DailyChallengeRequirementResult"
  FOR EACH ROW EXECUTE FUNCTION circuit_challenge_requirement_result_guard();
