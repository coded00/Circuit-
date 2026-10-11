-- Advisory checks on a submitted screenshot's own metadata: when it says it was taken, and what looks off. Flags help a
-- reviewer; they never reject a submission or decide a prize.
ALTER TABLE "DailyChallengeSubmission" ADD COLUMN "evidenceCapturedAt" TIMESTAMP(3);
ALTER TABLE "DailyChallengeSubmission" ADD COLUMN "evidenceFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The new columns are part of the evidence: written once with the upload, never changed.
CREATE OR REPLACE FUNCTION circuit_challenge_submission_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."entryId" IS DISTINCT FROM OLD."entryId"
     OR NEW."score" IS DISTINCT FROM OLD."score"
     OR NEW."tiebreakScore" IS DISTINCT FROM OLD."tiebreakScore"
     OR NEW."evidenceRef" IS DISTINCT FROM OLD."evidenceRef"
     OR NEW."evidenceMime" IS DISTINCT FROM OLD."evidenceMime"
     OR NEW."evidenceHash" IS DISTINCT FROM OLD."evidenceHash"
     OR NEW."evidenceCapturedAt" IS DISTINCT FROM OLD."evidenceCapturedAt"
     OR NEW."evidenceFlags" IS DISTINCT FROM OLD."evidenceFlags"
     OR NEW."recordingRef" IS DISTINCT FROM OLD."recordingRef"
     OR NEW."recordingMime" IS DISTINCT FROM OLD."recordingMime"
     OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" THEN
    RAISE EXCEPTION 'DailyChallengeSubmission % is evidence: its score, files and upload time cannot be changed', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
