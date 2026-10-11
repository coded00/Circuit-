-- Challenge templates (docs/daily-challenges-spec.md §11): the owner's on/off switches for the code-defined template
-- library, and the guarantee that a template launches at most once per Lagos day.
--
-- Every template starts OFF: no row exists until someone switches one on. Nothing here changes an existing challenge.

-- AlterTable
ALTER TABLE "DailyChallenge" ADD COLUMN     "launchedForDate" TEXT,
ADD COLUMN     "templateKey" TEXT;

-- CreateTable
CREATE TABLE "ChallengeTemplateState" (
    "templateKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "weekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "entryFee" INTEGER,
    "minEntrants" INTEGER,
    "maxEntrants" INTEGER,
    "launchedOn" TEXT,
    "lastResult" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeTemplateState_pkey" PRIMARY KEY ("templateKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyChallenge_templateKey_launchedForDate_key" ON "DailyChallenge"("templateKey", "launchedForDate");

-- AddForeignKey
ALTER TABLE "ChallengeTemplateState" ADD CONSTRAINT "ChallengeTemplateState_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Weekdays are 0-6 only, and overrides can't be negative or nonsense.
ALTER TABLE "ChallengeTemplateState"
  ADD CONSTRAINT "ChallengeTemplateState_weekdays_check" CHECK ("weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[]),
  ADD CONSTRAINT "ChallengeTemplateState_overrides_check" CHECK (
    ("entryFee" IS NULL OR "entryFee" >= 0)
    AND ("minEntrants" IS NULL OR "minEntrants" >= 1)
    AND ("maxEntrants" IS NULL OR "maxEntrants" >= 1)
    AND ("minEntrants" IS NULL OR "maxEntrants" IS NULL OR "maxEntrants" >= "minEntrants")
  );

-- A challenge that came from a template has both its template and its day, or neither.
ALTER TABLE "DailyChallenge"
  ADD CONSTRAINT "DailyChallenge_template_pair_check" CHECK (("templateKey" IS NULL) = ("launchedForDate" IS NULL));
